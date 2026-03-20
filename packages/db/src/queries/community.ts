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
     * Publish a project to the community.
     */
    async publishProject(data: {
      projectId: string;
      title: string;
      description?: string;
      category?: string;
      thumbnailUrl?: string;
    }): Promise<PublicProjectRow> {
      const [row] = await sql<PublicProjectRow[]>`
        INSERT INTO public_projects (project_id, title, description, category, thumbnail_url)
        VALUES (
          ${data.projectId},
          ${data.title},
          ${data.description ?? null},
          ${data.category ?? null},
          ${data.thumbnailUrl ?? null}
        )
        ON CONFLICT (project_id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          thumbnail_url = EXCLUDED.thumbnail_url
        RETURNING *
      `;
      return row!;
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
