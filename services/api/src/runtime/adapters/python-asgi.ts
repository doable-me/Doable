import { mkdir, writeFile, chmod, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
  listenContract: "unix-socket",
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
    const socketPath =
      ctx.listen.kind === "unix-socket"
        ? ctx.listen.path
        : `/run/doable/${slug}.sock`;

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
      const execStart = await resolvePythonExecStart(distServerDir, slug);

      await mkdir(dropInDir, { recursive: true });
      await writeFile(
        path.join(dropInDir, "override.conf"),
        renderUnitOverride(ctx, execStart, egressHosts),
        "utf-8",
      );

      run("systemctl", ["daemon-reload"]);
      run("systemctl", ["enable", "--now", `doable-app@${slug}.socket`]);
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
  slug: string,
): Promise<string> {
  // Pick the venv's interpreter when present so users get the project's
  // pinned dependencies; fall back to system python3 otherwise.
  const venvPython = `${distServerDir}/.venv/bin/python`;
  const pythonBin = existsSync(venvPython) ? venvPython : "/usr/bin/python3";
  const sock = `/run/doable/${slug}.sock`;

  // Django: manage.py at the top of dist-server/ + a sibling directory
  // containing wsgi.py is the canonical layout. gunicorn binds the unix
  // socket directly via --bind unix:/path.
  if (existsSync(`${distServerDir}/manage.py`)) {
    const projectModule = await findDjangoProjectModule(distServerDir);
    if (projectModule) {
      return `${pythonBin} -m gunicorn --bind unix:${sock} --workers 2 ${projectModule}.wsgi:application`;
    }
    // Fallback: runserver against a TCP port — not socket-activated, but
    // keeps the unit alive while logging the project layout problem.
    return `${pythonBin} manage.py runserver 127.0.0.1:8000`;
  }

  // FastAPI (and any uvicorn-friendly app): asgi.py preferred when both
  // exist, else main:app. uvicorn supports --uds for unix socket binding.
  if (existsSync(`${distServerDir}/asgi.py`)) {
    return `${pythonBin} -m uvicorn asgi:application --uds ${sock}`;
  }
  return `${pythonBin} -m uvicorn main:app --uds ${sock}`;
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
