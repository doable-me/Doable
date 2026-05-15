import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { sql } from "../db/index.js";
import { communityQueries } from "@doable/db/queries/community";
import { marketplaceFeaturedQueries } from "@doable/db/queries/marketplace-featured";
import { getKVStore } from "@doable/shared/kv-store";

const featured = marketplaceFeaturedQueries(sql);
const kv = getKVStore();
const COMMUNITY_FEATURED_KEY = "community:featured:v1";
const COMMUNITY_FEATURED_TTL_MS = 60 * 1000;
const COMMUNITY_CATEGORIES_KEY = "community:categories:v1";
const COMMUNITY_CATEGORIES_TTL_MS = 5 * 60 * 1000;

export const communityRoutes = new Hono<AuthEnv>({ strict: false });

const community = communityQueries(sql);

function generateProjectSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "project"
  );
}

// ─── Public Routes ──────────────────────────────────────────

/**
 * GET /community/discover
 * List public projects with pagination, category filtering, and search.
 */
communityRoutes.get("/discover", async (c) => {
  const category = c.req.query("category") ?? undefined;
  const search = c.req.query("search") ?? undefined;
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const pageSize = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "20", 10) || 20, 1), 50);

  const result = await community.listPublicProjects({
    category,
    search,
    page,
    pageSize,
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
  // Try the materialised view first (denormalised + cached). Fall through
  // to the live query path if the MV doesn't exist yet (fresh DB).
  const cached = await kv.get<unknown[]>(COMMUNITY_FEATURED_KEY);
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json({ data: { projects: cached } });
  }
  try {
    const projects = await featured.listFeaturedDiscover(12);
    await kv.set(COMMUNITY_FEATURED_KEY, projects, COMMUNITY_FEATURED_TTL_MS);
    c.header("X-Cache", "MISS-MV");
    return c.json({ data: { projects } });
  } catch (err) {
    console.warn("[community.featured] MV unavailable, falling back:", err);
    const limit = parseInt(c.req.query("limit") ?? "6", 10);
    const projects = await community.listFeaturedProjects(Math.min(limit, 20));
    return c.json({ data: { projects } });
  }
});

/**
 * GET /community/categories
 * List all categories used by community projects.
 */
communityRoutes.get("/categories", async (c) => {
  const cached = await kv.get<unknown[]>(COMMUNITY_CATEGORIES_KEY);
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json({ data: { categories: cached } });
  }
  const categories = await community.listCategories();
  await kv.set(COMMUNITY_CATEGORIES_KEY, categories, COMMUNITY_CATEGORIES_TTL_MS);
  c.header("X-Cache", "MISS");
  return c.json({ data: { categories } });
});

// ─── Authenticated Routes ───────────────────────────────────

const shareSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.string().max(50).optional(),
  thumbnailUrl: z.string().url().optional(),
});

/**
 * Verify the requester owns the project (via workspace_members).
 * Returns the project row or null.
 */
async function assertProjectOwnership(projectId: string, userId: string) {
  const [project] = await sql<{ id: string }[]>`
    SELECT p.id FROM projects p
    INNER JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE p.id = ${projectId}
      AND wm.user_id = ${userId}
      AND p.deleted_at IS NULL
  `;
  return project ?? null;
}

/**
 * POST /community/:projectId/share
 * Share a project to the community feed (canonical name as of Phase 1).
 */
communityRoutes.post(
  "/:projectId/share",
  authMiddleware,
  zValidator("json", shareSchema),
  async (c) => {
    const userId = c.get("userId");
    const projectId = c.req.param("projectId")!;
    const { title, description, category, thumbnailUrl } = c.req.valid("json");

    const project = await assertProjectOwnership(projectId, userId);
    if (!project) {
      return c.json({ error: "Project not found or access denied" }, 404);
    }

    const publicProject = await community.publishProject({
      projectId,
      title,
      description,
      category,
      thumbnailUrl,
      sharedBy: userId,
    });

    return c.json({ data: publicProject }, 201);
  }
);

