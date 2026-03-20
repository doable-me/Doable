import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { communityQueries } from "@doable/db/queries/community";

export const communityRoutes = new Hono<AuthEnv>();

const community = communityQueries(sql);

// ─── Public Routes ──────────────────────────────────────────

/**
 * GET /community/discover
 * List public projects with pagination, category filtering, and search.
 */
communityRoutes.get("/discover", async (c) => {
  const category = c.req.query("category") ?? undefined;
  const search = c.req.query("search") ?? undefined;
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") ?? "20", 10);

  const result = await community.listPublicProjects({
    category,
    search,
    page,
    pageSize: Math.min(pageSize, 50),
  });

  return c.json({
    data: {
      projects: result.rows,
      total: result.total,
      page,
      pageSize,
    },
  });
});

/**
 * GET /community/featured
 * Get featured/trending community projects.
 */
communityRoutes.get("/featured", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "6", 10);
  const projects = await community.listFeaturedProjects(
    Math.min(limit, 20)
  );

  return c.json({ data: { projects } });
});

/**
 * GET /community/categories
 * List all categories used by community projects.
 */
communityRoutes.get("/categories", async (c) => {
  const categories = await community.listCategories();
  return c.json({ data: { categories } });
});

// ─── Authenticated Routes ───────────────────────────────────

/**
 * POST /community/:projectId/publish
 * Publish a project to the community (make it public and listed).
 */
communityRoutes.post(
  "/:projectId/publish",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      category: z.string().max(50).optional(),
      thumbnailUrl: z.string().url().optional(),
    })
  ),
  async (c) => {
    const userId = c.get("userId");
    const projectId = c.req.param("projectId");
    const { title, description, category, thumbnailUrl } = c.req.valid("json");

    // Verify project ownership
    const [project] = await sql<{ id: string }[]>`
      SELECT p.id FROM projects p
      INNER JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = ${projectId}
        AND wm.user_id = ${userId}
        AND p.deleted_at IS NULL
    `;

    if (!project) {
      return c.json({ error: "Project not found or access denied" }, 404);
    }

    const publicProject = await community.publishProject({
      projectId: projectId!,
      title,
      description,
      category,
      thumbnailUrl,
    });

    return c.json({ data: publicProject }, 201);
  }
);

/**
 * POST /community/:projectId/remix
 * Fork/remix a public project into the user's workspace.
 */
communityRoutes.post(
  "/:projectId/remix",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      projectName: z.string().min(1).max(128).optional(),
    })
  ),
  async (c) => {
    const userId = c.get("userId");
    const sourceProjectId = c.req.param("projectId");
    const { projectName } = c.req.valid("json");

    // Verify source project is public
    const publicProject = await community.getPublicProject(sourceProjectId!);
    if (!publicProject) {
      return c.json({ error: "Project not found or not public" }, 404);
    }

    // Get source project files
    const sourceFiles = await sql<{ file_path: string; content: string }[]>`
      SELECT file_path, content FROM project_files
      WHERE project_id = ${sourceProjectId}
    `;

    if (sourceFiles.length === 0) {
      return c.json({ error: "Source project has no files" }, 400);
    }

    // Get user's default workspace
    const [ws] = await sql<{ workspace_id: string }[]>`
      SELECT workspace_id FROM workspace_members
      WHERE user_id = ${userId}
      ORDER BY joined_at ASC
      LIMIT 1
    `;

    if (!ws) {
      return c.json({ error: "No workspace found" }, 400);
    }

    const name = projectName ?? `Remix of ${publicProject.title}`;

    // Create new project
    const [newProject] = await sql<{ id: string }[]>`
      INSERT INTO projects (name, description, workspace_id)
      VALUES (${name}, ${publicProject.description}, ${ws.workspace_id})
      RETURNING id
    `;

    if (!newProject) {
      return c.json({ error: "Failed to create project" }, 500);
    }

    // Copy all files to the new project
    for (const file of sourceFiles) {
      await sql`
        INSERT INTO project_files (project_id, file_path, content)
        VALUES (${newProject.id}, ${file.file_path}, ${file.content})
        ON CONFLICT (project_id, file_path)
        DO UPDATE SET content = ${file.content}, updated_at = now()
      `;
    }

    // Record the remix
    await community.createRemix({
      sourceProjectId: sourceProjectId!,
      forkedProjectId: newProject.id,
      forkedBy: userId,
    });

    return c.json({
      data: {
        projectId: newProject.id,
        sourceProjectId: sourceProjectId,
        name,
        filesCopied: sourceFiles.length,
      },
    }, 201);
  }
);

/**
 * DELETE /community/:projectId/publish
 * Unpublish a project from the community.
 */
communityRoutes.delete(
  "/:projectId/publish",
  authMiddleware,
  async (c) => {
    const userId = c.get("userId");
    const projectId = c.req.param("projectId");

    // Verify project ownership
    const [project] = await sql<{ id: string }[]>`
      SELECT p.id FROM projects p
      INNER JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = ${projectId}
        AND wm.user_id = ${userId}
        AND p.deleted_at IS NULL
    `;

    if (!project) {
      return c.json({ error: "Project not found or access denied" }, 404);
    }

    await community.unpublishProject(projectId!);
    return c.json({ data: { success: true } });
  }
);
