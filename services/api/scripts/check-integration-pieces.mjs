#!/usr/bin/env node
/**
 * Validate that every `piecePackage` referenced in the integration registry
 * is declared as a dependency in services/api/package.json AND is installable
 * (i.e. resolves at runtime).
 *
 * This guards against "missing piece" 500 errors that surface only when a
 * user clicks an integration in the catalog UI. Run on:
 *   - pretest / prebuild / predev (services/api package.json scripts)
 *   - CI
 *
 * Exit codes:
 *   0  all good
 *   1  drift detected (registry references package not in dependencies)
 *   2  declared package fails to resolve from disk (broken install)
 *
 * Usage:
 *   node services/api/scripts/check-integration-pieces.mjs
 *   node services/api/scripts/check-integration-pieces.mjs --check-resolve
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, "..");
const registryDir = join(apiRoot, "src", "integrations", "registry");
const pkgPath = join(apiRoot, "package.json");

const checkResolve = process.argv.includes("--check-resolve");

// ─── Collect piecePackages from registry ─────────────────
const registryFiles = (await readdir(registryDir)).filter((f) => f.endsWith(".ts"));
const referenced = new Map(); // pkg -> [{ file, line }]
const PIECE_RE = /piecePackage:\s*"([^"]+)"/g;

for (const file of registryFiles) {
  const text = await readFile(join(registryDir, file), "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    PIECE_RE.lastIndex = 0;
    let m;
    while ((m = PIECE_RE.exec(line)) !== null) {
      const pkg = m[1];
      const arr = referenced.get(pkg) ?? [];
      arr.push({ file, line: idx + 1 });
      referenced.set(pkg, arr);
    }
  });
}

// ─── Collect declared deps ───────────────────────────────
const pkgJson = JSON.parse(await readFile(pkgPath, "utf8"));
const declared = new Set([
  ...Object.keys(pkgJson.dependencies ?? {}),
  ...Object.keys(pkgJson.devDependencies ?? {}),
  ...Object.keys(pkgJson.optionalDependencies ?? {}),
]);

// ─── Diff ────────────────────────────────────────────────
const missing = [];
for (const [pkg, refs] of referenced) {
  if (!declared.has(pkg)) missing.push({ pkg, refs });
}

if (missing.length > 0) {
  console.error(
    `\n✖ Integration registry drift: ${missing.length} piecePackage(s) referenced but not declared in services/api/package.json\n`
  );
  for (const { pkg, refs } of missing) {
    const where = refs.map((r) => `${r.file}:${r.line}`).join(", ");
    console.error(`  - ${pkg}  (${where})`);
  }
  console.error(
    `\nFix: add the missing entry to services/api/package.json dependencies, ` +
      `OR remove the registry entry if the upstream piece no longer exists.\n` +
      `If the package is unpublished, remove the integration from the registry.\n`
  );
  process.exit(1);
}

// ─── Optional: verify each declared piece resolves ───────
if (checkResolve) {
  const require_ = createRequire(import.meta.url);
  const broken = [];
  for (const pkg of referenced.keys()) {
    try {
      // Resolve via the api package's node_modules tree
      require_.resolve(pkg + "/package.json", { paths: [apiRoot] });
    } catch {
      // Some pieces don't expose package.json in exports; fall back to dir check
      const dir = join(apiRoot, "node_modules", ...pkg.split("/"));
      if (!existsSync(dir)) broken.push(pkg);
    }
  }
  if (broken.length > 0) {
    console.error(
      `\n✖ ${broken.length} declared piecePackage(s) failed to resolve from disk.` +
        `\nRun \`pnpm install\` from the repo root to fix.\n`
    );
    for (const pkg of broken) console.error(`  - ${pkg}`);
    process.exit(2);
  }
}

console.log(
  `✓ Integration pieces consistent: ${referenced.size} referenced, ` +
    `${declared.size} declared deps${checkResolve ? " (resolve-checked)" : ""}.`
);
