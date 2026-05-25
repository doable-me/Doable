import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { aiSettingsQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import type { WorkspaceRole } from "@doable/shared";
import { ENCRYPTION_KEY } from "../lib/secrets.js";
import { hasWorkspaceReadAccessViaProject } from "./projects/helpers.js";

const aiSettings = aiSettingsQueries(sql, ENCRYPTION_KEY);
const workspaces = workspaceQueries(sql);

export const aiSettingsConfigRoutes = new Hono<AuthEnv>({ strict: false });

aiSettingsConfigRoutes.use("*", authMiddleware);

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

// ─── Workspace AI Defaults ────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/defaults
aiSettingsConfigRoutes.get("/:workspaceId/ai-settings/defaults", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const settings = await aiSettings.getSettings(workspaceId);
  return c.json({
    data: settings ?? {
      workspace_id: workspaceId,
      default_source: "copilot",
      default_copilot_account_id: null,
      default_copilot_model: null,
      default_provider_id: null,
      default_provider_model: null,
      default_model: null,
      suggestion_source: "copilot",
      suggestion_copilot_account_id: null,
      suggestion_copilot_model: null,
      suggestion_provider_id: null,
      suggestion_provider_model: null,
      suggestion_model: null,
      enforce_ai: false,
      enforced_copilot_account_id: null,
      enforced_provider_id: null,
      enforced_model: null,
      show_model_selector: false,
      default_framework_id: null,
      updated_by: null,
    },
  });
});

const VALID_FRAMEWORK_IDS = [
  "vite-react",
  "nextjs-app",
  "nuxt",
  "sveltekit",
  "astro",
  "hono",
  "fastapi",
  "django",
] as const;

const updateDefaultsSchema = z.object({
  defaultSource: z.enum(["copilot", "custom"]).optional(),
  defaultCopilotAccountId: z.string().uuid().nullable().optional(),
  defaultCopilotModel: z.string().max(100).nullable().optional(),
  defaultProviderId: z.string().uuid().nullable().optional(),
  defaultProviderModel: z.string().max(100).nullable().optional(),
  suggestionSource: z.enum(["copilot", "custom"]).optional(),
  suggestionCopilotAccountId: z.string().uuid().nullable().optional(),
  suggestionCopilotModel: z.string().max(100).nullable().optional(),
  suggestionProviderId: z.string().uuid().nullable().optional(),
  suggestionProviderModel: z.string().max(100).nullable().optional(),
  enforceAi: z.boolean().optional(),
  enforcedCopilotAccountId: z.string().uuid().nullable().optional(),
  enforcedProviderId: z.string().uuid().nullable().optional(),
  enforcedModel: z.string().max(100).nullable().optional(),
  showModelSelector: z.boolean().optional(),
  defaultFrameworkId: z.enum(VALID_FRAMEWORK_IDS).nullable().optional(),
});

// PUT /workspaces/:workspaceId/ai-settings/defaults
aiSettingsConfigRoutes.put(
  "/:workspaceId/ai-settings/defaults",
  zValidator("json", updateDefaultsSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    try {
      const settings = await aiSettings.upsertSettings({
        workspaceId,
        defaultSource: body.defaultSource,
        defaultCopilotAccountId: body.defaultCopilotAccountId,
        defaultCopilotModel: body.defaultCopilotModel,
        defaultProviderId: body.defaultProviderId,
        defaultProviderModel: body.defaultProviderModel,
        suggestionSource: body.suggestionSource,
        suggestionCopilotAccountId: body.suggestionCopilotAccountId,
        suggestionCopilotModel: body.suggestionCopilotModel,
        suggestionProviderId: body.suggestionProviderId,
        suggestionProviderModel: body.suggestionProviderModel,
        enforceAi: body.enforceAi,
        enforcedCopilotAccountId: body.enforcedCopilotAccountId,
        enforcedProviderId: body.enforcedProviderId,
        enforcedModel: body.enforcedModel,
        showModelSelector: body.showModelSelector,
        defaultFrameworkId: body.defaultFrameworkId,
        updatedBy: userId,
      });

      return c.json({ data: settings });
    } catch (e) {
      // The DB enforces that workspace defaults reference workspace-scoped
      // providers/accounts (not personal ones), since personal rows aren't
      // visible to other members. Surface this as a 400 with a clear,
      // user-actionable message instead of bubbling a generic 500.
      const msg = (e as Error)?.message ?? "";
      if (/must reference a workspace-scoped/i.test(msg)) {
        return c.json(
          {
            error: "invalid_provider_scope",
            message:
              "Workspace defaults can only use workspace-shared providers or GitHub accounts. " +
              "Add a workspace-shared provider in the Connections tab, or set this as a Personal Override instead.",
          },
          400,
        );
      }
      throw e;
    }
  }
);

