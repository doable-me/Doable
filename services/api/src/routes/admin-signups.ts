/**
 * Admin signup-approval API.
 *
 * GET    /admin/signups/config           — current { enabled, pending_message }
 * PUT    /admin/signups/config           — update config
 * GET    /admin/signups                  — list pending signups (+ recent decisions)
 * POST   /admin/signups/:userId/approve  — mark approved (allows login)
 * POST   /admin/signups/:userId/deny     — mark rejected (login blocked)
 * POST   /admin/signups/:userId/block    — mark rejected + add email to blocklist
 * GET    /admin/signups/blocked          — list blocked emails
 * DELETE /admin/signups/blocked/:email   — remove from blocklist
 */
import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { signupApprovalQueries, DEFAULT_PENDING_MESSAGE } from "@doable/db/queries/signup-approval.js";
import { ensureWorkspace } from "./auth/helpers.js";

const signupApproval = signupApprovalQueries(sql);

export const adminSignupRoutes = new Hono<AuthEnv>({ strict: false });

adminSignupRoutes.use("*", authMiddleware);
adminSignupRoutes.use("*", platformAdminMiddleware);

// ─── Config ────────────────────────────────────────────────

adminSignupRoutes.get("/signups/config", async (c) => {
  const cfg = await signupApproval.getConfig();
  return c.json(cfg);
});

const configSchema = z.object({
  enabled: z.boolean(),
  pending_message: z.string().max(2000).optional(),
});

adminSignupRoutes.put("/signups/config", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);

  const userId = c.get("userId");
  const next = await signupApproval.setConfig({
    enabled: parsed.data.enabled,
    pending_message: parsed.data.pending_message ?? DEFAULT_PENDING_MESSAGE,
  }, userId ?? null);
  return c.json(next);
});

// ─── Queue ─────────────────────────────────────────────────

adminSignupRoutes.get("/signups", async (c) => {
  const [pending, recentlyDecided, cfg] = await Promise.all([
    signupApproval.listPending(),
    signupApproval.listRecentlyDecided(20),
    signupApproval.getConfig(),
  ]);
  return c.json({ pending, recentlyDecided, config: cfg });
});

// ─── Decisions ─────────────────────────────────────────────

adminSignupRoutes.post("/signups/:userId/approve", async (c) => {
  const userId = c.req.param("userId");
  const user = await signupApproval.setStatus(userId, "approved");
  if (!user) return c.json({ error: "User not found" }, 404);

  // Now that they're approved, make sure their personal workspace exists
  // (we skipped this at signup time for password signups).
  await ensureWorkspace(user.id, user.display_name, user.email).catch(() => { /* non-fatal */ });

  return c.json({ ok: true, user_id: user.id, approval_status: user.approval_status });
});

adminSignupRoutes.post("/signups/:userId/deny", async (c) => {
  const userId = c.req.param("userId");
  const user = await signupApproval.setStatus(userId, "rejected");
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ ok: true, user_id: user.id, approval_status: user.approval_status });
});

const blockSchema = z.object({ reason: z.string().max(500).optional() }).optional();

adminSignupRoutes.post("/signups/:userId/block", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json().catch(() => undefined);
  const parsed = blockSchema.safeParse(body);
  const reason = parsed.success ? parsed.data?.reason ?? null : null;

  const user = await signupApproval.setStatus(userId, "rejected");
  if (!user) return c.json({ error: "User not found" }, 404);

  const adminId = c.get("userId");
  await signupApproval.blockEmail(user.email, reason, adminId ?? null);
  return c.json({ ok: true, user_id: user.id, email: user.email, blocked: true });
});

// ─── Blocked emails ────────────────────────────────────────

adminSignupRoutes.get("/signups/blocked", async (c) => {
  const blocked = await signupApproval.listBlocked();
  return c.json({ blocked });
});

adminSignupRoutes.delete("/signups/blocked/:email", async (c) => {
  const email = c.req.param("email");
  const removed = await signupApproval.unblockEmail(email);
  return c.json({ ok: removed });
});
