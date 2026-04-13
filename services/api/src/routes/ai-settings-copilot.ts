import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { aiSettingsQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import type { WorkspaceRole } from "@doable/shared";
import { CopilotEngine } from "../ai/providers/copilot.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";

const aiSettings = aiSettingsQueries(sql, ENCRYPTION_KEY);
const workspaces = workspaceQueries(sql);

export const aiSettingsCopilotRoutes = new Hono<AuthEnv>();

aiSettingsCopilotRoutes.use("*", authMiddleware);

// ─── Role helpers ──────────────────────────────────────────
const ADMIN_ROLES: WorkspaceRole[] = ["owner", "admin"];

async function requireAdmin(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  if (!ADMIN_ROLES.includes(role)) return "Requires admin or owner role";
  return null;
}

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

// ─── GitHub Copilot Accounts ──────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/copilot-accounts
aiSettingsCopilotRoutes.get("/:workspaceId/ai-settings/copilot-accounts", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const accounts = await aiSettings.listCopilotAccounts(workspaceId);
  return c.json({ data: accounts });
});

const addCopilotAccountSchema = z.object({
  label: z.string().min(1).max(100),
  githubToken: z.string().min(1),
});

// POST /workspaces/:workspaceId/ai-settings/copilot-accounts
aiSettingsCopilotRoutes.post(
  "/:workspaceId/ai-settings/copilot-accounts",
  zValidator("json", addCopilotAccountSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const { label, githubToken } = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    // Validate the token by fetching the GitHub user
    let ghUser: { login: string; id: number };
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${githubToken}` },
      });
      if (!res.ok) return c.json({ error: "Invalid GitHub token" }, 400);
      ghUser = (await res.json()) as { login: string; id: number };
    } catch {
      return c.json({ error: "Failed to validate GitHub token" }, 400);
    }

    // Also verify Copilot API access
    try {
      const { models } = await CopilotEngine.validateToken(githubToken);
      if (models.length === 0) {
        return c.json({ error: "GitHub token is valid but has no Copilot access. Check your Copilot subscription." }, 400);
      }
    } catch (sdkErr) {
      const msg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      if (msg.includes("not authorized") || msg.includes("unauthorized")) {
        return c.json({ error: "GitHub token works but Copilot API access is denied. Re-authorize with Copilot scopes or check your subscription." }, 400);
      }
      console.warn("[AI Settings] Copilot access check failed (non-blocking):", msg);
    }

    try {
      const account = await aiSettings.addCopilotAccount({
        workspaceId,
        label,
        githubLogin: ghUser.login,
        githubId: String(ghUser.id),
        token: githubToken,
        addedBy: userId,
      });

      const { encrypted_token, ...safe } = account;
      return c.json({ data: safe }, 201);
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return c.json({ error: "This GitHub account is already connected" }, 409);
      }
      throw dbErr;
    }
  }
);

const updateCopilotAccountSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  githubToken: z.string().min(1).optional(),
});

// PATCH /workspaces/:workspaceId/ai-settings/copilot-accounts/:id
aiSettingsCopilotRoutes.patch(
  "/:workspaceId/ai-settings/copilot-accounts/:id",
  zValidator("json", updateCopilotAccountSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const accountId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const updated = await aiSettings.updateCopilotAccount(accountId, {
      label: body.label,
      token: body.githubToken,
      isValid: body.githubToken ? true : undefined,
    });

    if (!updated) return c.json({ error: "Account not found" }, 404);

    const { encrypted_token, ...safe } = updated;
    return c.json({ data: safe });
  }
);

// DELETE /workspaces/:workspaceId/ai-settings/copilot-accounts/:id
aiSettingsCopilotRoutes.delete("/:workspaceId/ai-settings/copilot-accounts/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const accountId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const deleted = await aiSettings.deleteCopilotAccount(accountId);
  if (!deleted) return c.json({ error: "Account not found" }, 404);

  return c.json({ data: { id: accountId, deleted: true } });
});

// POST /workspaces/:workspaceId/ai-settings/copilot-accounts/:id/validate
aiSettingsCopilotRoutes.post("/:workspaceId/ai-settings/copilot-accounts/:id/validate", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const accountId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const token = await aiSettings.getCopilotAccountToken(accountId);
  if (!token) return c.json({ error: "Account not found or invalid" }, 404);

  try {
    // 1. Verify GitHub token is valid
    const ghRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!ghRes.ok) {
      await aiSettings.updateCopilotAccount(accountId, { isValid: false });
      return c.json({ data: { valid: false, status: ghRes.status, error: "GitHub token is invalid or expired" } });
    }

    // 2. Verify Copilot API access
    let copilotValid = false;
    let copilotError: string | undefined;
    try {
      const { models } = await CopilotEngine.validateToken(token);
      copilotValid = models.length > 0;
      if (!copilotValid) copilotError = "No models available — Copilot access may be restricted";
    } catch (sdkErr) {
      copilotError = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      if (copilotError.includes("not authorized") || copilotError.includes("unauthorized")) {
        copilotError = "GitHub token works but Copilot API access is denied. Check your Copilot subscription or re-authorize with Copilot scopes.";
      }
    }

    if (!copilotValid) {
      await aiSettings.updateCopilotAccount(accountId, { isValid: false });
      return c.json({ data: { valid: false, status: 200, error: copilotError } });
    }

    await aiSettings.updateCopilotAccount(accountId, { isValid: true });
    return c.json({ data: { valid: true, status: 200 } });
  } catch {
    await aiSettings.updateCopilotAccount(accountId, { isValid: false });
    return c.json({ data: { valid: false, status: 0, error: "Connection check failed" } });
  }
});
