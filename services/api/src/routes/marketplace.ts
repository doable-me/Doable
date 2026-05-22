import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { marketplaceQueries, environmentQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { bundleService } from "../services/bundle-service.js";
import { JSON_V1_FORMAT, STANDARDS_ZIP_FORMAT } from "@doable/marketplace-bundle";
import { getKVStore } from "@doable/shared/kv-store";

const kv = getKVStore();
const CATEGORIES_CACHE_KEY = "marketplace:categories:v1";
const CATEGORIES_TTL_MS = 5 * 60 * 1000; // 5 min

const FEATURED_LISTINGS_KEY = "marketplace:featured:listings:v1";
const FEATURED_DISCOVER_KEY = "marketplace:featured:discover:v1";
const FEATURED_TTL_MS = 60 * 1000; // 1 min — MV refreshes every 5 min so 1 min staleness is fine

const mkt = marketplaceQueries(sql);
const envs = environmentQueries(sql);
const ws = workspaceQueries(sql);

export const marketplaceRoutes = new Hono<AuthEnv>({ strict: false });

// Public browse routes (no auth needed)
const publicRoutes = new Hono<AuthEnv>({ strict: false });
const authedRoutes = new Hono<AuthEnv>({ strict: false });

authedRoutes.use("*", authMiddleware);

// ─── Role helper ──────────────────────────────────────────

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await ws.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

// ─── Public: Browse / Search / Categories ─────────────────

/**
 * Bare /marketplace — public catalog summary. Without this, the route falls
 * through to the authed sub-router and 401s anonymous browsers, violating
 * TC-MARKET-LIST-001 ("no auth wall"). Returns a small overview object so
 * web clients linking directly to /marketplace get a useful payload, plus
 * pointers to the dedicated browse / category endpoints.
 * See BUG-PUB-003.
 */
publicRoutes.get("/marketplace", async (c) => {
  try {
    const [categories, listings] = await Promise.all([
      mkt.listCategories().catch(() => []),
      mkt.browseListings({ sort: "popular", limit: 12 }).catch(() => ({ data: [], total: 0 })),
    ]);
    return c.json({
      data: {
        categories,
        featured: listings.data,
        total: listings.total,
      },
      links: {
        listings: "/marketplace/listings",
        categories: "/marketplace/categories",
        featured: "/marketplace/featured",
      },
    });
  } catch (err) {
    console.warn("[marketplace] root summary failed:", err);
    return c.json({
      data: { categories: [], featured: [], total: 0 },
      links: {
        listings: "/marketplace/listings",
        categories: "/marketplace/categories",
        featured: "/marketplace/featured",
      },
    });
  }
});

publicRoutes.get("/marketplace/categories", async (c) => {
  // KV-cached: categories change rarely, but the endpoint is hit on every
  // marketplace landing render. 5-min TTL strikes a good balance.
  const cached = await kv.get<unknown[]>(CATEGORIES_CACHE_KEY);
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json({ data: cached });
  }
  const data = await mkt.listCategories();
  await kv.set(CATEGORIES_CACHE_KEY, data, CATEGORIES_TTL_MS);
  c.header("X-Cache", "MISS");
  return c.json({ data });
});

/**
 * Featured strip — reads from mv_marketplace_featured (denormalised).
 * Wrapped in a 1-min KV cache to absorb refresh storms on the landing page.
 */
