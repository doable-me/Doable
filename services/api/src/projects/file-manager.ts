/**
 * Project File Manager
 *
 * Scaffolds Vite+React+TypeScript projects on the server filesystem
 * and provides file CRUD operations. This is the core of how Doable's
 * live preview works — files written here are served by the Vite dev server.
 */

import { existsSync, statSync } from "node:fs";
import { writeFile as fsWriteFile, mkdir as fsMkdir, rm as fsRm } from "node:fs/promises";
import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";
import {
  readProjectFile,
  writeProjectFile,
  deleteProjectFile,
  listProjectFiles,
  getProjectPath,
  ensureProjectDir,
  FileNotFoundError,
  FileAccessError,
} from "../ai/project-files.js";
import { blankTemplate } from "../templates/definitions/blank.js";
import { getTemplate } from "../templates/registry.js";
import { initRepo } from "../git/init.js";
import { defaultRegistry } from "../frameworks/registry.js";
import { FrameworkAdapterError, type FrameworkContext } from "../frameworks/types.js";
import { linkDoableSdk } from "./link-sdk.js";
import { isSandboxWrapperAvailable } from "../runtime/dev-uid-allocator.js";

// Re-export for convenience
export {
  readProjectFile as readFile,
  writeProjectFile as writeFile,
  deleteProjectFile as deleteFile,
  listProjectFiles as listFiles,
  getProjectPath,
  FileNotFoundError,
  FileAccessError,
};

// ─── Scaffold Function ───────────────────────────────────

export interface ScaffoldResult {
  projectPath: string;
  files: string[];
  installOutput: string;
}

// In-flight scaffold promises — prevents two concurrent createProject()
// calls for the same project from colliding (race between frontend
// scaffold POST and chat API auto-scaffold).
const scaffoldingInFlight = new Map<string, Promise<ScaffoldResult>>();

// Per-project install failure tracker — circuit-breaker for the
// preview-url polling loop. After 3 failures within a 30s window we
// stop attempting npm install; the operator must intervene. Without
// this the EACCES loop (BUG-R13 / preview-243) hammers the disk and
// floods logs at every ~3s preview poll.
const INSTALL_FAILURE_LIMIT = 3;
const INSTALL_FAILURE_WINDOW_MS = 30_000;
const installFailureWindow = new Map<string, { count: number; firstFailAt: number }>();

function checkInstallBreaker(projectId: string): void {
  const w = installFailureWindow.get(projectId);
  if (!w) return;
  const now = Date.now();
  if (now - w.firstFailAt >= INSTALL_FAILURE_WINDOW_MS) {
    installFailureWindow.delete(projectId);
    return;
  }
  if (w.count >= INSTALL_FAILURE_LIMIT) {
    throw new Error(
      "install repeatedly failed for project — circuit breaker open, manual retry needed",
    );
  }
}

function recordInstallFailure(projectId: string): void {
  const now = Date.now();
  const w = installFailureWindow.get(projectId);
  if (!w || now - w.firstFailAt >= INSTALL_FAILURE_WINDOW_MS) {
    installFailureWindow.set(projectId, { count: 1, firstFailAt: now });
  } else {
    w.count += 1;
  }
}

function clearInstallFailures(projectId: string): void {
  installFailureWindow.delete(projectId);
}

/**
 * Linux-only pre-install fixup: if the project dir is owned by a sandbox
 * uid from a prior dev-server run, chown it back to the API user so the
 * upcoming `npm install` can mkdir node_modules (BUG-R13 EACCES). The
 * subsequent dev-server-start chown-to-sandbox-uid will re-flip ownership
 * after install completes.
 */
