/**
 * Caddy admin-API client.
 *
 * Per devframeworkPRD/06-runtime-and-publish.md §6. Inserts and removes
 * per-project reverse-proxy routes via the local Caddy admin API at
 * 127.0.0.1:2019 (already enabled in setup-server.sh and the existing
 * caddy-domains.ts generated config).
 *
 * Why this exists: today caddy-domains.ts regenerates the entire
 * Caddyfile + `systemctl reload caddy` on every custom-domain change.
 * That works for rare events (custom domains) but is too slow per
 * publish. The admin API supports incremental config patches —
 * adding/removing one route per project without touching the file.
 *
 * Static-spa publishes still go through the wildcard handler (no
 * Caddy admin call needed). Process-kind publishes call addReverseProxy
 * here and removeRoute on unpublish.
 */

const CADDY_ADMIN_URL =
  process.env.CADDY_ADMIN_URL ?? "http://127.0.0.1:2019";

const ROUTES_PATH = "/config/apps/http/servers/srv0/routes";

export interface AddProcessRouteInput {
  /** project slug used both for Caddy @id and unix socket path */
  slug: string;
  /** public hostname Caddy should match — e.g. myapp.doable.me */
  hostname: string;
  /** upstream — either a unix-socket path or "127.0.0.1:port" */
  upstream: { kind: "unix-socket"; path: string } | { kind: "tcp-port"; addr: string };
}

export interface CaddyRoute {
  "@id"?: string;
  match: Array<{ host: string[] }>;
  handle: Array<Record<string, unknown>>;
  terminal?: boolean;
}

/**
 * Build a Caddy route block for a process-kind app. Inserted at index 0
 * so it wins over the wildcard file_server handler that serves static
 * sites.
 */
export function buildProcessRoute(input: AddProcessRouteInput): CaddyRoute {
  const dial =
    input.upstream.kind === "unix-socket"
      ? `unix/${input.upstream.path}`
      : input.upstream.addr;

  return {
    "@id": routeId(input.slug),
    match: [{ host: [input.hostname] }],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial }],
        transport: { protocol: "http" },
        load_balancing: { try_duration: "5s" },
        headers: {
          request: {
            set: {
              "X-Forwarded-Proto": ["https"],
              "X-Forwarded-Host": ["{http.request.host}"],
            },
          },
        },
      },
    ],
    terminal: true,
  };
}

/**
 * Insert a per-project reverse-proxy route at index 0 of srv0/routes,
 * overriding the wildcard static handler for this hostname only.
 *
 * Idempotent — if a route with the same @id already exists, it is
 * deleted first. This avoids duplicate handlers on republish.
 */
export async function addProcessRoute(input: AddProcessRouteInput): Promise<void> {
  await removeRoute(input.slug); // idempotent: noop if absent
  const route = buildProcessRoute(input);
  const res = await fetch(`${CADDY_ADMIN_URL}${ROUTES_PATH}/0`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(route),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new CaddyAdminError(
      `Caddy admin PUT routes/0 failed: ${res.status} ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Remove the per-project route by @id. Returns true if the route was
 * present and removed; false if it was absent (treated as success).
 */
export async function removeRoute(slug: string): Promise<boolean> {
  const res = await fetch(`${CADDY_ADMIN_URL}/id/${routeId(slug)}`, {
    method: "DELETE",
  });
  if (res.status === 404 || res.status === 200) return res.status === 200;
  const text = await res.text().catch(() => "");
  throw new CaddyAdminError(
    `Caddy admin DELETE failed: ${res.status} ${text.slice(0, 200)}`,
  );
}

/**
 * Read every per-host route currently registered. Used by the supervisor
 * (PRD 06 §6.2) on boot to reconcile against the project_runtime table.
 */
export async function listRoutes(): Promise<CaddyRoute[]> {
  const res = await fetch(`${CADDY_ADMIN_URL}${ROUTES_PATH}`);
  if (!res.ok) {
    if (res.status === 404) return []; // no routes configured yet
    throw new CaddyAdminError(`Caddy admin GET routes failed: ${res.status}`);
  }
  return (await res.json()) as CaddyRoute[];
}

/**
 * Probe — used at boot and in health checks. Returns true if the admin
 * API is reachable; false otherwise. Does NOT throw on connection errors
 * because the API is optional in dev (no Caddy running on Windows).
 */
export async function caddyAdminAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${CADDY_ADMIN_URL}/config/`);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

function routeId(slug: string): string {
  return `doable-app-${slug}`;
}

export class CaddyAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaddyAdminError";
  }
}
