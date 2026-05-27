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
  type WorkspacePlan,
} from "@doable/shared";
import { projects, workspacesQ, getUserWorkspaceId, getUserWorkspaceIdWithMinRole, validateUuidQueryParam } from "./helpers.js";
import { getEnabledFrameworkIds } from "../../frameworks/init.js";
import { getEffectivePlanLimits } from "../admin-plan-limits.js";

const stars = starQueries(sql);
const projectViews = projectViewQueries(sql);
const shareTracking = shareTrackingQueries(sql);

export const projectListRoutes = new Hono<AuthEnv>({ strict: false });

// BUG-CORPUS-PROJ-003: validate the `workspaceId` query param on
// `GET /projects` and `GET /projects/recently-viewed` etc. before any SQL
// runs. Previously a non-UUID value reached postgres.js and surfaced as 500
// "Internal Server Error". Other query params (folderId, status, search)
// are validated inline by the existing handlers.
projectListRoutes.use("*", validateUuidQueryParam("workspaceId", "workspaceId"));
projectListRoutes.use("*", validateUuidQueryParam("folderId", "folderId"));

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

  // BUG-WS-003: wrap in try/catch so any future DB error returns a 500 JSON
  // body instead of an unhandled rejection that Cloudflare surfaces as 502.
  try {
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
  } catch (err) {
    console.error("[projects/shared] Failed to list shared projects:", err);
    return c.json({
      error: "Failed to list shared projects",
      data: [],
      pagination: { total: 0, page, pageSize, totalPages: 0 },
    }, 500);
  }
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
/** Strip HTML/script tags from user-supplied names to prevent stored XSS */
const safeName = (s: string) => s.replace(/<[^>]*>/g, "").trim();

const createSchema = z.object({
  name: z.string().min(1).max(100).transform(safeName).pipe(z.string().min(1, "Name cannot be empty after sanitization")),
  slug: z.string().min(SLUG_MIN_LENGTH).max(SLUG_MAX_LENGTH).regex(SLUG_REGEX).optional(),
  description: z.string().max(500).optional(),
  templateId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  prompt: z.string().max(5000).optional(),
  frameworkId: z.string().max(50).optional(),
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
  const rawBody = await c.req.json();
  // Accept snake_case + bare aliases for legacy clients (workspace_id,
  // template_id, folder_id, framework_id, framework). Without this, zod
  // silently strips unknown keys and the handler falls back to the user's
  // first workspace (their personal one), which silently mis-routes the
  // project. See BUG-PWA-002. The `framework` alias is required so that
  // BUG-API-002 (invalid framework values silently accepted) can validate
  // — without it, `{"framework":"cobol"}` is dropped before validation.
  const body = (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody))
    ? {
        ...rawBody,
        workspaceId: (rawBody as Record<string, unknown>).workspaceId
          ?? (rawBody as Record<string, unknown>).workspace_id,
        templateId: (rawBody as Record<string, unknown>).templateId
          ?? (rawBody as Record<string, unknown>).template_id,
        folderId: (rawBody as Record<string, unknown>).folderId
          ?? (rawBody as Record<string, unknown>).folder_id,
        frameworkId: (rawBody as Record<string, unknown>).frameworkId
          ?? (rawBody as Record<string, unknown>).framework_id
          ?? (rawBody as Record<string, unknown>).framework,
      }
    : rawBody;
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const { prompt, frameworkId: explicitFrameworkId, ...data } = parsed.data;

  // BUG-WS-002: workspaceId is required — silently falling back to the
  // caller's default workspace mis-routes projects (a user with multiple
  // workspaces would have their project land in the first one regardless
  // of intent). Require an explicit workspaceId on the request body.
  if (!data.workspaceId) {
    return c.json(
      { error: "workspaceId is required" },
      400
    );
  }

  // Resolve workspace — require explicit workspaceId with member+ role
  const workspaceId = await getUserWorkspaceIdWithMinRole(userId, "member", data.workspaceId);
  if (!workspaceId) {
    return c.json({ error: "Access denied — requires member role or higher" }, 403);
  }

  // Framework resolution chain (only when caller didn't pick explicitly):
  //   1. explicit frameworkId from request body — wins
  //   2. heuristic detection from prompt text — "build me a Django app" → "django"
  //   3. workspace admin default_framework_id — set in workspace settings
  //   4. undefined → projects.create defaults to vite-react via DB column default
  let frameworkId = explicitFrameworkId;
  if (!frameworkId && prompt) {
    const { detectFrameworkFromPrompt } = await import("../../projects/detect-framework.js");
    const detected = detectFrameworkFromPrompt(prompt);
    if (detected) frameworkId = detected;
  }
  if (!frameworkId) {
    try {
      const rows = await sql<{ default_framework_id: string | null }[]>`
        SELECT default_framework_id FROM workspace_ai_settings
        WHERE workspace_id = ${workspaceId}
      `;
      const wsDefault = rows[0]?.default_framework_id;
      if (wsDefault) frameworkId = wsDefault;
    } catch {
      // Pre-migration host: column doesn't exist yet — fall through to DB default.
    }
  }

  // Enforce enabled frameworks — reject creation with unknown/disabled
  // framework. BUG-API-002: invalid values like "cobol" were silently
  // accepted and the project was created with the DB default. Return 400
  // (validation) so callers can correct the request.
  if (frameworkId) {
    const enabled = getEnabledFrameworkIds();
    if (!enabled.has(frameworkId)) {
      return c.json({
        error: "Validation failed",
        details: {
          framework: [
            `Invalid framework "${frameworkId}". Allowed: ${Array.from(enabled).join(", ")}`,
          ],
        },
      }, 400);
    }
  }

  // Enforce plan project limit (with per-workspace override)
  const workspace = await workspacesQ.findById(workspaceId);
  if (workspace) {
    const effectiveLimits = await getEffectivePlanLimits();
    const limits = effectiveLimits[workspace.plan as WorkspacePlan] ?? effectiveLimits.free;
    const maxProjects = workspace.max_projects_override ?? limits.maxProjects;
    const { total } = await projects.listByWorkspace(workspaceId, { page: 1, pageSize: 1 });
    if (total >= maxProjects) {
      return c.json({
        error: `Project limit reached (${maxProjects} for ${workspace.plan} plan). Upgrade to create more.`,
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
    frameworkId,
  });

  // US-011: register the per-project builtin doable.data MCP connector so the
  // AI's data.* tools are available for this project. The chat-turn create path
  // (send-handler.ts) does the same; this covers the dashboard POST /projects
  // create path. Fire-and-forget; gated on the feature flag.
  if (process.env.DOABLE_APP_DB_ENABLED !== "0") {
    const { ensureDataConnectorForProject } = await import("../../mcp/builtin/data/register.js");
    ensureDataConnectorForProject(project.id, workspaceId, userId).catch((err) => {
      console.error("[builtin-data] connector provision failed (project create):", err);
    });
  }

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
