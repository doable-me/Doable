#!/usr/bin/env node
/**
 * Auto-discovers and runs every API/UI contract probe in scripts/.
 *
 * A "contract probe" is a self-contained tsx script that pins the wire
 * shape between API routes and their frontend consumers. The originating
 * use case is BUG-ADMIN-012 (see scripts/r17-test-admin-users-contract.ts),
 * where commit 05b622dc silently flipped /admin/users from a flat array
 * to a { data, total, limit, offset } envelope and crashed every
 * platform admin's /admin page with "A.map is not a function".
 *
 * Discovery rules:
 *   - Any file matching scripts/contract-*.ts is picked up automatically.
 *   - The historical r17-test-admin-users-contract.ts is also picked up
 *     so renaming it later can be a follow-up, not a blocker.
 *
 * Failure rules:
 *   - Each probe is executed sequentially with `pnpm exec tsx <file>`.
 *   - Non-zero exit from ANY probe makes this runner exit non-zero,
 *     so CI (.github/workflows/ci.yml) fails the build.
 *
 * Fork-friendliness:
 *   - This runner is fully self-contained — no network, no env vars,
 *     no domain assumptions. Probes themselves should also stay
 *     domain-agnostic; see scripts/smoke-admin.mjs for the live-server
 *     equivalent that takes BASE_URL from the operator.
 */

import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);

const candidates = readdirSync(here)
  .filter((f) => f.startsWith("contract-") && f.endsWith(".ts"))
  .sort();

// Backwards-compat: the original probe predates the contract-*.ts naming
// convention. Include it explicitly so renaming can be deferred.
const legacy = "r17-test-admin-users-contract.ts";
if (existsSync(join(here, legacy)) && !candidates.includes(legacy)) {
  candidates.unshift(legacy);
}

if (candidates.length === 0) {
  console.log("No contract probes found in scripts/. Skipping.");
  process.exit(0);
}

let failures = 0;
for (const file of candidates) {
  console.log(`\n=== contract: ${file} ===`);
  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", join("scripts", file)],
    { stdio: "inherit", cwd: repoRoot, shell: process.platform === "win32" },
  );
  if (result.status !== 0) {
    console.error(`FAIL: ${file} (exit ${result.status})`);
    failures += 1;
  }
}

console.log(
  `\n${candidates.length - failures}/${candidates.length} contract probes PASS` +
    (failures > 0 ? `, ${failures} FAIL` : ""),
);
process.exit(failures === 0 ? 0 : 1);
