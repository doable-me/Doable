#!/usr/bin/env node
// scripts/phase1-golden/compare.mjs
//
// Compares two captured golden directories produced by capture.mjs.
//
// Usage:
//   node scripts/phase1-golden/compare.mjs --golden <commit-a> --candidate <commit-b>
//
// Exit codes:
//   0 — every artifact in --golden matches --candidate byte-for-byte after
//       JSON parse + key-sort. (Whitespace is normalized; semantic equality
//       is what we test.)
//   1 — at least one artifact differs. The first 5 differences per artifact
//       are printed in a unified-style format.
//   2 — usage error or missing artifacts.
//
// Determinism guarantees come from capture.mjs, not from this script —
// we just deep-compare the JSON.

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const HARNESS_DIR = path.dirname(__filename);
const GOLDEN_ROOT = path.join(HARNESS_DIR, "golden");

const ARTIFACTS = [
  "dev-spawn.argv.json",
  "build-spawn.argv.json",
  "scaffold.fileset.json",
];

const MAX_DIFFS_PER_ARTIFACT = 5;

// ─── arg parsing ─────────────────────────────────────────

function parseArgs(argv) {
  const out = { golden: null, candidate: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--golden") out.golden = argv[++i];
    else if (argv[i] === "--candidate") out.candidate = argv[++i];
  }
  return out;
}

function usage(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error(
    "usage: node scripts/phase1-golden/compare.mjs --golden <hash> --candidate <hash>",
  );
  process.exit(2);
}

// ─── deep diff (collects up to N differences) ───────────

/**
 * Recursively walk two JSON values, emitting up to `limit` difference paths.
 * Each diff is `{ path: string, golden: any, candidate: any }`.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @param {string} pathStr
 * @param {Array<{path:string,golden:unknown,candidate:unknown}>} diffs
 * @param {number} limit
 */
function deepDiff(a, b, pathStr, diffs, limit) {
  if (diffs.length >= limit) return;

  if (a === b) return;
  if (typeof a !== typeof b) {
    diffs.push({ path: pathStr, golden: a, candidate: b });
    return;
  }
  if (a === null || b === null) {
    diffs.push({ path: pathStr, golden: a, candidate: b });
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      diffs.push({ path: pathStr, golden: a, candidate: b });
      return;
    }
    if (a.length !== b.length) {
      diffs.push({
        path: `${pathStr}.length`,
        golden: a.length,
        candidate: b.length,
      });
    }
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      deepDiff(a[i], b[i], `${pathStr}[${i}]`, diffs, limit);
      if (diffs.length >= limit) return;
    }
    return;
  }
  if (typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const sorted = [...keys].sort();
    for (const k of sorted) {
      deepDiff(a[k], b[k], pathStr ? `${pathStr}.${k}` : k, diffs, limit);
      if (diffs.length >= limit) return;
    }
    return;
  }
  diffs.push({ path: pathStr, golden: a, candidate: b });
}

// ─── pretty-printing ─────────────────────────────────────

function fmtVal(v) {
  if (v === undefined) return "<missing>";
  const s = JSON.stringify(v);
  if (s.length > 200) return s.slice(0, 197) + "...";
  return s;
}

function printArtifactDiff(name, diffs) {
  console.log(`--- golden/${name}`);
  console.log(`+++ candidate/${name}`);
  for (const d of diffs) {
    console.log(`  @ ${d.path}`);
    console.log(`  - ${fmtVal(d.golden)}`);
    console.log(`  + ${fmtVal(d.candidate)}`);
  }
  if (diffs.length === MAX_DIFFS_PER_ARTIFACT) {
    console.log(`  … (showing first ${MAX_DIFFS_PER_ARTIFACT}; more may exist)`);
  }
}

// ─── main ────────────────────────────────────────────────

async function loadArtifact(commit, name) {
  const p = path.join(GOLDEN_ROOT, commit, name);
  if (!existsSync(p)) {
    return { ok: false, error: `missing: ${path.relative(HARNESS_DIR, p)}` };
  }
  try {
    const raw = await readFile(p, "utf-8");
    return { ok: true, data: JSON.parse(raw), path: p };
  } catch (err) {
    return { ok: false, error: `parse error in ${p}: ${err.message}` };
  }
}

async function main() {
  const { golden, candidate } = parseArgs(process.argv.slice(2));
  if (!golden) usage("--golden is required");
  if (!candidate) usage("--candidate is required");

  const goldenDir = path.join(GOLDEN_ROOT, golden);
  const candidateDir = path.join(GOLDEN_ROOT, candidate);
  if (!existsSync(goldenDir)) usage(`golden dir not found: ${goldenDir}`);
  if (!existsSync(candidateDir)) usage(`candidate dir not found: ${candidateDir}`);

  let totalDiffs = 0;
  let artifactsCompared = 0;

  for (const name of ARTIFACTS) {
    const a = await loadArtifact(golden, name);
    const b = await loadArtifact(candidate, name);
    if (!a.ok || !b.ok) {
      console.error(`✗ ${name}: ${a.ok ? b.error : a.error}`);
      totalDiffs++;
      continue;
    }
    artifactsCompared++;
    const diffs = [];
    deepDiff(a.data, b.data, "", diffs, MAX_DIFFS_PER_ARTIFACT);
    if (diffs.length === 0) {
      console.log(`✓ ${name}: identical`);
    } else {
      console.log(`✗ ${name}: ${diffs.length} difference(s)`);
      printArtifactDiff(name, diffs);
      totalDiffs += diffs.length;
    }
  }

  console.log("");
  console.log(
    totalDiffs === 0
      ? `PASS — all ${artifactsCompared} artifacts identical`
      : `FAIL — ${totalDiffs} total diff(s) across ${ARTIFACTS.length} artifact(s)`,
  );

  process.exit(totalDiffs === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
