/**
 * Tailwind toolchain normalizer for imported Vite projects.
 *
 * ─── The bug this fixes ──────────────────────────────────────────────────
 * Tools like Lovable now author CSS with Tailwind **v4** syntax:
 *
 *     @import "tailwindcss";
 *     @theme { --color-primary: hsl(var(--primary)); ... }
 *
 * but ship a package.json that still pins Tailwind **v3** (`tailwindcss: ^3.x`)
 * with a v3 `postcss.config.js` (`{ plugins: { tailwindcss: {}, autoprefixer: {} } }`).
 *
 * When Vite compiles `index.css`, its built-in `postcss-import` tries to
 * resolve `@import "tailwindcss"` to a file. Under Tailwind v3 the package's
 * main entry is JavaScript (`node_modules/tailwindcss/lib/index.js` →
 * `"use strict"; module.exports = require("./plugin");`), so postcss-import
 * feeds JS to the CSS parser and throws:
 *
 *     [postcss] postcss-import: .../tailwindcss/lib/index.js:1:1: Unknown word "use strict"
 *
 * That error fails the `index.css` module. `main.tsx` imports it, so the whole
 * module graph fails and the app never mounts — a **blank preview**. Crucially
 * the Vite *process* stays healthy and the base HTML returns 200, so none of
 * the existing recovery paths (missing-peer-dep install, CorruptDepsError
 * reinstall, HTTP health check) ever fire. The mismatch is invisible to them.
 *
 * In a correct Tailwind v4 setup the `@tailwindcss/postcss` (or
 * `@tailwindcss/vite`) plugin intercepts `@import "tailwindcss"` *before*
 * postcss-import can mis-resolve it. So the root-cause fix is to make a
 * v4-capable processor handle the CSS whenever the CSS is v4-flavoured.
 *
 * ─── What this does ──────────────────────────────────────────────────────
 * Pre-spawn, idempotent, vite-react only:
 *   1. Detect whether any project CSS uses Tailwind v4 directives.
 *   2. If so, and the installed/declared toolchain is not v4-correct:
 *        • bump `tailwindcss` to ^4 + add `@tailwindcss/postcss` ^4 in pkg.json
 *        • rewrite the PostCSS config to use `@tailwindcss/postcss`
 *          (unless the project drives Tailwind through the `@tailwindcss/vite`
 *           plugin, in which case we only ensure v4 is installed and neutralise
 *           a stale bare-`tailwindcss` PostCSS entry that would double-process)
 *        • run a scoped `npm install`
 *        • wipe `node_modules/.vite` so the next Vite picks up the new pipeline
 *   3. Once v4 is installed the detector sees a consistent setup and no-ops, so
 *      the install runs at most once per project.
 */

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const INSTALL_TIMEOUT_MS = 120_000;

// Directives that only exist in Tailwind v4's CSS-first authoring model.
// `@import "tailwindcss"` is the canonical v4 entry; `@theme`/`@custom-variant`/
// `@plugin`/`@source`/`@reference`/`@utility` are all v4-only at-rules. (v3
// used `@tailwind base; @tailwind components; @tailwind utilities;` instead.)
const V4_CSS_MARKERS: RegExp[] = [
  /@import\s+["']tailwindcss["']/,
  /@theme\b/,
  /@custom-variant\b/,
  /@plugin\s+["']/,
  /@reference\s+["']/,
  /@source\s+["']/,
  /@utility\b/,
];

const CSS_SCAN_DIRS = ["src", "app", "styles", "."];
const MAX_CSS_FILES = 60;

/** True when a CSS string is authored in Tailwind v4 syntax. (Pure — testable.) */
export function cssTextUsesTailwindV4(text: string): boolean {
  return V4_CSS_MARKERS.some((re) => re.test(text));
}

/** Recursively (shallowly) collect *.css files under a directory. */
async function collectCssFiles(
  dir: string,
  depth: number,
  out: string[],
): Promise<void> {
  if (depth > 4 || out.length >= MAX_CSS_FILES) return;
  let entries: Array<{ name: string; isDir: boolean; isFile: boolean }>;
  try {
    const raw = await readdir(dir, { withFileTypes: true });
    entries = raw.map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
      isFile: e.isFile(),
    }));
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_CSS_FILES) return;
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDir) {
      await collectCssFiles(full, depth + 1, out);
    } else if (entry.isFile && entry.name.endsWith(".css")) {
      out.push(full);
    }
  }
}

/** True when any project CSS file is written in Tailwind v4 syntax. */
async function projectCssUsesTailwindV4(projectPath: string): Promise<boolean> {
  const files: string[] = [];
  for (const d of CSS_SCAN_DIRS) {
    const dir = d === "." ? projectPath : join(projectPath, d);
    if (existsSync(dir)) await collectCssFiles(dir, 0, files);
  }
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch {
      continue;
    }
    if (cssTextUsesTailwindV4(content)) return true;
  }
  return false;
}

