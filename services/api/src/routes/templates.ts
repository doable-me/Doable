import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { getTemplates, getTemplate, getCategories } from "../templates/registry.js";
import { scaffolder } from "../templates/scaffolder.js";
import { buildTemplatePreviewHtml } from "../templates/preview-builder.js";
import { createProject as materializeProjectOnDisk } from "../projects/file-manager.js";

export const templateRoutes = new Hono<AuthEnv>({ strict: false });

const scaffold = scaffolder(sql);

// ─── Auth gate (BUG-WS-003) ─────────────────────────────────
// `GET /templates` and `GET /templates/:id` previously returned the full
// registry — including `codeFiles` payloads — to unauthenticated callers.
// That's an information-disclosure / scraping surface inconsistent with
// the rest of the API which requires `Authorization: Bearer <jwt>`.
// Gate the listing and detail endpoints with the JWT middleware. The
// `/:id/preview` HTML render stays public because it is loaded by the
// dashboard iframe (which cannot carry an Authorization header) and the
// rendered HTML does not expose the underlying `codeFiles` source.
templateRoutes.use("/", authMiddleware);
templateRoutes.use("/:id", authMiddleware);

/**
 * GET /templates
 * List all available templates. Optionally filter by category and search.
 */
templateRoutes.get("/", async (c) => {
  const category = c.req.query("category") ?? undefined;
  const search = c.req.query("search") ?? undefined;
  const templates = getTemplates({ category, search });
  const categories = getCategories();

  return c.json({ data: { templates, categories } });
});

/**
 * GET /templates/:id/preview
 * Returns a fully rendered HTML page showing the template's React app.
 * Designed to be loaded in an iframe for the template preview modal.
 */
templateRoutes.get("/:id/preview", async (c) => {
  const id = c.req.param("id");
  const template = getTemplate(id!);

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  const html = buildTemplatePreviewHtml(template);

  return c.html(html, 200, {
    "Cache-Control": "public, max-age=300",
  });
});

/**
 * GET /templates/:id
 * Get a single template with full details (including file listing).
 */
templateRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const template = getTemplate(id!);

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  // Return full template details including code files
  return c.json({
    data: {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      tags: template.tags,
      previewImageUrl: template.previewImageUrl,
      isOfficial: template.isOfficial,
      files: Object.keys(template.codeFiles),
      codeFiles: template.codeFiles,
      hasContextOverrides: !!template.contextOverrides,
    },
  });
});

// ─── Authenticated Routes ───────────────────────────────────

const scaffoldBody = z.object({
  projectId: z.string().uuid(),
  projectName: z.string().min(1).max(128).optional(),
});

/**
 * POST /templates/:id/scaffold
 * Scaffold a new project from a template.
 */
templateRoutes.post(
  "/:id/scaffold",
  authMiddleware,
  zValidator("json", scaffoldBody),
  async (c) => {
    const templateId = c.req.param("id");
    const { projectId, projectName } = c.req.valid("json");

    const template = getTemplate(templateId!);
    if (!template) {
      return c.json({ error: "Template not found" }, 404);
    }

    // Verify the project exists and belongs to the user
    const [project] = await sql<{ id: string }[]>`
      SELECT p.id FROM projects p
      INNER JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = ${projectId}
        AND wm.user_id = ${c.get("userId")}
        AND p.deleted_at IS NULL
    `;

    if (!project) {
      return c.json({ error: "Project not found or access denied" }, 404);
    }

    const result = await scaffold.scaffoldFromTemplate({
      projectId,
      templateId: templateId!,
      projectName,
    });

    return c.json({ data: result }, 201);
  }
);

/**
 * POST /templates/:id/use
 * Create a new project from a template directly.
 * Combines project creation + scaffolding in one step.
 */
