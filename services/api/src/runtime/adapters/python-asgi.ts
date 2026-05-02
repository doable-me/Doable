import { mkdir, writeFile, chmod, readdir } from "node:fs/promises";
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
 * Python ASGI/WSGI runtime adapter.
 *
 * Dispatches between uvicorn (FastAPI, Django ASGI) and gunicorn (Django
 * WSGI) based on what's present at {projectDir}/dist-server/. Mirrors
 * node-standalone.ts shape so the supervisor + caddy admin code paths
 * are identical.
 */
export const pythonAsgiAdapter: RuntimeAdapter = {
  id: "python-asgi",
  kind: "process",
  /** Wave 21: switched from "unix-socket" to "tcp-port". gunicorn/uvicorn
   *  bind 127.0.0.1:PORT and Caddy reverse_proxies to it. */
  listenContract: "tcp-port",
  /** PRD 06 §3.2 — 30 minutes idle */
  idleTimeoutMs: 30 * 60_000,

  env(ctx: RuntimeContext): Record<string, string> {
    return {
      ...ctx.env,
      PYTHONUNBUFFERED: "1",
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
    // Wave 21: TCP-port mode only. Construct host:port from ctx.listen.
    const listenHost =
      ctx.listen.kind === "tcp-port" ? ctx.listen.host : "127.0.0.1";
    const listenPort = ctx.listen.kind === "tcp-port" ? ctx.listen.port : 0;
    const listenAddr = `${listenHost}:${listenPort}`;

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

      const distServerDir = `${ctx.projectDir}/dist-server`;
      const execStart = await resolvePythonExecStart(distServerDir, listenHost, listenPort);

      await mkdir(dropInDir, { recursive: true });
      await writeFile(
        path.join(dropInDir, "override.conf"),
        renderUnitOverride(ctx, execStart, egressHosts),
        "utf-8",
      );

      run("systemctl", ["daemon-reload"]);
      // Wave 21: enable + start the .service directly (no .socket).
      run("systemctl", ["enable", "--now", `doable-app@${slug}.service`]);
    } else {
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
  },

  async healthCheck(handle: RuntimeHandle): Promise<HealthStatus> {
    if (handle.listenContract === "tcp-port") {
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
    const needsQuote = /[\s#"]/.test(v);
    lines.push(needsQuote ? `${k}="${v.replace(/"/g, '\\"')}"` : `${k}=${v}`);
  }
  return lines.join("\n") + "\n";
}

function renderUnitOverride(
  ctx: RuntimeContext,
  execStart: string,
  egressHosts: string[] = [],
): string {
  const extraAllows = egressHosts
    .map((host) => `IPAddressAllow=${host}`)
    .join("\n");
  // Empty `ExecStart=` resets the template's inherited ExecStart so the
  // drop-in's override is accepted. Type=simple units only allow one
  // ExecStart total, so without this systemd refuses to load the unit.
  return `[Service]
WorkingDirectory=${ctx.projectDir}/dist-server
User=doable-app
Group=doable-app
ReadWritePaths=
ReadWritePaths=${ctx.projectDir}/dist-server
ExecStart=
ExecStart=${execStart}
MemoryMax=512M
CPUQuota=50%
TasksMax=256
IPAddressDeny=any
IPAddressAllow=localhost
${extraAllows}${extraAllows ? "\n" : ""}`;
}

async function resolvePythonExecStart(
  distServerDir: string,
  host: string,
  port: number,
): Promise<string> {
  // Pick the venv's interpreter when present so users get the project's
  // pinned dependencies; fall back to system python3 otherwise.
  const venvPython = `${distServerDir}/.venv/bin/python`;
  const pythonBin = existsSync(venvPython) ? venvPython : "/usr/bin/python3";

  // Django WSGI: gunicorn binds host:port directly.
  if (existsSync(`${distServerDir}/manage.py`)) {
    const projectModule = await findDjangoProjectModule(distServerDir);
    if (projectModule) {
      return `${pythonBin} -m gunicorn --bind ${host}:${port} --workers 2 ${projectModule}.wsgi:application`;
    }
    return `${pythonBin} manage.py runserver ${host}:${port}`;
  }

  // FastAPI / any ASGI: uvicorn binds host:port.
  if (existsSync(`${distServerDir}/asgi.py`)) {
    return `${pythonBin} -m uvicorn asgi:application --host ${host} --port ${port}`;
  }
  return `${pythonBin} -m uvicorn main:app --host ${host} --port ${port}`;
}

async function findDjangoProjectModule(distServerDir: string): Promise<string | null> {
  // Django's startproject layout puts wsgi.py inside <project_name>/. Scan
  // the immediate subdirectories for one containing wsgi.py and return its
  // basename; that's the importable module path for gunicorn.
  try {
    const entries = await readdir(distServerDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (existsSync(`${distServerDir}/${e.name}/wsgi.py`)) return e.name;
    }
  } catch {
    // dist-server may not exist yet (called before deploy); fall through.
  }
  return null;
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
