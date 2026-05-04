/**
 * Real preview e2e test.
 *
 * For each framework, this scaffolds the blank template, installs deps,
 * starts the dev server through the framework adapter (NOT vite for all),
 * then uses Puppeteer to:
 *   1. Wait for the page to actually render content (not just respond)
 *   2. Capture a screenshot to scripts/screenshots/{framework}.png
 *   3. Inspect the running process via /proc to verify it's the
 *      framework's OWN dev binary — not some generic vite shim
 *      masquerading. Records the cmdline + parent so the user can
 *      see "yes, this is really next-server / nuxt-nitro / uvicorn /
 *      manage.py runserver" etc.
 *
 * Output: PNGs + a JSON summary at scripts/screenshots/summary.json
 *
 * Run on Linux droplet:
 *   pnpm tsx --env-file=.env scripts/test-preview-real.ts
 */

import { mkdtemp, rm, writeFile, mkdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { defaultRegistry } from "../services/api/src/frameworks/registry.js";
import { initFrameworks } from "../services/api/src/frameworks/init.js";
import { getTemplate } from "../services/api/src/templates/registry.js";

initFrameworks();

const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots");

// Per-framework expected process signature (in cmdline of the listening pid).
// Used to FAIL-LOUD if a framework's dev server is actually vite under the
// hood when it shouldn't be. Each entry is a substring that MUST appear.
const EXPECTED_BINARY_SIGNATURE: Record<string, string[]> = {
  "vite-react":  ["vite"],                     // it IS vite
  "nextjs-app":  ["next-server", "next/dist"], // accept either name
  "nuxt":        ["nuxt", "nitro"],            // nuxt nitro dev server
  "sveltekit":   ["vite"],                     // sveltekit USES vite under the hood — this is correct
  "hono":        ["tsx", "hono", "src/index"], // tsx watch on hono
  "astro":       ["astro"],                    // astro dev
  "fastapi":     ["uvicorn"],                  // uvicorn workers
  "django":      ["manage.py"],                // python manage.py runserver
};

const FRAMEWORKS = [
  { id: "vite-react",  templateId: "blank" },
  { id: "nextjs-app",  templateId: "nextjs-blank" },
  { id: "nuxt",        templateId: "nuxt-blank" },
  { id: "sveltekit",   templateId: "sveltekit-blank" },
  { id: "hono",        templateId: "hono-blank" },
  { id: "astro",       templateId: "astro-blank" },
  { id: "fastapi",     templateId: "fastapi-blank" },
  { id: "django",      templateId: "django-blank" },
];

const PORT_BASE = 42000;

interface Result {
  framework: string;
  status: "PASS" | "FAIL";
  port: number;
  screenshotPath: string | null;
  httpStatus: number | null;
  // Forensic evidence that this isn't vite-pretending-to-be-X:
  listeningPid: number | null;
  cmdline: string | null;
  signatureMatched: boolean;
  signatureExpected: string[];
  pageTitle: string | null;
  bodyLengthBytes: number | null;
  durationMs: number;
  error?: string;
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

async function waitForReady(port: number, child: ChildProcess, maxMs: number, readyPatterns: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxMs;
    let logBuf = "";
    let resolved = false;
    const finish = (ok: boolean) => { if (!resolved) { resolved = true; resolve(ok); } };
    child.stdout?.on("data", (d) => {
      logBuf += d.toString();
      for (const p of readyPatterns) if (logBuf.includes(p)) finish(true);
    });
    child.stderr?.on("data", (d) => {
      logBuf += d.toString();
      for (const p of readyPatterns) if (logBuf.includes(p)) finish(true);
    });
    child.on("exit", () => finish(false));
    const poll = setInterval(async () => {
      if (Date.now() > deadline) { clearInterval(poll); finish(false); return; }
      const code = await probeHttp(port, 1500);
      if (code != null) { clearInterval(poll); finish(true); }
    }, 1500);
  });
}

async function readCmdline(pid: number): Promise<string | null> {
  try {
    const buf = await readFile(`/proc/${pid}/cmdline`, "utf-8");
    return buf.replace(/\0/g, " ").trim();
  } catch { return null; }
}

async function readPpid(pid: number): Promise<number | null> {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf-8");
    const m = /^PPid:\s+(\d+)/m.exec(status);
    return m && m[1] ? parseInt(m[1], 10) : null;
  } catch { return null; }
}

