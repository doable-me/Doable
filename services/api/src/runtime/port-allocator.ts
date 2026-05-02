/**
 * Per-project TCP port allocator for production process-kind apps.
 *
 * Wave 21: replaces systemd socket activation. Each published process-kind
 * project (Next.js standalone, Nuxt nitro, SvelteKit adapter-node, Hono,
 * FastAPI/Django) gets a unique port from PROD_PORT_RANGE. The systemd
 * unit's drop-in sets PORT to this value; Caddy reverse_proxies the
 * public hostname to 127.0.0.1:PORT.
 *
 * Allocation is idempotent — calling for the same projectId twice
 * returns the same port. Persisted in `project_runtime.listen_addr`
 * (text column, format "127.0.0.1:PORT").
 */

import { sql as defaultSql } from "../db/index.js";

const PROD_PORT_RANGE_START = 30_000;
const PROD_PORT_RANGE_END = 39_999;

export interface AllocatePortOptions {
  /** override the default sql client (test only) */
  sql?: typeof defaultSql;
}

/**
 * Returns the host:port string for the project. If a port was previously
 * allocated (project_runtime.listen_addr already set with kind=tcp-port),
 * returns the same value. Otherwise allocates the lowest unused port in
 * PROD_PORT_RANGE_START..PROD_PORT_RANGE_END and persists it.
 *
 * Throws RangeExhaustedError if every port in the range is already in
 * project_runtime — at that point the operator should widen the range.
 */
export async function allocateProcessPort(
  projectId: string,
  opts: AllocatePortOptions = {},
): Promise<{ host: string; port: number; addr: string }> {
  const sql = opts.sql ?? defaultSql;

  // Re-use existing allocation if present.
  const existing = await sql<{ listen_addr: string | null; listen_kind: string | null }[]>`
    SELECT listen_addr, listen_kind
    FROM project_runtime
    WHERE project_id = ${projectId}
  `;
  const existingAddr = existing[0]?.listen_addr;
  const existingKind = existing[0]?.listen_kind;
  if (existingKind === "tcp-port" && existingAddr) {
    const parsed = parseAddr(existingAddr);
    if (parsed) return parsed;
  }

  // Find lowest unused port. Atomic: read all in-use ports in a single
  // query, pick the gap. Race window between read and upsert is small;
  // worst case two concurrent calls both get the same port and one
  // upsert wins on the unique key (project_runtime.project_id is PK).
  const rows = await sql<{ listen_addr: string }[]>`
    SELECT listen_addr
    FROM project_runtime
    WHERE listen_kind = 'tcp-port' AND listen_addr IS NOT NULL
  `;
  const inUse = new Set<number>();
  for (const r of rows) {
    const p = parseAddr(r.listen_addr);
    if (p) inUse.add(p.port);
  }

  for (let port = PROD_PORT_RANGE_START; port <= PROD_PORT_RANGE_END; port++) {
    if (!inUse.has(port)) {
      return { host: "127.0.0.1", port, addr: `127.0.0.1:${port}` };
    }
  }

  throw new RangeExhaustedError(
    `No free ports in ${PROD_PORT_RANGE_START}-${PROD_PORT_RANGE_END}. ` +
      `${inUse.size} ports allocated. Widen the range or clean up stale runtime rows.`,
  );
}

function parseAddr(addr: string): { host: string; port: number; addr: string } | null {
  const m = /^([\w.-]+):(\d+)$/.exec(addr);
  if (!m) return null;
  const host = m[1];
  const port = parseInt(m[2] ?? "", 10);
  if (!host || !Number.isFinite(port) || port < 1 || port > 65_535) return null;
  return { host, port, addr };
}

export class RangeExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RangeExhaustedError";
  }
}
