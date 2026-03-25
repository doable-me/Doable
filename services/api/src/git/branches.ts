// ─── Branch Operations ───────────────────────────────────────
import { execGit } from "./exec.js";

export async function listBranches(
  projectPath: string
): Promise<string[]> {
  const { stdout } = await execGit(projectPath, [
    "branch",
    "--format=%(refname:short)",
  ]);
  if (!stdout.trim()) return [];
  return stdout.split("\n").filter((b) => b.trim());
}

export async function currentBranch(
  projectPath: string
): Promise<string> {
  const { stdout } = await execGit(projectPath, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  return stdout;
}

export async function createBranch(
  projectPath: string,
  name: string
): Promise<void> {
  await execGit(projectPath, ["branch", name]);
}

export async function switchBranch(
  projectPath: string,
  name: string
): Promise<void> {
  await execGit(projectPath, ["checkout", name]);
}
