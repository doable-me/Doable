/**
 * POST /projects/:id/chat/suggestions — AI-powered suggestions.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../../db/index.js";
import { aiSettingsQueries, platformAiDefaultsQueries } from "@doable/db";
import { type ByokProviderConfig } from "../../ai/providers/copilot.js";
import { getCopilotManager } from "../../ai/providers/copilot-manager.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { ENCRYPTION_KEY } from "../../lib/secrets.js";

const aiSettingsDb = aiSettingsQueries(sql, ENCRYPTION_KEY);
const platformDefaults = platformAiDefaultsQueries(sql);

const suggestionsSchema = z.object({
  lastAssistantMessage: z.string().min(1).max(4000),
  userPrompt: z.string().min(1).max(4000),
});

const resolveProvider = async (providerId: string | null | undefined): Promise<ByokProviderConfig | undefined> => {
  if (!providerId) return undefined;
  const providerData = await aiSettingsDb.getProviderWithKey(providerId);
  if (!providerData) return undefined;
  return {
    type: providerData.row.provider_type as "openai" | "azure" | "anthropic",
    baseUrl: providerData.row.base_url,
    apiKey: providerData.apiKey ?? undefined,
    bearerToken: providerData.bearerToken ?? undefined,
    ...(providerData.row.wire_api ? { wireApi: providerData.row.wire_api as "completions" | "responses" } : {}),
    ...(providerData.row.azure_api_version ? { azure: { apiVersion: providerData.row.azure_api_version } } : {}),
  };
};

export function registerSuggestionsRoute(app: Hono<AuthEnv>) {
  app.post(
    "/projects/:id/chat/suggestions",
    zValidator("json", suggestionsSchema),
    async (c) => {
      const projectId = c.req.param("id");
      const { lastAssistantMessage, userPrompt } = c.req.valid("json");

      try {
        const configs: Array<{
          model: string | undefined;
          githubToken: string | undefined;
          provider: ByokProviderConfig | undefined;
          label: string;
        }> = [];

        let settings: Awaited<ReturnType<typeof aiSettingsDb.getSettings>> | null = null;
        let workspaceId: string | undefined;
        try {
          const [project] = await sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
          workspaceId = project?.workspace_id;
          if (workspaceId) {
            settings = await aiSettingsDb.getSettings(workspaceId);
          }
        } catch (err) {
          console.error("[Chat] Failed to resolve suggestion settings:", err);
        }

        if (settings) {
          if (settings.enforce_ai) {
            configs.push({
              model: settings.enforced_model ?? "gpt-4o-mini",
              githubToken: settings.enforced_copilot_account_id
                ? ((await aiSettingsDb.getCopilotAccountToken(settings.enforced_copilot_account_id)) ?? undefined)
                : undefined,
              provider: await resolveProvider(settings.enforced_provider_id),
              label: "enforced",
            });
          } else {
            const useCustomSuggestion = settings.suggestion_source === "custom" && !!settings.suggestion_provider_id;
            const useCopilotSuggestion = settings.suggestion_source === "copilot" && !!settings.suggestion_copilot_account_id;

            if (useCustomSuggestion) {
              configs.push({
                model: settings.suggestion_provider_model ?? "gpt-4o-mini",
                githubToken: undefined,
                provider: await resolveProvider(settings.suggestion_provider_id),
                label: "suggestion",
              });
            } else if (useCopilotSuggestion) {
              configs.push({
                model: settings.suggestion_copilot_model ?? "gpt-4o-mini",
                githubToken: settings.suggestion_copilot_account_id
                  ? ((await aiSettingsDb.getCopilotAccountToken(settings.suggestion_copilot_account_id)) ?? undefined)
                  : undefined,
                provider: undefined,
                label: "suggestion",
              });
            }
          }
        }

        if (configs.length === 0) {
          let fallbackToken: string | undefined;
          let fallbackProvider: ByokProviderConfig | undefined;
          let fallbackModel: string | undefined = "gpt-4o-mini";

          if (settings?.default_copilot_account_id) {
            fallbackToken = (await aiSettingsDb.getCopilotAccountToken(settings.default_copilot_account_id)) ?? undefined;
          }

          // Platform defaults fallback (mirrors engine-resolver Tier 5)
          if (!fallbackToken && !fallbackProvider && workspaceId) {
            try {
              const [ws] = await sql<{ plan: string }[]>`SELECT plan FROM workspaces WHERE id = ${workspaceId}`;
              if (ws?.plan) {
                const planDefault = await platformDefaults.getForPlan(ws.plan);
                if (planDefault) {
                  if (planDefault.source === "custom" && planDefault.provider_id) {
                    fallbackProvider = await resolveProvider(planDefault.provider_id);
                    fallbackModel = planDefault.provider_model ?? fallbackModel;
                  } else if (planDefault.copilot_account_id) {
                    fallbackToken = (await aiSettingsDb.getCopilotAccountToken(planDefault.copilot_account_id)) ?? undefined;
                    fallbackModel = planDefault.copilot_model ?? fallbackModel;
                  }
                }
              }
            } catch (err) {
              console.error("[Suggestions] Failed to resolve platform defaults:", err);
            }
          }

          configs.push({ model: fallbackModel, githubToken: fallbackToken, provider: fallbackProvider, label: "fallback" });
        }

        // Avoid starting SDK sessions when neither GitHub auth nor a custom provider is configured.
        const runnableConfigs = configs.filter((cfg) => cfg.provider || cfg.githubToken);
        if (runnableConfigs.length === 0) {
          console.warn(`[Suggestions][${projectId.slice(0, 8)}] No runnable configs (no provider or GitHub token)`);
          return c.json({ data: [] });
        }

        const suggestionSystemPrompt = `You generate short, contextual next-step suggestion chips for an AI app builder. Given the user's last prompt and the AI's response, return exactly 4 suggestions as a JSON array of strings. Each suggestion should be 2-6 words, actionable, and relevant to what was just built. Do NOT include generic suggestions. Focus on what the user would logically want to do next with THIS specific app. Return ONLY the JSON array, no other text. Do NOT wrap in markdown code fences.`;
        const suggestionUserMessage = `User asked: "${userPrompt.slice(0, 200)}"\n\nAI built: "${lastAssistantMessage.slice(0, 500)}"\n\nReturn 4 contextual next-step suggestions as a JSON array:`;

        console.log(`[Suggestions][${projectId.slice(0, 8)}] Starting — ${runnableConfigs.length} config(s): ${runnableConfigs.map(c => `${c.label}(${c.model})`).join(", ")}`);
        const suggestStartMs = Date.now();

        const manager = getCopilotManager();

        for (const config of runnableConfigs) {
          const configStartMs = Date.now();
          try {
            const suggestions = await manager.withAutoRetry("suggestions", config.githubToken, async (engine) => {
              const sessionId = await engine.createSession({
                projectId: "suggestions",
                userId: "system",
                model: config.model,
                ...(config.provider ? { provider: config.provider } : {}),
                systemPrompt: suggestionSystemPrompt,
              });
              const result = await engine.sendAndWait(sessionId, suggestionUserMessage, 15_000);
              engine.disconnectSession(sessionId).catch(() => {});
              const resultData = result?.data as Record<string, unknown> | undefined;
              const content = typeof resultData?.content === "string" ? resultData.content : "";
              console.log(`[Suggestions][${projectId.slice(0, 8)}] Raw response (${config.label}, ${Date.now() - configStartMs}ms): "${content.slice(0, 300)}"`);
              // Strip <think>...</think> and other reasoning tags before JSON extraction
              const stripped = content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<rationale>[\s\S]*?<\/rationale>/gi, "").trim();
              const jsonMatch = stripped.match(/\[[\s\S]*?\]/);
              if (!jsonMatch) {
                console.warn(`[Suggestions][${projectId.slice(0, 8)}] No JSON array found in response (${config.label})`);
                return null;
              }
              const parsed = JSON.parse(jsonMatch[0]) as string[];
              return parsed.filter((s): s is string => typeof s === "string").slice(0, 5);
            });

            if (suggestions && suggestions.length > 0) {
              console.log(`[Suggestions][${projectId.slice(0, 8)}] Success (${config.label}, ${Date.now() - suggestStartMs}ms): ${JSON.stringify(suggestions)}`);
              const userId = c.get("userId")!;
              try {
                const [dbSession] = await sql`SELECT id FROM ai_sessions WHERE project_id = ${projectId} AND user_id = ${userId} ORDER BY created_at DESC LIMIT 1`;
                if (dbSession) {
                  await sql`UPDATE ai_messages SET suggestions = ${sql.json(suggestions)} WHERE id = (SELECT id FROM ai_messages WHERE session_id = ${dbSession.id} AND role = 'assistant' ORDER BY created_at DESC LIMIT 1)`;
                }
              } catch (e) {
                console.warn("[Chat] Failed to save suggestions:", e);
              }
              return c.json({ data: suggestions });
            }
            console.warn(`[Suggestions] Config '${config.label}' returned empty — trying next`);
          } catch (err) {
            console.warn(`[Suggestions] Config '${config.label}' (model=${config.model}) failed:`, err instanceof Error ? err.message : err);
          }
        }

        console.warn("[Suggestions] All configs exhausted, returning empty");
        return c.json({ data: [] });
      } catch (err) {
        console.warn("[Suggestions] Failed:", err);
        return c.json({ data: [] });
      }
    },
  );
}
