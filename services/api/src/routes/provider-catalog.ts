import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { PROVIDER_CATALOG, PROVIDER_COUNT, PROVIDER_BY_ID } from "@doable/shared/ai/provider-catalog.js";
import { providerDiscovery, type ProviderConfig, type DiscoveredModel } from "../ai/provider-discovery.js";

// ─── ETag for HTTP caching ───────────────────────────────
// Compute once at startup from ALL provider IDs so any add/remove/reorder
// produces a new fingerprint. Uses a simple DJB2 hash — fast, zero deps.
function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
const CATALOG_FINGERPRINT = djb2(PROVIDER_CATALOG.map((p) => p.id).join(","));
const CATALOG_ETAG = `"catalog-${PROVIDER_COUNT}-${CATALOG_FINGERPRINT}"`;

export const providerCatalogRoutes = new Hono<AuthEnv>({ strict: false });

// ─── GET /ai/provider-catalog ────────────────────────────
// Return the full static catalog (all presets).
// No auth required — catalog is public reference data.
providerCatalogRoutes.get("/provider-catalog", (c) => {
  // Support conditional requests via ETag
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatch === CATALOG_ETAG) {
    return c.body(null, 304);
  }

  c.header("ETag", CATALOG_ETAG);
  // no-cache = browser MUST revalidate every request (still caches body for 304).
  // After a deploy the new ETag causes a fresh 200; between deploys → fast 304.
  c.header("Cache-Control", "no-cache");

  return c.json({ data: PROVIDER_CATALOG });
});

// ─── POST /ai/providers/test-connection ──────────────────
// Test a provider connection before saving it.
// Auth required (prevents abuse of the endpoint as an open proxy).
const testConnectionSchema = z.object({
  type: z.enum(["openai", "azure", "anthropic"]),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  bearerToken: z.string().optional(),
  azure: z
    .object({
      apiVersion: z.string().optional(),
    })
    .optional(),
  presetId: z.string().optional(),
});

providerCatalogRoutes.post(
  "/providers/test-connection",
  authMiddleware,
  zValidator("json", testConnectionSchema),
  async (c) => {
    const body = c.req.valid("json");

    // If this connection is tied to a known preset that doesn't expose
    // GET /models (e.g. MiniMax), pass a validationModel so the validator
    // can fall back to a chat.completions ping.
    const preset = body.presetId
      ? (PROVIDER_BY_ID as Record<string, (typeof PROVIDER_BY_ID)[keyof typeof PROVIDER_BY_ID]>)[body.presetId] ?? null
      : null;
    const validationModel = preset && !preset.supportsModelDiscovery
      ? preset.defaultModels[0]?.id
      : undefined;

    const config: ProviderConfig = {
      type: body.type,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      bearerToken: body.bearerToken,
      azure: body.azure,
      validationModel,
    };

    const result = await providerDiscovery.validateProvider(config);

    // When validation succeeded via the chat-ping fallback there won't be
    // discovered models — surface the preset defaults so the wizard can
    // show them as selectable.
    let models: DiscoveredModel[] | undefined = result.models;
    if (result.ok && (!models || models.length === 0) && preset && preset.defaultModels.length > 0) {
      models = preset.defaultModels.map((m) => ({
        id: m.id,
        name: m.name,
        contextWindow: m.contextWindow,
        capabilities: { tools: m.supportsTools, vision: m.supportsVision },
      }));
    }

    return c.json({
      data: {
        ok: result.ok,
        latencyMs: result.latencyMs,
        error: result.errorMessage ?? result.error,
        models,
      },
    });
  },
);
