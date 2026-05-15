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

export const aiSettingsCopilotRoutes = new Hono<AuthEnv>({ strict: false });

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

/**
 * Authorize a mutation on an existing copilot account row. Migration 072.
 * - workspace-scoped row → requires owner/admin role
 * - user-scoped row      → caller must be owner_user_id
 *
 * Returns the auth-info row when the caller may proceed, or { error, status }
 * to be returned directly. Treats a missing row as 404.
 */
async function authorizeCopilotAccountMutation(
  workspaceId: string,
  accountId: string,
  callerId: string,
): Promise<
  | { ok: true; row: NonNullable<Awaited<ReturnType<typeof aiSettings.getCopilotAccountAuthInfo>>> }
  | { ok: false; error: string; status: 403 | 404 }
> {
  const row = await aiSettings.getCopilotAccountAuthInfo(accountId);
  if (!row || row.workspace_id !== workspaceId) {
    return { ok: false, error: "Account not found", status: 404 };
  }
  if (row.scope === "user") {
    if (row.owner_user_id !== callerId) {
      // Don't reveal that the row exists for someone else.
      return { ok: false, error: "Account not found", status: 404 };
    }
    // Personal row owner must still be a member of the workspace.
    const memErr = await requireMember(workspaceId, callerId);
    if (memErr) return { ok: false, error: memErr, status: 403 };
    return { ok: true, row };
  }
  // workspace-scoped
  const adminErr = await requireAdmin(workspaceId, callerId);
  if (adminErr) return { ok: false, error: adminErr, status: 403 };
  return { ok: true, row };
}

// ─── GitHub Copilot Accounts ──────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/copilot-accounts
//
// Returns the workspace-shared accounts plus the caller's own personal
// accounts. Other members' personal accounts are never disclosed.
aiSettingsCopilotRoutes.get("/:workspaceId/ai-settings/copilot-accounts", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const accounts = await aiSettings.listCopilotAccounts(workspaceId, userId);
  return c.json({ data: accounts });
});

const addCopilotAccountSchema = z.object({
  label: z.string().min(1).max(100),
  githubToken: z.string().min(1),
  /**
   * 'user' (default): personal — only the caller can see/use it.
   * 'workspace': shared with the whole workspace (admin-only).
   * Default biases toward privacy so a client that omits scope doesn't
   * accidentally publish a member's personal token to the workspace.
   */
  scope: z.enum(["workspace", "user"]).default("user"),
});

// POST /workspaces/:workspaceId/ai-settings/copilot-accounts
aiSettingsCopilotRoutes.post(
  "/:workspaceId/ai-settings/copilot-accounts",
  zValidator("json", addCopilotAccountSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const { label, githubToken, scope } = c.req.valid("json");

    // Authorization is scope-aware: admins to share with the workspace,
    // any member to add their own personal account.
    const authErr = scope === "workspace"
      ? await requireAdmin(workspaceId, userId)
      : await requireMember(workspaceId, userId);
    if (authErr) return c.json({ error: authErr }, 403);

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
        scope,
        ownerUserId: scope === "user" ? userId : null,
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

    const auth = await authorizeCopilotAccountMutation(workspaceId, accountId, userId);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);

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

  const auth = await authorizeCopilotAccountMutation(workspaceId, accountId, userId);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const deleted = await aiSettings.deleteCopilotAccount(accountId);
  if (!deleted) return c.json({ error: "Account not found" }, 404);

  return c.json({ data: { id: accountId, deleted: true } });
});

// POST /workspaces/:workspaceId/ai-settings/copilot-accounts/:id/validate
aiSettingsCopilotRoutes.post("/:workspaceId/ai-settings/copilot-accounts/:id/validate", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const accountId = c.req.param("id");
  const userId = c.get("userId");

  const auth = await authorizeCopilotAccountMutation(workspaceId, accountId, userId);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

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