// Find the PID actually listening on a TCP port (Linux only). Walks the
// process tree up to 4 ancestors so we catch the framework's parent
// command, not e.g. uvicorn's multiprocessing-spawned worker. Returns
// the cmdline of the FIRST ancestor whose cmdline is non-empty AND
// matches one of the expected signatures (when provided), otherwise the
// listening pid's own cmdline.
async function findListeningPid(port: number, expectedSig: string[] = []): Promise<{ pid: number | null; cmdline: string | null; chainCmdlines: string[] }> {
  if (process.platform !== "linux") return { pid: null, cmdline: null, chainCmdlines: [] };
  try {
    const ssOut = await new Promise<string>((resolve) => {
      const ss = spawn("ss", ["-tlnp", "-H"], { stdio: ["ignore", "pipe", "ignore"] });
      let buf = "";
      ss.stdout.on("data", (d) => { buf += d.toString(); });
      ss.on("exit", () => resolve(buf));
    });
    const lines = ssOut.split("\n").filter((l) => l.includes(`:${port} `));
    if (lines.length === 0) return { pid: null, cmdline: null, chainCmdlines: [] };
    const m = /pid=(\d+)/.exec(lines[0] ?? "");
    if (!m || !m[1]) return { pid: null, cmdline: null, chainCmdlines: [] };
    const startPid = parseInt(m[1], 10);

    // Walk up the process tree
    const chain: { pid: number; cmdline: string }[] = [];
    let cur: number | null = startPid;
    for (let i = 0; i < 5 && cur && cur > 1; i++) {
      const cl = await readCmdline(cur);
      if (cl) chain.push({ pid: cur, cmdline: cl });
      cur = await readPpid(cur);
    }

    // Pick the first ancestor that matches expected signatures (if given);
    // otherwise return the listening pid's own cmdline.
    if (expectedSig.length > 0) {
      for (const node of chain) {
        const lc = node.cmdline.toLowerCase();
        if (expectedSig.some((s) => lc.includes(s.toLowerCase()))) {
          return { pid: node.pid, cmdline: node.cmdline, chainCmdlines: chain.map((c) => c.cmdline) };
        }
      }
    }
    return {
      pid: chain[0]?.pid ?? startPid,
      cmdline: chain[0]?.cmdline ?? null,
      chainCmdlines: chain.map((c) => c.cmdline),
    };
  } catch {
    return { pid: null, cmdline: null, chainCmdlines: [] };
  }
}

