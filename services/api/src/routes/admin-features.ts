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
import { getCfApiTokenSource, encryptPlatformValue } from "../lib/cloudflare-token.js";
import {
  ensureWildcardCname,
  lookupWildcardCname,
  listZoneWildcards,
  deleteCloudflareDns,
} from "../deploy/adapters/doable-cloud.js";

const featureFlags = featureFlagQueries(sql);
const platformSettings = platformSettingQueries(sql);

export const adminFeatureRoutes = new Hono<AuthEnv>({ strict: false });

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
// BUG-ADMIN-007: built-in platform features (ai_chat, analytics, billing,
// publish, etc.) are referenced by code paths and migrations. Deleting them
// breaks the platform with no API-level restore. Block deletion of any
// system-owned flag — toggle via PATCH /features/:key { enabled:false }
// instead.
const SYSTEM_FEATURE_KEYS = new Set<string>([
  "ai_chat",
  "analytics",
  "billing",
  "publish",
  "integrations",
  "mcp",
  "templates",
  "marketplace",
  "community",
  "skills",
]);

adminFeatureRoutes.delete("/features/:key", async (c) => {
  const key = c.req.param("key");
  if (SYSTEM_FEATURE_KEYS.has(key)) {
    return c.json(
      {
        error: "System feature flags cannot be deleted",
        hint: "Use PATCH /admin/features/:key { enabled: false } to disable.",
      },
      403,
    );
  }
  const deleted = await featureFlags.delete(key);
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

interface ZoneWildcard {
  hostname: string;
  target: string;
  proxied: boolean;
  modifiedOn: string;
}

interface DnsDiagnostics {
  zoneName: string;
  plan: string;
  /** "enabled" | "absent" | "undetectable" — see cloudflare-zone-info.ts. */
  acmStatus: "enabled" | "absent" | "undetectable";
  /** Convenience boolean, true iff acmStatus === "enabled". Kept for callers
   * that only care about the gate decision. */
  hasAcm: boolean;
  publishDomain: string;
  domainDepth: number;
  recommendedWildcard: string;
  /**
   * The wildcard hostname the operator actually configured via the panel,
   * persisted in platform_settings.dns_wildcard_hostname after a successful
   * auto-wildcard write. Null when nothing has been persisted yet — in that
   * case the panel should treat recommendedWildcard as the operator's
   * implicit choice and existingWildcard falls back to the legacy
   * *.${publishDomain} lookup.
   */
  configuredWildcard: string | null;
  /** Single-hostname lookup result. Hostname is the configuredWildcard when
   * set, otherwise the legacy *.${publishDomain} convention so existing
   * deployments don't regress. */
  existingWildcard: { hostname: string; target: string } | null;
  /** All wildcard CNAMEs currently on the zone (any name starting with '*'). */
  allWildcards: ZoneWildcard[];
  canAutoSetup: boolean;
  reason: "ok" | "no-cf-creds" | "no-tunnel-id" | "no-publish-domain" | "free-plan-multilevel" | "zone-lookup-failed";
  message: string;
}

function computeDnsDiagnostics(
  zone: Awaited<ReturnType<typeof getZoneInfo>>,
  existing: Awaited<ReturnType<typeof lookupWildcardCname>>,
  allWildcards: ZoneWildcard[],
  configuredWildcard: string | null,
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
    acmStatus: zone.acmStatus,
    hasAcm: zone.hasAcm,
    publishDomain,
    domainDepth,
    recommendedWildcard,
    configuredWildcard,
    existingWildcard: existing.exists
      ? { hostname: configuredWildcard ?? recommendedWildcard, target: existing.target ?? "" }
      : null,
    allWildcards,
    canAutoSetup,
    reason,
    message,
  };
}

/** Resolve the hostname to use for the single-hostname lookup. Persisted
 * dns_wildcard_hostname wins; falls back to the convention so deployments
 * that pre-date round 8 still see *.${DOABLE_DOMAIN} surfaced. */
async function resolveLookupHostname(publishDomain: string): Promise<{
  hostname: string;
  configured: string | null;
}> {
  const raw = await platformSettings.get(PLATFORM_SETTING_KEYS.DNS_WILDCARD_HOSTNAME);
  const configured = raw && raw.startsWith("*.") ? raw : null;
  const hostname = configured ?? (publishDomain ? `*.${publishDomain}` : "");
  return { hostname, configured };
}

adminFeatureRoutes.get("/dns-mode/diagnostics", async (c) => {
  const zone = await getZoneInfo();
  const publishDomain = process.env.DOABLE_DOMAIN ?? "";
  const { hostname: lookupHostname, configured } = await resolveLookupHostname(publishDomain);
  const [existing, allWildcards] = await Promise.all([
    lookupHostname
      ? lookupWildcardCname(lookupHostname)
      : Promise.resolve({ exists: false, target: null as string | null }),
    listZoneWildcards(),
  ]);
  return c.json(computeDnsDiagnostics(zone, existing, allWildcards, configured));
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

// DELETE /admin/dns-mode/wildcard removes a specific wildcard CNAME from the
// configured CF zone. Used by the admin panel so operators can free a
// wildcard (e.g. *.doable.me) before a different doable server claims it.
// In-zone validation: the hostname's base (after the leading "*.") must
// equal the zone name or be a subdomain of it — refusing cross-zone targets
// the CF token might happen to accept on multi-zone accounts.
const deleteWildcardSchema = z.object({
  hostname: z.string().regex(/^\*\.[a-z0-9.-]+$/),
});

adminFeatureRoutes.delete("/dns-mode/wildcard", async (c) => {
  let body: { hostname: string };
  try {
    const raw = await c.req.json();
    const parsed = deleteWildcardSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten(), reason: "invalid-body" }, 400);
    }
    body = parsed.data;
  } catch {
    return c.json({ error: "Request body must be JSON with {hostname:'*.foo.com'}", reason: "invalid-body" }, 400);
  }

  if (!body.hostname.startsWith("*.")) {
    return c.json({ error: "Hostname must start with '*.'", reason: "not-wildcard" }, 400);
  }

  const zone = await getZoneInfo();
  if (!zone.acmReady || !zone.zoneName) {
    // Reuse the existing not-ready reason mapping — caller can't act on
    // wildcards without zone access.
    return c.json(
      { error: zone.error ?? "Cloudflare zone lookup failed", reason: "zone-lookup-failed" },
      400,
    );
  }
  const bare = body.hostname.slice(2);
  const inZone = bare === zone.zoneName || bare.endsWith(`.${zone.zoneName}`);
  if (!inZone) {
    return c.json(
      {
        error: `Wildcard ${body.hostname} is not inside zone ${zone.zoneName}.`,
        reason: "wildcard-out-of-zone",
      },
      400,
    );
  }

  let deleted: boolean;
  try {
    deleted = await deleteCloudflareDns(body.hostname);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to delete wildcard CNAME: ${msg}` }, 502);
  }

  if (!deleted) {
    return c.json(
      { error: `No CNAME found for ${body.hostname} on zone ${zone.zoneName}`, hostname: body.hostname, reason: "not-found" },
      404,
    );
  }

  // If the deleted wildcard matches the persisted hostname, clear the
  // setting so /diagnostics no longer surfaces a stale "configured" value.
  // Best-effort: a failure here doesn't turn a successful CF delete into a 500.
  try {
    const stored = await platformSettings.get(PLATFORM_SETTING_KEYS.DNS_WILDCARD_HOSTNAME);
    if (stored && stored === body.hostname) {
      const userId = c.get("userId");
      await platformSettings.set(PLATFORM_SETTING_KEYS.DNS_WILDCARD_HOSTNAME, "", userId);
    }
  } catch (err) {
    console.warn(
      "[admin/dns-mode/wildcard] Failed to clear persisted dns_wildcard_hostname after CF delete:",
      err instanceof Error ? err.message : err,
    );
  }

  return c.json({ hostname: body.hostname, deleted: true });
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
  const { hostname: lookupHostname, configured } = await resolveLookupHostname(publishDomain);
  const [existing, allWildcards] = await Promise.all([
    lookupHostname
      ? lookupWildcardCname(lookupHostname)
      : Promise.resolve({ exists: false, target: null as string | null }),
    listZoneWildcards(),
  ]);
  const diagnostics = computeDnsDiagnostics(zone, existing, allWildcards, configured);

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
    // Persist the hostname the operator actually configured so /diagnostics
    // can surface it (and the panel can pre-fill the input) on reload —
    // without this, the UI keeps showing the *.${DOABLE_DOMAIN} convention.
    await platformSettings.set(
      PLATFORM_SETTING_KEYS.DNS_WILDCARD_HOSTNAME,
      cnameResult.hostname,
      userId,
    );
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

// ─── Optional Cloudflare API token override (R5) ───────────
// The cfut_* token from `cloudflared tunnel login` carries DNS:Edit +
// tunnel scopes only — enough for everything except ACM detection (which
// returns 9109 Unauthorized on /ssl/certificate_packs). Operators who
// want accurate ACM detection can paste a custom CF token with broader
// scopes; it's stored in platform_settings and the resolver prefers it
// over process.env.CF_API_TOKEN. Strictly optional — every DNS feature
// works fine without it.

const setCfTokenSchema = z.object({
  token: z.string().min(20),
});

adminFeatureRoutes.post("/dns-mode/cf-token", async (c) => {
  let body: { token: string };
  try {
    const raw = await c.req.json();
    const parsed = setCfTokenSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten(), reason: "invalid-body" }, 400);
    }
    body = parsed.data;
  } catch {
    return c.json({ error: "Body must be JSON {token:'...'}", reason: "invalid-body" }, 400);
  }

  // Probe 1: /user/tokens/verify must succeed.
  const verifyHeaders = { Authorization: `Bearer ${body.token}` };
  try {
    const resp = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: verifyHeaders,
    });
    const data = (await resp.json()) as { success?: boolean };
    if (!resp.ok || !data.success) {
      return c.json({ error: "Cloudflare rejected the token", reason: "token-invalid" }, 400);
    }
  } catch (err) {
    return c.json({ error: `Could not reach Cloudflare to verify: ${err instanceof Error ? err.message : String(err)}`, reason: "token-invalid" }, 400);
  }

  // Probe 2: the whole point — token must have SSL/Certificates:Read scope.
  // Refuse to persist a token that doesn't fix the very gap it's meant to.
  const zoneId = process.env.CF_ZONE_ID;
  if (!zoneId) {
    return c.json({ error: "CF_ZONE_ID is not set on this server", reason: "no-cf-creds" }, 400);
  }
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/ssl/certificate_packs?status=active`,
      { headers: verifyHeaders },
    );
    const data = (await resp.json()) as { success?: boolean; result?: { type: string }[] };
    if (!resp.ok || !data.success) {
      return c.json({
        error: "Token verified but lacks SSL/Certificates:Read on this zone — without it ACM still can't be detected, so we won't persist. Edit the token in Cloudflare and add Zone → SSL and Certificates → Read.",
        reason: "token-missing-ssl-scope",
      }, 400);
    }
    const acmStatus = Array.isArray(data.result) && data.result.some((p) => p.type === "advanced")
      ? "enabled"
      : "absent";

    const userId = c.get("userId");
    try {
      // Encrypt at rest so DB backups + read-only access can't extract a
      // usable token. See encryptPlatformValue for the wire format.
      await platformSettings.set(
        PLATFORM_SETTING_KEYS.CF_API_TOKEN,
        encryptPlatformValue(body.token),
        userId,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json(
        { error: "Token validated but persisting failed. Has migration 081 been applied?", detail: msg },
        503,
      );
    }
    return c.json({ persisted: true, acmStatus });
  } catch (err) {
    return c.json({ error: `SSL scope probe failed: ${err instanceof Error ? err.message : String(err)}`, reason: "token-invalid" }, 400);
  }
});

