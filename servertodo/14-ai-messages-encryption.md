# 14 — ai_messages app-layer encryption (operator-toggleable)

## Why

`ai_messages.content` is the largest plaintext PII surface in Doable's
database: every chat turn between the user and the AI is persisted as raw
text. PostgreSQL's filesystem-level encryption (LUKS, dm-crypt) protects
data at rest from someone walking off with a disk, but does nothing
against a logical SQL dump (`pg_dump`), a compromised replica, or a
ransacked backup tarball. Migration 072 + this wiring add column-level
encryption using `pgcrypto.pgp_sym_encrypt`, gated behind a single env
var so installs that don't need it pay zero overhead.

## How to enable

1. Set `DOABLE_ENCRYPT_AI_MESSAGES=1` in `/opt/doable/.env`.
2. Make sure `ENCRYPTION_KEY` in the same file is a long random secret —
   the encryption key is shared with other app-layer crypto (provider
   tokens, etc.), so don't rotate it casually.
3. Restart the API: `systemctl restart doable.service`.

That's it. New chat messages will land in `ai_messages.encrypted_content`
(with `content` NULL); read paths transparently decrypt at the DB layer
via the SQL helper `selectMessageContent(sql)`.

## How to disable

Flip `DOABLE_ENCRYPT_AI_MESSAGES=0` and restart. New writes go back to
plaintext `content`. Previously-encrypted rows remain readable because
the read helper uses `COALESCE(content, pgp_sym_decrypt(encrypted_content, key))`.

## Behavior — forward-only

- Existing rows: untouched. `content` stays plaintext, `encrypted_content`
  stays NULL.
- New rows after enable: `content` NULL, `encrypted_content` populated.
- New rows after disable: `content` plaintext, `encrypted_content` NULL.
- The `ai_messages_content_xor_encrypted` CHECK constraint enforces
  exactly ONE of the two columns is non-null per row.

## Coverage

Wired as of 2026-05-09 (commit pending):

- `packages/db/src/queries/chat.ts` — `saveMessage` (write),
  `getMessages` (read), `getMessagesByProject` (read).
- `services/api/src/routes/chat/misc-routes.ts` — `/chat/history` reads
  (returnAll, cursor-based pagination, before-cursor branch).
- `services/api/src/routes/chat/message-persistence.ts` —
  `saveUserMessage`, `preInsertAssistantMessage`,
  `finalSaveAssistantMessage` all route writes through
  `messageContentColumnAndValue()`. The final UPDATE explicitly NULLs
  the inactive column to keep the XOR check happy on toggle changes
  mid-session.
- `services/api/src/routes/chat/event-processor.ts` — the per-chunk
  incremental `UPDATE ai_messages SET content = ...` is gated on
  `!isMessageEncryptionEnabled()`. With encryption on, the streaming
  buffer is held in memory (`state.assistantContent`) and persisted
  once at finalize time via `finalSaveAssistantMessage`. Trade-off: a
  mid-stream API crash loses the partial transcript when encryption
  is on (same as today's behavior before the first 500-char flush).
- `services/api/src/admin/audit-routes.ts` and
  `services/api/src/routes/admin-ops.ts` — admin-side reads now use
  `${selectMessageContent(sql)} AS content`, including the ILIKE
  search predicates. ILIKE on encrypted rows still won't match (see
  trade-offs below), but plaintext rows are unaffected and the
  transcript/excerpt fields decrypt transparently.

The toggle is now production-safe across all read+write sites.

## Verification

```sql
-- After enabling, send a chat turn and verify the new row landed in
-- the encrypted column:
SELECT
  COUNT(*) FILTER (WHERE content IS NOT NULL)            AS plaintext_rows,
  COUNT(*) FILTER (WHERE encrypted_content IS NOT NULL)  AS encrypted_rows,
  COUNT(*)                                               AS total
FROM ai_messages;

-- Confirm the read helper works (should return decrypted content for
-- both legacy and new rows):
SELECT id, role,
       COALESCE(content, pgp_sym_decrypt(encrypted_content::bytea,
                                         current_setting('app.enc_key', true))) AS content
FROM ai_messages
ORDER BY created_at DESC
LIMIT 5;
```

(The app passes `ENCRYPTION_KEY` per-query rather than via
`current_setting`, so substitute your actual key when running the
diagnostic above.)

## Trade-offs

- **No server-side full-text search on encrypted rows.** The trigram
  GIN index on `content` from migration 059 only matches plaintext.
  Admin search will only find rows written before enabling, or rows
  written while disabled.
- **Slight write overhead.** `pgp_sym_encrypt` is non-trivial CPU per
  insert (~milliseconds for typical chat-sized payloads). Negligible at
  ~100-user scale; measure if you scale higher.
- **Key loss = data loss.** If `ENCRYPTION_KEY` rotates or is lost,
  encrypted rows are unrecoverable. Same property applies to other
  app-layer encrypted fields (provider tokens) — back up the key.

## Backfill (future work)

A separate script (e.g. `setup-v3/encrypt-existing-ai-messages.sh`)
will be needed if operators want to encrypt-at-rest the historical
plaintext rows. Sketch:

```sql
UPDATE ai_messages
   SET encrypted_content = pgp_sym_encrypt(content, $1),
       content = NULL
 WHERE content IS NOT NULL;
```

Run in a transaction with vacuum afterward; on a large table consider
batching by `created_at` range. Out of scope for this commit.
