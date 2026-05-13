import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import {
  featureFlagQueries,
  platformSettingQueries,
  PLATFORM_SETTING_KEYS,
  parseDnsMode,
} from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { WORKSPACE_PLANS, WORKSPACE_ROLES } from "@doable/shared";
import { getZoneInfo } from "../lib/cloudflare-zone-info.js";
import { ensureWildcardCname, lookupWildcardCname } from "../deploy/adapters/doable-cloud.js";

const featureFlags = featureFlagQueries(sql);
const platformSettings = platformSettingQueries(sql);

export const adminFeatureRoutes = new Hono<AuthEnv>();

adminFeatureRoutes.use("*", authMiddleware);
adminFeatureRoutes.use("*", platformAdminMiddleware);

// ─── Feature Flags ─────────────────────────────────────────

// List all feature flags
adminFeatureRoutes.get("/features", async (c) => {
  const flags = await featureFlags.listAll();
  return c.json(flags);
});

// Get a single feature flag
adminFeatureRoutes.get("/features/:key", async (c) => {
  const flag = await featureFlags.getByKey(c.req.param("key"));
  if (!flag) return c.json({ error: "Feature not found" }, 404);
  return c.json(flag);
});

// Update a feature flag
const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  minPlan: z.enum(WORKSPACE_PLANS).nullable().optional(),
  minRole: z.enum(WORKSPACE_ROLES).nullable().optional(),
  label: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

adminFeatureRoutes.patch("/features/:key", async (c) => {
  const body = await c.req.json();
  const parsed = updateFlagSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const flag = await featureFlags.update(c.req.param("key"), parsed.data);
  if (!flag) return c.json({ error: "Feature not found" }, 404);
  return c.json(flag);
});

// Create a new feature flag
const createFlagSchema = z.object({
  featureKey: z.string().min(1).regex(/^[a-z_]+$/),
  label: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  minPlan: z.enum(WORKSPACE_PLANS).nullable().optional(),
  minRole: z.enum(WORKSPACE_ROLES).nullable().optional(),
});

adminFeatureRoutes.post("/features", async (c) => {
  const body = await c.req.json();
  const parsed = createFlagSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const flag = await featureFlags.create(parsed.data);
    return c.json(flag, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("duplicate")) {
      return c.json({ error: "Feature key already exists" }, 409);
    }
    throw err;
  }
});

// Delete a feature flag
adminFeatureRoutes.delete("/features/:key", async (c) => {
  const deleted = await featureFlags.delete(c.req.param("key"));
  if (!deleted) return c.json({ error: "Feature not found" }, 404);
  return c.json({ ok: true });
});

// ─── DNS Mode ──────────────────────────────────────────────
// GET /admin/dns-mode  → { mode, defaulted }
//   "defaulted: true" means no row exists yet and the server is using the
//   built-in per-publish default.
// PUT /admin/dns-mode  { mode: 'per_publish' | 'wildcard' }
//   Upserts the platform_settings row. Returns 503 if the underlying
//   migration (081) hasn't been applied yet — read still works (returns
//   default), but writes can't be persisted.
adminFeatureRoutes.get("/dns-mode", async (c) => {
  const raw = await platformSettings.get(PLATFORM_SETTING_KEYS.DNS_MODE);
  return c.json({
    mode: parseDnsMode(raw),
    defaulted: raw === null,
  });
});

const dnsModeSchema = z.object({
  mode: z.enum(["per_publish", "wildcard"]),
});

