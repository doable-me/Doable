-- ─── Chat Trace / Observability ────────────────────────────
-- Full per-turn trace of every SDK event, tool call, LLM thinking,
-- LLM response, with timestamps and durations. Zero information loss.
--
-- Each row = one user message → AI response cycle (a "turn").
-- The `events` JSONB array contains every event in order with timestamps.

CREATE TABLE IF NOT EXISTS chat_traces (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id      text,                -- Copilot SDK session ID
    message_id      uuid,                -- Links to ai_messages.id
    user_id         uuid NOT NULL,
    workspace_id    uuid NOT NULL,

    -- Timing
    turn_started_at timestamptz NOT NULL,
    turn_ended_at   timestamptz,
    duration_ms     int,                 -- total wall-clock time for this turn
    ttft_ms         int,                 -- time to first token (first text_delta)

    -- Summary counters (denormalized for fast queries)
    tool_call_count     int NOT NULL DEFAULT 0,
    auto_continue_count int NOT NULL DEFAULT 0,
    thinking_chars      int NOT NULL DEFAULT 0,
    response_chars      int NOT NULL DEFAULT 0,
    prompt_tokens       int,
    completion_tokens   int,
    thinking_tokens     int,
    total_tokens        int,
    estimated_cost_usd  numeric(10,6),
    model               text,

    -- The full trace: ordered array of every event
    -- Each element: { ts, elapsed_ms, type, data }
    -- Types: "user_message", "sdk_event", "tool_start", "tool_end",
    --        "text_delta", "thinking_delta", "auto_continue",
    --        "sse_emit", "error", "done"
    events          jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Status: "streaming", "completed", "error", "aborted", "stalled"
    status          text NOT NULL DEFAULT 'streaming',
    error_message   text,

    -- Provider info
    provider        text,
    provider_label  text,

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_traces_project ON chat_traces (project_id, created_at DESC);
CREATE INDEX idx_chat_traces_session ON chat_traces (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_chat_traces_user    ON chat_traces (user_id, created_at DESC);
CREATE INDEX idx_chat_traces_status  ON chat_traces (status) WHERE status != 'completed';
