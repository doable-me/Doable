# BUG-R11-PDF-ATTACHMENT-IGNORED-001 — AI ignores attached PDF content; generates generic splash instead

- **Severity**: P1 (high — the marquee PDF-attach feature does not work end-to-end)
- **Env**: dev (dev-api.doable.me / dev.doable.me)
- **Filed**: 2026-05-14 (Ralph R11)
- **Status**: FIXED — R13 verified 2026-05-15. Fix branch `fix/r11-pdf-attachment-prompt-and-persist` (commit `fecc8c1`) merged via PR #19 + PR #35 + PR #39. Full E2E confirmed: prompt_tokens=57,979, App.tsx=3,731 chars with verbatim SRS content ("Amazing Lunch Indicator", 9 features from §2.2, Restaurant entity fields from §3-§4), history=2 messages, version sha committed. See `testcases/evidence/dev/r13-pdf-e2e-verify.md`.
- **User report**: "when I tried to attach a large pdf and told it to create an app, it created something without looking at the pdf I attached" (uniquegodwin@gmail.com)
- **Reproduced by**: `scripts/r11-pdf-attach-test.ts` against `dev-api.doable.me`

## Reproduction
1. Authenticate as platform admin (uniquegodwin) on dev.
2. `POST /projects` to create a new vite-react project.
3. `POST /projects/<id>/chat` with body:
   ```json
   {
     "content": "Read the attached SRS PDF carefully. Identify the system name, its main features, and a key data entity. Build a single-page React app whose title is the system name...",
     "mode": "agent",
     "attachments": [{
       "type": "application/pdf",
       "data": "<base64 of srs_example_2010_group2.pdf, ~3.0 MB>",
       "name": "srs_example_2010_group2.pdf"
     }]
   }
   ```
4. Stream the SSE response to completion.

## Expected
- AI inlines the PDF text via `pdf-parse` (fix shipped in commit 8f20970)
- AI's generated `src/App.tsx` references content from the SRS (system name from the cover page, at least one feature from §2 or §3, a data entity from §4)
- Chat history persists the user message + assistant response

## Actual
- POST /chat returns 200, SSE streams normally (45.8s total).
- Trace shows the prompt **DID** contain the inlined PDF text — `prompt_tokens: 128595`.
- Trace also shows `tool_call_count: 20`, `response_chars: 0`, `completion_tokens: 892`. AI made 20 tool calls but wrote NOTHING.
- Only **1 of the 20 tool calls is visible in the SSE stream** (`list_files`) — 19 are missing from the live stream.
- Generated `src/App.tsx` is **identical to the default vite-react scaffold's "Dream it. Build it." Doable splash** — nothing about the SRS PDF.
- `GET /projects/<id>/chat/history` returns `{"data":[],"hasMore":false}` — **chat history is empty** despite the request having completed and a git version being committed (`version_created` event with valid sha).
- The trace row has `session_id: ""` (empty string) — likely the reason history isn't surfaced.

## Evidence
- `testcases/evidence/dev/ai-pdf-r11/00-summary.json` — full stage timings + DOM-check verdict
- `testcases/evidence/dev/ai-pdf-r11/03-sse-events.json` — 129 SSE events with UTC timestamps + Δms
- `testcases/evidence/dev/ai-pdf-r11/04-chat-history.json` — empty `data`
- `testcases/evidence/dev/ai-pdf-r11/06-src_App.tsx` — generated file (the splash, not the SRS app)
- `testcases/evidence/dev/ai-pdf-r11-stdout.log` — full stdout from the harness

## Per-turn timing (from this run)
- T_project_create: 1.1 s
- T_chat_post_200: 3.2 s
- T_thinking_first: 3.2 s
- T_status_scaffolding_first: 3.2 s
- T_keep_alive_first: 13.2 s
- T_tool_call_first: 24.3 s
- T_tool_result_first: 24.4 s
- T_done: 44.2 s
- T_version_created: 45.8 s
- T_total: 45.8 s
- prompt_tokens: 128,595
- completion_tokens: 892
- thinking_chars: 2,763
- response_chars: 0

## Three signals that point to the root cause

1. **128k prompt tokens with 0 response chars + 20 tool calls** = the LLM was overwhelmed by a huge prompt (scaffolded project files + PDF + system prompt) and made tool calls that did nothing visible. The AI may be receiving instructions to NOT modify any existing scaffold files when they look complete.
2. **Only 1/20 tool calls reach the SSE stream** = the live emission path is dropping tool events. Streaming-only consumers (the editor UI) won't see what the AI is actually doing.
3. **session_id: ""** in the trace + empty `chat/history` = the chat persistence layer is keyed on session_id but the chat send-handler is not populating it for new projects.

## Suspected code locations
- `services/api/src/ai/attachments.ts` — `processAttachments` (pdf-parse extraction; fix in 8f20970)
- `services/api/src/routes/chat/send-handler.ts:140-222` — attachment schema + augmentedContent application; check what gets passed to the LLM
- `services/api/src/ai/providers/copilot-engine.ts` — final prompt assembly; system prompt may instruct AI to leave Doable splash alone
- `services/api/src/ai/trace-infra.ts` / `trace-factory.ts` — session_id population
- `services/api/src/routes/chat/history.ts` (or wherever GET /chat/history is) — verify it filters by session_id or by project_id

## Recommended next steps
1. (Opus agent — in progress) Read attachments.ts + send-handler.ts + copilot-engine.ts to find:
   - whether augmentedContent reaches the LLM intact
   - whether system prompt overrides user intent
   - why response_chars=0 with 20 tool calls
2. Once root cause is identified, fix on `fix/r11-pdf-attachment-integration` branch with:
   - Explicit instruction to the LLM that attached document content takes precedence over scaffold preservation
   - Tool emission completeness (stream EVERY tool call, not just the first)
   - session_id population at chat-send time (use chat session id or generate one if absent)
3. Re-run `scripts/r11-pdf-attach-test.ts` and require `pdf_text_detected_in_prompt: true` AND `App.tsx` to contain content from the SRS PDF.

## Note on R10 pdf-parse fix
Commit 8f20970 (already in `chore/qa-r10-evidence` branch) shipped the pdf-parse text extraction. That fix is **necessary but not sufficient**. The text IS being extracted (visible in the 128k prompt tokens) but the AI is still not generating an app from it. This bug captures the residual integration gap.
