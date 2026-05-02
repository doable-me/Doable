/**
 * End-to-end production publish smoke test for the Linux server.
 *
 * Flow:
 *   1. Materialise a synthetic Next.js standalone build at
 *      ${PROJECTS_ROOT}/{slug}/.next/standalone/server.js — a real Node
 *      HTTP listener that binds to a unix socket from $PORT/$HOSTNAME and
 *      replies to every request with a known body.
 *   2. Call DoableCloudAdapter.deploy() — stages dist-server/ via the
 *      Wave 12-14 detection branches.
 *   3. Call nodeStandaloneAdapter.start() — writes the systemd drop-in,
 *      enables the socket-activated unit, and waits for the .sock file.
 *   4. Probe the socket with a real HTTP request and assert the synthetic
 *      app responds.
 *   5. Read /sys/fs/cgroup metrics to prove the cgroup branch is alive
 *      under the per-app slice.
 *   6. nodeStandaloneAdapter.stop() to tear down.
 *
 * Linux only. Will fail noisily if systemd is not the init or if running
 * non-root (the drop-in writes under /etc/systemd/system).
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ESM-compatible __dirname (Node 18 doesn't have import.meta.dirname).
const HERE = path.dirname(fileURLToPath(import.meta.url));

const SLUG = `e2e-${Date.now().toString(36)}`;
const PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? "/data/projects";
const PROJECT_DIR = path.join(PROJECTS_ROOT, SLUG);
// Wave 21: each test gets its own port. 39000-39999 reserved for e2e
// tests so we don't collide with the prod allocator's 30000-39000 range.
const TEST_PORT = 39000 + Math.floor(Math.random() * 1000);

interface StepResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: StepResult[] = [];

function step(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name.padEnd(48)} — ${detail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function probeTcp(host: string, port: number): Promise<{ ok: boolean; body: string }> {
  return new Promise((resolve) => {
    const sock = connect({ host, port });
    let body = "";
    sock.setTimeout(3000);
    sock.on("connect", () => {
      sock.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    });
    sock.on("data", (d) => { body += d.toString(); });
    sock.on("end", () => resolve({ ok: body.length > 0, body }));
    sock.on("error", (e) => resolve({ ok: false, body: e.message }));
    sock.on("timeout", () => {
      sock.destroy();
      resolve({ ok: false, body: "timeout" });
    });
  });
}

async function main(): Promise<void> {
  if (process.platform !== "linux") {
    console.error("This e2e script requires Linux + systemd. Aborting.");
    process.exit(1);
  }

  console.log(`=== e2e publish smoke test ===`);
  console.log(`SLUG=${SLUG}`);
  console.log(`PROJECT_DIR=${PROJECT_DIR}`);
  console.log("");

  // Step 1 — synthetic Next.js standalone fixture.
  const standaloneDir = path.join(PROJECT_DIR, ".next", "standalone");
  await mkdir(standaloneDir, { recursive: true });
  const synthServer = `
// Wave 21: vanilla Next.js standalone listens on PORT — exactly what
// the runtime adapter sets via the systemd EnvironmentFile.
const http = require("node:http");
const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "127.0.0.1";
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("e2e ok " + (process.env.DOABLE_PROJECT_SLUG ?? "no-slug") + "\\n");
});
server.listen(port, hostname, () => {
  console.log("listening on tcp", hostname, port);
});
`;
  await writeFile(path.join(standaloneDir, "server.js"), synthServer, "utf-8");
  step("fixture-create", true, `synthetic standalone at ${standaloneDir}`);

  // Step 2 — doable-cloud deploy
  process.env.PROJECTS_ROOT = PROJECTS_ROOT;
  const { DoableCloudAdapter } = await import(
    path.resolve(HERE, "../src/deploy/adapters/doable-cloud.js")
  );
  const adapter = new DoableCloudAdapter();
  await adapter.deploy({
    projectId: SLUG,
    projectSlug: SLUG,
    workspaceSlug: "e2e",
    subdomain: SLUG,
    buildOutputDir: path.join(PROJECT_DIR, ".next"),
    environment: "preview",
  });
  const stagedEntry = path.join(PROJECT_DIR, "dist-server", "server.js");
  step(
    "deploy-stage",
    existsSync(stagedEntry),
    existsSync(stagedEntry) ? `dist-server/server.js present` : `MISSING ${stagedEntry}`
  );

  // Step 3 — runtime adapter start
  const { nodeStandaloneAdapter } = await import(
    path.resolve(HERE, "../src/runtime/adapters/node-standalone.js")
  );
  const handle = await nodeStandaloneAdapter.start({
    projectId: SLUG,
    projectSlug: SLUG,
    workspaceSlug: "e2e",
    siteDir: path.join("/data/sites", SLUG),
    projectDir: PROJECT_DIR,
    framework: { id: "nextjs-app" },
    env: {},
    listen: { kind: "tcp-port", host: "127.0.0.1", port: TEST_PORT },
    userId: null,
  });
  step("runtime-start", true, `handle.id=${handle.id}, addr=${handle.listenAddr}`);

  // Step 4 — wait for the port then HTTP probe
  let probed = { ok: false, body: "no-attempt" };
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    probed = await probeTcp("127.0.0.1", TEST_PORT);
    if (probed.ok) break;
  }
  step(
    "tcp-probe",
    probed.ok && probed.body.includes("e2e ok"),
    probed.ok ? `200 OK, body line: ${probed.body.split("\\r\\n").filter(Boolean).pop()?.slice(0, 60)}` : `probe failed: ${probed.body.slice(0, 80)}`
  );

  // Step 5 — cgroup metrics check
  const { getInstanceMetrics } = await import(
    path.resolve(HERE, "../src/runtime/metrics.js")
  );
  const metrics = await getInstanceMetrics(SLUG);
  step(
    "cgroup-metrics",
    metrics.source === "cgroup" && metrics.state !== "unknown",
    `state=${metrics.state}, mem=${metrics.memoryBytes}, cpu=${metrics.cpuPct}, source=${metrics.source}`
  );

  // Step 6 — systemd show
  const r = spawnSync("systemctl", ["show", `doable-app@${SLUG}.service`, "--property=ActiveState", "--property=ExecMainStatus", "--no-pager"], { encoding: "utf-8" });
  step(
    "systemd-show",
    r.status === 0,
    r.stdout?.replace(/\n/g, " ").trim() ?? `error: ${r.stderr?.trim()}`
  );

  // Step 7 — teardown. Confirm port no longer accepts connections.
  await nodeStandaloneAdapter.stop(handle);
  await sleep(500);
  const postStop = await probeTcp("127.0.0.1", TEST_PORT);
  step("runtime-stop", !postStop.ok, postStop.ok ? "port still accepting" : "port closed");

  // Cleanup project dir
  await rm(PROJECT_DIR, { recursive: true, force: true });

  console.log("");
  console.log("=== Phase B: static-spa flow ===");
  await runStaticSpaFlow();

  console.log("");
  console.log("=== Phase C: python-asgi flow (FastAPI) ===");
  await runFastApiFlow();

  console.log("");
  const allOk = results.every((r) => r.ok);
  console.log(`=== ${allOk ? "ALL STEPS PASS" : "FAIL"} ===`);
  process.exit(allOk ? 0 : 1);
}

async function runStaticSpaFlow(): Promise<void> {
  const SITES_DIR = process.env.SITES_DIR ?? "/data/sites";
  const slug = `e2e-static-${Date.now().toString(36)}`;
  const projectDir = path.join(PROJECTS_ROOT, slug);
  const buildOutputDir = path.join(projectDir, "dist");

  // Step 1 — synthetic Vite-React-style static build: index.html +
  // an asset under assets/.
  await mkdir(path.join(buildOutputDir, "assets"), { recursive: true });
  await writeFile(
    path.join(buildOutputDir, "index.html"),
    `<!doctype html><html><head><title>${slug}</title></head><body><div id="root">e2e static ok</div><script src="/assets/app.js"></script></body></html>`,
    "utf-8",
  );
  await writeFile(
    path.join(buildOutputDir, "assets", "app.js"),
    `console.log("e2e static js");`,
    "utf-8",
  );
  step("static:fixture-create", true, `dist/index.html + dist/assets/app.js`);

  // Step 2 — doable-cloud deploy (no framework-specific staging branch
  // matches a plain dist/index.html, so this exercises the base
  // static-spa cp into /data/sites/{slug}/test/).
  const { DoableCloudAdapter } = await import(
    path.resolve(HERE, "../src/deploy/adapters/doable-cloud.js")
  );
  const adapter = new DoableCloudAdapter();
  await adapter.deploy({
    projectId: slug,
    projectSlug: slug,
    workspaceSlug: "e2e",
    subdomain: slug,
    buildOutputDir,
    environment: "preview",
  });
  const stagedIndex = path.join(SITES_DIR, slug, "test", "index.html");
  step(
    "static:deploy-stage",
    existsSync(stagedIndex),
    existsSync(stagedIndex) ? `${stagedIndex} present` : `MISSING ${stagedIndex}`,
  );

  // Step 3 — staticFilesAdapter.start() should accept the populated dir.
  const { staticFilesAdapter } = await import(
    path.resolve(HERE, "../src/runtime/adapters/static-files.js")
  );
  let staticHandle: { id: string; listenAddr: string } | null = null;
  try {
    staticHandle = await staticFilesAdapter.start({
      projectId: slug,
      projectSlug: slug,
      workspaceSlug: "e2e",
      siteDir: path.join(SITES_DIR, slug, "test"),
      projectDir,
      framework: { id: "vite-react" },
      env: {},
      listen: { kind: "tcp-port", host: "127.0.0.1", port: 0 },
      userId: null,
    });
    step("static:runtime-start", true, `id=${staticHandle.id}, dir=${staticHandle.listenAddr}`);
  } catch (err) {
    step("static:runtime-start", false, err instanceof Error ? err.message : String(err));
  }

  // Step 4 — healthCheck should report ok with non-zero uptime.
  if (staticHandle) {
    const health = await staticFilesAdapter.healthCheck({
      id: staticHandle.id,
      startedAt: new Date(Date.now() - 1500),
      listenAddr: staticHandle.listenAddr,
      listenContract: "tcp-port",
    });
    step(
      "static:healthcheck",
      health.ok,
      health.ok ? `ok, uptimeMs=${health.uptimeMs}` : `${health.reason}: ${health.detail}`,
    );
  }

  // Step 5 — Caddy file_server probe. Configure a temporary site block
  // and probe via HTTP. Best-effort: if Caddy isn't running this step
  // skips with a SKIP marker rather than failing the whole flow.
  const caddyOk = await probeCaddyForStaticSite(slug, path.join(SITES_DIR, slug, "test"));
  if (caddyOk === "skipped") {
    step("static:caddy-probe", true, "SKIPPED — Caddy not reachable on this host");
  } else if (caddyOk.ok) {
    step("static:caddy-probe", true, `200 OK from Caddy: ${caddyOk.body.slice(0, 80)}`);
  } else {
    step("static:caddy-probe", false, `Caddy probe failed: ${caddyOk.detail}`);
  }

  // Cleanup
  if (staticHandle) await staticFilesAdapter.stop(staticHandle as never);
  await rm(projectDir, { recursive: true, force: true });
  await rm(path.join(SITES_DIR, slug), { recursive: true, force: true });
}

async function runFastApiFlow(): Promise<void> {
  const slug = `e2e-fastapi-${Date.now().toString(36)}`;
  const projectDir = path.join(PROJECTS_ROOT, slug);
  const port = 39000 + Math.floor(Math.random() * 1000);

  // Step 1 — synthetic FastAPI fixture: main.py + requirements.txt.
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    path.join(projectDir, "main.py"),
    `from fastapi import FastAPI
app = FastAPI()
@app.get("/")
def root():
    return {"e2e": "ok", "slug": "${slug}"}
`,
    "utf-8",
  );
  await writeFile(
    path.join(projectDir, "requirements.txt"),
    `fastapi==0.115.0\nuvicorn==0.30.6\n`,
    "utf-8",
  );
  step("py:fixture-create", true, `main.py + requirements.txt`);

  // Step 2 — doable-cloud deploy. The FastAPI block in doable-cloud.ts
  // detects main.py + requirements.txt, copies the project source to
  // dist-server/, and calls setupPythonVenv() which creates .venv and
  // pip-installs requirements (Wave 17).
  process.env.PROJECTS_ROOT = PROJECTS_ROOT;
  const { DoableCloudAdapter } = await import(
    path.resolve(HERE, "../src/deploy/adapters/doable-cloud.js")
  );
  const adapter = new DoableCloudAdapter();
  try {
    await adapter.deploy({
      projectId: slug,
      projectSlug: slug,
      workspaceSlug: "e2e",
      subdomain: slug,
      buildOutputDir: projectDir, // FastAPI has no build step; source IS the artifact
      environment: "preview",
    });
  } catch (err) {
    step("py:deploy-stage", false, err instanceof Error ? err.message : String(err));
    return;
  }
  const stagedMain = path.join(projectDir, "dist-server", "main.py");
  const venvUvicorn = path.join(projectDir, "dist-server", ".venv", "bin", "uvicorn");
  const stagedOk = existsSync(stagedMain);
  const venvOk = existsSync(venvUvicorn);
  step(
    "py:deploy-stage",
    stagedOk && venvOk,
    stagedOk && venvOk
      ? `dist-server/main.py + .venv/bin/uvicorn present`
      : `staged=${stagedOk} venv=${venvOk} (need both)`
  );
  if (!stagedOk || !venvOk) return;

  // Step 3 — runtime adapter start
  const { pythonAsgiAdapter } = await import(
    path.resolve(HERE, "../src/runtime/adapters/python-asgi.js")
  );
  const handle = await pythonAsgiAdapter.start({
    projectId: slug,
    projectSlug: slug,
    workspaceSlug: "e2e",
    siteDir: path.join("/data/sites", slug),
    projectDir,
    framework: { id: "fastapi" },
    env: {},
    listen: { kind: "tcp-port", host: "127.0.0.1", port },
    userId: null,
  });
  step("py:runtime-start", true, `id=${handle.id}, addr=${handle.listenAddr}`);

  // Step 4 — wait for uvicorn to bind, then HTTP probe.
  let probed = { ok: false, body: "no-attempt" };
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    probed = await probeTcp("127.0.0.1", port);
    if (probed.ok) break;
  }
  step(
    "py:tcp-probe",
    probed.ok && probed.body.includes("e2e"),
    probed.ok ? `200 OK, body line: ${probed.body.split("\\r\\n").filter(Boolean).pop()?.slice(0, 80)}` : `probe failed: ${probed.body.slice(0, 80)}`
  );

  // Step 5 — systemd state
  const r = spawnSync("systemctl", ["show", `doable-app@${slug}.service`, "--property=ActiveState", "--property=ExecMainStatus", "--no-pager"], { encoding: "utf-8" });
  step("py:systemd-show", r.status === 0, r.stdout?.replace(/\n/g, " ").trim() ?? `error: ${r.stderr?.trim()}`);

  // Step 6 — teardown
  await pythonAsgiAdapter.stop(handle);
  await sleep(500);
  const post = await probeTcp("127.0.0.1", port);
  step("py:runtime-stop", !post.ok, post.ok ? "port still accepting" : "port closed");

  await rm(projectDir, { recursive: true, force: true });
}

type CaddyProbeResult = "skipped" | { ok: true; body: string } | { ok: false; detail: string };

async function probeCaddyForStaticSite(
  slug: string,
  siteDir: string,
): Promise<CaddyProbeResult> {
  // Caddy admin API listens on 127.0.0.1:2019 by default. Try to add a
  // temporary route that file_servers from siteDir, host-matched on a
  // synthetic hostname we'll send via the Host header.
  const hostname = `${slug}.local-e2e`;
  const adminUrl = "http://127.0.0.1:2019";
  try {
    const ping = await fetch(`${adminUrl}/config/`, { method: "GET" });
    if (!ping.ok) return "skipped";
  } catch {
    return "skipped";
  }

  // Build a minimal route. Caddy's auto_https is annoying for synthetic
  // hostnames, so we use a single http/h2c server on 127.0.0.1:8080
  // and route by Host header.
  const probePort = 8081;
  const route = {
    "@id": `e2e-static-${slug}`,
    match: [{ host: [hostname] }],
    handle: [{ handler: "file_server", root: siteDir }],
    terminal: true,
  };

  // Try to insert into srv0 if it exists, else create a server on probePort.
  // Simpler: PUT a dedicated apps.http.servers.e2e_${slug} server.
  const serverName = `e2e_${slug.replace(/-/g, "_")}`;
  try {
    const putRes = await fetch(`${adminUrl}/config/apps/http/servers/${serverName}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listen: [`:${probePort}`],
        routes: [route],
        // Disable Caddy's automatic_https — synthetic e2e hostnames
        // can't actually serve HTTPS (no DNS, no cert). Without this,
        // Caddy wraps the listener in TLS and the plaintext probe
        // returns "400 Bad Request — sent HTTP to HTTPS".
        automatic_https: { disable: true },
      }),
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      return { ok: false, detail: `caddy PUT server failed: ${putRes.status} ${text.slice(0, 120)}` };
    }
    await sleep(300);

    // Probe — manual TCP since fetch doesn't let us spoof Host header
    // easily across HTTP versions, and we need a Host header to match
    // the route.
    const body = await new Promise<string>((resolve, reject) => {
      const sock = connect({ host: "127.0.0.1", port: probePort });
      let buf = "";
      sock.setTimeout(3000);
      sock.on("connect", () => sock.write(`GET / HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\n\r\n`));
      sock.on("data", (d) => { buf += d.toString(); });
      sock.on("end", () => resolve(buf));
      sock.on("error", reject);
      sock.on("timeout", () => { sock.destroy(); reject(new Error("timeout")); });
    });

    // Cleanup the temporary server.
    await fetch(`${adminUrl}/config/apps/http/servers/${serverName}`, { method: "DELETE" }).catch(() => {});

    if (body.startsWith("HTTP/1.1 200") && body.includes("e2e static ok")) {
      return { ok: true, body };
    }
    return { ok: false, detail: `unexpected body: ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

main().catch((err) => {
  console.error("verify-e2e-publish crashed:", err);
  process.exit(2);
});
