#!/usr/bin/env node
// scripts/phase1-golden/capture.mjs
//
// Phase 1 golden-file capture harness.
//
// Captures three byte-deterministic JSON artifacts that describe the externally
// observable behavior of the Phase-0 dev-server / build / scaffold paths:
//
//   1. dev-spawn.argv.json   — the [command, args, sortedEnvKeys, cwd] for the
//                              Vite spawn done by services/api/.../dev-server-start.ts.
//   2. build-spawn.argv.json — same shape for the npx-vite spawn done by
//                              services/api/.../deploy/builder.ts.
//   3. scaffold.fileset.json — the {relPath, sha256} list produced by
//                              createProject() against the blankTemplate.
//
// Run with `npx tsx scripts/phase1-golden/capture.mjs` (tsx is required because
// we dynamically import services/api .ts modules without a build step).
//
// Inputs (env vars):
//   DOABLE_FIXTURE_PROJECT_ID  UUID of an existing project in DB used for the
//                              dev-server / build captures. (Required for those
//                              two artifacts; scaffold capture uses its own
//                              throwaway project id.)
//   DATABASE_URL               PostgreSQL connection string. Loaded from .env
//                              if present.
//
// Outputs:
//   scripts/phase1-golden/golden/<commit-hash>/dev-spawn.argv.json
//   scripts/phase1-golden/golden/<commit-hash>/build-spawn.argv.json
//   scripts/phase1-golden/golden/<commit-hash>/scaffold.fileset.json
//
// Determinism:
//   - sortedEnvKeys captures KEY LIST ONLY (never values — they may be secrets).
//   - Keys matching ^DOABLE_.*_ID$, ^PORT$, or ending in _TOKEN are dropped.
//   - 4-digit numbers in argv are replaced with <PORT>.
//   - UUID-shaped strings in argv are replaced with <PROJECT_ID>.
//
// Hard rules:
//   - This script must NOT edit any code under services/. It only imports.
//   - Re-running on the same commit must produce byte-identical JSON.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile, readdir, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash as cryptoCreateHash } from "node:crypto";

// ─── Repo paths ──────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const HARNESS_DIR = path.dirname(__filename);
const REPO_ROOT = path.resolve(HARNESS_DIR, "..", "..");
const API_SRC = path.join(REPO_ROOT, "services", "api", "src");

// ─── Load .env (best-effort, no extra deps) ──────────────

function loadDotEnv() {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  const raw = require("node:fs").readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

// require() shim so the dotenv loader above can use sync fs
const require = createRequire(import.meta.url);
loadDotEnv();

// ─── Spawn monkey-patch ──────────────────────────────────
//
// services/api modules import `spawn` from "node:child_process". For Node's
// built-in modules, the CJS exports object (obtainable via require) is the
// same object that backs the ESM named bindings — mutating cp.spawn here
// affects subsequent ESM imports in the same process.
//
// We must call setupSpawnPatch() BEFORE the first dynamic import of any
// services/api module that will call spawn.

const cp = require("node:child_process");
const ORIG_SPAWN = cp.spawn;

/** @type {Array<{command:string,args:string[],sortedEnvKeys:string[],cwd:string|undefined}>} */
let spawnRecords = [];

/**
 * @param {(rec: {command:string,args:string[],sortedEnvKeys:string[],cwd:string|undefined}) => boolean} filter
 */
function setupSpawnPatch(filter) {
  spawnRecords = [];
  cp.spawn = function patchedSpawn(command, args, options) {
    // Normalize args into an array of strings — node accepts spawn(cmd, opts)
    // where args is omitted, in which case `args` is the options object.
    /** @type {string[]} */
    let normArgs = [];
    /** @type {object|undefined} */
    let normOpts = undefined;
    if (Array.isArray(args)) {
      normArgs = args.map((a) => String(a));
      normOpts = options;
    } else if (args && typeof args === "object") {
      normOpts = args;
    } else {
      normOpts = options;
    }

    const env = (normOpts && normOpts.env) ?? process.env;
    const sortedEnvKeys = Object.keys(env).sort();

    const rec = {
      command: String(command),
      args: normArgs,
      sortedEnvKeys,
      cwd: normOpts && typeof normOpts.cwd === "string" ? normOpts.cwd : undefined,
    };

    if (filter(rec)) {
      spawnRecords.push(rec);
    }

    return ORIG_SPAWN.call(this, command, args, options);
  };
}

function restoreSpawn() {
  cp.spawn = ORIG_SPAWN;
}

// ─── Redaction ───────────────────────────────────────────

const REDACT_KEY_PATTERNS = [
  /^DOABLE_.*_ID$/,
  /^PORT$/,
  /_TOKEN$/,
];

function redactEnvKeys(keys) {
  return keys
    .filter((k) => !REDACT_KEY_PATTERNS.some((re) => re.test(k)))
    .sort();
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PORT_RE = /\b\d{4}\b/g;

function redactString(s) {
  return s.replace(UUID_RE, "<PROJECT_ID>").replace(PORT_RE, "<PORT>");
}

function redactArgs(args) {
  return args.map((a) => redactString(a));
}

function redactCwd(cwd) {
  if (!cwd) return cwd;
  // Only the project segment of the path is non-deterministic — replace any
  // UUID portion. We deliberately leave absolute path prefixes untouched
  // because the harness asserts on the exact same checkout layout.
  return cwd.replace(UUID_RE, "<PROJECT_ID>");
}

function redactRecord(rec) {
  return {
    command: redactString(rec.command),
    args: redactArgs(rec.args),
    sortedEnvKeys: redactEnvKeys(rec.sortedEnvKeys),
    cwd: redactCwd(rec.cwd),
  };
}

// ─── Helpers ─────────────────────────────────────────────

function getCommitHash() {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString().trim();
  } catch (err) {
    throw new Error(`Failed to read git commit hash: ${err.message}`);
  }
}

function stableJson(value) {
  // Stable stringify — sort keys at every level so hashing is deterministic.
  function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
      return out;
    }
    return v;
  }
  return JSON.stringify(sortDeep(value), null, 2) + "\n";
}

