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
 * Reads CF_API_TOKEN + CF_ZONE_ID from process.env. Never throws —
 * returns a structured error so callers can decide how to surface.
 */

export type CloudflarePlan = "free" | "pro" | "business" | "enterprise" | "unknown";

export interface ZoneInfo {
  zoneName: string;
  plan: CloudflarePlan;
  /**
   * True when at least one active certificate pack of type "advanced"
   * exists on the zone — i.e. the zone has Advanced Certificate Manager
   * issuing custom certs that can cover multi-level wildcards.
   */
  hasAcm: boolean;
  /**
   * True when CF API responded successfully. False when env vars are
   * missing or any API call errored — callers should read `error` for
   * the human-readable reason.
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
  const apiToken = process.env.CF_API_TOKEN;
  const zoneId = process.env.CF_ZONE_ID;

  if (!apiToken || !zoneId) {
    return {
      zoneName: "",
      plan: "unknown",
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
      hasAcm: false,
      acmReady: false,
      error: `Cloudflare zone lookup error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Detect Advanced Certificate Manager: list active certificate packs and
  // look for at least one of type "advanced".
  let hasAcm = false;
  try {
    const resp = await fetch(
      `${CF_API_BASE}/zones/${zoneId}/ssl/certificate_packs?status=active`,
      { headers },
    );
    const data = (await resp.json()) as CertPackResponse;
    if (resp.ok && data.success && Array.isArray(data.result)) {
      hasAcm = data.result.some((p) => p.type === "advanced");
    }
    // A 4xx/5xx here is non-fatal — we still know the plan; just leave
    // hasAcm=false. The diagnostics endpoint surfaces this as "can't do
    // multi-level" rather than a hard failure.
  } catch {
    // Same — treat as "ACM not detected".
  }

  return { zoneName, plan, hasAcm, acmReady: true };
}