publicRoutes.get("/marketplace/featured", async (c) => {
  const cached = await kv.get<unknown[]>(FEATURED_LISTINGS_KEY);
  if (cached) {
    c.header("X-Cache", "HIT");
    return c.json({ data: cached });
  }
  try {
    const data = await mkt.listFeaturedListings(12);
    await kv.set(FEATURED_LISTINGS_KEY, data, FEATURED_TTL_MS);
    c.header("X-Cache", "MISS");
    return c.json({ data });
  } catch (err) {
    // The MV may not exist yet on a fresh DB — fall back gracefully.
    console.warn("[marketplace.featured] falling back to live query:", err);
    const data = await mkt.browseListings({ featured: true, limit: 12, sort: "popular" });
    return c.json({ data: data.data });
  }
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

/**
 * Bundle download — returns the raw artifact bytes for the requested
 * listing/version/format. Used by external installers and for users who
 * want to inspect the bundle before installing.
 */
publicRoutes.get("/marketplace/listings/:slug/bundle", async (c) => {
  const slug = c.req.param("slug");
  const formatParam = c.req.query("format") ?? JSON_V1_FORMAT;
  if (formatParam !== JSON_V1_FORMAT && formatParam !== STANDARDS_ZIP_FORMAT) {
    return c.json({ error: `Unsupported format: ${formatParam}` }, 400);
  }
  const format = formatParam as typeof JSON_V1_FORMAT | typeof STANDARDS_ZIP_FORMAT;

  const listing = await mkt.getListingBySlug(slug);
  if (!listing || listing.status !== "published") {
    return c.json({ error: "Listing not found" }, 404);
  }

  const artifact = await mkt.getArtifact(listing.id, listing.version, format);
  if (!artifact) {
    return c.json({ error: `No artifact in format ${format}` }, 404);
  }

  const filename = `${listing.slug}-${listing.version}.${format === STANDARDS_ZIP_FORMAT ? "zip" : "json"}`;
  const contentType =
    format === STANDARDS_ZIP_FORMAT ? "application/zip" : "application/json";

  return new Response(new Uint8Array(artifact.contents), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": artifact.byte_size.toString(),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Bundle-SHA256": artifact.sha256,
      "Cache-Control": "public, max-age=300",
    },
  });
});

// ─── Public: JSON feed for aggregators ────────────────────

publicRoutes.get("/marketplace/feed.json", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);
  const result = await mkt.browseListings({ sort: "popular", limit, offset });
  const listings = result.data ?? [];
  return c.json({
    version: "1.0",
    generatedAt: new Date().toISOString(),
    items: listings.map((l) => ({
      id: l.id,
      slug: l.slug,
      name: l.title,
      description: l.short_desc,
      category: l.category_slug,
      version: l.version,
      rating: l.avg_rating,
      installs: l.install_count,
      publishedAt: l.published_at,
    })),
  }, 200, { "Cache-Control": "public, max-age=60" });
});

// ─── Authed: Install / Uninstall ──────────────────────────

/**
 * Install a published listing into the caller's workspace.
 *
 * Strategy: prefer materialising from the persisted bundle artifact
 * (cheap, format-portable, immutable copy). If no artifact has been built
 * yet (legacy listings created before bundles existed), fall back to
 * cloning the source environment directly.
 */
