import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { marketplaceQueries, environmentQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

const mkt = marketplaceQueries(sql);
const envs = environmentQueries(sql);
const ws = workspaceQueries(sql);

export const marketplaceRoutes = new Hono<AuthEnv>();

// Public browse routes (no auth needed)
const publicRoutes = new Hono<AuthEnv>();
const authedRoutes = new Hono<AuthEnv>();

authedRoutes.use("*", authMiddleware);

// ─── Role helper ──────────────────────────────────────────

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await ws.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

// ─── Public: Browse / Search / Categories ─────────────────

publicRoutes.get("/marketplace/categories", async (c) => {
  const data = await mkt.listCategories();
  return c.json({ data });
});

const browseSchema = z.object({
  category: z.string().optional(),
  search: z.string().max(200).optional(),
  tags: z.string().optional(), // comma-separated
  featured: z.enum(["true", "false"]).optional(),
  sort: z.enum(["popular", "newest", "rating"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

publicRoutes.get("/marketplace/listings", zValidator("query", browseSchema), async (c) => {
  const q = c.req.valid("query");
  const result = await mkt.browseListings({
    categorySlug: q.category,
    search: q.search,
    tags: q.tags?.split(",").map((t) => t.trim()).filter(Boolean),
    featured: q.featured === "true",
    sort: q.sort ?? "popular",
    limit: q.limit,
    offset: q.offset,
  });
  return c.json(result);
});

publicRoutes.get("/marketplace/listings/:slug", async (c) => {
  const slug = c.req.param("slug");
  const listing = await mkt.getListingBySlug(slug);
  if (!listing) return c.json({ error: "Listing not found" }, 404);

  // Get full environment items for the detail page
  const environment = await envs.getById(listing.environment_id);
  return c.json({ data: { listing, environment } });
});

publicRoutes.get("/marketplace/listings/:slug/reviews", async (c) => {
  const slug = c.req.param("slug");
  const listing = await mkt.getListingBySlug(slug);
  if (!listing) return c.json({ error: "Listing not found" }, 404);
  const reviews = await mkt.listReviews(listing.id);
  return c.json({ data: reviews });
});

// ─── Authed: Install / Uninstall ──────────────────────────

authedRoutes.post("/marketplace/listings/:id/install", async (c) => {
  const listingId = c.req.param("id");
  const userId = c.get("userId");
  const { workspaceId } = await c.req.json<{ workspaceId: string }>();
  if (!workspaceId) return c.json({ error: "workspaceId is required" }, 400);

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const listing = await mkt.getListingById(listingId);
  if (!listing || listing.status !== "published") {
    return c.json({ error: "Listing not found" }, 404);
  }

  // Check if already installed
  const existing = await mkt.getInstall(listingId, workspaceId);
  if (existing) {
    return c.json({ error: "Already installed in this workspace" }, 409);
  }

  // Clone the template environment into the user's workspace
  const cloned = await envs.clone(
    listing.environment_id,
    workspaceId,
    userId,
    listing.title,
  );

  // Track the installation
  const install = await mkt.installListing({
    listingId,
    userId,
    workspaceId,
    environmentId: cloned.id,
    version: listing.version,
  });

  // Apply to workspace
  await envs.applyToWorkspace(workspaceId, cloned.id);

  return c.json({ data: { install, environment: cloned } }, 201);
});

authedRoutes.delete("/marketplace/listings/:id/install", async (c) => {
  const listingId = c.req.param("id");
  const userId = c.get("userId");
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) return c.json({ error: "workspaceId query param required" }, 400);

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const install = await mkt.getInstall(listingId, workspaceId);
  if (!install) return c.json({ error: "Not installed" }, 404);

  // Remove the cloned environment and the install record
  await envs.removeFromWorkspace(workspaceId, install.environment_id);
  await envs.remove(install.environment_id);
  await mkt.uninstall(listingId, workspaceId);

  return c.json({ data: { uninstalled: true } });
});

authedRoutes.get("/:workspaceId/marketplace/installs", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const installs = await mkt.listInstallsForWorkspace(workspaceId);
  return c.json({ data: installs });
});

// ─── Authed: Reviews ──────────────────────────────────────

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(100).optional(),
  body: z.string().max(2000).optional(),
});

authedRoutes.post(
  "/marketplace/listings/:id/review",
  zValidator("json", reviewSchema),
  async (c) => {
    const listingId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const review = await mkt.addReview({
      listingId,
      userId,
      ...body,
    });
    return c.json({ data: review }, 201);
  },
);

authedRoutes.delete("/marketplace/listings/:id/review", async (c) => {
  const listingId = c.req.param("id");
  const userId = c.get("userId");
  const deleted = await mkt.deleteReview(listingId, userId);
  if (!deleted) return c.json({ error: "Review not found" }, 404);
  return c.json({ data: { deleted: true } });
});

// ─── Authed: Publish / Manage Listings ────────────────────

const createListingSchema = z.object({
  environmentId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  title: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  shortDesc: z.string().max(200).optional(),
  longDesc: z.string().max(5000).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  version: z.string().max(20).optional(),
});

authedRoutes.post(
  "/marketplace/listings",
  zValidator("json", createListingSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    // Verify the user owns the environment
    const env = await envs.getById(body.environmentId);
    if (!env || env.created_by !== userId) {
      return c.json({ error: "Environment not found or not owned by you" }, 403);
    }

    // Check slug uniqueness
    const existing = await mkt.getListingBySlug(body.slug);
    if (existing) return c.json({ error: "Slug already taken" }, 409);

    const listing = await mkt.createListing({
      ...body,
      publisherId: userId,
    });

    return c.json({ data: listing }, 201);
  },
);

const updateListingSchema = z.object({
  categoryId: z.string().uuid().nullish(),
  title: z.string().min(1).max(100).optional(),
  shortDesc: z.string().max(200).optional(),
  longDesc: z.string().max(5000).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  version: z.string().max(20).optional(),
  changelog: z.string().max(5000).optional(),
});

authedRoutes.put(
  "/marketplace/listings/:id",
  zValidator("json", updateListingSchema),
  async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const listing = await mkt.getListingById(id);
    if (!listing || listing.publisher_id !== userId) {
      return c.json({ error: "Listing not found or not owned by you" }, 403);
    }

    const updated = await mkt.updateListing(id, body);
    return c.json({ data: updated });
  },
);

