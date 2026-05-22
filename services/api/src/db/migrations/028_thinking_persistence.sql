-- 028_thinking_persistence.sql
-- Persist AI reasoning/thinking content alongside assistant messages
-- so users can review thinking after page reload.

ALTER TABLE ai_messages
    ADD COLUMN IF NOT EXISTS thinking_content text;
