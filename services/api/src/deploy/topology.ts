/**
 * Publish topology resolution.
 *
 * Doable supports two ways to host a published app:
 *
 *   - "subdomain" (recommended): each app gets `https://<slug>.<domain>`.
 *     Requires wildcard DNS + wildcard TLS, which in practice means a
 *     Cloudflare Tunnel (per-publish CNAME) or an admin-managed wildcard
 *     CNAME (DNS_MODE=wildcard). This is the prettiest URL and the default
 *     whenever that infrastructure is present.
 *
 *   - "path" (out-of-the-box fallback): apps are served as sub-paths off the
 *     main domain, `https://<domain>/sites/<slug>/`. No wildcard DNS, no
 *     extra certificate, no tunnel — works on any single-domain install with
 *     one Let's Encrypt cert (the common self-host case). The trade-off is a
 *     longer URL and (for now) static SPA output only.
 *
 * The active topology is auto-detected from the available infrastructure and
 * can be forced with the PUBLISH_MODE env var ("path" | "subdomain").
 *
 * This module is the single source of truth for {url, basePath, on-disk dir}
 * across both topologies so the build (`--base`), the deploy adapter, the
 * Caddy serving route, and teardown all agree.
 */
import { computeSitePublishLocation, SITES_DIR } from "./adapters/doable-cloud.js";

export type PublishTopology = "subdomain" | "path";

export interface PublishLocation {
  /** Which topology produced this location. */
  topology: PublishTopology;
  /** Public URL the user visits. Always ends in "/" for path topology. */
  url: string;
  /**
   * Public base path the assets are served from. "/" for subdomain hosting;
   * "/sites/<dirKey>/" for path hosting. Passed to the builder as Vite's
   * `--base` so emitted asset URLs resolve under the right prefix.
   */
  basePath: string;
  /**
   * On-disk directory name under SITES_DIR for this publish. Both topologies
   * key off this so serving + teardown are uniform.
   */
  dirKey: string;
  /** Fully-qualified hostname — subdomain topology only. */
  hostname?: string;
}

export interface TopologySignals {
  /** Raw PUBLISH_MODE env value (case-insensitive: "path" | "subdomain"). */
  publishMode?: string;
  /** True when a Cloudflare Tunnel is configured (CLOUDFLARED_TUNNEL_ID). */
  hasTunnel: boolean;
  /** Platform DNS mode — "wildcard" implies an admin-managed wildcard CNAME. */
  dnsMode: "per_publish" | "wildcard";
}

/**
 * Decide the active publish topology.
 *
 * Precedence:
 *   1. Explicit PUBLISH_MODE override ("path" | "subdomain").
 *   2. Auto: subdomain when wildcard infra exists (a tunnel, or an
 *      admin-managed wildcard CNAME); otherwise path.
 */
export function resolvePublishTopology(signals: TopologySignals): PublishTopology {
  const explicit = signals.publishMode?.trim().toLowerCase();
  if (explicit === "path" || explicit === "subdomain") {
    return explicit;
  }
  if (signals.hasTunnel || signals.dnsMode === "wildcard") {
    return "subdomain";
  }
  return "path";
}

/**
 * Public path prefix for path-based publishes. Configurable via
 * PUBLISH_PATH_PREFIX (leading slash optional, trailing slashes stripped).
 * Defaults to "/sites".
 */
function pathPrefix(): string {
  const raw = (process.env.PUBLISH_PATH_PREFIX ?? "/sites").trim();
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  return withLead.replace(/\/+$/, "") || "/sites";
}

/**
 * Public origin for path-based publish URLs (no trailing slash). Published
 * sites are served from the SAME origin as the app, under the path prefix.
 * Precedence: PUBLISH_BASE_URL > NEXT_PUBLIC_APP_URL > https://<DOABLE_DOMAIN>.
 */
function publicOrigin(): string {
  const raw =
    process.env.PUBLISH_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    `https://${process.env.DOABLE_DOMAIN ?? "doable.me"}`;
  return raw.replace(/\/+$/, "");
}

/**
 * Compute the publish location for a given subdomain + environment under the
 * chosen topology. Mirrors the on-disk layout each adapter writes:
 *   - subdomain → SITES_DIR/<siteSubdomain>/live/  (DoableCloudAdapter)
 *   - path      → SITES_DIR/<dirKey>/              (DoablePathAdapter)
 */
export function computePublishLocation(
  subdomain: string,
  environment: "preview" | "production",
  topology: PublishTopology,
): PublishLocation {
  if (topology === "subdomain") {
    const loc = computeSitePublishLocation(subdomain, environment);
    return {
      topology,
      url: loc.url,
      basePath: loc.basePath,
      dirKey: loc.siteSubdomain,
      hostname: loc.hostname,
    };
  }

  // Path topology: preview keeps the same `p-` prefix convention as the
  // subdomain topology so the two never collide on disk.
  const envPrefix = environment === "preview" ? "p-" : "";
  const dirKey = `${envPrefix}${subdomain}`;
  const prefix = pathPrefix();
  return {
    topology,
    url: `${publicOrigin()}${prefix}/${dirKey}/`,
    basePath: `${prefix}/${dirKey}/`,
    dirKey,
  };
}

/** Adapter name that serves a given topology. */
export function adapterNameForTopology(topology: PublishTopology): string {
  return topology === "path" ? "doable-path" : "doable-cloud";
}

/** Re-export so callers don't need to reach into the cloud adapter module. */
export { SITES_DIR };