// ─── User AI Preferences ─────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/user-preferences
aiSettingsConfigRoutes.get("/:workspaceId/ai-settings/user-preferences", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const [preferences, settings] = await Promise.all([
    aiSettings.getUserPreferences(workspaceId, userId),
    aiSettings.getSettings(workspaceId),
  ]);

  return c.json({
    data: {
      preferences: preferences ?? null,
      enforcement: {
        enforce_ai: settings?.enforce_ai ?? false,
        enforced_copilot_account_id: settings?.enforced_copilot_account_id ?? null,
        enforced_provider_id: settings?.enforced_provider_id ?? null,
        enforced_model: settings?.enforced_model ?? null,
      },
    },
  });
});

const updateUserPreferencesSchema = z.object({
  source: z.enum(["copilot", "custom"]).optional(),
  copilotAccountId: z.string().uuid().nullable().optional(),
  copilotModel: z.string().max(100).nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  providerModel: z.string().max(100).nullable().optional(),
  suggestionSource: z.enum(["copilot", "custom"]).optional(),
  suggestionCopilotAccountId: z.string().uuid().nullable().optional(),
  suggestionCopilotModel: z.string().max(100).nullable().optional(),
  suggestionProviderId: z.string().uuid().nullable().optional(),
  suggestionProviderModel: z.string().max(100).nullable().optional(),
});

// PUT /workspaces/:workspaceId/ai-settings/user-preferences
aiSettingsConfigRoutes.put(
  "/:workspaceId/ai-settings/user-preferences",
  zValidator("json", updateUserPreferencesSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const settings = await aiSettings.getSettings(workspaceId);
    if (settings?.enforce_ai) {
      return c.json({ error: "AI model is enforced by workspace admin" }, 403);
    }

    const result = await aiSettings.upsertUserPreferences({
      workspaceId,
      userId,
      source: body.source,
      copilotAccountId: body.copilotAccountId,
      copilotModel: body.copilotModel,
      providerId: body.providerId,
      providerModel: body.providerModel,
      suggestionSource: body.suggestionSource,
      suggestionCopilotAccountId: body.suggestionCopilotAccountId,
      suggestionCopilotModel: body.suggestionCopilotModel,
      suggestionProviderId: body.suggestionProviderId,
      suggestionProviderModel: body.suggestionProviderModel,
    });

    return c.json({ data: result });
  }
);

// ─── User AI Allocations (admin manages other users) ─────

// GET /workspaces/:workspaceId/ai-settings/user-allocations
aiSettingsConfigRoutes.get("/:workspaceId/ai-settings/user-allocations", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const rows = await aiSettings.listAllUserPreferences(workspaceId);
  return c.json({ data: rows });
});

const updateUserAllocationSchema = z.object({
  source: z.enum(["copilot", "custom"]).optional(),
  copilotAccountId: z.string().uuid().nullable().optional(),
  copilotModel: z.string().max(100).nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  providerModel: z.string().max(100).nullable().optional(),
  suggestionSource: z.enum(["copilot", "custom"]).optional(),
  suggestionCopilotAccountId: z.string().uuid().nullable().optional(),
  suggestionCopilotModel: z.string().max(100).nullable().optional(),
  suggestionProviderId: z.string().uuid().nullable().optional(),
  suggestionProviderModel: z.string().max(100).nullable().optional(),
});