/** Parse a major version out of a semver range like "^4.0.0", "~4.1", ">=4". */
export function parseMajor(range: string | undefined): number | null {
  if (!range) return null;
  const m = range.match(/(\d+)/);
  return m && m[1] ? parseInt(m[1], 10) : null;
}

/** Authoritative installed Tailwind major from node_modules, else null. */
async function installedTailwindMajor(projectPath: string): Promise<number | null> {
  const pkgPath = join(projectPath, "node_modules", "tailwindcss", "package.json");
  try {
    const raw = await readFile(pkgPath, "utf-8");
    return parseMajor((JSON.parse(raw) as { version?: string }).version);
  } catch {
    return null;
  }
}

type PkgJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  type?: string;
};

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Whether the user's vite.config drives Tailwind through @tailwindcss/vite. */
async function viteConfigUsesTailwindVitePlugin(projectPath: string): Promise<boolean> {
  for (const name of ["vite.config.ts", "vite.config.js", "vite.config.mjs"]) {
    const p = join(projectPath, name);
    if (!existsSync(p)) continue;
    try {
      const content = await readFile(p, "utf-8");
      if (content.includes("@tailwindcss/vite")) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

type PostcssConfig = { path: string; content: string; esm: boolean } | null;

async function readPostcssConfig(projectPath: string): Promise<PostcssConfig> {
  for (const name of [
    "postcss.config.js",
    "postcss.config.cjs",
    "postcss.config.mjs",
    "postcss.config.ts",
  ]) {
    const p = join(projectPath, name);
    if (!existsSync(p)) continue;
    try {
      const content = await readFile(p, "utf-8");
      const esm = name.endsWith(".mjs") || /export\s+default/.test(content);
      return { path: p, content, esm };
    } catch {
      // ignore unreadable config, keep looking
    }
  }
  return null;
}

export function canonicalPostcssConfig(esm: boolean): string {
  const body = `{\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n}`;
  return esm
    ? `export default ${body};\n`
    : `module.exports = ${body};\n`;
}

/**
 * Rewrite a PostCSS config to use the v4 plugin. If the existing config is the
 * standard `{ tailwindcss: {}, autoprefixer: {} }` shape (the Lovable/Vite
 * default) we replace it wholesale with the canonical v4 config. Otherwise we
 * do a targeted swap of the bare `tailwindcss` plugin key so any other plugins
 * the user added are preserved.
 */
export function rewritePostcssContent(content: string): string {
  if (content.includes("@tailwindcss/postcss")) return content; // already v4
  const onlyDefaultPlugins =
    /\btailwindcss\b/.test(content) &&
    /\bautoprefixer\b/.test(content) &&
    // no other plugin identifiers beyond tailwindcss/autoprefixer
    !/(postcss-|cssnano|nesting|preset-env)/.test(content);
  if (onlyDefaultPlugins) {
    return canonicalPostcssConfig(/export\s+default/.test(content));
  }
  // Targeted swap: replace the bare `tailwindcss:` plugin key, keep the rest.
  return content.replace(
    /(["']?)tailwindcss\1(\s*:)/,
    '"@tailwindcss/postcss"$2',
  );
}

/** Remove a stale bare-`tailwindcss` PostCSS entry (vite-plugin path only). */
function stripBareTailwindFromPostcss(content: string): string {
  // Drop a `tailwindcss: {},` / `"tailwindcss": {},` plugin line so the
  // @tailwindcss/vite plugin is the single Tailwind processor.
  return content.replace(
    /^\s*(["']?)tailwindcss\1\s*:\s*\{\s*\},?\s*$\n?/m,
    "",
  );
}

async function runNpmInstall(
  projectPath: string,
  pkgs: string[],
): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "npm",
      ["install", ...pkgs, "--legacy-peer-deps", "--include=dev", "--no-audit", "--no-fund"],
      {
        cwd: projectPath,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
        // NODE_ENV=development so the api container's production default does
        // not prune devDeps (vite, plugin-react, typescript) mid-install — the
        // same guard the scaffold/peer-dep installers use.
        env: { ...process.env, NODE_ENV: "development", FORCE_COLOR: "0" },
      },
    );
    let log = "";
    child.stdout?.on("data", (d: Buffer) => (log += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (log += d.toString()));
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // already dead
      }
    }, INSTALL_TIMEOUT_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, log });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, log: log + String(err) });
    });
  });
}

export interface TailwindNormalizeResult {
  changed: boolean;
  reason?: string;
}

/**
 * Ensure an imported Vite project's Tailwind toolchain matches its CSS.
 *
 * Idempotent and cheap: returns immediately unless the project authored CSS in
 * Tailwind v4 syntax while the installed toolchain is still v3 / misconfigured.
 * Safe to call on every dev-server start.
 */
