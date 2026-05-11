-- 072_ai_messages_encryption.sql
-- Add an optional encrypted_content column to ai_messages so operators
-- can opt into app-layer encryption of chat content via DOABLE_ENCRYPT_AI_MESSAGES=1.
-- When set, write paths use pgp_sym_encrypt(content, ENCRYPTION_KEY)
-- and read paths decrypt. Existing rows keep their plaintext content
-- column populated; encryption is forward-only (set new env on, encrypt
-- new messages; existing data unchanged unless a backfill is run later).
--
-- Schema rule:
--   exactly ONE of (content, encrypted_content) must be non-null per row.
--
-- Out of scope here: backfill of existing rows. That's a separate operator-run
-- script (could be `setup-v3/encrypt-existing-ai-messages.sh` later).

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS encrypted_content text;

-- Lift the NOT NULL constraint on content if it exists, since encrypted rows
-- will have content=NULL and encrypted_content set.
ALTER TABLE ai_messages
  ALTER COLUMN content DROP NOT NULL;

-- Backfill any legacy rows where BOTH content and encrypted_content are
-- NULL. A handful of `assistant` rows from before the column existed land
-- in this state (aborted/empty streams that persisted a placeholder row
-- with content=NULL). Setting content='' keeps them queryable and lets
-- the XOR CHECK constraint below apply without rejecting existing data.
-- Idempotent: a re-run finds no matching rows once content='' has been set.
UPDATE ai_messages
   SET content = ''
 WHERE content IS NULL
   AND encrypted_content IS NULL;

-- Add a CHECK constraint enforcing that exactly one of the two is set.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'ai_messages'
      AND constraint_name = 'ai_messages_content_xor_encrypted'
  ) THEN
    ALTER TABLE ai_messages
      ADD CONSTRAINT ai_messages_content_xor_encrypted
      CHECK ((content IS NOT NULL) <> (encrypted_content IS NOT NULL));
  END IF;
END $$;
