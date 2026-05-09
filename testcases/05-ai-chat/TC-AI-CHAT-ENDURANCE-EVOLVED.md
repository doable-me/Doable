# TC-AI-CHAT-ENDURANCE-EVOLVED — Multi-turn AI chat endurance under per-user rate limit

**Source:** Discovered during endurance-15 run on 2026-05-09 against env1 (`zantaz-api.doable.me`).
**Failure mode:** sustained AI-chat sends (>20 in ~4 min from a single user) get HTTP 429 with `retry-after: 120` and block any further evolution of a project, regardless of token budget or model availability.

## Why this needs its own testcase

The existing AI-chat tests (`TC-AI-CHAT-SEND.md`, `TC-AI-CHAT-PREVIEW-E2E.md`) cover single-turn or short-sequence flows and don't exercise the rate limiter. Endurance-style flows (15+ turns refining one app) hit a **product-visible** ceiling: real users in a long iteration session will see "Too many requests, please try again later." after roughly 20 sends per ~2 min window, with no in-UI countdown communicated. This is both a usability concern and a hard blocker for regression test suites.

## Setup

- env1 token (`qa-owner`, platform admin) — see `testcases/evidence/_tokens-env1.json`
- Fresh vite-react project in workspace `4bbd6afe-c396-4da6-add5-d71f73f51801`
- Runner: `testcases/evidence/run-granular-turn.sh`

## Steps

1. Create a project: `POST /projects` with `template=vite-react`. Capture `id`.
2. In a tight loop, send 21 chat turns to `POST /projects/{id}/chat` from the same JWT, each within ~30 s of the previous. Use the EVOLUTION list in endurance-15 as reference prompts.
3. After each send, capture response status and response headers `x-ratelimit-*` and `retry-after`.

## Expected (current behavior — to be redesigned)

- Turns 1..20: HTTP 200, SSE stream of `tool-event` / `usage` / `[DONE]`.
- Turn 21: HTTP 429, body `{"error":"Too many requests, please try again later."}`, header `retry-after: 120`, `x-ratelimit-limit: 20`, `x-ratelimit-remaining: 0`.

## Expected (desired behavior — proposal)

- **A.** Platform admins (`is_platform_admin=true`) bypass per-user chat rate limit, OR a `RATE_LIMIT_BYPASS_USERS` allowlist is honored.
- **B.** When a non-admin hits the limit, the response surfaces `retryAfterSeconds` in JSON (not just header) so the editor can render an in-UI cooldown banner instead of a generic toast.
- **C.** The limit window is configurable per-environment (`AI_CHAT_RATE_LIMIT_PER_WINDOW`, default 20; for staging/test envs raise to 200).

## Acceptance

- Re-run the 21-send loop as `qa-owner`: all 21 succeed (admin bypass).
- Re-run as `qa-member`: 21st returns 429 with `retryAfterSeconds` in JSON.
- The editor chat panel shows a countdown banner during cooldown and re-enables the send button at expiry.

## Evidence

- `testcases/99-runlog/env1/endurance-15.md` — full per-turn table, BUG-ENDU-001 details, and the four representative 429 retry attempts (`*.turn7.*`).
- `testcases/evidence/env1/endurance-15/endurance-15.summary.csv` — per-turn timing, tokens, accept-hits.

## Notes for future endurance authors

Acceptance regexes derived from prompt wording (e.g. `"White to move"`) frequently miss because the AI legitimately splits literals across JSX ternaries (`{isWhiteTurn ? "White" : "Black"} to move`), renames identifiers (`selected` vs `selectedPiece`), or swaps case (`Move History` vs `Move history`). Use case-insensitive, looser regex with multiple alternatives, and verify "feature present" via multiple independent tokens — not literal phrase matches.
