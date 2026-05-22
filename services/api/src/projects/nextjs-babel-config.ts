/**
 * Helper for installing the doable visual-edit Babel plugin into a Next.js
 * project. Drops the CommonJS plugin under `<projectPath>/.doable/` and
 * writes a `.babelrc.json` at the project root that references it.
 *
 * Trade-off: adding `.babelrc.json` switches Next.js from SWC (Rust-native,
 * fast) to Babel (JS-native, slower compile times) for the entire project,
 * but unlocks click-to-edit in the visual editor by tagging every JSX
 * element with a `data-source="filepath:line:col"` attribute. Users may
 * delete `.babelrc.json` to revert to SWC at the cost of losing visual-edit.
 */

import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BABELRC = JSON.stringify(
  {
    presets: ["next/babel"],
    plugins: ["./.doable/babel-plugin-source-annotations.cjs"],
  },
  null,
  2,
);

export async function ensureNextjsBabelPlugin(projectPath: string): Promise<void> {
  const doableDir = path.join(projectPath, ".doable");
  await mkdir(doableDir, { recursive: true });
  const dest = path.join(doableDir, "babel-plugin-source-annotations.cjs");
  if (!existsSync(dest)) {
    const src = path.join(__dirname, "babel-plugin-source-annotations.cjs");
    await copyFile(src, dest);
  }
  const babelrcPath = path.join(projectPath, ".babelrc.json");
  if (!existsSync(babelrcPath)) {
    await writeFile(babelrcPath, BABELRC, "utf-8");
  }
}
