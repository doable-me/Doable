import { join } from "node:path";
import type { DoableContextFile, ProjectContext } from "@doable/shared/types/ai.js";
import {
  getProjectPath,
  readProjectFile,
  writeProjectFile,
  ensureDoableDir,
} from "../project-files.js";
import { CONTEXT_DEFAULTS } from "./defaults.js";

// ─── All Context Files ────────────────────────────────────

const CONTEXT_FILE_NAMES: DoableContextFile[] = [
  "knowledge.md",
  "instructions.md",
  "identity.md",
  "soul.md",
  "memory.md",
  "user.md",
  "plan.md",
];

// ─── Load Context ─────────────────────────────────────────

export async function loadProjectContext(
  projectId: string,
): Promise<ProjectContext> {
  const projectPath = getProjectPath(projectId);
  const contextFiles: Partial<Record<DoableContextFile, string>> = {};

  for (const fileName of CONTEXT_FILE_NAMES) {
    const filePath = join(".doable", fileName);
    try {
      const content = await readProjectFile(projectId, filePath);
      contextFiles[fileName] = content;
    } catch {
      // Use default if file doesn't exist
      contextFiles[fileName] = CONTEXT_DEFAULTS[fileName];
    }
  }

  return { projectId, projectPath, contextFiles };
}

// ─── Initialize Context ───────────────────────────────────

export async function initializeContext(projectId: string): Promise<void> {
  await ensureDoableDir(projectId);

  for (const fileName of CONTEXT_FILE_NAMES) {
    const filePath = join(".doable", fileName);
    try {
      await readProjectFile(projectId, filePath);
      // File exists, skip
    } catch {
      // File doesn't exist, create with defaults
      await writeProjectFile(projectId, filePath, CONTEXT_DEFAULTS[fileName]!);
    }
  }
}

// ─── Update Context File ─────────────────────────────────

export async function updateContextFile(
  projectId: string,
  fileName: DoableContextFile,
  content: string,
): Promise<void> {
  await ensureDoableDir(projectId);
  const filePath = join(".doable", fileName);
  await writeProjectFile(projectId, filePath, content);
}

// ─── Read Single Context File ─────────────────────────────

export async function readContextFile(
  projectId: string,
  fileName: DoableContextFile,
): Promise<string> {
  const filePath = join(".doable", fileName);
  try {
    return await readProjectFile(projectId, filePath);
  } catch {
    return CONTEXT_DEFAULTS[fileName] ?? "";
  }
}
