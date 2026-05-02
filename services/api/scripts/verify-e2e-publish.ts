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
const SOCKET_PATH = `/run/doable/${SLUG}.sock`;

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

function probeSocket(socketPath: string): Promise<{ ok: boolean; body: string }> {
  return new Promise((resolve) => {
    if (!existsSync(socketPath)) {
      resolve({ ok: false, body: "socket-missing" });
      return;
    }
    const sock = connect(socketPath);
    let body = "";
    sock.setTimeout(3000);
    sock.on("connect", () => {
      sock.write("GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
    });
    sock.on("data", (d) => {
      body += d.toString();
    });
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
const http = require("node:http");
const port = process.env.PORT;
const hostname = process.env.HOSTNAME ?? "127.0.0.1";
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("e2e ok " + (process.env.DOABLE_PROJECT_SLUG ?? "no-slug") + "\\n");
});
const listenFds = parseInt(process.env.LISTEN_FDS ?? "0", 10);
const isMyPid = !process.env.LISTEN_PID || parseInt(process.env.LISTEN_PID, 10) === process.pid;
if (listenFds > 0 && isMyPid) {
  // systemd socket activation — fd 3 is the inherited socket.
  server.listen({ fd: 3 }, () => { console.log("listening on inherited fd 3"); });
} else if (port) {
  server.listen(parseInt(port, 10), hostname, () => {
    console.log("listening on tcp", hostname, port);
  });
} else {
  const sockPath = "/run/doable/" + (process.env.DOABLE_PROJECT_SLUG ?? "fallback") + ".sock";
  try { require("node:fs").unlinkSync(sockPath); } catch {}
  server.listen(sockPath, () => { console.log("listening on", sockPath); });
}
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
    listen: { kind: "unix-socket", path: SOCKET_PATH },
  });
  step("runtime-start", true, `handle.id=${handle.id}, addr=${handle.listenAddr}`);

  // Step 4 — wait for socket then probe
  let probed = { ok: false, body: "no-attempt" };
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (existsSync(SOCKET_PATH)) break;
  }
  probed = await probeSocket(SOCKET_PATH);
  step(
    "socket-probe",
    probed.ok && probed.body.includes("e2e ok"),
    probed.ok ? `200 OK, body starts: ${probed.body.split("\\r\\n").pop()?.slice(0, 60)}` : `probe failed: ${probed.body.slice(0, 80)}`
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

  // Step 7 — teardown
  await nodeStandaloneAdapter.stop(handle);
  step("runtime-stop", !existsSync(SOCKET_PATH), existsSync(SOCKET_PATH) ? "socket still exists" : "socket cleared");

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