async function sha256OfFile(absPath) {
  const buf = await readFile(absPath);
  return cryptoCreateHash("sha256").update(buf).digest("hex");
}

/**
 * Walk `root` recursively, returning sorted [{relPath, sha256}] entries.
 * Skips node_modules/, .git/, and dist/.
 */
async function walkFileset(root) {
  const out = [];
  /** @param {string} dir */
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue;
      }
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        out.push({ relPath: rel, sha256: await sha256OfFile(abs) });
      }
    }
  }
  await walk(root);
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

// ─── Capture: dev-spawn ──────────────────────────────────

async function captureDevSpawn(fixtureProjectId) {
  console.log("[capture] dev-spawn: starting…");
  setupSpawnPatch((rec) =>
    rec.args.some((a) => typeof a === "string" && a.includes("vite"))
  );

  /** @type {{url:string,port:number} | null} */
  let started = null;
  let startError = null;

  // Import lazily so the monkey-patch is in place first.
  const { startDevServer } = await import(
    pathToFileUrl(path.join(API_SRC, "projects", "dev-server-start.ts"))
  );
  const { servers, cleanup } = await import(
    pathToFileUrl(path.join(API_SRC, "projects", "dev-server-core.ts"))
  );

  try {
    started = await Promise.race([
      startDevServer(fixtureProjectId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("dev-server start timed out (30s)")), 30_000)
      ),
    ]);
  } catch (err) {
    startError = err;
    console.warn(`[capture] dev-spawn: startDevServer threw: ${err && err.message}`);
  }

  // Stop the spawned process if we managed to start one.
  try {
    const inst = servers.get(fixtureProjectId);
    if (inst && inst.process && inst.process.exitCode === null) {
      inst.process.kill("SIGTERM");
    }
    cleanup(fixtureProjectId);
  } catch (err) {
    console.warn(`[capture] dev-spawn: cleanup error: ${err && err.message}`);
  }

  const records = spawnRecords.map(redactRecord);
  restoreSpawn();
  console.log(
    `[capture] dev-spawn: captured ${records.length} matching spawn(s); ` +
    `started=${Boolean(started)} error=${Boolean(startError)}`
  );
  return records;
}

// ─── Capture: build-spawn ────────────────────────────────

