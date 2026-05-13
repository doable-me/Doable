/**
 * Cloudflare zone capability detection.
 *
 * Used by the admin DNS panel to decide whether a wildcard CNAME can be
 * created automatically on this zone. Two things matter:
 *
 *   1. The zone's billing plan (free / pro / business / enterprise).
 *      Free zones get Universal SSL which covers exactly <zone> + *.<zone>.
 *      Multi-level wildcards (e.g. *.staging.doable.me) are NOT covered.
 *
 *   2. Whether an Advanced Certificate Manager (ACM) pack is active on
 *      the zone. ACM lets a zone issue custom certificates that cover
 *      multi-level wildcards, which is the only way to run multiple
 *      doable servers under a single domain (e.g. one tunnel for
 *      staging-*.doable.me, another for prod-*.doable.me — but each
 *      tunnel needs its own *.<env>.doable.me wildcard, which requires
 *      ACM since the base wildcard *.doable.me cert won't reach two
 *      levels deep).
 *
 * Reads the effective CF API token via getEffectiveCfApiToken (which prefers
 * the admin-set platform_settings.cf_api_token override, falling back to
 * process.env.CF_API_TOKEN) and CF_ZONE_ID from process.env. Never throws —
 * returns a structured error so callers can decide how to surface.
 */
import { getEffectiveCfApiToken } from "./cloudflare-token.js";

export type CloudflarePlan = "free" | "pro" | "business" | "enterprise" | "unknown";

/**
 * ACM detection has three honest states:
 *   - "enabled":     the certificate_packs endpoint returned at least one
 *                    pack of type="advanced" — ACM is definitely on.
 *   - "absent":      endpoint returned 200 but no advanced packs — ACM is
 *                    definitely off.
 *   - "undetectable": endpoint returned 403/9109 (or any failure) — the
 *                    cfut_* token from `cloudflared tunnel login` lacks
 *                    "SSL and Certificates: Read" scope on most zones, so
 *                    we genuinely cannot tell. Different from "absent":
 *                    the operator may very well have paid ACM, we just
 *                    can't see it. The admin panel surfaces this honestly
 *                    and routes operators to the manual ACM override.
 */
export type AcmStatus = "enabled" | "absent" | "undetectable";

export interface ZoneInfo {
  zoneName: string;
  plan: CloudflarePlan;
  /** Three-state ACM detection — see {@link AcmStatus}. */
  acmStatus: AcmStatus;
  /**
   * Convenience flag for gate logic: true iff acmStatus === "enabled".
   * "undetectable" is treated as not-enabled for blocking decisions; the
   * UI exposes an explicit override for that case.
   */
  hasAcm: boolean;
  /**
   * True when CF API responded successfully for the zone lookup. False
   * when env vars are missing or the zone GET errored — callers should
   * read `error` for the human-readable reason. Independent of ACM
   * detection (which is allowed to fail in a 403-undetectable way).
   */
  acmReady: boolean;
  error?: string;
}

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface ZoneResponse {
  success: boolean;
  errors?: { message: string }[];
  result?: {
    name: string;
    plan?: { legacy_id?: string; name?: string };
  };
}

interface CertPackResponse {
  success: boolean;
  errors?: { message: string }[];
  result?: { type: string; status: string }[];
}

function planFromLegacyId(legacyId: string | undefined): CloudflarePlan {
  switch (legacyId) {
    case "free":
    case "pro":
    case "business":
    case "enterprise":
      return legacyId;
    default:
      return "unknown";
  }
}

/**
 * Fetch zone capability info from the Cloudflare API.
 *
 * Returns a `ZoneInfo` with `acmReady=false` and a populated `error`
 * field when env vars are missing or any API call fails — callers should
 * NOT treat a missing zone as a thrown exception.
 */
export async function getZoneInfo(): Promise<ZoneInfo> {
  const apiToken = await getEffectiveCfApiToken();
  const zoneId = process.env.CF_ZONE_ID;

  if (!apiToken || !zoneId) {
    return {
      zoneName: "",
      plan: "unknown",
      acmStatus: "undetectable",
      hasAcm: false,
      acmReady: false,
      error:
        "CF_API_TOKEN and CF_ZONE_ID are not set. Re-run setup-server.sh or set them in .env after `cloudflared tunnel login`.",
    };
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  let zoneName = "";
  let plan: CloudflarePlan = "unknown";

  try {
    const resp = await fetch(`${CF_API_BASE}/zones/${zoneId}`, { headers });
    const data = (await resp.json()) as ZoneResponse;
    if (!resp.ok || !data.success || !data.result) {
      const msg = data.errors?.map((e) => e.message).join("; ") ?? `HTTP ${resp.status}`;
      return {
        zoneName: "",
        plan: "unknown",
        acmStatus: "undetectable",
        hasAcm: false,
        acmReady: false,
        error: `Cloudflare zone lookup failed: ${msg}`,
      };
    }
    zoneName = data.result.name;
    plan = planFromLegacyId(data.result.plan?.legacy_id);
  } catch (err) {
    return {
      zoneName: "",
      plan: "unknown",
      acmStatus: "undetectable",
      hasAcm: false,
      acmReady: false,
      error: `Cloudflare zone lookup error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Detect Advanced Certificate Manager. Three outcomes:
  //   200 + data.success + has advanced pack  → "enabled"
  //   200 + data.success + no advanced pack   → "absent"
  //   anything else (403/9109, network error) → "undetectable"
  //
  // The "undetectable" branch is the common case on doable installs: the
  // `cloudflared tunnel login` OAuth token only carries DNS:Edit + tunnel
  // scopes — NOT "SSL and Certificates: Read" — so CF returns 9109 here.
  // The admin panel renders that state honestly and routes operators to
  // the manual ACM override checkbox instead of pretending ACM is off.
  let acmStatus: AcmStatus = "undetectable";
  try {
    const resp = await fetch(
      `${CF_API_BASE}/zones/${zoneId}/ssl/certificate_packs?status=active`,
      { headers },
    );
    const data = (await resp.json()) as CertPackResponse;
    if (resp.ok && data.success && Array.isArray(data.result)) {
      acmStatus = data.result.some((p) => p.type === "advanced") ? "enabled" : "absent";
    }
  } catch {
    // Network error — stays "undetectable", honest about not knowing.
  }

  return { zoneName, plan, acmStatus, hasAcm: acmStatus === "enabled", acmReady: true };
}
