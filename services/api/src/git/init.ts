// ─── Repository Initialization ───────────────────────────────
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execGit } from "./exec.js";

const DEFAULT_GITIGNORE = `node_modules/
dist/
.next/
.turbo/
.cache/
__pycache__/
*.lock
.env
.env.*
.doable/
`;

export function isGitRepo(projectPath: string): boolean {
  return existsSync(join(projectPath, ".git"));
}

export async function initRepo(projectPath: string): Promise<void> {
  await execGit(projectPath, ["init", "-b", "main"]);
  await execGit(projectPath, ["config", "user.name", "Doable"]);
  await execGit(projectPath, ["config", "user.email", "noreply@doable.me"]);

  const gitignorePath = join(projectPath, ".gitignore");
  if (!existsSync(gitignorePath)) {
    await writeFile(gitignorePath, DEFAULT_GITIGNORE, "utf-8");
  }

  await execGit(projectPath, ["add", "-A"]);
  await execGit(projectPath, [
    "commit",
    "-m",
    "Initial commit\n\nDoable-Type: init",
    "--allow-empty",
  ]);
}

export async function ensureRepo(projectPath: string): Promise<void> {
  if (isGitRepo(projectPath)) return;
  await initRepo(projectPath);
}