export async function ensureTailwindV4Consistency(
  projectPath: string,
): Promise<TailwindNormalizeResult> {
  // 1. Only act when the CSS is actually v4-flavoured.
  if (!(await projectCssUsesTailwindV4(projectPath))) {
    return { changed: false };
  }

  const usesVitePlugin = await viteConfigUsesTailwindVitePlugin(projectPath);
  const installedMajor = await installedTailwindMajor(projectPath);
  const tailwindInstalledV4 = installedMajor !== null && installedMajor >= 4;
  const postcss = await readPostcssConfig(projectPath);
  const postcssV4 = postcss?.content.includes("@tailwindcss/postcss") ?? false;
  const postcssHasBareTailwind =
    !!postcss && /\btailwindcss\b/.test(postcss.content) && !postcssV4;
  const postcssPkgInstalled = existsSync(
    join(projectPath, "node_modules", "@tailwindcss", "postcss"),
  );

  // 2. Decide whether anything is wrong.
  let needFix: boolean;
  if (usesVitePlugin) {
    // The @tailwindcss/vite plugin handles Tailwind. We only need v4 installed
    // and no conflicting bare-tailwindcss PostCSS entry.
    needFix = !tailwindInstalledV4 || postcssHasBareTailwind;
  } else {
    // PostCSS path (the Lovable default): need v4 + @tailwindcss/postcss wired.
    needFix =
      !tailwindInstalledV4 ||
      !postcssPkgInstalled ||
      !postcssV4 ||
      postcssHasBareTailwind;
  }
  if (!needFix) return { changed: false };

  console.log(
    `[normalize-tailwind] ${projectPath}: v4 CSS detected but toolchain is not v4-correct ` +
      `(installedMajor=${installedMajor}, vitePlugin=${usesVitePlugin}, postcssV4=${postcssV4}) — reconciling to Tailwind v4`,
  );

  // 3a. package.json: pin tailwind v4, add the v4 PostCSS plugin when needed.
  const pkgPath = join(projectPath, "package.json");
  const pkg = await readJson<PkgJson>(pkgPath);
  if (!pkg) return { changed: false, reason: "package.json unreadable" };
  pkg.devDependencies ??= {};
  const installArgs: string[] = [];
  const declaredMajor =
    parseMajor(pkg.dependencies?.tailwindcss) ??
    parseMajor(pkg.devDependencies?.tailwindcss);
  if (!tailwindInstalledV4 || (declaredMajor !== null && declaredMajor < 4)) {
    // Keep tailwindcss in whichever section already declares it.
    if (pkg.dependencies?.tailwindcss) pkg.dependencies.tailwindcss = "^4.0.0";
    else pkg.devDependencies.tailwindcss = "^4.0.0";
    installArgs.push("tailwindcss@^4.0.0");
  }
  if (!usesVitePlugin && (!postcssPkgInstalled || !pkg.devDependencies["@tailwindcss/postcss"])) {
    pkg.devDependencies["@tailwindcss/postcss"] = "^4.0.0";
    installArgs.push("@tailwindcss/postcss@^4.0.0");
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

  // 3b. Reconcile the PostCSS config.
  if (usesVitePlugin) {
    if (postcss && postcssHasBareTailwind) {
      const next = stripBareTailwindFromPostcss(postcss.content);
      if (next !== postcss.content) await writeFile(postcss.path, next, "utf-8");
    }
  } else if (postcss) {
    const next = rewritePostcssContent(postcss.content);
    if (next !== postcss.content) await writeFile(postcss.path, next, "utf-8");
  } else {
    // No PostCSS config at all — create the canonical v4 one. ESM when the
    // project is type:module, else CommonJS.
    const esm = pkg.type === "module";
    await writeFile(
      join(projectPath, esm ? "postcss.config.js" : "postcss.config.cjs"),
      canonicalPostcssConfig(esm),
      "utf-8",
    );
  }

  // 3c. Install the v4 packages (scoped — additive, fast).
  if (installArgs.length > 0) {
    const res = await runNpmInstall(projectPath, installArgs);
    if (!res.ok) {
      console.warn(
        `[normalize-tailwind] npm install ${installArgs.join(" ")} failed for ${projectPath}: ${res.log.slice(-500)}`,
      );
      return { changed: true, reason: "install-failed" };
    }
  }

  // 3d. Wipe Vite's transform cache so the new PostCSS pipeline is picked up.
  await rm(join(projectPath, "node_modules", ".vite"), {
    recursive: true,
    force: true,
  }).catch(() => {});

  console.log(`[normalize-tailwind] ${projectPath}: reconciled to Tailwind v4`);
  return { changed: true, reason: "reconciled-to-v4" };
}