/**
 * DELETE /community/:projectId/share
 * Unshare a project (canonical name as of Phase 1).
 */
communityRoutes.delete(
  "/:projectId/share",
  authMiddleware,
  async (c) => {
    const userId = c.get("userId");
    const projectId = c.req.param("projectId")!;

    const project = await assertProjectOwnership(projectId, userId);
    if (!project) {
      return c.json({ error: "Project not found or access denied" }, 404);
    }

    await community.unpublishProject(projectId);
    return c.json({ data: { success: true } });
  }
);

// ─── Backward-compat aliases (kept indefinitely) ─────────────
// The old /publish surface was confusing (it suggested deployment).
// We forward POST/DELETE 1:1 to /share via 308 Permanent Redirect, which
// preserves the HTTP method (vs 301/302 which downgrade to GET).
communityRoutes.post("/:projectId/publish", authMiddleware, (c) => {
  const projectId = c.req.param("projectId")!;
  return c.redirect(`/community/${projectId}/share`, 308);
});

communityRoutes.delete("/:projectId/publish", authMiddleware, (c) => {
  const projectId = c.req.param("projectId")!;
  return c.redirect(`/community/${projectId}/share`, 308);
});

/**
 * GET /community/my/shared
 * Returns the set of project_ids the requester currently has shared.
 * Used by the dashboard to badge cards with "Shared" without N+1 lookups.
 */
communityRoutes.get("/my/shared", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const ids = await community.listMySharedProjectIds(userId);
  return c.json({ data: { projectIds: Array.from(ids) } });
});

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

    // Generate a workspace-unique slug for the remixed project.
    let slug = generateProjectSlug(name);
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM projects
      WHERE workspace_id = ${ws.workspace_id}
        AND slug = ${slug}
      LIMIT 1
    `;
    if (existing) {
      slug = `${slug.slice(0, 38)}-${Date.now().toString(36)}`;
    }

    const newProjectId = await sql.begin(async (tx) => {
      const txn = tx as unknown as typeof sql;

      const [newProject] = await txn<{ id: string }[]>`
        INSERT INTO projects (name, slug, description, workspace_id)
        VALUES (${name}, ${slug}, ${publicProject.description}, ${ws.workspace_id})
        RETURNING id
      `;

      if (!newProject) {
        throw new Error("Failed to create remixed project");
      }

      // Copy all files to the new project.
      for (const file of sourceFiles) {
        await txn`
          INSERT INTO project_files (project_id, file_path, content)
          VALUES (${newProject.id}, ${file.file_path}, ${file.content})
          ON CONFLICT (project_id, file_path)
          DO UPDATE SET content = ${file.content}, updated_at = now()
        `;
      }

      // Record the remix and increment counts in the same transaction.
      await communityQueries(txn).createRemix({
        sourceProjectId: sourceProjectId!,
        forkedProjectId: newProject.id,
        forkedBy: userId,
      });

      return newProject.id;
    });

    return c.json({
      data: {
        projectId: newProjectId,
        sourceProjectId: sourceProjectId,
        name,
        filesCopied: sourceFiles.length,
      },
    }, 201);
  }
);

// ─── Admin Routes ──────────────────────────────────────────

/**
 * PUT /community/:projectId/featured
 * Toggle the featured flag (admin only).
 */
communityRoutes.put(
  "/:projectId/featured",
  authMiddleware,
  platformAdminMiddleware,
  zValidator("json", z.object({ featured: z.boolean() })),
  async (c) => {
    const projectId = c.req.param("projectId")!;
    const { featured } = c.req.valid("json");
    const updated = await community.setFeatured(projectId, featured);
    if (!updated) {
      return c.json({ error: "Public project not found" }, 404);
    }
    return c.json({ data: updated });
  }
);