// Publish action (draft/unlisted → published)
authedRoutes.post("/marketplace/listings/:id/publish", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const listing = await mkt.getListingById(id);
  if (!listing || listing.publisher_id !== userId) {
    return c.json({ error: "Listing not found or not owned by you" }, 403);
  }

  if (listing.status === "published") {
    return c.json({ error: "Already published" }, 400);
  }

  const updated = await mkt.updateListing(id, { status: "published" });
  return c.json({ data: updated });
});

authedRoutes.delete("/marketplace/listings/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const listing = await mkt.getListingById(id);
  if (!listing || listing.publisher_id !== userId) {
    return c.json({ error: "Listing not found or not owned by you" }, 403);
  }

  await mkt.deleteListing(id);
  return c.json({ data: { deleted: true } });
});

authedRoutes.get("/marketplace/my-listings", async (c) => {
  const userId = c.get("userId");
  const listings = await mkt.listMyListings(userId);
  return c.json({ data: listings });
});

// ─── Authed: Export / Import ──────────────────────────────

authedRoutes.get("/:workspaceId/environments/:envId/export", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("envId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const bundle = await mkt.buildExportBundle(envId);
  if (!bundle) return c.json({ error: "Environment not found" }, 404);

  return c.json({ data: bundle });
});

const importSchema = z.object({
  version: z.literal("1.0.0"),
  exportedAt: z.string(),
  environment: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500),
    icon: z.string().max(50),
    color: z.string().max(20),
  }),
  skills: z.array(z.object({
    name: z.string(),
    content: z.string(),
    scope: z.string(),
  })),
  rules: z.array(z.object({
    name: z.string(),
    content: z.string(),
    filePatterns: z.array(z.string()),
  })),
  instructions: z.array(z.object({
    filename: z.string(),
    content: z.string(),
  })),
  knowledgeFiles: z.array(z.object({
    filename: z.string(),
    content: z.string(),
  })),
});

authedRoutes.post(
  "/:workspaceId/environments/import",
  zValidator("json", importSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const bundle = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const env = await mkt.importBundle(workspaceId, userId, bundle);

    // Auto-apply imported environment to workspace
    await envs.applyToWorkspace(workspaceId, env.id);

    return c.json({ data: env }, 201);
  },
);

// ─── Authed: Per-Project Environment ──────────────────────

authedRoutes.get("/projects/:projectId/environment", async (c) => {
  const projectId = c.req.param("projectId");
  const projEnv = await mkt.getProjectEnvironment(projectId);
  return c.json({ data: projEnv });
});

authedRoutes.put("/projects/:projectId/environment", async (c) => {
  const projectId = c.req.param("projectId");
  const { environmentId } = await c.req.json<{ environmentId: string }>();
  if (!environmentId) return c.json({ error: "environmentId required" }, 400);
  const link = await mkt.setProjectEnvironment(projectId, environmentId);
  return c.json({ data: link });
});

authedRoutes.delete("/projects/:projectId/environment", async (c) => {
  const projectId = c.req.param("projectId");
  const cleared = await mkt.clearProjectEnvironment(projectId);
  if (!cleared) return c.json({ error: "No project environment set" }, 404);
  return c.json({ data: { cleared: true } });
});

// Resolve effective environment for a project (project > workspace > default)
authedRoutes.get("/:workspaceId/projects/:projectId/effective-environment", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const result = await mkt.resolveEffectiveEnvironment(workspaceId, projectId);
  return c.json({ data: result });
});

// ─── Mount both sub-routers ───────────────────────────────

marketplaceRoutes.route("/", publicRoutes);
marketplaceRoutes.route("/", authedRoutes);
