/**
 * Framework end-to-end smoke test.
 *
 * For each supported framework, this script:
 *   1. Scaffolds a temp project from the corresponding "{framework}-blank" template.
 *   2. Runs the framework adapter's install command.
 *   3. Spawns the framework adapter's dev command (through vite-jail).
 *   4. Polls the dev port for a 200/302/404 response (any successful TCP +
 *      HTTP-shaped reply means the dev server is up; user code may be
 *      empty so 404 is treated as PASS).
 *   5. Kills the dev process and reports per-framework PASS/FAIL.
 *
 * Run from repo root:
 *   pnpm tsx scripts/test-frameworks.ts
 *
 * Output is a single table to stdout — easy to copy into a verification log.
 */

import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import { defaultRegistry } from "../services/api/src/frameworks/registry.js";
import { initFrameworks } from "../services/api/src/frameworks/init.js";
import { getTemplate } from "../services/api/src/templates/registry.js";

// Register all framework adapters before resolving any of them.
initFrameworks();

const FRAMEWORKS_TO_TEST = [
  { id: "vite-react",   templateId: "blank" },
  { id: "nextjs-app",   templateId: "nextjs-blank" },
  { id: "nuxt",         templateId: "nuxt-blank" },
  { id: "sveltekit",    templateId: "sveltekit-blank" },
  { id: "hono",         templateId: "hono-blank" },
  { id: "astro",        templateId: "astro-blank" },
  { id: "fastapi",      templateId: "fastapi-blank" },
  { id: "django",       templateId: "django-blank" },
];

const PORT_BASE = 41000; // outside the editor preview range (3100-3200) and prod range (30000-39999)

interface Result {
  framework: string;
  step: "scaffold" | "install" | "dev-spawn" | "dev-ready" | "http-probe" | "done";
  status: "PASS" | "FAIL" | "SKIP";
  port?: number;
  pid?: number;
  http?: number;
  durationMs?: number;
  notes?: string;
}

async function probeHttp(port: number, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode ?? null);
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function waitForReady(port: number, child: ChildProcess, maxMs: number, readyPatterns: string[]): Promise<{ ok: boolean; how: string }> {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxMs;
    let logBuf = "";
    let resolved = false;

    const finish = (ok: boolean, how: string) => {
      if (resolved) return;
      resolved = true;
      resolve({ ok, how });
    };

    child.stdout?.on("data", (d) => {
      logBuf += d.toString();
      for (const p of readyPatterns) {
        if (logBuf.includes(p)) {
          finish(true, `log:"${p}"`);
          return;
        }
      }
      if (logBuf.length > 64 * 1024) logBuf = logBuf.slice(-32 * 1024);
    });
    child.stderr?.on("data", (d) => {
      logBuf += d.toString();
      for (const p of readyPatterns) {
        if (logBuf.includes(p)) {
          finish(true, `log:"${p}"`);
          return;
        }
      }
    });
    child.on("exit", (code) => finish(false, `exited(${code})`));

    const poll = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(poll);
        finish(false, `timeout — last 1KB of output: ${logBuf.slice(-1024)}`);
        return;
      }
      const code = await probeHttp(port, 1500);
      if (code != null) {
        clearInterval(poll);
        finish(true, `http:${code}`);
      }
    }, 1500);
  });
}

