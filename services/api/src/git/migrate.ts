// ─── Project Migration to Git ────────────────────────────────
import { existsSync } from "node:fs";
import { sql } from "../db/index.js";
import { initRepo, isGitRepo } from "./init.js";
import { configureRemote } from "../github/git-ops.js";
import { getProjectPath } from "../projects/file-manager.js";

interface MigrateResult {
  migrated: boolean;
  error?: string;
}

interface BatchMigrateResult {
  total: number;
  migrated: number;
  skipped: number;
  failed: Array<{ projectId: string; error: string }>;
}

/**
 * Migrate a single project to git-based version control.
 * Idempotent: skips if already initialized or directory missing.
 */
export async function migrateProjectToGit(
  projectId: string,
  projectPath?: string
): Promise<MigrateResult> {
  try {
    const path = projectPath ?? getProjectPath(projectId);

    // Skip if directory doesn't exist on disk
    if (!existsSync(path)) {
      return { migrated: false, error: "Project directory does not exist" };
    }

    // Skip if already a git repo
    if (isGitRepo(path)) {
      // Just mark as initialized in DB if not already
      await sql`
        UPDATE projects SET git_initialized = true WHERE id = ${projectId}
      `;
      return { migrated: false, error: undefined };
    }

    // Initialize git repo (creates .gitignore + initial commit)
    await initRepo(path);

    // If project has a GitHub connection, add the remote
    const [conn] = await sql<
      Array<{ repo_owner: string; repo_name: string }>
    >`
      SELECT repo_owner, repo_name FROM github_connections
      WHERE project_id = ${projectId}
    `;

    if (conn) {
      try {
        await configureRemote(
          path,
          "origin",
          `https://github.com/${conn.repo_owner}/${conn.repo_name}.git`
        );
      } catch {
        // Non-critical: remote can be configured later
      }
    }

    // Mark as initialized in DB
    await sql`
      UPDATE projects SET git_initialized = true WHERE id = ${projectId}
    `;

    return { migrated: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { migrated: false, error: message };
  }
}

/**
 * Batch-migrate all existing projects to git.
 * Runs in series to avoid overwhelming disk I/O.
 */
export async function migrateAllProjects(): Promise<BatchMigrateResult> {
  const projects = await sql<Array<{ id: string }>>`
    SELECT id FROM projects
    WHERE git_initialized = false AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;

  const result: BatchMigrateResult = {
    total: projects.length,
    migrated: 0,
    skipped: 0,
    failed: [],
  };

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i]!;
    console.log(
      `[Git Migration] Migrating project ${i + 1} of ${projects.length}: ${project.id}`
    );

    const migrationResult = await migrateProjectToGit(project.id);

    if (migrationResult.migrated) {
      result.migrated++;
    } else if (migrationResult.error) {
      result.failed.push({
        projectId: project.id,
        error: migrationResult.error,
      });
    } else {
      result.skipped++;
    }
  }

  console.log(
    `[Git Migration] Complete: ${result.migrated} migrated, ${result.skipped} skipped, ${result.failed.length} failed`
  );

  return result;
}
