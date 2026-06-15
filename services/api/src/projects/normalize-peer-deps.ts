/**
 * Flaky peer-dependency normalizer for generated/imported Vite projects.
 *
 * ─── The bug this fixes ──────────────────────────────────────────────────
 * Some libraries (recharts, react-redux, …) need a transitive dep (react-is)
 * that npm declares as a PEER and that the sandbox often fails to install or
 * leaves corrupt (e.g. an interrupted install or an AI auto-fix that hand-stubs
 * `node_modules/react-is` with an empty/garbage package.json). recharts imports
 * react-is at module-eval time, so a missing/corrupt react-is makes Vite's
 * optimizeDeps of recharts fail (the dep 504s), the recharts import throws at
 * load, React never mounts → permanent BLANK preview. The Vite process stays
 * healthy and the base HTML returns 200, so none of the existing recovery paths
 * (missing-import installer, CorruptDepsError reinstall, HTTP health check)
 * ever fire — the failure is invisible to them, exactly like the Tailwind-v4
 * mismatch the sibling normalizer handles.
 *
 * ─── What this does ──────────────────────────────────────────────────────
 * Pre-spawn, idempotent, vite-react only. For every parent in FLAKY_PEER_DEPS
 * the project depends on, ensure each required peer is present AND valid
 * (parseable package.json + a resolvable entry file). Repair the missing/corrupt
 * ones with a scoped `npm install` (the same working install path the scaffold
 * uses — NOT a hand-written stub), add them to package.json so future installs
 * keep them, and wipe `node_modules/.vite` so Vite re-optimizes cleanly. No-ops
 * once everything is valid, so the install runs at most once per project.
 *
 * GENERIC: driven entirely by the FLAKY_PEER_DEPS registry — add a package
 * there and it is covered with zero code changes here.
 */

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { FLAKY_PEER_DEPS, requiredPeersForDeps } from "./flaky-peer-deps.js";

const INSTALL_TIMEOUT_MS = 120_000;

type PkgJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Parse a major version out of a semver range like "^19.0.0", "~19.1", ">=19". */
export function parseMajor(range: string | undefined): number | null {
  if (!range) return null;
  const m = range.match(/(\d+)/);
  return m && m[1] ? parseInt(m[1], 10) : null;
}

/**
 * Resolve the entry FILE (relative path) a package.json points at, or null when
 * the manifest is unusable. Pure + testable: feeds the corruption check. Handles
 * `main`, `module`, string/object `exports["."]`, and the implicit `index.js`.
 */
export function resolvePackageEntry(pkgRaw: string | null): string | null {
  if (pkgRaw === null) return null;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
  } catch {
    return null; // unparseable / empty / truncated manifest = corrupt
  }
  if (!pkg || typeof pkg !== "object" || !pkg.name) return null;
  const pick = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const exportsField = pkg.exports as unknown;
  let exp: string | null = null;
  if (typeof exportsField === "string") exp = exportsField;
  else if (exportsField && typeof exportsField === "object") {
    const dot = (exportsField as Record<string, unknown>)["."];
    if (typeof dot === "string") exp = dot;
    else if (dot && typeof dot === "object") {
      const d = dot as Record<string, unknown>;
      exp = pick(d.import) ?? pick(d.require) ?? pick(d.default);
    }
  }
  return pick(pkg.main) ?? pick(pkg.module) ?? exp ?? "index.js";
}

export type PkgState = "ok" | "missing" | "corrupt";

/** Classify an installed package dir: present + parseable + entry file exists. */
export async function classifyInstalledPackage(
  projectPath: string,
  name: string,
): Promise<PkgState> {
  const dir = join(projectPath, "node_modules", name);
  if (!existsSync(dir)) return "missing";
  let pkgRaw: string | null = null;
  try {
    pkgRaw = await readFile(join(dir, "package.json"), "utf-8");
  } catch {
    return "corrupt";
  }
  const entry = resolvePackageEntry(pkgRaw);
  if (entry === null) return "corrupt";
  const entryPath = join(dir, entry);
  // Tolerate extensionless/dir entries by also accepting an index.js fallback.
  if (existsSync(entryPath)) return "ok";
  if (existsSync(entryPath + ".js")) return "ok";
  if (existsSync(join(entryPath, "index.js"))) return "ok";
  return "corrupt";
}

