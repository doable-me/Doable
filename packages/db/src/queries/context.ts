import type postgres from "postgres";

// ─── Row Types ────────────────────────────────────────────

export interface WorkspaceContextFileRow {
  id: string;
  workspace_id: string;
  filename: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserContextFileRow {
  id: string;
  user_id: string;
  workspace_id: string;
  filename: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

// ─── Queries ──────────────────────────────────────────────

export function contextQueries(sql: postgres.Sql) {
  return {
    // ── Workspace context ──
    async listWorkspaceContext(workspaceId: string) {
      return sql<WorkspaceContextFileRow[]>`
        SELECT * FROM workspace_context_files
        WHERE workspace_id = ${workspaceId}
        ORDER BY filename
      `;
    },

    async getWorkspaceContextFile(workspaceId: string, filename: string) {
      const [row] = await sql<WorkspaceContextFileRow[]>`
        SELECT * FROM workspace_context_files
        WHERE workspace_id = ${workspaceId} AND filename = ${filename}
      `;
      return row ?? null;
    },

    async upsertWorkspaceContext(workspaceId: string, filename: string, content: string) {
      const [row] = await sql<WorkspaceContextFileRow[]>`
        INSERT INTO workspace_context_files (workspace_id, filename, content)
        VALUES (${workspaceId}, ${filename}, ${content})
        ON CONFLICT (workspace_id, filename)
        DO UPDATE SET content = ${content}, updated_at = now()
        RETURNING *
      `;
      return row!;
    },

    async deleteWorkspaceContext(workspaceId: string, filename: string) {
      const result = await sql`
        DELETE FROM workspace_context_files
        WHERE workspace_id = ${workspaceId} AND filename = ${filename}
      `;
      return result.count > 0;
    },

    // ── User context ──
    async listUserContext(userId: string, workspaceId: string) {
      return sql<UserContextFileRow[]>`
        SELECT * FROM user_context_files
        WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
        ORDER BY filename
      `;
    },

    async getUserContextFile(userId: string, workspaceId: string, filename: string) {
      const [row] = await sql<UserContextFileRow[]>`
        SELECT * FROM user_context_files
        WHERE user_id = ${userId} AND workspace_id = ${workspaceId} AND filename = ${filename}
      `;
      return row ?? null;
    },

    async upsertUserContext(userId: string, workspaceId: string, filename: string, content: string) {
      const [row] = await sql<UserContextFileRow[]>`
        INSERT INTO user_context_files (user_id, workspace_id, filename, content)
        VALUES (${userId}, ${workspaceId}, ${filename}, ${content})
        ON CONFLICT (user_id, workspace_id, filename)
        DO UPDATE SET content = ${content}, updated_at = now()
        RETURNING *
      `;
      return row!;
    },

    async deleteUserContext(userId: string, workspaceId: string, filename: string) {
      const result = await sql`
        DELETE FROM user_context_files
        WHERE user_id = ${userId} AND workspace_id = ${workspaceId} AND filename = ${filename}
      `;
      return result.count > 0;
    },
  };
}