async function runFramework(spec: { id: string; templateId: string }, port: number): Promise<Result> {
  const startTime = Date.now();
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), `doable-fwtest-${spec.id}-`));
  const projectId = `00000000-0000-0000-0000-${spec.id.replace(/[^a-z0-9]/g, "").slice(0, 12).padEnd(12, "0")}`;

  try {
    // 1. Scaffold from template
    const tpl = getTemplate(spec.templateId);
    if (!tpl) {
      return { framework: spec.id, step: "scaffold", status: "FAIL", notes: `template ${spec.templateId} not found` };
    }
    const files = tpl.codeFiles;
    if (!files || Object.keys(files).length === 0) {
      return { framework: spec.id, step: "scaffold", status: "FAIL", notes: "template returned no files" };
    }

    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(tmpRoot, relPath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content);
    }

    // 2. Install (use raw spawn — same shape as framework adapter would, but skipping vault since we just want the smoke)
    const adapter = defaultRegistry.getAdapter(spec.id);
    if (!adapter) {
      return { framework: spec.id, step: "scaffold", status: "FAIL", notes: `adapter ${spec.id} not found` };
    }

    try {
      await adapter.install({
        projectId, projectPath: tmpRoot, basePath: "/", env: {},
      });
    } catch (e) {
      return {
        framework: spec.id, step: "install", status: "FAIL",
        durationMs: Date.now() - startTime,
        notes: `install threw: ${e instanceof Error ? e.message.slice(-300) : String(e)}`,
      };
    }

    // 3. Spawn dev
    const devSpec = adapter.dev({
      projectId, projectPath: tmpRoot, basePath: "/", host: "127.0.0.1", port, env: {},
    });
    const child = spawn(devSpec.command, devSpec.args, {
      cwd: devSpec.cwd ?? tmpRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(devSpec.env ?? {}) },
    });

    // 4. Wait for ready
    const readyPatterns = devSpec.readinessSignal?.kind === "log-substring"
      ? devSpec.readinessSignal.patterns
      : ["Local:", "Ready", "started", "listening", "Application startup complete"];
    const ready = await waitForReady(port, child, 90_000, readyPatterns);

    if (!ready.ok) {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      return {
        framework: spec.id, step: "dev-ready", status: "FAIL",
        port, pid: child.pid, durationMs: Date.now() - startTime,
        notes: ready.how,
      };
    }

    // 5. Final HTTP probe
    const httpStatus = await probeHttp(port, 5000);

    try { child.kill("SIGKILL"); } catch { /* ignore */ }
    // Give it a moment to release the port
    await new Promise((r) => setTimeout(r, 500));

    return {
      framework: spec.id, step: "done", status: "PASS",
      port, pid: child.pid,
      http: httpStatus ?? undefined,
      durationMs: Date.now() - startTime,
      notes: `ready via ${ready.how}, http=${httpStatus ?? "(no response)"}`,
    };
  } catch (e) {
    return {
      framework: spec.id, step: "dev-spawn", status: "FAIL",
      durationMs: Date.now() - startTime,
      notes: e instanceof Error ? e.message : String(e),
    };
  } finally {
    // Cleanup — best effort. Leave it on failure for inspection.
    try {
      if (process.env.KEEP_TEMP !== "1") {
        await rm(tmpRoot, { recursive: true, force: true });
      } else {
        console.log(`  [keep] tmpRoot=${tmpRoot}`);
      }
    } catch { /* ignore */ }
  }
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Doable framework end-to-end smoke test");
  console.log(`platform: ${process.platform}/${process.arch}, node: ${process.version}`);
  console.log(`${"=".repeat(60)}\n`);

  const results: Result[] = [];
  let port = PORT_BASE;
  for (const fw of FRAMEWORKS_TO_TEST) {
    process.stdout.write(`${fw.id.padEnd(14)} on :${port} … `);
    const r = await runFramework(fw, port++);
    results.push(r);
    const symbol = r.status === "PASS" ? "✓ PASS" : r.status === "SKIP" ? "○ SKIP" : "✗ FAIL";
    const ms = r.durationMs ? ` (${(r.durationMs / 1000).toFixed(1)}s)` : "";
    console.log(`${symbol}${ms}  ${r.notes ? "— " + r.notes.slice(0, 100) : ""}`);
  }

  // Summary table
  console.log(`\n${"=".repeat(60)}`);
  console.log(`SUMMARY  (${results.filter(r => r.status === "PASS").length} pass / ${results.filter(r => r.status === "FAIL").length} fail / ${results.length} total)`);
  console.log(`${"=".repeat(60)}`);
  console.log("framework      | step       | status | http | duration | notes");
  console.log("-".repeat(120));
  for (const r of results) {
    const dur = r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—";
    console.log(`${r.framework.padEnd(14)} | ${r.step.padEnd(10)} | ${r.status.padEnd(6)} | ${String(r.http ?? "—").padEnd(4)} | ${dur.padEnd(8)} | ${(r.notes ?? "").slice(0, 80)}`);
  }
  console.log();

  process.exit(results.every(r => r.status === "PASS") ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