/**
 * Pick the install spec for a peer. react-is must match React's major (its
 * element-type symbols are version-coupled), so derive `^<reactMajor>` from the
 * project's react. Everything else installs at the latest compatible version.
 * Pure + testable.
 */
export function peerInstallSpec(peer: string, deps: Record<string, string>): string {
  if (peer === "react-is") {
    const major = parseMajor(deps.react ?? deps["react-dom"]);
    if (major) return `react-is@^${major}`;
  }
  return `${peer}@latest`;
}

function runNpmInstall(
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
        env: { ...process.env, NODE_ENV: "development", FORCE_COLOR: "0" },
      },
    );
    let log = "";
    child.stdout?.on("data", (d: Buffer) => (log += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (log += d.toString()));
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { /* already dead */ }
    }, INSTALL_TIMEOUT_MS);
    child.on("exit", (code) => { clearTimeout(timer); resolve({ ok: code === 0, log }); });
    child.on("error", (err) => { clearTimeout(timer); resolve({ ok: false, log: log + String(err) }); });
  });
}

export interface PeerDepNormalizeResult {
  changed: boolean;
  repaired: string[];
  reason?: string;
}

/**
 * Ensure all flaky peer deps required by the project's installed parents are
 * present and valid. Idempotent + cheap (no-op when everything is valid).
 */
export async function ensureFlakyPeerDeps(
  projectPath: string,
): Promise<PeerDepNormalizeResult> {
  const pkg = await readJson<PkgJson>(join(projectPath, "package.json"));
  if (!pkg) return { changed: false, repaired: [], reason: "no package.json" };
  const allDeps: Record<string, string> = { ...pkg.devDependencies, ...pkg.dependencies };

  const peers = requiredPeersForDeps(allDeps);
  if (peers.length === 0) return { changed: false, repaired: [] };

  // Which peers are missing/corrupt right now?
  const broken: string[] = [];
  for (const peer of peers) {
    const state = await classifyInstalledPackage(projectPath, peer);
    if (state !== "ok") broken.push(peer);
  }
  if (broken.length === 0) return { changed: false, repaired: [] };

  console.log(
    `[peer-deps] project needs repair of flaky peer dep(s): ${broken.join(", ")} (parents: ${Object.keys(FLAKY_PEER_DEPS).filter((p) => allDeps[p]).join(", ")})`,
  );

  // 1. Make sure they're declared so the install resolves + future installs keep them.
  const dependencies = { ...pkg.dependencies };
  let pkgChanged = false;
  for (const peer of broken) {
    if (dependencies[peer] === undefined) {
      const spec = peerInstallSpec(peer, allDeps);
      const range = spec.includes("@latest") ? "*" : "^" + (parseMajor(spec.split("@^")[1]) ?? "");
      dependencies[peer] = range || "*";
      pkgChanged = true;
    }
  }
  if (pkgChanged) {
    try {
      await writeFile(
        join(projectPath, "package.json"),
        JSON.stringify({ ...pkg, dependencies }, null, 2) + "\n",
        "utf-8",
      );
    } catch (err) {
      console.warn("[peer-deps] failed to update package.json:", err instanceof Error ? err.message : err);
    }
  }

  // 2. Remove corrupt dirs so npm re-extracts cleanly, then install from the
  //    real registry/cache (NEVER a hand-written stub).
  for (const peer of broken) {
    try { await rm(join(projectPath, "node_modules", peer), { recursive: true, force: true }); } catch { /* ignore */ }
  }
  const specs = broken.map((p) => peerInstallSpec(p, allDeps));
  const res = await runNpmInstall(projectPath, specs);

  // 3. Re-validate; only count peers that are actually good now.
  const repaired: string[] = [];
  for (const peer of broken) {
    if ((await classifyInstalledPackage(projectPath, peer)) === "ok") repaired.push(peer);
  }

  if (repaired.length > 0) {
    // Wipe the stale optimize cache so Vite re-bundles the parent (recharts)
    // against the now-valid peer instead of serving a 504 from the failed scan.
    try { await rm(join(projectPath, "node_modules", ".vite"), { recursive: true, force: true }); } catch { /* ignore */ }
  }

  if (repaired.length < broken.length) {
    console.warn(
      `[peer-deps] could not repair: ${broken.filter((b) => !repaired.includes(b)).join(", ")} (install ok=${res.ok})`,
    );
  }
  return { changed: repaired.length > 0, repaired };
}
