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
    // Wave 28: remove the per-project Linux user setupProjectUser created.
    // Idempotent: userdel exit 6 = "user not found" — treat as success.
    // Same slug→username mapping as setupProjectUser: doable-{slug}.slice(0,32).
    const username = `doable-${slug}`.slice(0, 32);
    const ud = spawnSync("userdel", [username], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    if (ud.status !== 0 && ud.status !== 6) {
      console.warn(
        `[node-standalone] userdel ${username} failed: ` +
          (ud.stderr?.toString() ?? ud.error?.message ?? "unknown"),
      );
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
  // Wave 27: per-instance host UID. doable-cloud.ts setupProjectUser()
  // creates `doable-{slug}` (truncated to Linux's 32-char username
  // limit) at deploy time and chowns dist-server to it; we pin the
  // systemd unit's User=/Group= to the same name so each published
  // project runs under its own UID instead of the shared dynamic UID
  // from Wave 26's DynamicUser=yes.
  const username = `doable-${ctx.projectSlug}`.slice(0, 32);
  // dist-server/ is the post-build runtime layout staged by
  // doable-cloud.ts: standalone tree + .next/static + public/ co-located
  // so the standalone server can serve static assets in production.
  // Entry priority: server.js (Next.js) → index.mjs (Nuxt nitro) → index.js (SvelteKit adapter-node, Hono node-build) → entry.mjs (Astro SSR). Default to server.js when none exist (legacy).
  const entry = resolveStandaloneEntry(`${ctx.projectDir}/dist-server`);

  // Wave 27-C: configurable hardening level for dev/test ergonomics.
  //   full     — production: all Wave 25-27 directives (default)
  //   relaxed  — dev: only universally-safe directives that don't
  //              interfere with hot-reload, debuggers, or volume mounts
  //   off      — debug only: no security directives, just the cgroup
  //              caps so a runaway can't OOM the host
  const level = (process.env.DOABLE_HARDENING ?? "full").toLowerCase();

  // Cgroup operational caps — always emitted regardless of level. These
  // are not security boundaries (a malicious app can still hit the limit
  // and crash); they exist to keep one runaway from starving its
  // neighbours.
  const cgroupBlock = `MemoryMax=512M
CPUQuota=50%
TasksMax=256`;

  // The empty `ExecStart=` resets the template's inherited ExecStart so
  // systemd accepts our per-project override. Without it, the drop-in
  // fails with "Service has more than one ExecStart= setting" because
  // template + drop-in both declare one (Type=simple only allows one).
  const execBlock = `WorkingDirectory=${ctx.projectDir}/dist-server
ExecStart=
ExecStart=/usr/bin/node ${ctx.projectDir}/dist-server/${entry}`;

  if (level === "off") {
    // No hardening at all — equivalent to running standalone. Only the
    // cgroup caps remain so the app still can't OOM the host. The
    // template's inherited User= (root or whatever it defaults to)
    // applies, which is the documented trade-off of this debug mode.
    //
    // Wave 30: the template doable-app@.service ships with the full
    // hardening directives baked in. systemd merges template + drop-in,
    // so simply OMITTING the strict settings here lets the template's
    // strict ones still apply. To make `off` actually mean off we must
    // explicitly emit the inverse / reset values for every directive
    // the template sets, so they override the inherited ones.
    return `[Service]
${execBlock}
NoNewPrivileges=no
ProtectSystem=no
PrivateTmp=no
PrivateUsers=no
PrivateDevices=no
ProtectKernelTunables=no
ProtectKernelModules=no
ProtectKernelLogs=no
ProtectControlGroups=no
ProtectClock=no
ProtectHostname=no
ProtectProc=default
ProcSubset=all
RestrictNamespaces=no
RestrictRealtime=no
LockPersonality=no
RestrictSUIDSGID=no
RemoveIPC=no
ReadWritePaths=
SystemCallFilter=
RestrictAddressFamilies=
IPAddressDeny=
IPAddressAllow=
${cgroupBlock}
`;
  }

  // BASE block — emitted for both `relaxed` and `full`. Universally safe
  // directives that don't break hot-reload, debuggers, or volume mounts:
  // no-new-privs, read-only system, narrowed write paths, private /tmp,
  // and the loopback-only egress firewall + per-project allow-list.
  const baseBlock = `NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=
ReadWritePaths=${ctx.projectDir}/dist-server
PrivateTmp=yes
IPAddressDeny=any
IPAddressAllow=localhost
${extraAllows}${extraAllows ? "\n" : ""}`;

  if (level !== "full") {
    // `relaxed` — base + cgroups, skip the heavy isolation. The
    // template's inherited User= applies (no per-project UID).
    //
    // Wave 30: like the `off` branch, we must explicitly clear the
    // template's strict directives that `relaxed` doesn't want. Without
    // these resets the template's PrivateUsers/ProtectKernel*/
    // SystemCallFilter/ProtectProc/etc. would still apply via the
    // template+drop-in merge, defeating the point of "relaxed".
    // baseBlock's positive settings (NoNewPrivileges=yes,
    // ProtectSystem=strict, narrowed ReadWritePaths, PrivateTmp=yes,
    // IPAddressDeny+localhost) are independent keys from the clears
    // below, so order doesn't matter for systemd — emit baseBlock
    // first for readability, then the inverse-clears, then cgroups.
    const relaxedClears = `PrivateUsers=no
PrivateDevices=no
ProtectKernelTunables=no
ProtectKernelModules=no
ProtectKernelLogs=no
ProtectControlGroups=no
ProtectClock=no
ProtectHostname=no
ProtectProc=default
ProcSubset=all
RestrictNamespaces=no
RestrictRealtime=no
LockPersonality=no
RestrictSUIDSGID=no
RemoveIPC=no
SystemCallFilter=
RestrictAddressFamilies=
`;
    return `[Service]
${execBlock}
${baseBlock}${relaxedClears}${cgroupBlock}
`;
  }

  // FULL extras — Wave 25-27 production hardening. Per-project User/Group
  // (Wave 27-A), W27-B's SystemCallFilter deny-list, and the namespace,
  // kernel, address-family, syscall, device, clock, and proc isolations
  // from Wave 25-26.
  const fullExtras = `User=${username}
Group=${username}
PrivateUsers=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
RestrictNamespaces=~user
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictRealtime=yes
LockPersonality=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallFilter=~@clock @cpu-emulation @debug @module @mount @obsolete @raw-io @reboot @swap @privileged
SystemCallArchitectures=native
PrivateDevices=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
`;

  return `[Service]
${execBlock}
${baseBlock}${fullExtras}${cgroupBlock}
`;
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
