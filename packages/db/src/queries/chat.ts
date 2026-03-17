import type postgres from "postgres";
import type { AiSessionRow, AiMessageRow } from "../types.js";
import type { AiSessionMode, AiMessageRole } from "@doable/shared";

export function chatQueries(sql: postgres.Sql) {
  return {
    async findOrCreateSession(
      projectId: string,
      userId: string,
      mode: AiSessionMode = "chat"
    ): Promise<AiSessionRow> {
      const [existing] = await sql<AiSessionRow[]>`
        SELECT * FROM ai_sessions
        WHERE project_id = ${projectId}
          AND user_id = ${userId}
          AND mode = ${mode}
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      if (existing) return existing;

      const [session] = await sql<AiSessionRow[]>`
        INSERT INTO ai_sessions (project_id, user_id, mode)
        VALUES (${projectId}, ${userId}, ${mode})
        RETURNING *
      `;
      return session!;
    },

    async findSessionByProject(
      projectId: string
    ): Promise<AiSessionRow | undefined> {
      const [session] = await sql<AiSessionRow[]>`
        SELECT * FROM ai_sessions
        WHERE project_id = ${projectId}
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      return session;
    },

    async saveMessage(data: {
      sessionId: string;
      role: AiMessageRole;
      content: string | null;
      toolCalls?: Record<string, unknown>[] | null;
      suggestions?: string[] | null;
      toolActions?: Record<string, unknown>[] | null;
    }): Promise<AiMessageRow> {
      const [message] = await sql<AiMessageRow[]>`
        INSERT INTO ai_messages (session_id, role, content, tool_calls, suggestions, tool_actions)
        VALUES (
          ${data.sessionId},
          ${data.role},
          ${data.content},
          ${data.toolCalls ? sql.json(data.toolCalls) : null},
          ${data.suggestions ? sql.json(data.suggestions) : null},
          ${data.toolActions ? sql.json(data.toolActions) : null}
        )
        RETURNING *
      `;
      return message!;
    },

    async getMessages(sessionId: string): Promise<AiMessageRow[]> {
      return sql<AiMessageRow[]>`
        SELECT * FROM ai_messages
        WHERE session_id = ${sessionId}
        ORDER BY created_at ASC
      `;
    },

    async getMessagesByProject(projectId: string): Promise<AiMessageRow[]> {
      return sql<AiMessageRow[]>`
        SELECT m.* FROM ai_messages m
        INNER JOIN ai_sessions s ON s.id = m.session_id
        WHERE s.id = (
          SELECT id FROM ai_sessions
          WHERE project_id = ${projectId}
          ORDER BY updated_at DESC
          LIMIT 1
        )
        ORDER BY m.created_at ASC
      `;
    },

    async deleteSessionMessages(sessionId: string): Promise<void> {
      await sql`
        DELETE FROM ai_messages WHERE session_id = ${sessionId}
      `;
    },

    async updateMessageSuggestions(
      messageId: string,
      suggestions: string[]
    ): Promise<AiMessageRow | undefined> {
      const [message] = await sql<AiMessageRow[]>`
        UPDATE ai_messages
        SET suggestions = ${sql.json(suggestions)}
        WHERE id = ${messageId}
        RETURNING *
      `;
      return message;
    },
  };
}