adminFeatureRoutes.put("/dns-mode", async (c) => {
  const body = await c.req.json();
  const parsed = dnsModeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const userId = c.get("userId");
  try {
    await platformSettings.set(
      PLATFORM_SETTING_KEYS.DNS_MODE,
      parsed.data.mode,
      userId,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Most common cause: migration 081 not applied yet.
    return c.json(
      { error: "Failed to persist DNS mode. Has migration 081 been applied?", detail: msg },
      503,
    );
  }
  return c.json({ mode: parsed.data.mode });
});

// ─── DNS Auto-wildcard Diagnostics & Setup ─────────────────
// GET  /admin/dns-mode/diagnostics  → zone capability + canAutoSetup
// POST /admin/dns-mode/auto-wildcard → create wildcard CNAME + persist mode

interface DnsDiagnostics {
  zoneName: string;
  plan: string;
  hasAcm: boolean;
  publishDomain: string;
  domainDepth: number;
  recommendedWildcard: string;
  existingWildcard: { hostname: string; target: string } | null;
  canAutoSetup: boolean;
  reason: "ok" | "no-cf-creds" | "no-tunnel-id" | "no-publish-domain" | "free-plan-multilevel" | "zone-lookup-failed";
  message: string;
}

function computeDnsDiagnostics(
  zone: Awaited<ReturnType<typeof getZoneInfo>>,
  existing: Awaited<ReturnType<typeof lookupWildcardCname>>,
): DnsDiagnostics {
  const publishDomain = process.env.DOABLE_DOMAIN ?? "";
  const tunnelId = process.env.CLOUDFLARED_TUNNEL_ID ?? "";
  const domainDepth = publishDomain ? publishDomain.split(".").length : 0;
  const recommendedWildcard = publishDomain ? `*.${publishDomain}` : "";

  let reason: DnsDiagnostics["reason"] = "ok";
  let message = "Ready to auto-configure a wildcard CNAME for this zone.";
  let canAutoSetup = true;

  if (!publishDomain) {
    canAutoSetup = false;
    reason = "no-publish-domain";
    message = "DOABLE_DOMAIN is not set; cannot determine the wildcard to create.";
  } else if (!zone.acmReady) {
    canAutoSetup = false;
    reason = zone.error?.includes("not set") ? "no-cf-creds" : "zone-lookup-failed";
    message = zone.error ?? "Cloudflare zone lookup failed.";
  } else if (!tunnelId) {
    canAutoSetup = false;
    reason = "no-tunnel-id";
    message = "CLOUDFLARED_TUNNEL_ID is not set. Run setup-server.sh after `cloudflared tunnel login` to provision a tunnel.";
  } else if (domainDepth > 2 && !zone.hasAcm) {
    // Publish domain like "staging.doable.me" needs *.staging.doable.me which
    // Universal SSL does not cover. Require ACM before we offer auto-setup.
    canAutoSetup = false;
    reason = "free-plan-multilevel";
    message = `Publish domain ${publishDomain} is multi-level. Free Universal SSL only covers <zone> and *.<zone>; multi-level wildcards (${recommendedWildcard}) require Cloudflare Advanced Certificate Manager (ACM) on this zone. Enable ACM in the Cloudflare dashboard (SSL/TLS → Edge Certificates), then return here to auto-configure.`;
  }

  return {
    zoneName: zone.zoneName,
    plan: zone.plan,
    hasAcm: zone.hasAcm,
    publishDomain,
    domainDepth,
    recommendedWildcard,
    existingWildcard: existing.exists
      ? { hostname: recommendedWildcard, target: existing.target ?? "" }
      : null,
    canAutoSetup,
    reason,
    message,
  };
}

adminFeatureRoutes.get("/dns-mode/diagnostics", async (c) => {
  const zone = await getZoneInfo();
  const publishDomain = process.env.DOABLE_DOMAIN ?? "";
  const existing = publishDomain
    ? await lookupWildcardCname(`*.${publishDomain}`)
    : { exists: false, target: null as string | null };
  return c.json(computeDnsDiagnostics(zone, existing));
});

const autoWildcardSchema = z.object({
  // Optional override of *.${DOABLE_DOMAIN}. Must start with "*." and live
  // inside the CF zone the server is configured against (validated below
  // against the live zoneName from getZoneInfo so we can't be tricked into
  // attempting cross-zone records the CF API would reject anyway).
  wildcardHostname: z.string().regex(/^\*\.[a-z0-9.-]+$/).optional(),
  // When true, the operator asserts they have Advanced Certificate Manager
  // active on this zone. The cfut_* token from `cloudflared tunnel login`
  // cannot read /ssl/certificate_packs (lacks Zone Settings: Read), so
  // hasAcm auto-detection silently returns false even for paid ACM zones.
  // This override skips the multi-level gate so those operators can proceed.
  acmOverride: z.boolean().optional(),
});

adminFeatureRoutes.post("/dns-mode/auto-wildcard", async (c) => {
  let body: { wildcardHostname?: string; acmOverride?: boolean } = {};
  // Empty body is allowed (round 1 behavior — no params). Parse only if
  // Content-Type indicates JSON and the body has bytes.
  if (c.req.header("content-type")?.includes("application/json")) {
    try {
      const raw = await c.req.json();
      const parsed = autoWildcardSchema.safeParse(raw);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten(), reason: "invalid-body" }, 400);
      }
      body = parsed.data;
    } catch {
      // Empty/missing body — treat as no overrides.
    }
  }

  const zone = await getZoneInfo();
  const publishDomain = process.env.DOABLE_DOMAIN ?? "";
  const existing = publishDomain
    ? await lookupWildcardCname(`*.${publishDomain}`)
    : { exists: false, target: null as string | null };
  const diagnostics = computeDnsDiagnostics(zone, existing);

  // Resolve effective wildcard target. Default to the diagnostics-recommended
  // value; honor the operator's override when supplied.
  const effectiveWildcard = body.wildcardHostname ?? diagnostics.recommendedWildcard;

  // Cross-zone refusal: the requested wildcard must end with .<zoneName>
  // (or exactly equal *.<zoneName>). Cloudflare itself would refuse, but
  // returning a clean 400 here gives the panel a much better error.
  if (zone.acmReady && zone.zoneName) {
    const bare = effectiveWildcard.slice(2); // drop "*."
    const inZone = bare === zone.zoneName || bare.endsWith(`.${zone.zoneName}`);
    if (!inZone) {
      return c.json(
        {
          error: `Wildcard ${effectiveWildcard} is not inside zone ${zone.zoneName}. Pick a hostname like *.${zone.zoneName} or *.<sub>.${zone.zoneName}.`,
          reason: "wildcard-out-of-zone",
          diagnostics,
        },
        400,
      );
    }
  }

  // Multi-level gating: still blocks unless the operator overrides. The
  // other diagnostics gates (no-cf-creds, no-tunnel-id, no-publish-domain,
  // zone-lookup-failed) are not bypassable since they reflect real missing
  // state, not API blind spots.
  if (!diagnostics.canAutoSetup) {
    const isOverridable = diagnostics.reason === "free-plan-multilevel" && body.acmOverride;
    if (!isOverridable) {
      return c.json(
        { error: diagnostics.message, reason: diagnostics.reason, diagnostics },
        400,
      );
    }
  }

  const tunnelId = process.env.CLOUDFLARED_TUNNEL_ID;
  if (!tunnelId) {
    // Defensive: diagnostics should already have flagged this (no-tunnel-id),
    // and that gate is not overridable.
    return c.json({ error: "CLOUDFLARED_TUNNEL_ID missing", reason: "no-tunnel-id" }, 400);
  }

  let cnameResult: Awaited<ReturnType<typeof ensureWildcardCname>>;
  try {
    cnameResult = await ensureWildcardCname(tunnelId, effectiveWildcard);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to create wildcard CNAME: ${msg}` }, 502);
  }

  const userId = c.get("userId");
  try {
    await platformSettings.set(PLATFORM_SETTING_KEYS.DNS_MODE, "wildcard", userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json(
      { error: "Wildcard CNAME created but failed to persist DNS mode. Has migration 081 been applied?", detail: msg },
      503,
    );
  }

  return c.json({
    mode: "wildcard" as const,
    wildcardHostname: cnameResult.hostname,
    target: cnameResult.target,
    created: cnameResult.created,
    updated: cnameResult.updated,
    acmOverrideApplied: body.acmOverride === true && diagnostics.reason === "free-plan-multilevel",
    diagnostics,
  });
});

// ─── User Overrides ────────────────────────────────────────

// List overrides for a feature
adminFeatureRoutes.get("/features/:key/overrides", async (c) => {
  const overrides = await featureFlags.listOverrides(c.req.param("key"));
  return c.json(overrides);
});

// Set override for a user
const setOverrideSchema = z.object({
  userId: z.string().uuid(),
  enabled: z.boolean(),
});

adminFeatureRoutes.post("/features/:key/overrides", async (c) => {
  const body = await c.req.json();
  const parsed = setOverrideSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  await featureFlags.setOverride(parsed.data.userId, c.req.param("key"), parsed.data.enabled);
  return c.json({ ok: true });
});

// Remove override for a user
adminFeatureRoutes.delete("/features/:key/overrides/:userId", async (c) => {
  const removed = await featureFlags.removeOverride(c.req.param("userId"), c.req.param("key"));
  if (!removed) return c.json({ error: "Override not found" }, 404);
  return c.json({ ok: true });
});
