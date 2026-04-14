import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../../db/index.js";
import { starQueries } from "@doable/db";
import { projectViewQueries } from "@doable/db";
import { shareTrackingQueries } from "@doable/db";
import type { AuthEnv } from "../../middleware/auth.js";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SLUG_REGEX,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
  PLAN_LIMITS,
  type WorkspacePlan,
} from "@doable/shared";
import { projects, workspacesQ, getUserWorkspaceId, getUserWorkspaceIdWithMinRole } from "./helpers.js";

const stars = starQueries(sql);
const projectViews = projectViewQueries(sql);
const shareTracking = shareTrackingQueries(sql);

export const projectListRoutes = new Hono<AuthEnv>();

// ─── List Starred Projects ──────────────────────────────────
// NOTE: This must be defined BEFORE "/:id" to avoid matching "starred" as an id
projectListRoutes.get("/starred", async (c) => {
  const userId = c.get("userId");
  const starredIds = await stars.listStarredProjectIds(userId);

  if (starredIds.length === 0) {
    return c.json({ data: [] });
  }

  // Fetch full project details for each starred project, filtering to accessible ones
  const projectPromises = starredIds.map((id) => projects.findById(id));
  const projectResults = await Promise.all(projectPromises);
  const validProjects = projectResults.filter((p): p is NonNullable<typeof p> => p != null);

  // Filter to only projects the user has workspace access to
  const accessChecks = await Promise.all(
    validProjects.map(async (p) => {
      const role = await workspacesQ.getMemberRole(p.workspace_id, userId);
      return role ? p : null;
    })
  );
  const data = accessChecks
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => ({ ...p, starred: true }));

  return c.json({ data });
});

// ─── List Shared-With-Me Projects ───────────────────────────
// NOTE: Must be defined BEFORE "/:id" to avoid matching "shared" as an id
projectListRoutes.get("/shared", async (c) => {
  const userId = c.get("userId");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(c.req.query("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10))
  );

  const { rows, total } = await shareTracking.listSharedWithUser(userId, {
    page,
    pageSize,
  });

  const starredIds = await stars.listStarredProjectIds(userId);
  const starredSet = new Set(starredIds);

  const data = rows.map((p) => ({
    ...p,
    starred: starredSet.has(p.id),
  }));

  return c.json({
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// ─── List Projects ──────────────────────────────────────────
projectListRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const explicitWorkspaceId = c.req.query("workspaceId");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(c.req.query("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10))
  );
  const status = c.req.query("status") as
    | "creating"
    | "draft"
    | "published"
    | "error"
    | undefined;
  const search = c.req.query("search") || undefined;
  const folderId = c.req.query("folderId") || undefined;

  const workspaceId = await getUserWorkspaceId(userId, explicitWorkspaceId ?? undefined);
  if (!workspaceId) {
    // If an explicit workspace was requested but user isn't a member, return 403
    if (explicitWorkspaceId) {
      return c.json({ error: "Access denied to this workspace" }, 403);
    }
    return c.json({ data: [], pagination: { total: 0, page: 1, pageSize, totalPages: 0 } });
  }

  const statusValues = ["creating", "draft", "published", "error"];
  if (status && !statusValues.includes(status)) {
    return c.json({ error: "Invalid status filter" }, 400);
  }

  const { rows, total } = await projects.listByWorkspace(workspaceId, {
    page,
    pageSize,
    status,
    search,
    folderId,
  });

  const starredIds = await stars.listStarredProjectIds(userId);
  const starredSet = new Set(starredIds);

  const data = rows.map((p) => ({
    ...p,
    starred: starredSet.has(p.id),
  }));

  return c.json({
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// ─── Create Project ─────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(SLUG_MIN_LENGTH).max(SLUG_MAX_LENGTH).regex(SLUG_REGEX).optional(),
  description: z.string().max(500).optional(),
  templateId: z.string().min(1).max(128).optional(),
  folderId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  prompt: z.string().max(5000).optional(),
});

function generateSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
  // Ensure minimum length
  if (slug.length < SLUG_MIN_LENGTH) {
    slug = `${slug}-${Date.now().toString(36)}`.slice(0, SLUG_MAX_LENGTH);
  }
  return slug || "project";
}

projectListRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const { prompt, ...data } = parsed.data;

  // Resolve workspace — use provided or user's default (require member+ role)
  const workspaceId = await getUserWorkspaceIdWithMinRole(userId, "member", data.workspaceId);
  if (!workspaceId) {
    if (data.workspaceId) {
      return c.json({ error: "Access denied — requires member role or higher" }, 403);
    }
    return c.json({ error: "No workspace found. Please create a workspace first." }, 400);
  }

  // Enforce plan project limit
  const workspace = await workspacesQ.findById(workspaceId);
  if (workspace) {
    const limits = PLAN_LIMITS[workspace.plan as WorkspacePlan] ?? PLAN_LIMITS.free;
    const { total } = await projects.listByWorkspace(workspaceId, { page: 1, pageSize: 1 });
    if (total >= limits.maxProjects) {
      return c.json({
        error: `Project limit reached (${limits.maxProjects} for ${workspace.plan} plan). Upgrade to create more.`,
      }, 403);
    }
  }

  // Auto-generate slug from name if not provided
  let slug = data.slug ?? generateSlug(data.name);

  // Ensure slug uniqueness within workspace
  const existing = await projects.findByWorkspaceAndSlug(workspaceId, slug);
  if (existing) {
    slug = `${slug.slice(0, 38)}-${Date.now().toString(36)}`;
  }

  const project = await projects.create({
    name: data.name,
    slug,
    description: data.description,
    templateId: data.templateId,
    folderId: data.folderId,
    workspaceId,
  });

  return c.json({ data: project }, 201);
});

// ─── Recently Viewed Projects ───────────────────────────────
// NOTE: Must be defined BEFORE "/:id" to avoid matching "recently-viewed" as an id
projectListRoutes.get("/recently-viewed", async (c) => {
  const userId = c.get("userId");
  const explicitWorkspaceId = c.req.query("workspaceId");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(c.req.query("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10))
  );

  const workspaceId = await getUserWorkspaceId(userId, explicitWorkspaceId ?? undefined);
  if (!workspaceId) {
    return c.json({ data: [], pagination: { total: 0, page: 1, pageSize, totalPages: 0 } });
  }

  const { rows, total } = await projectViews.listRecentlyViewed(userId, workspaceId, {
    page,
    pageSize,
  });

  const starredIds = await stars.listStarredProjectIds(userId);
  const starredSet = new Set(starredIds);

  const data = rows.map((p) => ({
    ...p,
    starred: starredSet.has(p.id),
  }));

  return c.json({
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});
