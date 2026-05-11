/**
 * App-layer encryption for ai_messages.content.
 * Operator-toggleable via DOABLE_ENCRYPT_AI_MESSAGES=1.
 *
 * When the env var is set, write paths populate `encrypted_content` (via
 * pgp_sym_encrypt) and leave `content` NULL; read paths use the SQL
 * snippet from `selectMessageContent()` to transparently decrypt at the
 * DB layer regardless of which column the row uses.
 *
 * Schema invariant (enforced by migration 072_ai_messages_encryption.sql):
 *   exactly ONE of (content, encrypted_content) is non-null per row.
 */

import type postgres from "postgres";
import { getEncryptionKey } from "../secrets.js";

const ENCRYPTION_KEY = getEncryptionKey();

/** Whether app-layer encryption of ai_messages.content is currently enabled. */
export function isMessageEncryptionEnabled(): boolean {
  return process.env.DOABLE_ENCRYPT_AI_MESSAGES === "1";
}

/**
 * SELECT fragment that returns the plaintext content regardless of which
 * column it lives in. Embed inside a tagged template, e.g.:
 *
 *   const rows = await sql`
 *     SELECT id, ${selectMessageContent(sql)} AS content
 *     FROM ai_messages WHERE session_id = ${sessionId}
 *   `;
 *
 * Tolerant: pgp_sym_decrypt is only invoked on rows where
 * encrypted_content IS NOT NULL, so plaintext-only rows are unaffected.
 */
export function selectMessageContent(
  sql: postgres.Sql,
): postgres.PendingQuery<postgres.Row[]> {
  return sql`COALESCE(content, pgp_sym_decrypt(encrypted_content::bytea, ${ENCRYPTION_KEY}))`;
}

/**
 * INSERT/UPDATE column + value pair to use when writing message content.
 *
 * Usage in an INSERT:
 *   const { column, value } = messageContentColumnAndValue(sql, plaintext);
 *   await sql`
 *     INSERT INTO ai_messages (session_id, role, ${sql(column)})
 *     VALUES (${sessionId}, ${role}, ${value})
 *   `;
 *
 * The returned `column` is one of the literal strings 'content' or
 * 'encrypted_content', safe to interpolate via sql() identifier-quoting.
 * The `value` is a fragment that either binds the plaintext directly or
 * wraps it in pgp_sym_encrypt(...).
 */
export function messageContentColumnAndValue(
  sql: postgres.Sql,
  plaintext: string | null,
): {
  column: "content" | "encrypted_content";
  value: postgres.PendingQuery<postgres.Row[]>;
} {
  // NULL plaintext is only valid for non-content roles (e.g. tool messages
  // where the body lives in tool_calls). Emit a NULL into the chosen column;
  // callers must ensure the *other* column carries a value or the XOR check
  // will reject the row.
  if (plaintext === null) {
    return {
      column: isMessageEncryptionEnabled() ? "encrypted_content" : "content",
      value: sql`${null}`,
    };
  }

  if (isMessageEncryptionEnabled()) {
    return {
      column: "encrypted_content",
      value: sql`pgp_sym_encrypt(${plaintext}, ${ENCRYPTION_KEY})`,
    };
  }
  return {
    column: "content",
    value: sql`${plaintext}`,
  };
}