authedRoutes.post("/marketplace/listings/:id/install", async (c) => {
  const listingId = c.req.param("id");
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(listingId)) return c.json({ error: "Listing not found" }, 404);

  const userId = c.get("userId");
  const { workspaceId } = await c.req.json<{ workspaceId: string }>();
  if (!workspaceId) return c.json({ error: "workspaceId is required" }, 400);

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  // Parallelise the three independent reads we need before installing.
  // (getListingById + getInstall don't depend on each other; we'll skip
  // the artifact result if the listing turns out invalid.)
  const [listing, existingInstall] = await Promise.all([
    mkt.getListingById(listingId),
    mkt.getInstall(listingId, workspaceId),
  ]);
  if (!listing || listing.status !== "published") {
    return c.json({ error: "Listing not found" }, 404);
  }
  if (existingInstall) {
    return c.json({ error: "Already installed in this workspace" }, 409);
  }

  // Try artifact-first install path
  const format = (listing.bundle_format ?? JSON_V1_FORMAT) as
    | typeof JSON_V1_FORMAT
    | typeof STANDARDS_ZIP_FORMAT;
  const artifact = await mkt.getArtifact(listingId, listing.version, format);

  let installedEnv;
  if (artifact) {
    installedEnv = await bundleService.installFromArtifact({
      listingId,
      version: listing.version,
      format,
      workspaceId,
      userId,
    });
  } else {
    // Legacy fallback: clone the source environment directly
    installedEnv = await envs.clone(
      listing.environment_id,
      workspaceId,
      userId,
      listing.title,
    );
  }

  const install = await mkt.installListing({
    listingId,
    userId,
    workspaceId,
    environmentId: installedEnv.id,
    version: listing.version,
  });
  await envs.applyToWorkspace(workspaceId, installedEnv.id);

  return c.json({ data: { install, environment: installedEnv } }, 201);
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

    const env = await envs.getById(body.environmentId);
    if (!env || env.created_by !== userId) {
      return c.json({ error: "Environment not found or not owned by you" }, 403);
    }

    const existing = await mkt.getListingBySlug(body.slug);
    if (existing) return c.json({ error: "Slug already taken" }, 409);

    const listing = await mkt.createListing({
      ...body,
      publisherId: userId,
    });

    // Build a draft artifact immediately so the wizard preview / install
    // dialog has something concrete to inspect (no separate "build" step
    // required for the happy path).
    const built = await bundleService.buildAndStoreArtifact({
      listingId: listing.id,
      environmentId: body.environmentId,
      format: JSON_V1_FORMAT,
      metadataOverrides: {
        name: body.title,
        description: body.shortDesc ?? body.longDesc ?? "",
        version: body.version ?? "1.0.0",
        tags: body.tags ?? [],
        slug: body.slug,
      },
    });

    return c.json(
      {
        data: {
          listing,
          bundle: built
            ? {
                format: JSON_V1_FORMAT,
                sha256: built.sha256,
                byteSize: built.byteSize,
                summary: built.summary,
                requiresReview: built.requiresReview,
              }
            : null,
        },
      },
      201,
    );
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

/**
 * Publish: rebuilds the artifact at the current version, then either flips
 * to "published" (no high-trust connectors) or "pending" (requires moderator
 * review). The moderation queue itself ships in Phase 3.
 */
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

  // Force a fresh artifact build at the current version
  const built = await bundleService.buildAndStoreArtifact({
    listingId: listing.id,
    environmentId: listing.environment_id,
    format: (listing.bundle_format ?? JSON_V1_FORMAT) as
      | typeof JSON_V1_FORMAT
      | typeof STANDARDS_ZIP_FORMAT,
    metadataOverrides: {
      name: listing.title,
      description: listing.short_desc ?? listing.long_desc ?? "",
      version: listing.version,
      tags: listing.tags ?? [],
      slug: listing.slug,
    },
  });
  if (!built) {
    return c.json({ error: "Source environment not found" }, 404);
  }

  const nextStatus: "published" | "pending" = built.requiresReview ? "pending" : "published";
  const updated = await mkt.updateListing(id, { status: nextStatus });

  if (built.requiresReview) {
    await mkt.enqueueReview({
      listingId: id,
      version: listing.version,
      reason: built.reviewReason ?? "Requires moderator review",
      manifestSummary: built.summary as unknown as Record<string, unknown>,
      submittedBy: userId,
    });
  } else {
    await mkt.logAdminAction({
      listingId: id,
      adminId: userId,
      action: "approve",
      note: "Auto-approved (no high-trust connectors).",
    });
  }

  return c.json({
    data: updated,
    moderation: built.requiresReview
      ? {
          required: true,
          reason: built.reviewReason,
          message:
            "Your listing was submitted for review. We manually review listings that include third-party connectors.",
        }
      : { required: false },
  });
});

/**
 * Owner-triggered rebuild — re-encodes the current source environment and
 * stores a fresh artifact. Useful after editing the source environment or
 * when changing format.
 */
const rebuildSchema = z.object({
  format: z.enum([JSON_V1_FORMAT, STANDARDS_ZIP_FORMAT]).optional(),
});