adminFeatureRoutes.delete("/dns-mode/cf-token", async (c) => {
  const userId = c.get("userId");
  try {
    // Set to empty so the resolver treats it as unset and falls through to env.
    // Using set(...,"") instead of a DELETE keeps the audit trail (updated_by/at).
    await platformSettings.set(PLATFORM_SETTING_KEYS.CF_API_TOKEN, "", userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "Failed to clear override. Has migration 081 been applied?", detail: msg }, 503);
  }
  const fallbackSource = process.env.CF_API_TOKEN ? "env" : "none";
  return c.json({ reverted: true, fallbackSource });
});

adminFeatureRoutes.get("/dns-mode/cf-token", async (c) => {
  const { source, tokenSuffix, decryptFailed } = await getCfApiTokenSource();
  // hasSslScope is derived from acmStatus — if getZoneInfo can probe
  // certificate_packs, the token has SSL:Read.
  let hasSslScope = false;
  const zoneId = process.env.CF_ZONE_ID;
  if (source !== "none" && zoneId) {
    try {
      const zone = await getZoneInfo();
      hasSslScope = zone.acmStatus !== "undetectable";
    } catch {
      hasSslScope = false;
    }
  }
  return c.json({ source, tokenSuffix, hasSslScope, decryptFailed });
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
