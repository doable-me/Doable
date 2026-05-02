/**
 * FastAPI framework adapter.
 *
 * Per devframeworkPRD/02-framework-abstraction.md §8 (multi-runtime support)
 * and PRD 06's `process` runtime kind. FastAPI is a Python ASGI framework
 * served by uvicorn; there is no separate build step — the source IS the
 * artifact. Production simply drops the `--reload` flag.
 *
 * Behaviour summary (consult `defaults` for static metadata):
 *   - dev:   `uvicorn main:app --reload --host {host} --port {port}` (long-lived)
 *   - build: no-op (Python source is the deployable artifact)
 *   - serve: `uvicorn main:app --host {host} --port {port}`           (production runtime)
 *
 * NOT registered yet — wiring lives in `adapters/index.ts` + `init.ts`.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

const INSTALL_TIMEOUT_MS = 240_000;

// ─── Helpers ─────────────────────────────────────────────

function runPipInstall(ctx: FrameworkContext): Promise<InstallResult> {
  return new Promise<InstallResult>((resolve, reject) => {
    const start = Date.now();
    // Invoke pip via `python -m pip` so the install path follows the
    // active Python interpreter (venv vs system) — this is the form the
    // pip docs recommend for portable scripts. The supervisor exposes the
    // venv's `python` on PATH inside the sandboxed project workspace.
    const child = spawn("python", ["-m", "pip", "install", "-r", "requirements.txt"], {
      cwd: ctx.projectPath,
      shell: true,
      stdio: "pipe",
      env: { ...process.env, ...ctx.env, PIP_DISABLE_PIP_VERSION_CHECK: "1" },
    });

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
        reject(new Error(`python -m pip install exited with code ${code}\n${log.slice(-2000)}`));
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

export const fastapiAdapter: FrameworkAdapter = {
  id: "fastapi",
  family: "python",
  displayName: "FastAPI",
  capabilities: new Set([
    "ssr-python",
    "requires-long-lived-process",
    "needs-system-runtime",
    "hmr-supported",
  ]),

  defaults: {
    requiredFiles: ["main.py", "requirements.txt"],
    criticalFiles: ["main.py", "requirements.txt"],
    listIgnore: ["__pycache__", ".venv", "venv", ".git", ".pytest_cache"],
    lockedConfigFiles: ["main.py"],
    fallbackTemplateId: "fastapi-blank",
    devReadinessTimeoutMs: 60_000,
    buildTimeoutMs: 60_000,
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
      command: "uvicorn",
      args: [
        "main:app",
        "--reload",
        "--host", ctx.host,
        "--port", String(ctx.port),
      ],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        // Force unbuffered stdout/stderr so readiness substrings reach the
        // supervisor without sitting in Python's block-buffer.
        PYTHONUNBUFFERED: "1",
        DOABLE_BASE_PATH: ctx.basePath,
      },
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Application startup complete", "Uvicorn running"],
      },
      healthUrl: `http://${ctx.host}:${ctx.port}${ctx.basePath === "/" ? "/" : ctx.basePath}`,
    };
  },

  build(_ctx: BuildContext): BuildSpec {
    // FastAPI has no build step — the Python source IS the artifact. We
    // return a no-op spawn shape (`true` exits 0 on every POSIX shell and
    // is recognised by Windows cmd via the `shell:true` spawn flag in the
    // caller) so the builder pipeline can run uniformly across frameworks
    // without a special case for build-less stacks.
    return {
      command: "true",
      args: [],
      cwd: _ctx.projectPath,
      env: { ...(_ctx.env ?? {}) },
      outputDir: "",
      timeoutMs: 60_000,
    };
  },

  serve(ctx: ServeContext): ServeSpec {
    // Production: same shape as dev minus --reload. The runtime supervisor
    // (PRD 06) owns process lifecycle; restarts come from the supervisor,
    // not from uvicorn's reloader.
    return {
      command: "uvicorn",
      args: [
        "main:app",
        "--host", ctx.host,
        "--port", String(ctx.port),
      ],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        PYTHONUNBUFFERED: "1",
      },
      port: ctx.port,
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Application startup complete", "Uvicorn running"],
      },
    };
  },

  parseLog(line: string) {
    // Uvicorn's standard log format: `LEVEL:     message` (5 spaces).
    if (/^ERROR:\s/.test(line) || line.toLowerCase().includes("traceback")) {
      return { level: "error" as const, message: line.trim() };
    }
    if (/^WARNING:\s/.test(line)) {
      return { level: "warn" as const, message: line.trim() };
    }
    return null;
  },

  lockedConfigFiles() {
    return this.defaults.lockedConfigFiles;
  },

  listIgnore() {
    return this.defaults.listIgnore;
  },

  shouldReloadOnError({ path, status }) {
    // uvicorn --reload briefly drops connections while it restarts on
    // file change; the proxy can paper over the gap by reloading the
    // client when a 502/504 hits an /api/ path.
    if (status !== 502 && status !== 504) return false;
    return path.startsWith("/api/");
  },

  redactInUI(text: string): string {
    return text
      .replace(/uvicorn\s+main:app/g, "dev server")
      .replace(/main\.py/g, "app entry")
      .replace(/requirements\.txt/g, "dependencies");
  },
};