async function chownProjectToApiUser(projectId: string, projectPath: string): Promise<void> {
  if (process.platform !== "linux") return;
  if (!isSandboxWrapperAvailable()) return;
  const apiUid = process.geteuid?.() ?? 0;
  let currentUid: number;
  try {
    currentUid = statSync(projectPath).uid;
  } catch {
    return;
  }
  if (currentUid === apiUid) return;
  await new Promise<void>((resolve) => {
    const ch = nodeSpawn(
      "sudo",
      ["-n", "chown", "-R", `${apiUid}:${apiUid}`, projectPath],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    ch.on("exit", () => resolve());
    ch.on("error", () => resolve());
  });
  console.log(
    `[FileManager] chowned project ${projectId} to API user uid=${apiUid} before install (was uid=${currentUid})`,
  );
}

/**
 * Create a new Vite+React+TypeScript project scaffold.
 * Writes all template files and runs `pnpm install`.
 * If templateFiles is provided, uses those instead of the default blank scaffold.
 */
export async function createProject(
  projectId: string,
  templateFiles?: Record<string, string>,
  frameworkId?: string,
  onProgress?: (message: string) => void,
): Promise<ScaffoldResult> {
  // Deduplicate concurrent scaffold calls for the same project
  const inflight = scaffoldingInFlight.get(projectId);
  if (inflight) {
    return inflight;
  }

  const promise = doCreateProject(projectId, templateFiles, frameworkId, onProgress);
  scaffoldingInFlight.set(projectId, promise);
  try {
    return await promise;
  } finally {
    scaffoldingInFlight.delete(projectId);
  }
}

async function doCreateProject(
  projectId: string,
  templateFiles?: Record<string, string>,
  frameworkIdOverride?: string,
  onProgress?: (message: string) => void,
): Promise<ScaffoldResult> {
  const projectPath = getProjectPath(projectId);

  // Check if already scaffolded
  if (existsSync(projectPath + "/package.json")) {
    throw new ProjectExistsError(projectId);
  }

  await ensureProjectDir(projectId);

  // Resolve framework adapter for required/critical-file lists.
  // Caller (scaffold.ts) passes frameworkId from the template metadata when
  // scaffolding from a template; vite-react is the default for legacy paths
  // and blank scaffolds (every existing project today is vite-react).
  const frameworkId = frameworkIdOverride ?? "vite-react";
  const adapter = defaultRegistry.getAdapter(frameworkId);

  let files: Array<[string, string]>;

  if (templateFiles && Object.keys(templateFiles).length > 0) {
    // Use template files — but ensure they contain required entries.
    // Per PRD 02 §4.4 and PRD 07a §7.3, an incomplete template is now a hard
    // error (FrameworkAdapterError code "missing-required-files") rather than
    // a silent fall-back; callers must supply a complete template or omit it.
    for (const required of adapter.defaults.requiredFiles) {
      if (!templateFiles[required]) {
        throw new FrameworkAdapterError(
          "missing-required-files",
          `template missing required file: ${required}`,
        );
      }
    }
  }

  if (templateFiles && Object.keys(templateFiles).length > 0) {
    // Use template files (validated above)
    files = Object.entries(templateFiles);
  } else {
    // Default blank scaffold — use the framework-specific blank template
    // when available (e.g. nextjs-blank for nextjs-app), falling back to
    // the generic vite-react blank template.
    const fallbackId = adapter.defaults.fallbackTemplateId;
    const frameworkBlank = fallbackId ? getTemplate(fallbackId) : undefined;
    files = Object.entries(
      frameworkBlank ? frameworkBlank.codeFiles : blankTemplate.codeFiles,
    );
  }

  // Write files directly to disk — NOT through writeProjectFile which goes
  // through the Yjs bridge. The Yjs bridge debounces disk persistence, so
  // files might not exist on disk when the validation check runs.
  const createdFiles: string[] = [];
  for (const [filePath, content] of files) {
    const fullPath = path.join(projectPath, filePath);
    await fsMkdir(path.dirname(fullPath), { recursive: true });
    await fsWriteFile(fullPath, content, "utf-8");
    createdFiles.push(filePath);
  }

  // Validate that critical scaffold files exist on disk.
  // Without these, the dev server would show a blank/default page. The list
  // comes from the framework adapter (vite-react: ["index.html","package.json"]).
  for (const critical of adapter.defaults.criticalFiles) {
    if (!existsSync(path.join(projectPath, critical))) {
      throw new FrameworkAdapterError(
        "missing-required-files",
        `scaffold missing critical file: ${critical} in ${projectPath} ` +
          `(created files: [${createdFiles.join(", ")}])`,
      );
    }
  }

  // Run npm install via the framework adapter. The vite-react adapter
  // mirrors the legacy runPnpmInstall spawn shape byte-for-byte: same
  // `npm install --legacy-peer-deps` argv, shell:true, FORCE_COLOR=0,
  // 180s timeout, Windows taskkill-tree on timeout. See
  // services/api/src/frameworks/adapters/vite-react.ts:runNpmInstall.
  // Adapter is reused from the requiredFiles/criticalFiles resolution above
  // (PR-E rule: fetch adapter once per createProject call).
  const installCtx: FrameworkContext = {
    projectId,
    projectPath,
    basePath: "/",
    env: {},
    onProgress,
  };
  checkInstallBreaker(projectId);
  await chownProjectToApiUser(projectId, projectPath);
  let installResult;
  try {
    installResult = await adapter.install(installCtx);
  } catch (err) {
    recordInstallFailure(projectId);
    throw err;
  }
  clearInstallFailures(projectId);
  const installOutput = installResult.log;

  // Verify node_modules was actually created AND the framework's required
  // build tool is resolvable inside it (e.g. node_modules/vite for vite-react).
  // npm install can exit 0 but skip devDeps when NODE_ENV=production leaks
  // through; without this guard, the dev server later crashes with
  // MODULE_NOT_FOUND for vite/bin/vite.js and the preview iframe never
  // mounts. Throw instead of warning so callers see the failure.
  if (!existsSync(projectPath + "/node_modules")) {
    throw new FrameworkAdapterError(
      "install-failed",
      `npm install completed but node_modules was not created for project ${projectId}`,
    );
  }
  const requiredBuildTool = (adapter as { requiredBuildTool?: string }).requiredBuildTool;
  if (
    requiredBuildTool &&
    !existsSync(path.join(projectPath, "node_modules", requiredBuildTool, "package.json"))
  ) {
    throw new FrameworkAdapterError(
      "install-failed",
      `npm install completed but ${requiredBuildTool} (the ${frameworkId} build tool) is missing from node_modules for project ${projectId} — likely a --omit=dev install`,
    );
  }

  // Pre-link @doable/sdk so generated apps can import it without npm publish
  try {
    await linkDoableSdk(projectPath);
  } catch (err) {
    console.warn(`[FileManager] Failed to link @doable/sdk for project ${projectId}:`, err);
  }

  // Initialize git repo for the new project
  try {
    await initRepo(projectPath);
    console.log(`[FileManager] Git repo initialized for project ${projectId}`);
  } catch (gitErr) {
    // Non-critical: project works without git, can be migrated later
    console.warn(`[FileManager] Git init failed for project ${projectId}:`, gitErr);
  }

  return {
    projectPath,
    files: createdFiles,
    installOutput,
  };
}

/**
 * Check if a project has been scaffolded (has package.json).
 */
export function isProjectScaffolded(projectId: string): boolean {
  const projectPath = getProjectPath(projectId);
  return existsSync(projectPath + "/package.json");
}

/**
 * Check if a project has node_modules installed.
 */
export function hasNodeModules(projectId: string): boolean {
  const projectPath = getProjectPath(projectId);
  return existsSync(projectPath + "/node_modules");
}

/**
 * Install dependencies for an existing project that's missing node_modules.
 * This can happen if the project was scaffolded but node_modules was
 * cleaned up, or if npm install failed during initial scaffold, or if
 * `install_package` later created a partial node_modules/ that lacks the
 * framework's required build tool (e.g. vite).
 */
export async function ensureDependencies(projectId: string): Promise<void> {
  const projectPath = getProjectPath(projectId);

  // Python projects: check for requirements.txt without package.json
  const hasPkgJson = existsSync(projectPath + "/package.json");
  const hasReqTxt = existsSync(projectPath + "/requirements.txt");

  if (!hasPkgJson && !hasReqTxt) {
    // No recognizable dependency file
    return;
  }

  // Resolve framework adapter for the install spawn shape. Reads
  // projects.framework_id (column from migration 060); falls back to
  // vite-react when the project row is missing or pre-migration. The
  // adapter's install() encodes the per-framework install command
  // (npm install --legacy-peer-deps for Node, pip install for Python).
  let frameworkId = hasPkgJson ? "vite-react" : "django";
  try {
    const { sql } = await import("../db/index.js");
    const rows = await sql<{ framework_id: string }[]>`
      SELECT framework_id FROM projects WHERE id = ${projectId}
    `;
    if (rows[0]?.framework_id) frameworkId = rows[0].framework_id;
  } catch {
    // DB unreachable or column missing — fallback is safe.
  }
  const adapter = defaultRegistry.getAdapter(frameworkId);

  if (hasPkgJson) {
    // Node project — skip only when node_modules exists AND the framework's
    // required build tool is fully resolvable inside it. BUG-PUB-004 /
    // preview-empty mode: a prior install ran with NODE_ENV=production, OR
    // the AI's `install_package` tool ran `npm install <pkg>` after a failed
    // initial install — both leave a populated-looking node_modules/ that
    // lacks vite. Mirrors the probe at services/api/src/deploy/builder.ts:207-216.
    //
    // Both probes must hit: node_modules/<tool>/package.json (manifest) AND
    // node_modules/.bin/<tool> (the executable symlink). Manifest-only races
    // happen during a concurrent install — pnpm/npm write the package.json
    // early while extracting the tarball, before .bin/ is linked. The dev
    // server spawns `node .../<tool>/bin/<tool>.js` which fails until the
    // extract finishes; checking the .bin symlink avoids that window.
    const nodeModulesPresent = hasNodeModules(projectId);
    const requiredBuildTool = (adapter as { requiredBuildTool?: string }).requiredBuildTool;
    const manifestPath = requiredBuildTool
      ? path.join(projectPath, "node_modules", requiredBuildTool, "package.json")
      : null;
    const binPath = requiredBuildTool
      ? path.join(projectPath, "node_modules", ".bin", requiredBuildTool)
      : null;
    const manifestMissing = manifestPath !== null && !existsSync(manifestPath);
    const binMissing = binPath !== null && !existsSync(binPath);
    const buildToolMissing = manifestMissing || binMissing;
    if (nodeModulesPresent && !buildToolMissing) return;
    if (nodeModulesPresent && buildToolMissing) {
      const reason = manifestMissing ? "manifest missing" : ".bin symlink missing";
      console.log(
        `[FileManager] node_modules exists but ${requiredBuildTool} is incomplete (${reason}) for project ${projectId} — re-running install`,
      );
    }
  } else if (hasReqTxt) {
    // Python project — skip if already installed (site-packages marker)
    if (existsSync(projectPath + "/.venv") || existsSync(projectPath + "/__pypackages__")) return;
  }

  checkInstallBreaker(projectId);
  await chownProjectToApiUser(projectId, projectPath);

  const family = hasPkgJson ? "node" : "python";
  console.log(
    `[FileManager] dependencies missing for ${family} project ${projectId} — running install`,
  );

  const ctx: FrameworkContext = {
    projectId,
    projectPath,
    basePath: "/",
    env: {},
  };
  try {
    await adapter.install(ctx);
  } catch (err) {
    recordInstallFailure(projectId);
    throw err;
  }
  clearInstallFailures(projectId);

  // Ensure @doable/sdk is available after install
  try {
    await linkDoableSdk(projectPath);
  } catch {
    // Non-critical
  }
}

/**
 * Force a clean reinstall of a Node project's dependencies: removes
 * node_modules entirely, then re-runs the framework adapter's install.
 *
 * Recovery path for a CORRUPT (not merely missing) dependency tree. When an
 * earlier `npm install` is interrupted/killed mid-extract (the scaffold and
 * peer-dep installers SIGTERM npm on timeout), a package can be left
 * present-but-incomplete — e.g. tinyglobby/dist with index.cjs but no
 * index.mjs — and vite then crashes at startup with ERR_MODULE_NOT_FOUND for
 * a file inside node_modules. ensureDependencies() can't see this (it only
 * probes the build tool itself, which IS present) and the reactive peer-dep
 * installer can't fix it (the package "exists"), so the dev server
 * crash-loops. Nuking node_modules and reinstalling from package-lock is the
 * only reliable cure. Callers MUST guard against repeated invocation.
 */
export async function forceReinstallDependencies(projectId: string): Promise<void> {
  const projectPath = getProjectPath(projectId);
  // Node projects only — Python deps live in .venv, not node_modules.
  if (!existsSync(path.join(projectPath, "package.json"))) return;

  checkInstallBreaker(projectId);
  await chownProjectToApiUser(projectId, projectPath);

  let frameworkId = "vite-react";
  try {
    const { sql } = await import("../db/index.js");
    const rows = await sql<{ framework_id: string }[]>`
      SELECT framework_id FROM projects WHERE id = ${projectId}
    `;
    if (rows[0]?.framework_id) frameworkId = rows[0].framework_id;
  } catch {
    // DB unreachable — vite-react fallback is safe.
  }
  const adapter = defaultRegistry.getAdapter(frameworkId);

  console.warn(
    `[FileManager] force-reinstalling dependencies for project ${projectId} (corrupt node_modules recovery)`,
  );
  await fsRm(path.join(projectPath, "node_modules"), { recursive: true, force: true });

  const ctx: FrameworkContext = { projectId, projectPath, basePath: "/", env: {} };
  try {
    await adapter.install(ctx);
  } catch (err) {
    recordInstallFailure(projectId);
    throw err;
  }
  clearInstallFailures(projectId);

  try {
    await linkDoableSdk(projectPath);
  } catch {
    // Non-critical
  }
}

// ─── Errors ──────────────────────────────────────────────

export class ProjectExistsError extends Error {
  readonly projectId: string;
  constructor(projectId: string) {
    super(`Project already scaffolded: ${projectId}`);
    this.name = "ProjectExistsError";
    this.projectId = projectId;
  }
}
