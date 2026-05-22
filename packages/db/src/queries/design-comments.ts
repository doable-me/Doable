import type postgres from "postgres";

export interface DesignCommentRow {
  id: string;
  project_id: string;
  user_id: string;
  display_name: string | null;
  user_color: string | null;
  x_percent: number;
  y_percent: number;
  selector: string | null;
  page_path: string;
  content: string;
  parent_id: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function designCommentQueries(sql: postgres.Sql) {
  return {
    async create(data: {
      id: string;
      projectId: string;
      userId: string;
      displayName: string | null;
      userColor: string | null;
      xPercent: number;
      yPercent: number;
      selector: string | null;
      pagePath: string;
      content: string;
      parentId: string | null;
    }): Promise<DesignCommentRow> {
      const [row] = await sql<DesignCommentRow[]>`
        INSERT INTO design_comments (id, project_id, user_id, display_name, user_color, x_percent, y_percent, selector, page_path, content, parent_id)
        VALUES (
          ${data.id},
          ${data.projectId},
          ${data.userId},
          ${data.displayName},
          ${data.userColor},
          ${data.xPercent},
          ${data.yPercent},
          ${data.selector},
          ${data.pagePath},
          ${data.content},
          ${data.parentId}
        )
        RETURNING *
      `;
      return row!;
    },

    async listByProject(projectId: string, pagePath?: string): Promise<DesignCommentRow[]> {
      if (pagePath) {
        return sql<DesignCommentRow[]>`
          SELECT * FROM design_comments
          WHERE project_id = ${projectId} AND page_path = ${pagePath}
          ORDER BY created_at ASC
        `;
      }
      return sql<DesignCommentRow[]>`
        SELECT * FROM design_comments
        WHERE project_id = ${projectId}
        ORDER BY created_at ASC
      `;
    },

    async resolve(id: string, resolvedBy: string): Promise<DesignCommentRow | null> {
      const [row] = await sql<DesignCommentRow[]>`
        UPDATE design_comments
        SET resolved = true, resolved_by = ${resolvedBy}, resolved_at = now(), updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },

    async unresolve(id: string): Promise<DesignCommentRow | null> {
      const [row] = await sql<DesignCommentRow[]>`
        UPDATE design_comments
        SET resolved = false, resolved_by = NULL, resolved_at = NULL, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },

    async deleteComment(id: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM design_comments WHERE id = ${id}
      `;
      return result.count > 0;
    },

    async updateContent(id: string, content: string): Promise<DesignCommentRow | null> {
      const [row] = await sql<DesignCommentRow[]>`
        UPDATE design_comments
        SET content = ${content}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },
  };
}
