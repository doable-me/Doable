# TC-AI-CHAT-HISTORY-PERSIST — Chat history persistence, session_id integrity, pagination

API endpoint: `POST https://${ENV}-api.doable.me/projects/{id}/chat`
             `GET  https://${ENV}-api.doable.me/projects/{id}/chat/history`
             `GET  https://${ENV}-api.doable.me/projects/{id}/traces`
Source: `services/api/src/routes/chat/send-handler.ts`
        `services/api/src/routes/chat/history.ts`
        `services/api/src/ai/trace-infra.ts`
Related bug: `testcases/bugs/BUG-R11-PDF-ATTACHMENT-IGNORED-001.md` (root causes #2 + #3)

Verifies that every completed chat turn is durably persisted to chat history, that the trace
row carries a non-empty session_id, and that pagination over multi-turn history works correctly.
Motivated by the R11 finding that `GET /chat/history` returned `{"data":[],"hasMore":false}`
immediately after a completed 45-second AI turn, and that the trace row held `session_id: ""`.

---

## TC-AI-CHAT-HISTORY-001 — Smoke: single turn appears in history

**Severity:** smoke (gates the suite)

**Preconditions:**
1. Authenticated platform admin.
2. Fresh project created via `POST /projects`.

**Steps:**
1. `POST /projects/{id}/chat` with a simple, fast prompt:
   ```json
   { "content": "Add a red button that says Hello", "mode": "agent" }
   ```
2. Stream SSE to `[DONE]`.
3. `GET /projects/{id}/chat/history`.

## Acceptance

- **Literal (display in report):** History response contains at least 2 messages: one with `role: "user"` and one with `role: "assistant"`.
- **Regex (applied to stringified JSON of history response body):**
  ```
  "role"\s*:\s*"user"[\s\S]{0,2000}"role"\s*:\s*"assistant"
  ```
- **Status assertion:** `GET /chat/history` returns HTTP 200; `response.data.length >= 2`.
- **DOM target:** n/a (API assertion only).

**Evolution log:**
- 2026-05-14 (R11): created after R11 found `data: []` in history response immediately after a completed AI turn (evidence: `testcases/evidence/dev/ai-pdf-r11/04-chat-history.json`).

---

## TC-AI-CHAT-HISTORY-002 — Smoke: attachment metadata preserved in history

**Severity:** smoke

**Preconditions:** fresh project; a real PDF (e.g. `srs_example_2010_group2.pdf`) available.

**Steps:**
1. `POST /projects/{id}/chat` with a prompt and a PDF attachment.
2. Stream SSE to `[DONE]`.
3. `GET /projects/{id}/chat/history`.
4. Find the user message in `response.data`; inspect its `attachments` field.

## Acceptance

- **Literal (display in report):** History non-empty; user message entry contains an `attachments` key with at least one item (name or type non-empty).
- **Regex (applied to stringified history JSON):**
  ```
  "role"\s*:\s*"user"[\s\S]{0,500}"attachments"\s*:\s*\[[\s\S]{1,}?\]
  ```
- **Field assertion:** `data[0].attachments` (or the user-role message's `attachments`) is an array with `length >= 1`; first item has `name` matching `\.pdf$` (case-insensitive).
- **DOM target:** n/a.

**Evolution log:**
- 2026-05-14 (R11): created to verify attachments round-trip through history, not just that the text turn is saved.

---

## TC-AI-CHAT-HISTORY-003 — High: trace session_id is a valid UUID

**Severity:** high

**Preconditions:** fresh project; any prompt.

**Steps:**
1. `POST /projects/{id}/chat` with a trivial prompt.
2. Stream SSE to `[DONE]`.
3. `GET /projects/{id}/traces?limit=1` (or the equivalent trace listing endpoint).
4. Inspect `response.data[0].session_id`.

## Acceptance

- **Literal (display in report):** The most recent trace row has a non-empty `session_id` that looks like a UUID.
- **Regex (applied to `session_id` field value):**
  ```
  ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
  ```
- **Negative assertion:** `session_id` must NOT be `""` (empty string) or `null` or `"null"`.
- **DOM target:** n/a (API assertion).

**Notes:** In R11 evidence the trace row had `session_id: ""`, which is why history was not surfaced.
The fix location is `services/api/src/routes/chat/send-handler.ts` (session_id population) or
`services/api/src/ai/trace-infra.ts` (trace recording).

**Evolution log:**
- 2026-05-14 (R11): created directly from R11 finding "trace row has `session_id: ""`".

---

## TC-AI-CHAT-HISTORY-004 — Medium: two sequential chats on same project appear in order

**Severity:** medium

**Preconditions:** fresh project.

**Steps:**
1. `POST /projects/{id}/chat` with prompt A (`"Add a blue header"`). Wait for `[DONE]`.
2. `POST /projects/{id}/chat` with prompt B (`"Now add a footer with the text Copyright 2024"`). Wait for `[DONE]`.
3. `GET /projects/{id}/chat/history`.
4. Collect all messages from `response.data`; sort by `created_at`.

## Acceptance

- **Literal (display in report):** History contains ≥ 4 messages (2 user + 2 assistant); messages are in monotonically increasing `created_at` order; the second user message text matches prompt B.
- **Regex (applied to stringified history body):**
  ```
  "role"\s*:\s*"user"[\s\S]{0,2000}"role"\s*:\s*"assistant"[\s\S]{0,5000}"role"\s*:\s*"user"[\s\S]{0,2000}"role"\s*:\s*"assistant"
  ```
- **Order assertion:** for every adjacent pair of messages, `messages[i].created_at <= messages[i+1].created_at`.
- **Count assertion:** `response.data.length >= 4`.
- **DOM target:** n/a.

**Evolution log:**
- 2026-05-14 (R11): created to ensure multi-turn ordering is stable, not just that turns are saved at all.

---

## TC-AI-CHAT-HISTORY-005 — Medium: history pagination (pageSize=1)

**Severity:** medium

**Preconditions:** project with at least 2 completed chat turns (run TC-AI-CHAT-HISTORY-004 first, or seed manually).

**Steps:**
1. `GET /projects/{id}/chat/history?pageSize=1`.
2. Assert `response.hasMore === true` and `response.data.length === 1`.
3. Extract the `nextCursor` (or equivalent pagination token) from the response.
4. `GET /projects/{id}/chat/history?pageSize=1&cursor={nextCursor}`.
5. Assert `response.data.length >= 1` and the returned message is different from step 1.

## Acceptance

- **Literal (display in report):** First page returns exactly 1 item and `hasMore: true`; second page returns the next item (different `id`).
- **Regex (applied to first-page response body):**
  ```
  "hasMore"\s*:\s*true
  ```
- **Field assertions:**
  - Page 1: `data.length === 1`, `hasMore === true`, cursor/nextToken present and non-empty.
  - Page 2: `data.length >= 1`, `data[0].id !== page1_data[0].id`.
- **DOM target:** n/a.

**Evolution log:**
- 2026-05-14 (R11): created to verify pagination path is exercised — empty history in R11 meant pagination was never tested.

---

## Runner invocation

```bash
ENV_NAME=dev API_BASE_URL=https://dev-api.doable.me \
  PROJECT_ID=<project-id> TEST_NAME=chat-history-persist \
  bash testcases/evidence/run-granular-turn.sh
```

Evidence dir: `testcases/evidence/${ENV}/chat-history-persist/`
Run log: `testcases/99-runlog/${ENV}/chat-history-persist.md`
