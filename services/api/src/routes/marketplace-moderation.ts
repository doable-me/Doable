import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { marketplaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";

/**
 * Moderation surface — split out into its own file so the main marketplace
 * routes stay focused on browsing/installing/publishing. All admin endpoints
 * live behind both authMiddleware and platformAdminMiddleware. User reports
 * only require auth.
 */

const mkt = marketplaceQueries(sql);

export const marketplaceModerationRoutes = new Hono<AuthEnv>({ strict: false });

// ─── User-facing: file a report ───────────────────────────

const reportSchema = z.object({
  reason: z.enum(["spam", "malware", "broken", "inappropriate", "copyright", "other"]),
  detail: z.string().max(2000).optional(),
});

marketplaceModerationRoutes.post(
  "/marketplace/listings/:id/report",
  authMiddleware,
  zValidator("json", reportSchema),
  async (c) => {
    const listingId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const listing = await mkt.getListingById(listingId);
    if (!listing) return c.json({ error: "Listing not found" }, 404);

    const report = await mkt.fileReport({
      listingId,
      reporterId: userId,
      reason: body.reason,
      detail: body.detail,
    });
    return c.json({ data: report }, 201);
  },
);

// ─── Admin queue ──────────────────────────────────────────

marketplaceModerationRoutes.use("/admin/marketplace/*", authMiddleware, platformAdminMiddleware);

const queueQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "withdrawn"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

marketplaceModerationRoutes.get(
  "/admin/marketplace/moderation/queue",
  zValidator("query", queueQuerySchema),
  async (c) => {
    const q = c.req.valid("query");
    const result = await mkt.listQueue({
      status: q.status,
      limit: q.limit,
      offset: q.offset,
    });
    return c.json(result);
  },
);

const queueDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional(),
});

marketplaceModerationRoutes.post(
  "/admin/marketplace/moderation/queue/:id/decision",
  zValidator("json", queueDecisionSchema),
  async (c) => {
    const queueId = c.req.param("id");
    const adminId = c.get("userId");
    const body = c.req.valid("json");

    const item = await mkt.getQueueItem(queueId);
    if (!item) return c.json({ error: "Queue item not found" }, 404);

    const newQueueStatus = body.decision === "approve" ? "approved" : "rejected";
    const newListingStatus = body.decision === "approve" ? "published" : "rejected";

    const resolved = await mkt.resolveQueueItem(queueId, {
      status: newQueueStatus,
      resolvedBy: adminId,
      note: body.note,
    });
    await mkt.updateListing(item.listing_id, { status: newListingStatus });
    await mkt.logAdminAction({
      listingId: item.listing_id,
      adminId,
      action: body.decision === "approve" ? "approve" : "reject",
      note: body.note,
    });

    return c.json({ data: resolved });
  },
);

// ─── Admin: reports ───────────────────────────────────────

const reportsQuerySchema = z.object({
  status: z.enum(["open", "reviewing", "actioned", "dismissed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

marketplaceModerationRoutes.get(
  "/admin/marketplace/reports",
  zValidator("query", reportsQuerySchema),
  async (c) => {
    const q = c.req.valid("query");
    const result = await mkt.listReports({ status: q.status, limit: q.limit, offset: q.offset });
    return c.json(result);
  },
);

const reportResolveSchema = z.object({
  decision: z.enum(["actioned", "dismissed"]),
});

marketplaceModerationRoutes.post(
  "/admin/marketplace/reports/:id/resolve",
  zValidator("json", reportResolveSchema),
  async (c) => {
    const reportId = c.req.param("id");
    const adminId = c.get("userId");
    const { decision } = c.req.valid("json");
    const updated = await mkt.resolveReport(reportId, { status: decision, resolvedBy: adminId });
    if (!updated) return c.json({ error: "Report not found" }, 404);
    return c.json({ data: updated });
  },
);

// ─── Admin: take-down / restore ──────────────────────────

const takedownSchema = z.object({
  note: z.string().max(2000).optional(),
});

marketplaceModerationRoutes.post(
  "/admin/marketplace/listings/:id/unpublish",
  zValidator("json", takedownSchema),
  async (c) => {
    const id = c.req.param("id");
    const adminId = c.get("userId");
    const { note } = c.req.valid("json");
    const updated = await mkt.updateListing(id, { status: "unlisted" });
    if (!updated) return c.json({ error: "Listing not found" }, 404);
    await mkt.logAdminAction({ listingId: id, adminId, action: "unpublish", note });
    return c.json({ data: updated });
  },
);

marketplaceModerationRoutes.post(
  "/admin/marketplace/listings/:id/restore",
  zValidator("json", takedownSchema),
  async (c) => {
    const id = c.req.param("id");
    const adminId = c.get("userId");
    const { note } = c.req.valid("json");
    const updated = await mkt.updateListing(id, { status: "published" });
    if (!updated) return c.json({ error: "Listing not found" }, 404);
    await mkt.logAdminAction({ listingId: id, adminId, action: "restore", note });
    return c.json({ data: updated });
  },
);

marketplaceModerationRoutes.get("/admin/marketplace/listings/:id/audit", async (c) => {
  const id = c.req.param("id");
  const actions = await mkt.listAdminActions(id);
  return c.json({ data: actions });
});

// ─── Admin: verified publisher toggle ────────────────────

const verifyPublisherSchema = z.object({
  verified: z.boolean(),
});

marketplaceModerationRoutes.post(
  "/admin/marketplace/publishers/:userId/verify",
  zValidator("json", verifyPublisherSchema),
  async (c) => {
    const userId = c.req.param("userId");
    const adminId = c.get("userId");
    const { verified } = c.req.valid("json");
    await mkt.setPublisherVerified(userId, verified);
    return c.json({
      data: {
        userId,
        verified,
        action: verified ? "verify_publisher" : "unverify_publisher",
      },
    });
  },
);
