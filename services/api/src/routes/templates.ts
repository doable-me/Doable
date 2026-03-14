import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { getTemplates, getTemplate, getCategories } from "../templates/registry.js";
import { scaffolder } from "../templates/scaffolder.js";

export const templateRoutes = new Hono<AuthEnv>();

const scaffold = scaffolder(sql);

// ─── Public Routes ──────────────────────────────────────────

/**
 * GET /templates
 * List all available templates. Optionally filter by category.
 */
templateRoutes.get("/", async (c) => {
  const category = c.req.query("category") ?? undefined;
  const templates = getTemplates({ category });
  const categories = getCategories();

  return c.json({ data: { templates, categories } });
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

  // Return template info with file paths (not full content for listing)
  return c.json({
    data: {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      previewImageUrl: template.previewImageUrl,
      isOfficial: template.isOfficial,
      files: Object.keys(template.codeFiles),
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
