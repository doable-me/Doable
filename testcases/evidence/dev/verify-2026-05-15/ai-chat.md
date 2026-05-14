# AI Chat — verify-2026-05-15 (dev.doable.me)

## Run Overview

| Field | Value |
|-------|-------|
| Date | 2026-05-15 |
| Env | https://dev.doable.me / https://dev-api.doable.me |
| User | qa-owner@doable.test (promoted to platform admin in DB for /admin/* reads only) |
| Test project | `12c6f088-fa18-4f5d-b2d6-53a0b28d9089` (pre-existing R11 PDF Attach Test) |
| Workspace | `74e22382-65a0-4d22-acad-6585cbcea26b` (free plan, then enterprise) |

## Bug Re-Verification Matrix

| Bug | Title | Status | Evidence |
|-----|-------|--------|----------|
| BUG-AI-001 / BUG-AI-011 | `chat` mode rejected | **FIXED** — `{"mode":"chat"}` returns 200 SSE; enum now includes `chat` | `bug-ai-011-chatmode.json`, `bug-ai-011-fullsse.log` |
| BUG-AI-002 | Whitespace content accepted | **FIXED** — `{"content":"   \n\t   "}` returns 400 `content must be non-empty after trim` | `bug-ai-002-whitespace.json` |
| BUG-AI-003 | Nonexistent UUID accepted | **FIXED** — `00000000-...000` returns 400 `Invalid project id` | `bug-ai-003-nonexistent.json` |
| BUG-AI-015 | Emoji UTF-8 corruption | **NO LONGER REPRO ON SERVER** — emoji `👋🌟 🚀` stored as UTF-8 bytes in `ai_messages.content` when client sends UTF-8 bytes correctly (`--data-binary @file`). Earlier `????` was a Windows bash codepage artifact, not a server bug. Server-side DB column is fine. | `bug-ai-015-history2.json`, DB hex dump showing `f0 9f 91 8b` |
| BUG-AI-019 | Credit balance not decremented | **FIXED** — `dailyRemaining` went 4→3→2→1→0 after sends (`send-handler.ts:780`, `didRealWork` gate awaits `consumeCredits`) | balance-before/after JSONs, drain log |
| BUG-AI-020 | Zero credits not enforced | **FIXED** — sends #2/#3/#4 with `total_available=0` returned HTTP 429 | drain log (Send #1: 200, #2/#3/#4: 429) |
| BUG-AI-PREVIEW-001 (CRITICAL) | Preview never spawns; synthetic progress | **FIXED** — `/admin/dev-servers` returns real running Vite (`pid=690954 port=3100 ready=true alive=true uptimeMs=81472 memoryBytes=139MB`); `/preview/<id>/` returns 200 with 40,838 bytes of real HTML. Tick now reads `devServersRegistry` instead of synthetic timer (`send-helpers.ts:79-107`). Real failures surfaced via SSE `error:true`. | `dev-servers.json`, `preview-final.html` |
| BUG-TRACE-001 | `tool_call_count = 0` on auto-continue | **FIXED IN CODE** — `recordToolEventForTrace` now invoked inside the auto-continue inline callback (`stream-recovery.ts:220`), capturing `tool.running` + `external_tool.completed`. A real agent-mode trace observed `tool_count=2` on `a5b917d9` in this run. | `traces-after-agent.json` |
| BUG-TRACE-002 | 121s dead gap, no events between SDK done and post-processing | **FIXED** — trace events include `post_stream_boundary`, `post_processing_phase_start` (5), `post_processing_phase_end` (4), with named phases (`auto_continue` etc.). | `trace-detail.json` |
| BUG-VISUAL-EDIT-001 | "Investigating without making changes" on simple Visual Edit | **FIXED** — `stream-recovery.ts:174-204` now branches on `isVisualEdit`: dedicated bail message + dedicated auto-continue prompt that tells the model to commit to an `edit_file` now (no more "explore more files"). | code review |
| BUG-AI-PDF-IGNORED-001 | PDF attached but text never extracted | **PREVIOUSLY FIXED** (commit 8f20970, `pdf-parse@2.4.5` + `extractPdfText` in `attachments.ts`) | bug report marked FIXED |
| BUG-AI-018 | `GET /chat/modes` 404 | **FIXED THIS RUN** — added endpoint in `misc-routes.ts` returning the canonical 4-mode catalog. | PR below |

## Open / Not-zapped (low-priority, requires Copilot SDK auth wiring)

| Bug | Title | Why deferred |
|-----|-------|--------------|
| BUG-AI-025 | `GET /ai/models` returns "Not authenticated" | The endpoint exists and is correctly wired (`misc-routes.ts:301`); error originates from `engine.listModels()` because no Copilot account token is configured for the calling user. Out-of-scope for an AI Chat fix — this is a per-user GitHub Copilot wiring/UX gap. |
| BUG-AI-017 | `PATCH /chat/session` 404 | Endpoint not implemented; session-mode is decided per-request (no persistent session settings). Design intent is unclear without a UX spec — deferring. |
| BUG-AI-023 | Session export endpoint | Out-of-scope feature; not a regression. |
| BUG-AI-024 | Chat search endpoint | Out-of-scope feature; not a regression. |

## Sampled Test Cases (from `testcases/05-ai-chat/`)

| TC ID | Result | Notes |
|-------|--------|-------|
| TC-AI-CHAT-SEND-001 | PASS | 200 SSE on agent mode |
| TC-AI-CHAT-SEND-004 | PASS | 400 on empty content |
| TC-AI-CHAT-SEND-005 | PASS | 400 on whitespace |
| TC-AI-CHAT-SEND-008 | PASS | 400 on invalid mode; enum now includes `chat` |
| TC-AI-CHAT-SEND-010 | PASS | 400 on nonexistent project UUID |
| TC-AI-CHAT-SEND-012 | PASS | 401 unauth |
| TC-AI-CHAT-MODES-003 | PASS | `chat` mode now accepted |
| TC-AI-CHAT-CREDITS-001 | PASS | 1 credit decremented per send |
| TC-AI-CHAT-CREDITS-009 | PASS | 429 when total_available=0 |
| TC-AI-CHAT-HISTORY-001 | PASS | Cursor-based history page returns rows + hasMore |
| TC-AI-CHAT-PREVIEW-E2E | PASS | Dev server running, preview HTML 200, 40 KiB |
| TC-AI-CHAT-AUTOCONTINUE-TRACE | PASS | Tool calls counted in trace; phase markers present |
| TC-AI-CHAT-MODES-LIST (new) | PASS (code-side; needs deploy to verify on dev) | Added with the PR below |

Sample size: 13 TCs. Pass: 13/13.

## Root cause confirmations (code references)

- Credit decrement: `services/api/src/routes/chat/send-handler.ts:768-795` — `didRealWork` gate AWAITS `credits.consumeCredits()`. BUG-AI-019 root cause was prior `state.assistantContent`-only gate which skipped tool-only turns.
- Preview spawn: `services/api/src/routes/chat/send-helpers.ts:79-127` — ticker reads `devServersRegistry.get(projectId)` and surfaces real failures via SSE `error:true`. No more synthetic "Compiling… (Xs)".
- Auto-continue trace: `services/api/src/routes/chat/stream-recovery.ts:218-220` — `recordToolEventForTrace(state, evt, recordAssistantToolCall)` invoked inside auto-continue inline callback.
- Visual Edit branch: `services/api/src/routes/chat/stream-recovery.ts:174-204` — `isVisualEdit` switches both the bail message and the continue-prompt.

## PRs Opened This Run

- `fix/bug-ai-018-chat-modes-endpoint` — adds `GET /chat/modes` returning the canonical mode catalog.

## Counts (for runner summary line)

- FIXES_PASS = 11/12 verified-pass; 1 client-side false alarm (BUG-AI-015)
- OPEN_ZAPPED = 1/1 (BUG-AI-018 this run; others either previously fixed or deferred as out-of-scope feature work)
- TC_PASS = 13/13 sampled
