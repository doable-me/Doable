import type postgres from "postgres";
import type { ProjectStarRow } from "../types.js";

export function starQueries(sql: postgres.Sql) {
  return {
    async toggle(userId: string, projectId: string): Promise<boolean> {
      const [existing] = await sql<ProjectStarRow[]>`
        SELECT * FROM project_stars
        WHERE user_id = ${userId} AND project_id = ${projectId}
      `;

      if (existing) {
        await sql`
          DELETE FROM project_stars
          WHERE user_id = ${userId} AND project_id = ${projectId}
        `;
        return false;
      }

      await sql`
        INSERT INTO project_stars (user_id, project_id)
        VALUES (${userId}, ${projectId})
      `;
      return true;
    },

    async isStarred(userId: string, projectId: string): Promise<boolean> {
      const [row] = await sql<ProjectStarRow[]>`
        SELECT * FROM project_stars
        WHERE user_id = ${userId} AND project_id = ${projectId}
      `;
      return !!row;
    },

    async listStarredProjectIds(userId: string): Promise<string[]> {
      const rows = await sql<{ project_id: string }[]>`
        SELECT project_id FROM project_stars
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;
      return rows.map((r) => r.project_id);
    },
  };
}