authedRoutes.post(
  "/marketplace/listings/:id/build",
  zValidator("json", rebuildSchema),
  async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const listing = await mkt.getListingById(id);
    if (!listing || listing.publisher_id !== userId) {
      return c.json({ error: "Listing not found or not owned by you" }, 403);
    }

    const format = (body.format ?? listing.bundle_format ?? JSON_V1_FORMAT) as
      | typeof JSON_V1_FORMAT
      | typeof STANDARDS_ZIP_FORMAT;

    const built = await bundleService.buildAndStoreArtifact({
      listingId: id,
      environmentId: listing.environment_id,
      format,
      metadataOverrides: {
        name: listing.title,
        description: listing.short_desc ?? listing.long_desc ?? "",
        version: listing.version,
        tags: listing.tags ?? [],
        slug: listing.slug,
      },
    });
    if (!built) return c.json({ error: "Source environment not found" }, 404);

    return c.json({
      data: {
        format,
        sha256: built.sha256,
        byteSize: built.byteSize,
        summary: built.summary,
        requiresReview: built.requiresReview,
      },
    });
  },
);

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
    await envs.applyToWorkspace(workspaceId, env.id);

    return c.json({ data: env }, 201);
  },
);

/**
 * Bundle-aware import endpoint. Accepts a multipart upload of a
 * `standards.zip.v1` file and materialises it directly via the bundle
 * service. Decoding is delegated to @doable/marketplace-bundle so this
 * route stays codec-agnostic.
 */
authedRoutes.post("/:workspaceId/environments/import-bundle", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const body = await c.req.parseBody();
  const fileEntry = body["file"];
  if (!(fileEntry instanceof File)) {
    return c.json({ error: "Missing 'file' field (expected a .zip upload)" }, 400);
  }
  const formatRaw = (body["format"] as string | undefined) ?? STANDARDS_ZIP_FORMAT;
  if (formatRaw !== JSON_V1_FORMAT && formatRaw !== STANDARDS_ZIP_FORMAT) {
    return c.json({ error: `Unsupported format: ${formatRaw}` }, 400);
  }
  const format = formatRaw as typeof JSON_V1_FORMAT | typeof STANDARDS_ZIP_FORMAT;

  const bytes = new Uint8Array(await fileEntry.arrayBuffer());
  let manifest;
  try {
    manifest = bundleService.decode({ format, contents: bytes });
  } catch (e) {
    return c.json(
      {
        error: "Bundle could not be decoded",
        detail: e instanceof Error ? e.message : String(e),
      },
      400,
    );
  }

  const env = await bundleService.installManifestIntoWorkspace(workspaceId, userId, manifest);
  await envs.applyToWorkspace(workspaceId, env.id);
  return c.json({ data: env }, 201);
});

/**
 * URL import — pulls a public GitHub repo (or sub-path) as a zip and
 * decodes it as a Standards Zip. We restrict to github.com to keep the
 * blast radius bounded.
 */
const importUrlSchema = z.object({
  url: z.string().url(),
});

authedRoutes.post(
  "/:workspaceId/environments/import-url",
  zValidator("json", importUrlSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const { url } = c.req.valid("json");
    const u = new URL(url);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") {
      return c.json({ error: "Only github.com URLs are supported" }, 400);
    }

    // Resolve to the repo zipball — supports both /owner/repo and
    // /owner/repo/tree/<ref>/... forms. Sub-path filtering happens
    // client-side on the decoded manifest.
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return c.json({ error: "URL must be /owner/repo[/...]" }, 400);
    const owner = segs[0];
    const repo = segs[1];
    const ref = segs[2] === "tree" && segs[3] ? segs[3] : "HEAD";
    const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/${ref}`;

    const resp = await fetch(zipUrl, {
      headers: { "User-Agent": "doable-marketplace-importer" },
    });
    if (!resp.ok) {
      return c.json({ error: `Failed to fetch repo: ${resp.status}` }, 400);
    }
    const bytes = new Uint8Array(await resp.arrayBuffer());

    let manifest;
    try {
      manifest = bundleService.decode({ format: STANDARDS_ZIP_FORMAT, contents: bytes });
    } catch (e) {
      return c.json(
        {
          error: "Could not decode repo as a Standards Zip bundle",
          detail: e instanceof Error ? e.message : String(e),
        },
        400,
      );
    }

    const env = await bundleService.installManifestIntoWorkspace(workspaceId, userId, manifest);
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
