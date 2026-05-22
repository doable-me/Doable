import type postgres from "postgres";
import type { ProjectRow, ProjectVersionRow } from "../types.js";
import type { ProjectStatus, ProjectVisibility } from "@doable/shared";

// The DB enum `project_visibility` only has values ('public', 'restricted'),
// but the API/frontend uses ('public', 'private'). Translate transparently
// at the query boundary so callers always see/send 'private'.
function mapRowOut<T extends ProjectRow | undefined>(row: T): T {
  if (!row) return row;
  if ((row as ProjectRow).visibility === ("restricted" as unknown as ProjectVisibility)) {
    return { ...(row as ProjectRow), visibility: "private" as ProjectVisibility } as T;
  }
  return row;
}
function mapRowsOut(rows: ProjectRow[]): ProjectRow[] {
  return rows.map((r) => mapRowOut(r)!);
}
function visibilityForDb(v: ProjectVisibility): string {
  return v === "private" ? "restricted" : v;
}

export function projectQueries(sql: postgres.Sql) {
  return {
    async findById(id: string): Promise<ProjectRow | undefined> {
      const [project] = await sql<ProjectRow[]>`
        SELECT * FROM projects WHERE id = ${id} AND deleted_at IS NULL
      `;
      return mapRowOut(project);
    },

    async findByWorkspaceAndSlug(
      workspaceId: string,
      slug: string
    ): Promise<ProjectRow | undefined> {
      const [project] = await sql<ProjectRow[]>`
        SELECT * FROM projects
        WHERE workspace_id = ${workspaceId}
          AND slug = ${slug}
          AND deleted_at IS NULL
      `;
      return mapRowOut(project);
    },

    async listByWorkspace(
      workspaceId: string,
      opts: { page?: number; pageSize?: number; status?: ProjectStatus; search?: string; folderId?: string } = {}
    ): Promise<{ rows: ProjectRow[]; total: number }> {
      const page = opts.page ?? 1;
      const pageSize = opts.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const statusFilter = opts.status ? sql`AND status = ${opts.status}` : sql``;
      const folderFilter = opts.folderId ? sql`AND folder_id = ${opts.folderId}` : sql``;
      const searchFilter = opts.search
        ? sql`AND (name ILIKE ${"%" + opts.search + "%"} OR description ILIKE ${"%" + opts.search + "%"})`
        : sql``;

      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM projects
        WHERE workspace_id = ${workspaceId}
          AND deleted_at IS NULL
          ${statusFilter}
          ${folderFilter}
          ${searchFilter}
      `;

      const rows = await sql<ProjectRow[]>`
        SELECT * FROM projects
        WHERE workspace_id = ${workspaceId}
          AND deleted_at IS NULL
          ${statusFilter}
          ${folderFilter}
          ${searchFilter}
        ORDER BY updated_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      return { rows: mapRowsOut(rows), total: parseInt(countResult!.count, 10) };
    },

    async create(data: {
      workspaceId: string;
      name: string;
      slug: string;
      description?: string;
      templateId?: string;
      folderId?: string;
      frameworkId?: string;
    }): Promise<ProjectRow> {
      const [project] = await sql<ProjectRow[]>`
        INSERT INTO projects (workspace_id, name, slug, description, template_id, folder_id, framework_id)
        VALUES (
          ${data.workspaceId},
          ${data.name},
          ${data.slug},
          ${data.description ?? null},
          ${data.templateId ?? null},
          ${data.folderId ?? null},
          ${data.frameworkId ?? "vite-react"}
        )
        RETURNING *
      `;
      return mapRowOut(project)!;
    },

    async findBySubdomain(subdomain: string): Promise<ProjectRow | undefined> {
      const [project] = await sql<ProjectRow[]>`
        SELECT * FROM projects WHERE subdomain = ${subdomain} AND deleted_at IS NULL
      `;
      return mapRowOut(project);
    },

    async update(
      id: string,
      data: Partial<{
        name: string;
        description: string;
        status: ProjectStatus;
        visibility: ProjectVisibility;
        githubRepoUrl: string;
        publishedUrl: string | null;
        subdomain: string;
        thumbnailUrl: string;
        folderId: string | null;
      }>
    ): Promise<ProjectRow | undefined> {
      const values: Record<string, unknown> = {};

      if (data.name !== undefined) values.name = data.name;
      if (data.description !== undefined) values.description = data.description;
      if (data.status !== undefined) values.status = data.status;
      // Translate API/UI "private" → DB enum "restricted" (DB only has public/restricted).
      if (data.visibility !== undefined) values.visibility = visibilityForDb(data.visibility);
      if (data.githubRepoUrl !== undefined) values.github_repo_url = data.githubRepoUrl;
      if (data.publishedUrl !== undefined) values.published_url = data.publishedUrl;
      if (data.subdomain !== undefined) values.subdomain = data.subdomain;
      if (data.thumbnailUrl !== undefined) values.thumbnail_url = data.thumbnailUrl;
      if (data.folderId !== undefined) values.folder_id = data.folderId;

      if (Object.keys(values).length === 0) return this.findById(id);

      const [project] = await sql<ProjectRow[]>`
        UPDATE projects
        SET ${sql(values as Record<string, postgres.SerializableParameter>)}
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING *
      `;
      return mapRowOut(project);
    },

    async softDelete(id: string): Promise<boolean> {
      const result = await sql`
        UPDATE projects SET deleted_at = now() WHERE id = ${id} AND deleted_at IS NULL
      `;
      return result.count > 0;
    },

    async hardDelete(id: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM projects WHERE id = ${id}
      `;
      return result.count > 0;
    },

    async createVersion(data: {
      projectId: string;
      versionNumber: number;
      description?: string;
      snapshotData?: Record<string, unknown>;
      createdBy: string;
    }): Promise<ProjectVersionRow> {
      const [version] = await sql<ProjectVersionRow[]>`
        INSERT INTO project_versions (project_id, version_number, description, snapshot_data, created_by)
        VALUES (
          ${data.projectId},
          ${data.versionNumber},
          ${data.description ?? null},
          ${data.snapshotData ? sql.json(data.snapshotData as postgres.JSONValue) : null},
          ${data.createdBy}
        )
        RETURNING *
      `;
      return version!;
    },

    async listVersions(projectId: string): Promise<ProjectVersionRow[]> {
      return sql<ProjectVersionRow[]>`
        SELECT * FROM project_versions
        WHERE project_id = ${projectId}
        ORDER BY version_number DESC
      `;
    },
  };
}
