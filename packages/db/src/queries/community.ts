import type postgres from "postgres";
import type { PublicProjectRow, ProjectRemixRow } from "../types.js";

export function communityQueries(sql: postgres.Sql) {
  return {
    /**
     * List public/community projects with pagination and optional category filter.
     */
    async listPublicProjects(opts?: {
      category?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    }): Promise<{ rows: PublicProjectRow[]; total: number }> {
      const page = opts?.page ?? 1;
      const pageSize = opts?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const categoryFilter = opts?.category
        ? sql`AND pp.category = ${opts.category}`
        : sql``;

      const searchFilter = opts?.search
        ? sql`AND (pp.title ILIKE ${"%" + opts.search + "%"} OR pp.description ILIKE ${"%" + opts.search + "%"})`
        : sql``;

      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM public_projects pp
        WHERE 1=1
          ${categoryFilter}
          ${searchFilter}
      `;

      const rows = await sql<PublicProjectRow[]>`
        SELECT pp.* FROM public_projects pp
        WHERE 1=1
          ${categoryFilter}
          ${searchFilter}
        ORDER BY pp.published_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      return { rows, total: parseInt(countResult!.count, 10) };
    },

    /**
     * List featured/trending community projects.
     */
    async listFeaturedProjects(limit = 6): Promise<PublicProjectRow[]> {
      return sql<PublicProjectRow[]>`
        SELECT * FROM public_projects
        WHERE featured = true
        ORDER BY view_count DESC, remix_count DESC
        LIMIT ${limit}
      `;
    },

    /**
     * Get a single public project by project_id.
     */
    async getPublicProject(
      projectId: string
    ): Promise<PublicProjectRow | undefined> {
      const [row] = await sql<PublicProjectRow[]>`
        SELECT * FROM public_projects
        WHERE project_id = ${projectId}
      `;
      return row;
    },

    /**
     * Publish (share) a project to the community. Idempotent - re-running
     * updates the metadata. `sharedBy` is recorded for accountability.
     */
    async publishProject(data: {
      projectId: string;
      title: string;
      description?: string;
      category?: string;
      thumbnailUrl?: string;
      sharedBy?: string;
    }): Promise<PublicProjectRow> {
      const [row] = await sql<PublicProjectRow[]>`
        INSERT INTO public_projects (project_id, title, description, category, thumbnail_url, shared_by, updated_at)
        VALUES (
          ${data.projectId},
          ${data.title},
          ${data.description ?? null},
          ${data.category ?? null},
          ${data.thumbnailUrl ?? null},
          ${data.sharedBy ?? null},
          now()
        )
        ON CONFLICT (project_id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          thumbnail_url = EXCLUDED.thumbnail_url,
          shared_by = COALESCE(public_projects.shared_by, EXCLUDED.shared_by),
          updated_at = now()
        RETURNING *
      `;
      return row!;
    },

    /**
     * Toggle the `featured` flag on a public project. Admin-only at the
     * route layer; this query intentionally has no permission checks.
     */
    async setFeatured(
      projectId: string,
      featured: boolean
    ): Promise<PublicProjectRow | undefined> {
      const [row] = await sql<PublicProjectRow[]>`
        UPDATE public_projects
        SET featured = ${featured},
            featured_at = CASE WHEN ${featured} THEN COALESCE(featured_at, now()) ELSE NULL END,
            updated_at = now()
        WHERE project_id = ${projectId}
        RETURNING *
      `;
      return row;
    },

    /**
     * List projects the user has shared. Used by the dashboard to badge
     * projects with their share state without N+1 lookups.
     */
    async listMySharedProjectIds(userId: string): Promise<Set<string>> {
      const rows = await sql<{ project_id: string }[]>`
        SELECT pp.project_id
        FROM public_projects pp
        INNER JOIN projects p ON p.id = pp.project_id
        INNER JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
        WHERE wm.user_id = ${userId}
      `;
      return new Set(rows.map((r) => r.project_id));
    },

    /**
     * Record a remix (fork) of a public project.
     */
    async createRemix(data: {
      sourceProjectId: string;
      forkedProjectId: string;
      forkedBy: string;
    }): Promise<ProjectRemixRow> {
      const [row] = await sql<ProjectRemixRow[]>`
        INSERT INTO project_remixes (source_project_id, forked_project_id, forked_by)
        VALUES (${data.sourceProjectId}, ${data.forkedProjectId}, ${data.forkedBy})
        RETURNING *
      `;

      // Increment remix count on the public project
      await sql`
        UPDATE public_projects
        SET remix_count = remix_count + 1
        WHERE project_id = ${data.sourceProjectId}
      `;

      return row!;
    },

    /**
     * Increment the view count for a public project.
     */
    async incrementViewCount(projectId: string): Promise<void> {
      await sql`
        UPDATE public_projects
        SET view_count = view_count + 1
        WHERE project_id = ${projectId}
      `;
    },

    /**
     * List all unique categories from public projects.
     */
    async listCategories(): Promise<string[]> {
      const rows = await sql<{ category: string }[]>`
        SELECT DISTINCT category FROM public_projects
        WHERE category IS NOT NULL
        ORDER BY category ASC
      `;
      return rows.map((r) => r.category);
    },

    /**
     * Unpublish a project (remove from community).
     */
    async unpublishProject(projectId: string): Promise<void> {
      await sql`
        DELETE FROM public_projects
        WHERE project_id = ${projectId}
      `;
    },
  };
}
