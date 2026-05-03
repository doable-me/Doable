/**
 * Django framework adapter.
 *
 * Per devframeworkPRD/02-framework-abstraction.md §8 (family: "python").
 * Django requires a long-lived Python process (gunicorn in production,
 * `manage.py runserver` in dev) and a non-Node system runtime, so it
 * carries the `ssr-python`, `requires-long-lived-process`, and
 * `needs-system-runtime` capabilities.
 *
 * Behaviour summary (consult `defaults` for static metadata):
 *   - dev:   `python manage.py runserver {host}:{port}`   (long-lived)
 *   - build: `python manage.py collectstatic --noinput`   -> `staticfiles/`
 *   - serve: `gunicorn wsgi:application -b {host}:{port}` (production runtime)
 *
 * NOT registered yet — wiring lives in `adapters/index.ts` + `init.ts`
 * (separate task).
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pythonBin } from "./python-bin.js";

import type {
  BuildSpec,
  DevSpec,
  FrameworkAdapter,
  InstallResult,
  ScaffoldResult,
  ServeSpec,
} from "../types.js";
import type {
  BuildContext,
  DevContext,
  FrameworkContext,
  ScaffoldContext,
  ServeContext,
} from "../context.js";

// ─── Constants ───────────────────────────────────────────

const INSTALL_TIMEOUT_MS = 180_000;

// ─── Helpers ─────────────────────────────────────────────

function runPipInstall(ctx: FrameworkContext): Promise<InstallResult> {
  return new Promise<InstallResult>((resolve, reject) => {
    const start = Date.now();
    const child = spawn(
      pythonBin(),
      ["-m", "pip", "install", "-r", "requirements.txt"],
      {
        cwd: ctx.projectPath,
        shell: true,
        stdio: "pipe",
        env: { ...process.env, ...ctx.env, PIP_DISABLE_PIP_VERSION_CHECK: "1" },
      },
    );

    let log = "";
    child.stdout?.on("data", (d: Buffer) => { log += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { log += d.toString(); });

    const timer = setTimeout(() => {
      try {
        if (process.platform === "win32" && child.pid) {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false });
        } else {
          child.kill("SIGTERM");
        }
      } catch { /* ignore */ }
    }, INSTALL_TIMEOUT_MS);

    if (ctx.signal) {
      ctx.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        try { child.kill("SIGTERM"); } catch { /* ignore */ }
        reject(new Error("install aborted"));
      });
    }

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ durationMs: Date.now() - start, log });
      } else {
        reject(new Error(`pip install exited with code ${code}\n${log.slice(-2000)}`));
      }
    });
  });
}

async function writeAllFiles(
  templateFiles: Record<string, string>,
  projectPath: string,
): Promise<string[]> {
  const written: string[] = [];
  for (const [rel, content] of Object.entries(templateFiles)) {
    const full = path.join(projectPath, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf-8");
    written.push(rel);
  }
  return written;
}

// ─── Adapter ─────────────────────────────────────────────

export const djangoAdapter: FrameworkAdapter = {
  id: "django",
  family: "python",
  displayName: "Django",
  capabilities: new Set([
    "ssr-python",
    "requires-long-lived-process",
    "needs-system-runtime",
  ]),

  defaults: {
    requiredFiles: ["manage.py", "requirements.txt"],
    criticalFiles: ["manage.py", "requirements.txt"],
    listIgnore: ["__pycache__", ".venv", "venv", "staticfiles", ".git"],
    lockedConfigFiles: ["settings.py", "wsgi.py", "asgi.py"],
    fallbackTemplateId: "django-blank",
    devReadinessTimeoutMs: 60_000,
    buildTimeoutMs: 180_000,
  },

  async scaffold(ctx: ScaffoldContext): Promise<ScaffoldResult> {
    const filesWritten = await writeAllFiles(ctx.templateFiles, ctx.projectPath);
    return { filesWritten };
  },

  install(ctx: FrameworkContext): Promise<InstallResult> {
    return runPipInstall(ctx);
  },

  dev(ctx: DevContext): DevSpec {
    return {
      command: pythonBin(),
      args: ["manage.py", "runserver", `${ctx.host}:${ctx.port}`],
      cwd: ctx.projectPath,
      env: ctx.env,
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Quit the server with", "Starting development server"],
      },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },

  build(ctx: BuildContext): BuildSpec {
    return {
      command: pythonBin(),
      args: ["manage.py", "collectstatic", "--noinput"],
      cwd: ctx.projectPath,
      env: ctx.env,
      outputDir: "staticfiles",
    };
  },

  serve(ctx: ServeContext): ServeSpec {
    return {
      command: "gunicorn",
      args: ["wsgi:application", "-b", `${ctx.host}:${ctx.port}`],
      cwd: ctx.projectPath,
      env: { ...ctx.env, DJANGO_SETTINGS_MODULE: "settings" },
      port: ctx.port,
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Listening at:", "Booting worker"],
      },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },

  parseLog(line: string) {
    const lower = line.toLowerCase();
    if (lower.includes("error")) {
      return { type: "build_error" as const, data: { message: line.trim() } };
    }
    if (lower.includes("warning")) {
      return { type: "build_warning" as const, data: { message: line.trim() } };
    }
    return null;
  },

  lockedConfigFiles() {
    return this.defaults.lockedConfigFiles;
  },

  listIgnore() {
    return this.defaults.listIgnore;
  },
};
