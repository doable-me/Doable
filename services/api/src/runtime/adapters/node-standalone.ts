import { mkdir, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";

import { sql } from "../../db/index.js";
import type {
  HealthStatus,
  RuntimeAdapter,
  RuntimeContext,
  RuntimeHandle,
} from "../types.js";

/**
 * Node standalone runtime adapter.
 *
 * Per devframeworkPRD/06-runtime-and-publish.md §3.2 + §7. Targets
 * Next.js with `output: "standalone"` (server bundle at
 * .next/standalone/server.js) and any other Node SSR framework whose
 * adapter declares its own server entry — the runtime supervisor
 * doesn't care about framework specifics, only about wiring up systemd
 * + the unix socket + Caddy's reverse_proxy route.
 *
 * Lifecycle:
 *   1. start() writes /etc/doable/apps/{slug}.env + a per-app
 *      `doable-app@{slug}.service.d/override.conf` drop-in, then
 *      `systemctl daemon-reload && enable --now doable-app@{slug}.socket`.
 *   2. The matching socket unit listens on /run/doable/{slug}.sock and
 *      starts the .service unit on the first connection (socket-activated).
 *   3. stop() runs `systemctl stop doable-app@{slug}.socket .service` and
 *      removes the drop-in directory.
 *
 * On Windows / macOS / any host without systemd, start() is best-effort:
 * it writes the env file but skips systemctl invocations and returns a
 * handle pointing at a TCP fallback. The supervisor falls through to
 * a raw spawn in dev. PRD 06 §13.6 documents the gap.
 */
export const nodeStandaloneAdapter: RuntimeAdapter = {
  id: "node-standalone",
  kind: "process",
  /** Wave 21: switched from "unix-socket" to "tcp-port" — vanilla
   *  Next.js/Nuxt/SvelteKit standalone listen on PORT and don't speak
   *  systemd's LISTEN_FDS protocol. Apps now bind 127.0.0.1:PORT and
   *  Caddy reverse_proxies to it. */
  listenContract: "tcp-port",
  /** PRD 06 §3.2 — 30 minutes idle */
  idleTimeoutMs: 30 * 60_000,

  env(ctx: RuntimeContext): Record<string, string> {
    const host = ctx.listen.kind === "tcp-port" ? ctx.listen.host : "127.0.0.1";
    const port = ctx.listen.kind === "tcp-port" ? String(ctx.listen.port) : "";
    return {
      ...ctx.env,
      NODE_ENV: "production",
      // Frameworks vary in which env they read: Next.js uses HOSTNAME,
      // Astro/@astrojs/node uses HOST, SvelteKit/adapter-node uses HOST too.
      // Set both so the right framework finds the right value.
      PORT: port,
      HOSTNAME: host,
      HOST: host,
      DOABLE_PROJECT_ID: ctx.projectId,
      DOABLE_PROJECT_SLUG: ctx.projectSlug,
    };
  },

  async start(ctx: RuntimeContext): Promise<RuntimeHandle> {
    const slug = ctx.projectSlug;
    const envPath = `/etc/doable/apps/${slug}.env`;
    const dropInDir = `/etc/systemd/system/doable-app@${slug}.service.d`;
    // Wave 21: TCP-port mode is the only supported path. listen.kind
    // should always be tcp-port from the pipeline. Construct the
    // listenAddr the supervisor + healthCheck use.
    const listenAddr =
      ctx.listen.kind === "tcp-port"
        ? `${ctx.listen.host}:${ctx.listen.port}`
        : "127.0.0.1:0";

    // Phase 5 §13.3: read per-project egress allow-list. Failure to load
    // (e.g. column missing on an un-migrated host) defaults to an empty
    // list, which still allows localhost via the static rule below.
    let egressHosts: string[] = [];
    try {
      const rows = await sql<{ egress_hosts: string[] | null }[]>`
        SELECT egress_hosts FROM project_runtime WHERE project_id = ${ctx.projectId}
      `;
      egressHosts = rows[0]?.egress_hosts ?? [];
    } catch {
      egressHosts = [];
    }

    if (process.platform === "linux" && hasSystemctl()) {
      await mkdir(path.dirname(envPath), { recursive: true });
      await writeFile(envPath, renderEnvFile(this.env(ctx)), "utf-8");
      await chmod(envPath, 0o640);

      await mkdir(dropInDir, { recursive: true });
      await writeFile(
        path.join(dropInDir, "override.conf"),
        renderUnitOverride(ctx, egressHosts),
        "utf-8",
      );

      run("systemctl", ["daemon-reload"]);
      // Wave 21: enable + start the .service directly (no .socket activation).
      // Socket activation never woke vanilla Next.js standalone (which only
      // listens on PORT). Now we start the service and Caddy reverse_proxies
      // to its 127.0.0.1:PORT bind.
      run("systemctl", ["enable", "--now", `doable-app@${slug}.service`]);
    } else {
      // Non-systemd host (Windows / macOS / Alpine). Write the env file
      // anyway so a dev tool or test harness can read it, then return a
      // handle the supervisor can degrade-handle.
      try {
        await mkdir(path.dirname(envPath), { recursive: true });
        await writeFile(envPath, renderEnvFile(this.env(ctx)), "utf-8");
      } catch {
        // /etc not writable in dev; ignore.
      }
    }

    return {
      id: `doable-app@${slug}.service`,
      startedAt: new Date(),
      listenAddr,
      listenContract: "tcp-port",
    };
  },

  async stop(handle: RuntimeHandle): Promise<void> {
    const slug = handle.id.replace(/^doable-app@|\.service$/g, "");
    if (process.platform === "linux" && hasSystemctl()) {
      run("systemctl", ["stop", `doable-app@${slug}.service`], {
        ignoreFailure: true,
      });
      run("systemctl", ["disable", `doable-app@${slug}.service`], { ignoreFailure: true });
    }
    // Best-effort env / drop-in cleanup. Failures are logged, not fatal,
    // because partial cleanup must not block the publish pipeline.
  },

  async healthCheck(handle: RuntimeHandle): Promise<HealthStatus> {
    if (handle.listenContract === "tcp-port") {
      // Wave 21: short TCP connect probe to confirm the bound port is
      // accepting connections. systemctl is-active is a coarser check;
      // this catches the case where the unit is "running" but the app
      // hasn't bound its port yet (still in startup).
      const [host, portStr] = handle.listenAddr.split(":");
      const port = parseInt(portStr ?? "", 10);
      if (!host || !Number.isFinite(port)) {
        return { ok: false, reason: "bad-addr", detail: handle.listenAddr };
      }
      const ok = await tcpProbe(host, port, 1000);
      return ok
        ? { ok: true, uptimeMs: Date.now() - handle.startedAt.getTime() }
        : { ok: false, reason: "no-port", detail: handle.listenAddr };
    }
    if (handle.listenContract === "unix-socket") {
      return existsSync(handle.listenAddr)
        ? { ok: true, uptimeMs: Date.now() - handle.startedAt.getTime() }
        : { ok: false, reason: "no-socket", detail: handle.listenAddr };
    }
    return { ok: false, reason: "unknown", detail: "no probe for this contract" };
  },
};

function tcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean) => {
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

// ─── Helpers ─────────────────────────────────────────────

function renderEnvFile(env: Record<string, string>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined || v === null) continue;
    // systemd EnvironmentFile syntax: KEY=value; quote when contains spaces or '#'.
    const needsQuote = /[\s#"]/.test(v);
    lines.push(needsQuote ? `${k}="${v.replace(/"/g, '\\"')}"` : `${k}=${v}`);
  }
  return lines.join("\n") + "\n";
}

