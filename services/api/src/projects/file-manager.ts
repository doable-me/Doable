/**
 * Project File Manager
 *
 * Scaffolds Vite+React+TypeScript projects on the server filesystem
 * and provides file CRUD operations. This is the core of how Doable's
 * live preview works — files written here are served by the Vite dev server.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile as fsWriteFile, mkdir as fsMkdir } from "node:fs/promises";
import path from "node:path";
import { buildSafeEnv } from "./safe-env.js";
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
import { initRepo } from "../git/init.js";

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
  templateFiles?: Record<string, string>
): Promise<ScaffoldResult> {
  // Deduplicate concurrent scaffold calls for the same project
  const inflight = scaffoldingInFlight.get(projectId);
  if (inflight) {
    return inflight;
  }

  const promise = doCreateProject(projectId, templateFiles);
  scaffoldingInFlight.set(projectId, promise);
  try {
    return await promise;
  } finally {
    scaffoldingInFlight.delete(projectId);
  }
}

async function doCreateProject(
  projectId: string,
  templateFiles?: Record<string, string>
): Promise<ScaffoldResult> {
  const projectPath = getProjectPath(projectId);

  // Check if already scaffolded
  if (existsSync(projectPath + "/package.json")) {
    throw new ProjectExistsError(projectId);
  }

  await ensureProjectDir(projectId);

  let files: Array<[string, string]>;

  if (templateFiles && Object.keys(templateFiles).length > 0) {
    // Use template files — but ensure they contain required entries
    const required = ["index.html", "package.json"];
    const templateKeys = Object.keys(templateFiles);
    const missingRequired = required.filter((r) => !templateKeys.includes(r));
    if (missingRequired.length > 0) {
      console.warn(
        `[FileManager] Template is missing required files [${missingRequired.join(", ")}] — ` +
        `falling back to default scaffold to prevent blank preview`,
      );
      // Fall back to default scaffold instead of using the incomplete template
      templateFiles = undefined;
    }
  }

  if (templateFiles && Object.keys(templateFiles).length > 0) {
    // Use template files (validated above)
    files = Object.entries(templateFiles);
  } else {
    // Default blank scaffold — sourced from the blank template so they
    // stay in sync automatically.
    files = Object.entries(blankTemplate.codeFiles);
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
  // Without these, Vite will show a blank/default page.
  const criticalFiles = ["index.html", "package.json"];
  const missingCritical: string[] = [];
  for (const cf of criticalFiles) {
    if (!existsSync(projectPath + "/" + cf)) {
      missingCritical.push(cf);
    }
  }
  if (missingCritical.length > 0) {
    throw new Error(
      `Scaffold validation failed: missing critical files [${missingCritical.join(", ")}] in ${projectPath}. ` +
      `This would cause a blank preview. Created files: [${createdFiles.join(", ")}]`,
    );
  }

  // Run pnpm install
  const installOutput = await runPnpmInstall(projectPath);

  // Verify node_modules was actually created (npm install can "succeed"
  // with exit code 0 but not create node_modules in edge cases)
  if (!existsSync(projectPath + "/node_modules")) {
    console.warn(
      `[FileManager] npm install completed but node_modules was not created for project ${projectId}`,
    );
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
  if (hasNodeModules(projectId)) return;

  const projectPath = getProjectPath(projectId);
  if (!existsSync(projectPath + "/package.json")) return;

  console.log(
    `[FileManager] node_modules missing for project ${projectId} — running npm install`,
  );
  await runPnpmInstall(projectPath);
}

// ─── pnpm Install ────────────────────────────────────────

function runPnpmInstall(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use npm instead of pnpm to avoid workspace interference
    // (pnpm in a monorepo would treat the project as a workspace member)
    const child = spawn("npm", ["install", "--legacy-peer-deps", "--ignore-scripts"], {
      cwd,
      shell: true,
      stdio: "pipe",
      env: buildSafeEnv(undefined, { FORCE_COLOR: "0" }),
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to run pnpm install: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout + stderr);
      } else {
        reject(
          new Error(`pnpm install exited with code ${code}:\n${stdout}\n${stderr}`),
        );
      }
    });

    // Timeout after 3 minutes
    setTimeout(() => {
      // On Windows, shell: true means child is cmd.exe; SIGTERM doesn't
      // propagate. Use taskkill to kill the entire process tree.
      if (process.platform === "win32" && child.pid) {
        try {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } catch {
          child.kill("SIGTERM");
        }
      } else {
        child.kill("SIGTERM");
      }
      reject(new Error("npm install timed out after 3 minutes"));
    }, 180_000);
  });
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
