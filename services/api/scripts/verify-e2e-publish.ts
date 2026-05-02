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
  const allOk = results.every((r) => r.ok);
  console.log(`=== ${allOk ? "ALL STEPS PASS" : "FAIL"} ===`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("verify-e2e-publish crashed:", err);
  process.exit(2);
});
