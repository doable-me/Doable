/**
 * Apply bundled data templates (migrations + optional seed).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { applyMigration } from "../../data-worker/migrate.js";
import { runOnProject } from "../../data-worker/pool.js";
import type { WorkerRequest, WorkerResponse } from "../../data-worker/types.js";
import { BACKEND_DIR } from "../config.js";
import { getProjectPath } from "../../projects/file-manager.js";

function templatesRoot(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "../../packages/doable-runtime/templates/data"),
    path.resolve(process.cwd(), "packages/doable-runtime/templates/data"),
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/doable-runtime/templates/data",
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function listDataTemplates(): string[] {
  const root = templatesRoot();
  if (!root) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export async function applyDataTemplate(
  projectId: string,
  slug: string,
): Promise<{ migrations: string[]; seeded: boolean }> {
  const root = templatesRoot();
  if (!root) throw new Error("Data templates package not found");
  const dir = path.join(root, slug);
  if (!existsSync(dir)) throw new Error(`Unknown template: ${slug}`);

  const exec = (req: Omit<WorkerRequest, "id">): Promise<WorkerResponse> =>
    runOnProject(projectId, req);

  const migDir = path.join(dir, "migrations");
  const applied: string[] = [];
  if (existsSync(migDir)) {
    const files = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      const sqlText = readFileSync(path.join(migDir, f), "utf-8");
      const migrationId = f.replace(/\.sql$/, "").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
      await applyMigration(exec, migrationId, sqlText);
      applied.push(migrationId);
    }
  }

  let seeded = false;
  const seedPath = path.join(dir, "seed.sql");
  if (existsSync(seedPath)) {
    const seedSql = readFileSync(seedPath, "utf-8");
    await runOnProject(projectId, {
      op: "exec",
      sql: seedSql,
    });
    seeded = true;
  }

  const lockDir = path.join(getProjectPath(projectId), BACKEND_DIR);
  await mkdir(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, "data-templates.lock.json");
  let lock: { applied: string[] } = { applied: [] };
  if (existsSync(lockPath)) {
    try {
      lock = JSON.parse(readFileSync(lockPath, "utf-8")) as typeof lock;
    } catch {
      lock = { applied: [] };
    }
  }
  if (!lock.applied.includes(slug)) lock.applied.push(slug);
  await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf-8");

  return { migrations: applied, seeded };
}