function renderUnitOverride(ctx: RuntimeContext, egressHosts: string[] = []): string {
  // Per PRD 06 §A appendix. Drop-in extends the template unit with
  // per-project execution + cgroup limits. Phase 5 §13.3 adds the
  // per-project egress allow-list on top of the implicit localhost rule.
  const extraAllows = egressHosts
    .map((host) => `IPAddressAllow=${host}`)
    .join("\n");
  // dist-server/ is the post-build runtime layout staged by
  // doable-cloud.ts: standalone tree + .next/static + public/ co-located
  // so the standalone server can serve static assets in production.
  // Entry priority: server.js (Next.js) → index.mjs (Nuxt nitro) → index.js (SvelteKit adapter-node, Hono node-build) → entry.mjs (Astro SSR). Default to server.js when none exist (legacy).
  const entry = resolveStandaloneEntry(`${ctx.projectDir}/dist-server`);
  // The empty `ExecStart=` resets the template's inherited ExecStart so
  // systemd accepts our per-project override. Without it, the drop-in
  // fails with "Service has more than one ExecStart= setting" because
  // template + drop-in both declare one (Type=simple only allows one).
  return `[Service]
WorkingDirectory=${ctx.projectDir}/dist-server
User=doable-app
Group=doable-app
ReadWritePaths=
ReadWritePaths=${ctx.projectDir}/dist-server
ExecStart=
ExecStart=/usr/bin/node ${ctx.projectDir}/dist-server/${entry}
MemoryMax=512M
CPUQuota=50%
TasksMax=256
IPAddressDeny=any
IPAddressAllow=localhost
${extraAllows}${extraAllows ? "\n" : ""}`;
}

function resolveStandaloneEntry(distServerDir: string): string {
  for (const candidate of ["server.js", "index.mjs", "index.js", "entry.mjs"]) {
    if (existsSync(`${distServerDir}/${candidate}`)) return candidate;
  }
  return "server.js";
}

function hasSystemctl(): boolean {
  try {
    const r = spawnSync("which", ["systemctl"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

function run(
  cmd: string,
  args: string[],
  opts: { ignoreFailure?: boolean } = {},
): void {
  const r = spawnSync(cmd, args, { stdio: "ignore" });
  if (r.status !== 0 && !opts.ignoreFailure) {
    throw new Error(`${cmd} ${args.join(" ")} exited with code ${r.status}`);
  }
}