templateRoutes.post(
  "/:id/use",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      projectName: z.string().min(1).max(128),
      workspaceId: z.string().uuid().optional(),
    })
  ),
  async (c) => {
    const templateId = c.req.param("id");
    const userId = c.get("userId");
    const { projectName, workspaceId } = c.req.valid("json");

    const template = getTemplate(templateId!);
    if (!template) {
      return c.json({ error: "Template not found" }, 404);
    }

    // Get the user's workspace (use provided or default)
    let wsId = workspaceId;
    if (!wsId) {
      const [ws] = await sql<{ workspace_id: string }[]>`
        SELECT workspace_id FROM workspace_members
        WHERE user_id = ${userId}
        ORDER BY joined_at ASC
        LIMIT 1
      `;
      if (!ws) {
        return c.json({ error: "No workspace found" }, 400);
      }
      wsId = ws.workspace_id;
    }

    // Generate slug from project name
    const baseSlug = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "project";
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // Create the project with the template's framework_id so scaffold picks it up
    const [project] = await sql<{ id: string }[]>`
      INSERT INTO projects (name, slug, description, workspace_id, framework_id)
      VALUES (${projectName}, ${slug}, ${template.description}, ${wsId}, ${template.framework_id})
      RETURNING id
    `;

    if (!project) {
      return c.json({ error: "Failed to create project" }, 500);
    }

    // Materialize template files on disk + run `npm install`. The DB-only
    // path through `scaffold.scaffoldFromTemplate` (below) was leaving fresh
    // projects with no on-disk artifacts, which broke the dev-server start
    // path for any caller of `/templates/<id>/use` (R30). createProject in
    // file-manager.ts is the same on-disk path the AI-chat scaffold flow
    // takes, so behavior matches what the chat surface produces.
    try {
      await materializeProjectOnDisk(
        project.id,
        template.codeFiles,
        template.framework_id,
      );
    } catch (err) {
      // Fall through to DB-only scaffold so the project row still exists;
      // the dev-server start path will surface the disk gap with a clear
      // error rather than a silent blank preview.
      console.warn(
        `[templates] on-disk materialize failed for ${project.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // DB-side scaffold (project_files rows + .doable/ context files) so the
    // editor file tree + AI chat surfaces still see the template content.
    const result = await scaffold.scaffoldFromTemplate({
      projectId: project.id,
      templateId: templateId!,
      projectName,
    });

    return c.json({
      data: {
        ...result,
        projectId: project.id,
      },
    }, 201);
  }
);

/**
 * POST /templates/save-as-template
 * Save an existing project as a user-created template (Business+ plan).
 */
templateRoutes.post(
  "/save-as-template",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1).max(128),
      description: z.string().max(500).optional(),
      category: z.string().max(50).optional(),
    })
  ),
  async (c) => {
    const userId = c.get("userId");
    const { projectId, name, description, category } = c.req.valid("json");

    // Verify project ownership
    const [project] = await sql<{ id: string; workspace_id: string }[]>`
      SELECT p.id, p.workspace_id FROM projects p
      INNER JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = ${projectId}
        AND wm.user_id = ${userId}
        AND p.deleted_at IS NULL
    `;

    if (!project) {
      return c.json({ error: "Project not found or access denied" }, 404);
    }

    // Check for Business+ plan
    const [workspace] = await sql<{ plan: string }[]>`
      SELECT plan FROM workspaces WHERE id = ${project.workspace_id}
    `;

    if (!workspace || !["business", "enterprise"].includes(workspace.plan)) {
      return c.json(
        { error: "Saving as template requires a Business or Enterprise plan" },
        403
      );
    }

    // Get project files
    const files = await sql<{ file_path: string; content: string }[]>`
      SELECT file_path, content FROM project_files
      WHERE project_id = ${projectId}
        AND file_path NOT LIKE '.doable/%'
    `;

    const codeFiles: Record<string, string> = {};
    for (const f of files) {
      codeFiles[f.file_path] = f.content;
    }

    // Save as template in DB
    const [template] = await sql<{ id: string }[]>`
      INSERT INTO templates (name, description, category, code_files, is_official, created_by)
      VALUES (${name}, ${description ?? null}, ${category ?? null}, ${sql.json(codeFiles)}, false, ${userId})
      RETURNING id
    `;

    return c.json({
      data: { templateId: template!.id, name, fileCount: files.length },
    }, 201);
  }
);