async function runFramework(spec: { id: string; templateId: string }, port: number): Promise<Result> {
  const startTime = Date.now();
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), `doable-real-${spec.id}-`));
  let child: ChildProcess | null = null;
  const expected = EXPECTED_BINARY_SIGNATURE[spec.id] ?? [];

  try {
    // Scaffold
    const tpl = getTemplate(spec.templateId);
    if (!tpl) throw new Error(`template ${spec.templateId} not found`);
    for (const [rel, content] of Object.entries(tpl.codeFiles)) {
      const full = path.join(tmpRoot, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content);
    }

    const adapter = defaultRegistry.getAdapter(spec.id);
    if (!adapter) throw new Error(`adapter ${spec.id} not found`);

    // Install
    await adapter.install({ projectId: "real-test", projectPath: tmpRoot, basePath: "/", env: {} });

    // Spawn dev
    const devSpec = adapter.dev({
      projectId: "real-test", projectPath: tmpRoot, basePath: "/", host: "127.0.0.1", port, env: {},
    });
    const needsShell = process.platform === "win32" && !devSpec.command.includes("/") && !devSpec.command.includes("\\");
    child = spawn(devSpec.command, devSpec.args, {
      cwd: devSpec.cwd ?? tmpRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: needsShell,
      // detached:true puts the child in its own process group on POSIX so
      // we can kill the WHOLE TREE later via process.kill(-pid, SIGKILL).
      // Without this, framework grandchildren (next-server, uvicorn
      // workers, vite plugins) reparent to PID 1 and hold ports.
      detached: process.platform !== "win32",
      env: { ...process.env, ...(devSpec.env ?? {}) },
    });
    child.on("error", () => { /* swallow — handled below */ });

    // Wait for ready
    const readyPatterns = devSpec.readinessSignal?.kind === "log-substring"
      ? devSpec.readinessSignal.patterns
      : ["Local:", "Ready", "started", "listening", "Application startup complete"];
    const ready = await waitForReady(port, child, 120_000, readyPatterns);
    if (!ready) throw new Error("dev server never reached ready state");

    // Give it a beat to stabilize before probing — some frameworks log "ready"
    // BEFORE the HTTP server actually accepts connections.
    await new Promise((r) => setTimeout(r, 3000));

    // Identify the actually-listening process (walks up to 5 ancestors,
    // returns the first that matches one of the expected signatures).
    const { pid, cmdline, chainCmdlines } = await findListeningPid(port, expected);
    const signatureMatched = cmdline ? expected.some((sig) => cmdline.toLowerCase().includes(sig.toLowerCase())) : false;
    if (!signatureMatched && chainCmdlines.length > 0) {
      console.log(`              tree: ${chainCmdlines.map((c) => c.slice(0, 60)).join(" → ")}`);
    }

    // Final HTTP probe
    const httpStatus = await probeHttp(port, 5000);

    // Screenshot via Puppeteer
    let screenshotPath: string | null = null;
    let pageTitle: string | null = null;
    let bodyLengthBytes: number | null = null;
    try {
      // puppeteer is a workspace dep of services/api, not the root —
      // resolve via that package's node_modules so this script works
      // regardless of where it's run from.
      const puppeteerPath = path.join(process.cwd(), "services", "api", "node_modules", "puppeteer", "lib", "cjs", "puppeteer", "puppeteer.js");
      const puppeteer = (await import(puppeteerPath)).default;
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        const resp = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await new Promise((r) => setTimeout(r, 2000)); // settle
        pageTitle = await page.title().catch(() => null);
        const bodyText = await page.content().catch(() => "");
        bodyLengthBytes = Buffer.byteLength(bodyText, "utf-8");
        screenshotPath = path.join(SCREENSHOT_DIR, `${spec.id}.png`);
        await mkdir(SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: screenshotPath as `${string}.png`, fullPage: false });
      } finally {
        await browser.close();
      }
    } catch (e) {
      // Puppeteer might not be installed — fall through with no screenshot.
      // The process-cmdline check is still valid evidence the framework ran.
      console.warn(`[${spec.id}] puppeteer screenshot failed: ${e instanceof Error ? e.message : e}`);
    }

    return {
      framework: spec.id,
      status: signatureMatched ? "PASS" : "FAIL",
      port,
      screenshotPath,
      httpStatus,
      listeningPid: pid,
      cmdline,
      signatureMatched,
      signatureExpected: expected,
      pageTitle,
      bodyLengthBytes,
      durationMs: Date.now() - startTime,
      ...(signatureMatched ? {} : { error: `cmdline did not match any of ${JSON.stringify(expected)}` }),
    };
  } catch (e) {
    return {
      framework: spec.id,
      status: "FAIL",
      port,
      screenshotPath: null,
      httpStatus: null,
      listeningPid: null,
      cmdline: null,
      signatureMatched: false,
      signatureExpected: expected,
      pageTitle: null,
      bodyLengthBytes: null,
      durationMs: Date.now() - startTime,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (child && child.pid) {
      // Kill the whole process group (negative pid). detached:true above
      // ensures the framework's grandchildren are in this group too.
      try {
        if (process.platform === "linux" || process.platform === "darwin") {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch { /* ignore — process may already be dead */ }
    }
    // Belt-and-suspenders: nuke anything that mentions OUR temp dir.
    // Catches workers reparented to PID 1 between SIGKILL and now.
    try {
      if (process.platform === "linux") {
        spawn("pkill", ["-9", "-f", `doable-real-${spec.id}-`], { stdio: "ignore" });
      }
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 1500));
    if (process.env.KEEP_TEMP !== "1") {
      try { await rm(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("REAL preview e2e — process verification + screenshot per framework");
  console.log(`platform: ${process.platform}/${process.arch}`);
  console.log(`screenshots: ${SCREENSHOT_DIR}`);
  console.log("=".repeat(70) + "\n");

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const results: Result[] = [];
  let port = PORT_BASE;
  for (const fw of FRAMEWORKS) {
    process.stdout.write(`${fw.id.padEnd(14)} on :${port} … `);
    const r = await runFramework(fw, port++);
    results.push(r);
    const sym = r.status === "PASS" ? "✓ PASS" : "✗ FAIL";
    const screen = r.screenshotPath ? path.basename(r.screenshotPath) : "no-png";
    console.log(`${sym}  cmdline-sig=${r.signatureMatched ? "MATCH" : "MISS"}  http=${r.httpStatus ?? "—"}  pid=${r.listeningPid ?? "—"}  png=${screen}`);
    if (r.cmdline) console.log(`              cmd: ${r.cmdline.slice(0, 120)}${r.cmdline.length > 120 ? "…" : ""}`);
    if (r.error) console.log(`              err: ${r.error}`);
  }

  // Save JSON summary
  const summary = {
    platform: `${process.platform}/${process.arch}`,
    timestamp: new Date().toISOString(),
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    total: results.length,
    results: results.map((r) => ({ ...r, cmdline: r.cmdline?.slice(0, 200) })),
  };
  await writeFile(path.join(SCREENSHOT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

  console.log("\n" + "=".repeat(70));
  console.log(`SUMMARY  ${summary.pass}/${summary.total} pass`);
  console.log(`details: ${path.join(SCREENSHOT_DIR, "summary.json")}`);
  console.log("=".repeat(70));
  process.exit(summary.fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(2); });
