/**
 * Message persistence: saving user messages, pre-inserting assistant
 * message rows, and final assistant message updates.
 */
import { sql } from "../../db/index.js";
import { buildToolActionsFromCalls } from "../../ai/tool-messages.js";

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
): Promise<void> {
  try {
    await sql`
      INSERT INTO ai_messages (session_id, role, content, sent_by_user_id, display_name, user_color)
      VALUES (${dbSessionId}, 'user', ${content}, ${userId}, ${displayName}, ${color})
    `;
  } catch (e) {
    console.warn("[Chat] Failed to save user message:", e);
  }
}

/** Pre-insert an empty assistant message row. Returns the message ID. */
export async function preInsertAssistantMessage(dbSessionId: string): Promise<string | undefined> {
  try {
    const [row] = await sql`
      INSERT INTO ai_messages (session_id, role, content)
      VALUES (${dbSessionId}, 'assistant', '')
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

  if (assistantContent || hadToolCalls) {
    try {
      const toolActionsJson = assistantToolCalls.length > 0
        ? sql.json(buildToolActionsFromCalls(assistantToolCalls, assistantMessageId) as any)
        : sql.json([]);
      await sql`
        UPDATE ai_messages
        SET content = ${assistantContent || null},
            tool_calls = ${assistantToolCalls.length > 0 ? sql.json(assistantToolCalls as any) : sql.json([])},
            tool_actions = ${toolActionsJson},
            version_sha = ${versionSha ?? null},
            had_tool_calls = ${hadToolCalls},
            thinking_content = ${assistantThinking || null}
        WHERE id = ${assistantMessageId}
      `;
    } catch (e) {
      console.warn("[Chat] Failed to save assistant message:", e);
    }
  } else {
    sql`DELETE FROM ai_messages WHERE id = ${assistantMessageId}`.catch(() => {});
  }
}
