import { existsSync, readdirSync } from "node:fs";

import type {
  HealthStatus,
  RuntimeAdapter,
  RuntimeContext,
  RuntimeHandle,
} from "../types.js";

/**
 * Static-files runtime adapter.
 *
 * Per devframeworkPRD/06-runtime-and-publish.md §7. The vite-react publish
 * path lands here unchanged — DoableCloudAdapter copies the build into
 * /data/sites/{slug}/live/ and Caddy's wildcard `file_server` does the
 * rest. This adapter only verifies the site dir exists and is non-empty;
 * it has no process to start, stop, or supervise.
 */
export const staticFilesAdapter: RuntimeAdapter = {
  id: "static-files",
  kind: "static",
  // listenContract is required by the type but unused for static; report
  // tcp-port by convention so consumers that switch on the field don't
  // crash. Caddy reads from disk, not from a port.
  listenContract: "tcp-port",
  // null = never sleep (and there is nothing to sleep — Caddy serves the
  // files directly from the filesystem).
  idleTimeoutMs: null,

  env(): Record<string, string> {
    return {};
  },

  async start(ctx: RuntimeContext): Promise<RuntimeHandle> {
    if (!dirNonEmpty(ctx.siteDir)) {
      throw new Error(`static-files: siteDir ${ctx.siteDir} missing or empty`);
    }
    return {
      id: `static:${ctx.projectSlug}`,
      startedAt: new Date(),
      listenAddr: ctx.siteDir,
      listenContract: "tcp-port",
    };
  },

  async stop(): Promise<void> {
    // No process to terminate. Site dir teardown is the deploy adapter's job.
  },

  async healthCheck(handle: RuntimeHandle): Promise<HealthStatus> {
    if (dirNonEmpty(handle.listenAddr)) {
      return {
        ok: true,
        uptimeMs: Date.now() - handle.startedAt.getTime(),
      };
    }
    return {
      ok: false,
      reason: "no-process",
      detail: `siteDir ${handle.listenAddr} missing or empty`,
    };
  },
};

function dirNonEmpty(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}