// PUT /workspaces/:workspaceId/ai-settings/user-allocations/:targetUserId
aiSettingsConfigRoutes.put(
  "/:workspaceId/ai-settings/user-allocations/:targetUserId",
  zValidator("json", updateUserAllocationSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const targetUserId = c.req.param("targetUserId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const targetErr = await requireMember(workspaceId, targetUserId);
    if (targetErr) return c.json({ error: "Target user is not a workspace member" }, 400);

    // When switching source, explicitly null out the other provider's fields
    // to prevent stale settings from being retained
    const isCopilot = body.source === "copilot";
    const isCustom = body.source === "custom";

    const result = await aiSettings.upsertUserPreferences({
      workspaceId,
      userId: targetUserId,
      source: body.source,
      copilotAccountId: isCustom ? (body.copilotAccountId ?? null) : body.copilotAccountId,
      copilotModel: isCustom ? (body.copilotModel ?? null) : body.copilotModel,
      providerId: isCopilot ? (body.providerId ?? null) : body.providerId,
      providerModel: isCopilot ? (body.providerModel ?? null) : body.providerModel,
      suggestionSource: body.suggestionSource,
      suggestionCopilotAccountId: body.suggestionCopilotAccountId,
      suggestionCopilotModel: body.suggestionCopilotModel,
      suggestionProviderId: body.suggestionProviderId,
      suggestionProviderModel: body.suggestionProviderModel,
    });

    return c.json({ data: result });
  }
);

const copySettingsSchema = z.object({
  targetUserIds: z.array(z.string().uuid()).min(1).max(100),
});

// POST /workspaces/:workspaceId/ai-settings/user-allocations/copy-my-settings
aiSettingsConfigRoutes.post(
  "/:workspaceId/ai-settings/user-allocations/copy-my-settings",
  zValidator("json", copySettingsSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const { targetUserIds } = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    let source: "copilot" | "custom" = "copilot";
    let copilotAccountId: string | null = null;
    let copilotModel: string | null = null;
    let providerId: string | null = null;
    let providerModel: string | null = null;
    let suggestionSource: "copilot" | "custom" = "copilot";
    let suggestionCopilotAccountId: string | null = null;
    let suggestionCopilotModel: string | null = null;
    let suggestionProviderId: string | null = null;
    let suggestionProviderModel: string | null = null;

    const adminPrefs = await aiSettings.getUserPreferences(workspaceId, userId);
    if (
      adminPrefs &&
      (adminPrefs.copilot_account_id ||
        adminPrefs.provider_id ||
        adminPrefs.copilot_model ||
        adminPrefs.provider_model)
    ) {
      source = adminPrefs.source;
      copilotAccountId = adminPrefs.copilot_account_id;
      copilotModel = adminPrefs.copilot_model;
      providerId = adminPrefs.provider_id;
      providerModel = adminPrefs.provider_model;
      suggestionSource = adminPrefs.suggestion_source;
      suggestionCopilotAccountId = adminPrefs.suggestion_copilot_account_id;
      suggestionCopilotModel = adminPrefs.suggestion_copilot_model;
      suggestionProviderId = adminPrefs.suggestion_provider_id;
      suggestionProviderModel = adminPrefs.suggestion_provider_model;
    } else {
      const wsDefaults = await aiSettings.getSettings(workspaceId);
      if (wsDefaults) {
        source = wsDefaults.default_source;
        copilotAccountId = wsDefaults.default_copilot_account_id;
        copilotModel = wsDefaults.default_copilot_model;
        providerId = wsDefaults.default_provider_id;
        providerModel = wsDefaults.default_provider_model;
        suggestionSource = wsDefaults.suggestion_source;
        suggestionCopilotAccountId = wsDefaults.suggestion_copilot_account_id;
        suggestionCopilotModel = wsDefaults.suggestion_copilot_model;
        suggestionProviderId = wsDefaults.suggestion_provider_id;
        suggestionProviderModel = wsDefaults.suggestion_provider_model;
      }
    }

    let updated = 0;
    for (const targetId of targetUserIds) {
      const memberErr = await requireMember(workspaceId, targetId);
      if (memberErr) continue;
      await aiSettings.upsertUserPreferences({
        workspaceId,
        userId: targetId,
        source,
        copilotAccountId,
        copilotModel,
        providerId,
        providerModel,
        suggestionSource,
        suggestionCopilotAccountId,
        suggestionCopilotModel,
        suggestionProviderId,
        suggestionProviderModel,
      });
      updated++;
    }

    return c.json({ data: { updated } });
  }
);

// DELETE /workspaces/:workspaceId/ai-settings/user-allocations/:targetUserId
aiSettingsConfigRoutes.delete("/:workspaceId/ai-settings/user-allocations/:targetUserId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const targetUserId = c.req.param("targetUserId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  await aiSettings.deleteUserPreferences(workspaceId, targetUserId);
  return c.json({ data: { userId: targetUserId, reset: true } });
});

// ─── Effective AI Config ─────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/effective
//
// READ-only. Workspace members are authorized as before. A project
// collaborator (shared into a private project, not a workspace member) may
// pass ?projectId=<their project in this workspace> to load the EFFECTIVE
// config needed to run AI chat on that shared project. getEffectiveAiConfig
// is scoped to (workspaceId, userId) so the collaborator only ever sees their
// OWN user-level prefs merged with workspace defaults — never another user's.
aiSettingsConfigRoutes.get("/:workspaceId/ai-settings/effective", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const projectId = c.req.query("projectId");

  const allowed = await hasWorkspaceReadAccessViaProject(userId, workspaceId, projectId);
  if (!allowed) return c.json({ error: "Not a member of this workspace" }, 403);

  const config = await aiSettings.getEffectiveAiConfig(workspaceId, userId);
  return c.json({
    data: config ?? {
      enforce_ai: false,
      enforced_copilot_account_id: null,
      enforced_provider_id: null,
      enforced_model: null,
      show_model_selector: false,
      default_source: "copilot" as const,
      default_copilot_account_id: null,
      default_copilot_model: null,
      default_provider_id: null,
      default_provider_model: null,
      suggestion_source: "copilot" as const,
      suggestion_copilot_account_id: null,
      suggestion_copilot_model: null,
      suggestion_provider_id: null,
      suggestion_provider_model: null,
      user_source: null,
      user_copilot_account_id: null,
      user_copilot_model: null,
      user_provider_id: null,
      user_provider_model: null,
      user_suggestion_source: null,
      user_suggestion_copilot_account_id: null,
      user_suggestion_copilot_model: null,
      user_suggestion_provider_id: null,
      user_suggestion_provider_model: null,
    },
  });
});
