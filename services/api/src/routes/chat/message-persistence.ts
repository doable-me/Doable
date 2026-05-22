/**
 * Message persistence: saving user messages, pre-inserting assistant
 * message rows, and final assistant message updates.
 *
 * All `ai_messages.content` writes go through
 * `messageContentColumnAndValue()` so the row lands in either `content`
 * (plaintext, default) or `encrypted_content` (pgp_sym_encrypt) based on
 * `DOABLE_ENCRYPT_AI_MESSAGES`. The XOR check from migration 072
 * requires exactly one of those columns to be non-null per row.
 */
import { sql } from "../../db/index.js";
import { buildToolActionsFromCalls } from "../../ai/tool-messages.js";
import { messageContentColumnAndValue } from "@doable/db";

/** Resolve user display info (name + deterministic color). */
export async function resolveUserDisplay(userId: string): Promise<{ displayName: string; color: string }> {
  let displayName = "";
  try {
    const [userRow] = await sql`SELECT display_name FROM users WHERE id = ${userId}`;
    displayName = userRow?.display_name ?? "";
  } catch { /* ignore */ }

  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  const colors = [
    "#E57373","#F06292","#BA68C8","#9575CD","#7986CB","#64B5F6","#4FC3F7",
    "#4DD0E1","#4DB6AC","#81C784","#AED581","#FFD54F","#FFB74D","#FF8A65",
    "#A1887F","#90A4AE",
  ];
  const color = colors[Math.abs(hash) % colors.length]!;

  return { displayName, color };
}

/** Save the user message to the database. */
export async function saveUserMessage(
  dbSessionId: string,
  content: string,
  userId: string,
  displayName: string,
  color: string,
  attachments?: ReadonlyArray<{ type: string; name: string; mimeType?: string; fileType?: string; size?: number }>,
): Promise<void> {
  try {
    const { column, value } = messageContentColumnAndValue(sql, content);
    // Store only lightweight attachment descriptors (no base64 data). The AI
    // consumes the full payload at /chat-POST time; history only needs enough
    // to re-render the chip on reload.
    const lightweight = (attachments ?? []).map((a) => ({
      type: a.type,
      name: a.name,
      ...(a.mimeType ? { mimeType: a.mimeType } : {}),
      ...(a.fileType ? { fileType: a.fileType } : {}),
      ...(typeof a.size === "number" ? { size: a.size } : {}),
    }));
    await sql`
      INSERT INTO ai_messages (session_id, role, ${sql(column)}, sent_by_user_id, display_name, user_color, attachments)
      VALUES (${dbSessionId}, 'user', ${value}, ${userId}, ${displayName}, ${color}, ${sql.json(lightweight as any)})
    `;
  } catch (e) {
    console.warn("[Chat] Failed to save user message:", e);
  }
}

/** Pre-insert an empty assistant message row. Returns the message ID. */
export async function preInsertAssistantMessage(dbSessionId: string): Promise<string | undefined> {
  try {
    // Empty string (not NULL) — the XOR check requires exactly one of
    // (content, encrypted_content) to be non-null. Empty plaintext is
    // a valid value; encrypting an empty string still yields a non-null
    // ciphertext. The row is updated with real content in
    // finalSaveAssistantMessage().
    const { column, value } = messageContentColumnAndValue(sql, "");
    const [row] = await sql`
      INSERT INTO ai_messages (session_id, role, ${sql(column)})
      VALUES (${dbSessionId}, 'assistant', ${value})
      RETURNING id
    `;
    return row?.id;
  } catch {
    return undefined;
  }
}

/** Final save/update of assistant message after streaming completes. */
export async function finalSaveAssistantMessage(
  assistantMessageId: string | undefined,
  assistantContent: string,
  hadToolCalls: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assistantToolCalls: any[],
  versionSha: string | undefined,
  assistantThinking: string,
): Promise<void> {
  if (!assistantMessageId) return;

  // ALWAYS UPDATE the placeholder row — never DELETE it. Prior behaviour
  // was to delete when content + hadToolCalls were both empty, which left
  // the chat history blank on reload for agent-loop runs where the model
  // streamed all visible reasoning through the leading-text-buffer
  // (kept-as-thinking by design) and emitted no plain-text assistant
  // turn before the run completed. Reload now reliably surfaces whatever
  // the stream produced — text, thinking, or tool actions — instead of
  // silently dropping the message and showing nothing.
  try {
    const toolActionsJson = assistantToolCalls.length > 0
      ? sql.json(buildToolActionsFromCalls(assistantToolCalls, assistantMessageId) as any)
      : sql.json([]);
    // Encryption-aware UPDATE: write the right column for the current
    // toggle state and NULL the other so the XOR check (migration 072)
    // is always satisfied. We pass empty string (not null) when there
    // was no text but tool calls happened — matches the pre-insert
    // semantics and keeps exactly one side non-null.
    const plaintext = assistantContent || "";
    const { column, value } = messageContentColumnAndValue(sql, plaintext);
    const otherColumn = column === "content" ? "encrypted_content" : "content";
    await sql`
      UPDATE ai_messages
      SET ${sql(column)} = ${value},
          ${sql(otherColumn)} = ${null},
          tool_calls = ${assistantToolCalls.length > 0 ? sql.json(assistantToolCalls as any) : sql.json([])},
          tool_actions = ${toolActionsJson},
          version_sha = ${versionSha ?? null},
          had_tool_calls = ${hadToolCalls || assistantToolCalls.length > 0},
          thinking_content = ${assistantThinking || null}
      WHERE id = ${assistantMessageId}
    `;
  } catch (e) {
    console.warn("[Chat] Failed to save assistant message:", e);
  }
}
