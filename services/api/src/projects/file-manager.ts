/**
 * Project File Manager
 *
 * Scaffolds Vite+React+TypeScript projects on the server filesystem
 * and provides file CRUD operations. This is the core of how Doable's
 * live preview works — files written here are served by the Vite dev server.
 */

import { existsSync } from "node:fs";
import { writeFile as fsWriteFile, mkdir as fsMkdir } from "node:fs/promises";
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
  const installResult = await adapter.install(installCtx);
  const installOutput = installResult.log;

  // Verify node_modules was actually created (npm install can "succeed"
  // with exit code 0 but not create node_modules in edge cases)
  if (!existsSync(projectPath + "/node_modules")) {
    console.warn(
      `[FileManager] npm install completed but node_modules was not created for project ${projectId}`,
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
 * cleaned up, or if npm install failed during initial scaffold.
 */
export async function ensureDependencies(projectId: string): Promise<void> {
  const projectPath = getProjectPath(projectId);

  // Python projects: check for requirements.txt without package.json
  const hasPkgJson = existsSync(projectPath + "/package.json");
  const hasReqTxt = existsSync(projectPath + "/requirements.txt");

  if (hasPkgJson) {
    // Node project — skip if already installed
    if (hasNodeModules(projectId)) return;
  } else if (hasReqTxt) {
    // Python project — skip if already installed (site-packages marker)
    if (existsSync(projectPath + "/.venv") || existsSync(projectPath + "/__pypackages__")) return;
  } else {
    // No recognizable dependency file
    return;
  }

  const family = hasPkgJson ? "node" : "python";
  console.log(
    `[FileManager] dependencies missing for ${family} project ${projectId} — running install`,
  );

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
  const ctx: FrameworkContext = {
    projectId,
    projectPath,
    basePath: "/",
    env: {},
  };
  await adapter.install(ctx);

  // Ensure @doable/sdk is available after install
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
