/**
 * Links @doable/sdk into a generated project's node_modules.
 *
 * The SDK is a private workspace package (not on npm). Generated projects
 * use npm install which can't resolve workspace:* references. This module
 * copies the SDK source into the project's node_modules/@doable/sdk/ so
 * Vite can resolve it via its normal dependency pre-bundling.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Resolve the SDK source directory.
 * process.cwd() = services/api/ → go up two levels to monorepo root.
 */
function getSdkSourceDir(): string {
  return path.resolve(process.cwd(), "../../packages/doable-sdk");
}

/**
 * Copy @doable/sdk into a project's node_modules.
 * Always re-copies source files to ensure the latest SDK version is used.
 */
export async function linkDoableSdk(projectPath: string): Promise<void> {
  const targetDir = path.join(projectPath, "node_modules", "@doable", "sdk");
  const markerFile = path.join(targetDir, "package.json");

  const srcDir = getSdkSourceDir();
  if (!existsSync(path.join(srcDir, "package.json"))) {
    console.warn("[link-sdk] SDK source not found at", srcDir, "— skipping");
    return;
  }

  // Ensure target directory structure
  await mkdir(targetDir, { recursive: true });
  await mkdir(path.join(targetDir, "src"), { recursive: true });

  // Copy package.json (adjust main/exports to point to src/)
  const pkgJson = JSON.parse(await readFile(path.join(srcDir, "package.json"), "utf-8"));
  // Remove private flag and workspace-only fields so Vite treats it normally
  delete pkgJson.private;
  delete pkgJson.scripts;
  delete pkgJson.devDependencies;
  await writeFile(markerFile, JSON.stringify(pkgJson, null, 2), "utf-8");

  // Copy source files
  const srcFiles = ["index.ts", "react.ts", "server.ts"];
  for (const file of srcFiles) {
    const srcPath = path.join(srcDir, "src", file);
    if (existsSync(srcPath)) {
      const content = await readFile(srcPath, "utf-8");
      await writeFile(path.join(targetDir, "src", file), content, "utf-8");
    }
  }

  // Copy tsconfig if present
  const tsConfigPath = path.join(srcDir, "tsconfig.json");
  if (existsSync(tsConfigPath)) {
    const content = await readFile(tsConfigPath, "utf-8");
    await writeFile(path.join(targetDir, "tsconfig.json"), content, "utf-8");
  }

  console.log(`[link-sdk] Linked @doable/sdk into ${projectPath}`);
}
