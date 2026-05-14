-- 077_ai_messages_attachments.sql
-- Persist attachment metadata on user messages so /chat/history can rebuild
-- the chip UI after reload. The actual base64 data is NOT stored here — only
-- the lightweight descriptor {type, name, mimeType, fileType, size}. The AI
-- consumes attachments at /chat-POST time via processAttachments(), so the
-- full data lives only in the request body and never needs to be re-served.

ALTER TABLE ai_messages
    ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
