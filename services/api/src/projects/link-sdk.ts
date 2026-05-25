/**
 * Links the private @doable/* workspace packages into a generated project's
 * node_modules:
 *   - @doable/sdk   — connector-proxy / runtime helpers
 *   - @doable/data  — per-app PGlite database client (import { db } from "@doable/data")
 *
 * These are private workspace packages (not on npm). Generated projects use
 * `npm install`, which can't resolve workspace:* references, so we copy each
 * package's source into node_modules/<name>/ where Vite resolves it via its
 * normal dependency pre-bundling.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Resolve a workspace package's source dir, robust to where the API process
 * was launched from. In local dev the cwd is services/api (packages live at
 * ../../packages); in the Docker image the cwd is /app with packages at
 * /app/packages. The old code assumed only the dev layout, so in containers
 * it computed /packages/... and silently skipped linking — leaving
 * @doable/sdk (and @doable/data) unresolvable in every deployed app. Probe
 * the known layouts and return the first that exists.
 */
function resolvePackageSrcDir(dirName: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), "../../packages", dirName), // dev: services/api → repo root
    path.resolve(process.cwd(), "packages", dirName), //        container: cwd = /app
    path.resolve(process.cwd(), "../packages", dirName), //      services/* one level up
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
  }
  return null;
}

/**
 * Copy a private workspace package into a project's node_modules. Re-copies on
 * every call so the linked copy tracks the current source. Returns true on
 * success. The target path is derived from the package's own "name" field
 * (e.g. "@doable/data" → node_modules/@doable/data).
 */
async function linkWorkspacePackage(
  projectPath: string,
  dirName: string,
  srcFiles: string[],
): Promise<boolean> {
  const srcDir = resolvePackageSrcDir(dirName);
  if (!srcDir) {
    console.warn(
      `[link-sdk] package source for ${dirName} not found (cwd=${process.cwd()}) — skipping`,
    );
    return false;
  }

  const pkgJson = JSON.parse(
    await readFile(path.join(srcDir, "package.json"), "utf-8"),
  ) as { name?: string; private?: boolean; scripts?: unknown; devDependencies?: unknown };
  const pkgName = pkgJson.name;
  if (!pkgName) {
    console.warn(`[link-sdk] ${dirName}/package.json has no name field — skipping`);
    return false;
  }

  // node_modules/@doable/sdk (split so the scope dir is created too)
  const targetDir = path.join(projectPath, "node_modules", ...pkgName.split("/"));
  await mkdir(path.join(targetDir, "src"), { recursive: true });

  // Strip workspace-only fields so Vite treats the linked copy as a normal dep.
  delete pkgJson.private;
  delete pkgJson.scripts;
  delete pkgJson.devDependencies;
  await writeFile(
    path.join(targetDir, "package.json"),
    JSON.stringify(pkgJson, null, 2),
    "utf-8",
  );

  for (const file of srcFiles) {
    const srcPath = path.join(srcDir, "src", file);
    if (existsSync(srcPath)) {
      await writeFile(
        path.join(targetDir, "src", file),
        await readFile(srcPath, "utf-8"),
        "utf-8",
      );
    }
  }

  const tsConfigPath = path.join(srcDir, "tsconfig.json");
  if (existsSync(tsConfigPath)) {
    await writeFile(
      path.join(targetDir, "tsconfig.json"),
      await readFile(tsConfigPath, "utf-8"),
      "utf-8",
    );
  }

  console.log(`[link-sdk] Linked ${pkgName} into ${projectPath}`);
  return true;
}

/**
 * Link the private @doable/* workspace packages into a project's node_modules.
 * Idempotent; safe to call on every dev-server start.
 */
export async function linkDoableSdk(projectPath: string): Promise<void> {
  await linkWorkspacePackage(projectPath, "doable-sdk", ["index.ts", "react.ts", "server.ts"]);
  // @doable/data — per-app DB client (src/index.ts only; index.test.ts is
  // intentionally excluded so node:test never reaches the Vite bundle).
  await linkWorkspacePackage(projectPath, "doable-data", ["index.ts"]);
  // @doable/ai — runtime AI client (chat + embed). Same exclusion of tests so
  // they never reach the Vite bundle. Reuses the same project-scoped token
  // injected by the CONNECTOR_BRIDGE_SNIPPET (preview) and the index.html
  // snippet baked in by deploy/auto-api-key.ts:injectDataToken (published).
  // index.ts re-exports the thinking-tag helpers from "./thinking.js", so
  // thinking.ts MUST be copied too — otherwise Vite's dep pre-bundle fails to
  // resolve that re-export and the WHOLE module errors with "does not provide
  // an export named 'ai'", white-screening any generated app that imports it.
  await linkWorkspacePackage(projectPath, "doable-ai", ["index.ts", "thinking.ts"]);
}