async function captureBuildSpawn(fixtureProjectId) {
  console.log("[capture] build-spawn: starting…");
  setupSpawnPatch((rec) => {
    if (rec.command === "npx" || rec.command === "vite") return true;
    return rec.args.some((a) => typeof a === "string" && a.includes("vite"));
  });

  const { runBuild } = await import(
    pathToFileUrl(path.join(API_SRC, "deploy", "builder.ts"))
  );
  const { getProjectPath } = await import(
    pathToFileUrl(path.join(API_SRC, "ai", "project-files.ts"))
  );

  const projectDir = getProjectPath(fixtureProjectId);
  let buildResult = null;
  try {
    buildResult = await runBuild(projectDir, undefined, {
      projectId: fixtureProjectId,
      target: "production",
    });
  } catch (err) {
    console.warn(`[capture] build-spawn: runBuild threw: ${err && err.message}`);
  }

  const records = spawnRecords.map(redactRecord);
  restoreSpawn();
  console.log(
    `[capture] build-spawn: captured ${records.length} matching spawn(s); ` +
    `success=${buildResult && buildResult.success}`
  );
  return records;
}

// ─── Capture: scaffold.fileset ───────────────────────────

async function captureScaffoldFileset() {
  console.log("[capture] scaffold: starting…");

  const { createProject } = await import(
    pathToFileUrl(path.join(API_SRC, "projects", "file-manager.ts"))
  );
  const { getProjectPath } = await import(
    pathToFileUrl(path.join(API_SRC, "ai", "project-files.ts"))
  );

  const throwawayId = randomUUID();
  const projectDir = getProjectPath(throwawayId);
  console.log(`[capture] scaffold: throwaway projectId=${throwawayId}`);

  let fileset = [];
  try {
    await createProject(throwawayId);
    fileset = await walkFileset(projectDir);
  } catch (err) {
    console.warn(`[capture] scaffold: createProject threw: ${err && err.message}`);
    if (existsSync(projectDir)) {
      fileset = await walkFileset(projectDir);
    }
  } finally {
    // Best-effort cleanup — leave the dir if we can't remove it.
    try {
      if (existsSync(projectDir)) {
        await rm(projectDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[capture] scaffold: rm failed: ${err && err.message}`);
    }
  }

  console.log(`[capture] scaffold: captured ${fileset.length} files`);
  return fileset;
}

// ─── tiny URL helper ─────────────────────────────────────

function pathToFileUrl(absPath) {
  // tsx accepts file:// URLs for dynamic .ts imports.
  return "file://" + absPath.split(path.sep).join("/");
}

// ─── main ────────────────────────────────────────────────

async function main() {
  const fixtureProjectId = process.env.DOABLE_FIXTURE_PROJECT_ID;
  const databaseUrl = process.env.DATABASE_URL;

  const commit = getCommitHash();
  const outDir = path.join(HARNESS_DIR, "golden", commit);
  await mkdir(outDir, { recursive: true });

  console.log(`[capture] commit=${commit}`);
  console.log(`[capture] outDir=${outDir}`);
  console.log(`[capture] fixtureProjectId=${fixtureProjectId ?? "<missing>"}`);
  console.log(`[capture] databaseUrl=${databaseUrl ? "<set>" : "<missing>"}`);

  // ── scaffold.fileset.json ────────────────────────────
  const scaffoldFileset = await captureScaffoldFileset();
  await writeFile(
    path.join(outDir, "scaffold.fileset.json"),
    stableJson(scaffoldFileset),
  );

  // ── dev-spawn.argv.json ──────────────────────────────
  let devSpawnRecs = [];
  if (fixtureProjectId) {
    devSpawnRecs = await captureDevSpawn(fixtureProjectId);
  } else {
    console.warn("[capture] DOABLE_FIXTURE_PROJECT_ID not set — skipping dev-spawn capture");
  }
  await writeFile(
    path.join(outDir, "dev-spawn.argv.json"),
    stableJson(devSpawnRecs),
  );

  // ── build-spawn.argv.json ────────────────────────────
  let buildSpawnRecs = [];
  if (fixtureProjectId) {
    buildSpawnRecs = await captureBuildSpawn(fixtureProjectId);
  } else {
    console.warn("[capture] DOABLE_FIXTURE_PROJECT_ID not set — skipping build-spawn capture");
  }
  await writeFile(
    path.join(outDir, "build-spawn.argv.json"),
    stableJson(buildSpawnRecs),
  );

  console.log(`[capture] done → ${outDir}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[capture] FATAL:", err);
    process.exit(2);
  },
);
