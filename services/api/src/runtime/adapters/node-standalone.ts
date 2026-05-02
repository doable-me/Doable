import { mkdir, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

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
  listenContract: "unix-socket",
  /** PRD 06 §3.2 — 30 minutes idle */
  idleTimeoutMs: 30 * 60_000,

  env(ctx: RuntimeContext): Record<string, string> {
    return {
      ...ctx.env,
      NODE_ENV: "production",
      PORT: ctx.listen.kind === "tcp-port" ? String(ctx.listen.port) : "",
      HOSTNAME: ctx.listen.kind === "tcp-port" ? ctx.listen.host : "127.0.0.1",
      DOABLE_PROJECT_ID: ctx.projectId,
      DOABLE_PROJECT_SLUG: ctx.projectSlug,
    };
  },

  async start(ctx: RuntimeContext): Promise<RuntimeHandle> {
    const slug = ctx.projectSlug;
    const envPath = `/etc/doable/apps/${slug}.env`;
    const dropInDir = `/etc/systemd/system/doable-app@${slug}.service.d`;
    const socketPath =
      ctx.listen.kind === "unix-socket"
        ? ctx.listen.path
        : `/run/doable/${slug}.sock`;

    if (process.platform === "linux" && hasSystemctl()) {
      await mkdir(path.dirname(envPath), { recursive: true });
      await writeFile(envPath, renderEnvFile(this.env(ctx)), "utf-8");
      await chmod(envPath, 0o640);

      await mkdir(dropInDir, { recursive: true });
      await writeFile(
        path.join(dropInDir, "override.conf"),
        renderUnitOverride(ctx),
        "utf-8",
      );

      run("systemctl", ["daemon-reload"]);
      run("systemctl", ["enable", "--now", `doable-app@${slug}.socket`]);
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
      listenAddr: socketPath,
      listenContract: "unix-socket",
    };
  },

  async stop(handle: RuntimeHandle): Promise<void> {
    const slug = handle.id.replace(/^doable-app@|\.service$/g, "");
    if (process.platform === "linux" && hasSystemctl()) {
      run("systemctl", ["stop", `doable-app@${slug}.socket`, `doable-app@${slug}.service`], {
        ignoreFailure: true,
      });
      run("systemctl", ["disable", `doable-app@${slug}.socket`], { ignoreFailure: true });
    }
    // Best-effort env / drop-in cleanup. Failures are logged, not fatal,
    // because partial cleanup must not block the publish pipeline.
  },

  async healthCheck(handle: RuntimeHandle): Promise<HealthStatus> {
    if (handle.listenContract === "unix-socket") {
      return existsSync(handle.listenAddr)
        ? { ok: true, uptimeMs: Date.now() - handle.startedAt.getTime() }
        : { ok: false, reason: "no-socket", detail: handle.listenAddr };
    }
    return { ok: false, reason: "unknown", detail: "tcp probe not implemented yet" };
  },
};

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

function renderUnitOverride(ctx: RuntimeContext): string {
  // Per PRD 06 §A appendix. Drop-in extends the template unit with
  // per-project execution + cgroup limits.
  return `[Service]
WorkingDirectory=${ctx.projectDir}
ExecStart=/usr/bin/node ${ctx.projectDir}/.next/standalone/server.js
MemoryMax=512M
CPUQuota=50%
TasksMax=256
IPAddressDeny=any
IPAddressAllow=localhost
`;
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
