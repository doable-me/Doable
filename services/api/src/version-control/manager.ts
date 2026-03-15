import { sql } from "../db/index.js";
import type { ProjectVersionRow } from "@doable/db";
import { createSnapshot, snapshotToJson, jsonToSnapshot } from "./snapshot.js";
import { diffSnapshots, type DiffResult } from "./diff.js";

// ─── Types ──────────────────────────────────────────────────

interface CreateVersionOpts {
  description?: string;
  createdBy: string;
}

interface PaginationOpts {
  page?: number;
  pageSize?: number;
}

interface VersionListResult {
  versions: ProjectVersionRow[];
  total: number;
}

// ─── Version Manager ────────────────────────────────────────

export async function createVersion(
  projectId: string,
  projectPath: string,
  opts: CreateVersionOpts
): Promise<ProjectVersionRow> {
  // Get next version number
  const [latest] = await sql<[{ max_version: number | null }]>`
    SELECT MAX(version_number) as max_version
    FROM project_versions
    WHERE project_id = ${projectId}
  `;
  const nextVersion = (latest?.max_version ?? 0) + 1;

  // Create snapshot of current project state
  const snapshot = await createSnapshot(projectPath);
  const snapshotData = snapshotToJson(snapshot);

  const [version] = await sql<ProjectVersionRow[]>`
    INSERT INTO project_versions (project_id, version_number, description, snapshot_data, created_by)
    VALUES (
      ${projectId},
      ${nextVersion},
      ${opts.description ?? null},
      ${sql.json(snapshotData as unknown as Record<string, never>)},
      ${opts.createdBy}
    )
    RETURNING *
  `;

  return version!;
}

export async function getVersions(
  projectId: string,
  pagination: PaginationOpts = {}
): Promise<VersionListResult> {
  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const [countResult] = await sql<[{ count: string }]>`
    SELECT count(*)::text FROM project_versions
    WHERE project_id = ${projectId}
  `;

  const versions = await sql<ProjectVersionRow[]>`
    SELECT id, project_id, version_number, description, bookmarked, created_by, created_at
    FROM project_versions
    WHERE project_id = ${projectId}
    ORDER BY version_number DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  return {
    versions,
    total: parseInt(countResult!.count, 10),
  };
}

export async function getVersion(
  versionId: string
): Promise<ProjectVersionRow | undefined> {
  const [version] = await sql<ProjectVersionRow[]>`
    SELECT * FROM project_versions WHERE id = ${versionId}
  `;
  return version;
}

export async function restoreVersion(
  projectId: string,
  versionId: string,
  projectPath: string,
  restoredBy: string
): Promise<ProjectVersionRow> {
  // Get the version to restore
  const [sourceVersion] = await sql<ProjectVersionRow[]>`
    SELECT * FROM project_versions
    WHERE id = ${versionId} AND project_id = ${projectId}
  `;

  if (!sourceVersion) {
    throw new Error(`Version ${versionId} not found for project ${projectId}`);
  }

  if (!sourceVersion.snapshot_data) {
    throw new Error(`Version ${versionId} has no snapshot data`);
  }

  // Restore files from snapshot (non-destructive: creates a new version first)
  const snapshot = jsonToSnapshot(
    sourceVersion.snapshot_data as Record<string, unknown>
  );

  const { restoreSnapshot } = await import("./snapshot.js");
  const { restoredFiles, errors } = await restoreSnapshot(projectPath, snapshot);

  if (errors.length > 0) {
    console.warn(`Restore had ${errors.length} errors:`, errors);
  }

  // Create a new version representing the restore
  const newVersion = await createVersion(projectId, projectPath, {
    description: `Restored from v${sourceVersion.version_number} (${restoredFiles} files)`,
    createdBy: restoredBy,
  });

  return newVersion;
}

export async function bookmarkVersion(
  versionId: string,
  bookmarked: boolean
): Promise<ProjectVersionRow | undefined> {
  const [version] = await sql<ProjectVersionRow[]>`
    UPDATE project_versions
    SET bookmarked = ${bookmarked}
    WHERE id = ${versionId}
    RETURNING *
  `;
  return version;
}

export async function diffVersions(
  versionId1: string,
  versionId2: string
): Promise<DiffResult> {
  const [v1] = await sql<ProjectVersionRow[]>`
    SELECT * FROM project_versions WHERE id = ${versionId1}
  `;
  const [v2] = await sql<ProjectVersionRow[]>`
    SELECT * FROM project_versions WHERE id = ${versionId2}
  `;

  if (!v1 || !v2) {
    throw new Error("One or both versions not found");
  }

  if (!v1.snapshot_data || !v2.snapshot_data) {
    throw new Error("One or both versions have no snapshot data");
  }

  const snapshot1 = jsonToSnapshot(v1.snapshot_data as Record<string, unknown>);
  const snapshot2 = jsonToSnapshot(v2.snapshot_data as Record<string, unknown>);

  return diffSnapshots(snapshot1, snapshot2);
}

export async function autoVersion(
  projectId: string,
  projectPath: string,
  description: string,
  createdBy: string
): Promise<ProjectVersionRow> {
  return createVersion(projectId, projectPath, {
    description: `[Auto] ${description}`,
    createdBy,
  });
}
