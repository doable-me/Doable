import type postgres from "postgres";

export interface TeamMessageRow {
  id: string;
  project_id: string;
  user_id: string;
  display_name: string | null;
  content: string;
  message_type: string;
  mentions: string[];
  parent_id: string | null;
  created_at: Date;
}

export function teamChatQueries(sql: postgres.Sql) {
  return {
    async saveMessage(data: {
      id: string;
      projectId: string;
      userId: string;
      displayName: string | null;
      content: string;
      messageType?: string;
      mentions?: string[];
      parentId?: string | null;
    }): Promise<TeamMessageRow> {
      const [row] = await sql<TeamMessageRow[]>`
        INSERT INTO team_messages (id, project_id, user_id, display_name, content, message_type, mentions, parent_id)
        VALUES (
          ${data.id},
          ${data.projectId},
          ${data.userId},
          ${data.displayName},
          ${data.content},
          ${data.messageType ?? "user"},
          ${sql.array(data.mentions ?? [])},
          ${data.parentId ?? null}
        )
        RETURNING *
      `;
      return row!;
    },

    async getHistory(projectId: string, limit: number = 50): Promise<TeamMessageRow[]> {
      return sql<TeamMessageRow[]>`
        SELECT * FROM team_messages
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `.then(rows => rows.reverse());
    },
  };
}
