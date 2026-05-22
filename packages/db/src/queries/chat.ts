import type postgres from "postgres";
import type { AiSessionRow, AiMessageRow } from "../types.js";
import type { AiSessionMode, AiMessageRole } from "@doable/shared";
import {
  selectMessageContent,
  messageContentColumnAndValue,
} from "./ai-messages-encryption.js";

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
      // Encryption-aware insert: write to either `content` (plaintext) or
      // `encrypted_content` (pgp_sym_encrypt) based on
      // DOABLE_ENCRYPT_AI_MESSAGES. Read paths transparently decrypt via
      // `selectMessageContent()`, so downstream code keeps reading
      // `row.content`.
      const { column, value } = messageContentColumnAndValue(sql, data.content);
      const [message] = await sql<AiMessageRow[]>`
        INSERT INTO ai_messages (session_id, role, ${sql(column)}, tool_calls, suggestions, tool_actions)
        VALUES (
          ${data.sessionId},
          ${data.role},
          ${value},
          ${data.toolCalls ? sql.json(data.toolCalls as postgres.JSONValue) : null},
          ${data.suggestions ? sql.json(data.suggestions) : null},
          ${data.toolActions ? sql.json(data.toolActions as postgres.JSONValue) : null}
        )
        RETURNING
          id, session_id, role,
          ${selectMessageContent(sql)} AS content,
          tool_calls, suggestions, tool_actions,
          sent_by_user_id, display_name, user_color, created_at,
          version_sha, had_tool_calls, thinking_content
      `;
      return message!;
    },

    async getMessages(sessionId: string): Promise<AiMessageRow[]> {
      return sql<AiMessageRow[]>`
        SELECT
          id, session_id, role,
          ${selectMessageContent(sql)} AS content,
          tool_calls, suggestions, tool_actions,
          sent_by_user_id, display_name, user_color, created_at,
          version_sha, had_tool_calls, thinking_content
        FROM ai_messages
        WHERE session_id = ${sessionId}
        ORDER BY created_at ASC
      `;
    },

    async getMessagesByProject(projectId: string): Promise<AiMessageRow[]> {
      return sql<AiMessageRow[]>`
        SELECT
          m.id, m.session_id, m.role,
          ${selectMessageContent(sql)} AS content,
          m.tool_calls, m.suggestions, m.tool_actions,
          m.sent_by_user_id, m.display_name, m.user_color, m.created_at,
          m.version_sha, m.had_tool_calls, m.thinking_content
        FROM ai_messages m
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
