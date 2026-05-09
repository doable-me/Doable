# Endurance-15 — Multi-Turn AI Chat Endurance Test

**Test name:** endurance-15
**Date:** 2026-05-09 → 2026-05-10 (UTC)
**Environment:** env1 (zantaz prod) — `https://zantaz-api.doable.me`
**Workspace:** `4bbd6afe-c396-4da6-add5-d71f73f51801`
**Project:** `5de28cb9-c081-43b5-8d6a-e6ca3b6a89b0` (`endurance-1778360177`, vite-react)
**User:** qa-owner@doable.test (platform admin)
**Model:** `MiniMax-M2.7-highspeed` (sticky across all turns)
**Runner:** `testcases/evidence/run-granular-turn.sh`
**Time budget:** 5 min hard cap. Stopped at turn 7 (rate-limited).

## Per-turn results

| # | Prompt summary | sse_ms | preview_ms | prompt_tok | comp_tok | ttft_ms | accept_hits | Notes |
|---|---|---:|---:|---:|---:|---:|---|---|
| 1 | Seed: 8x8 chess board + 32 Unicode pieces, Tailwind grid-cols-8 | 60288 | 65453 | 84,325 | 1,962 | 3922 | +grid-cols-8 +♔ +♚ | Scaffolded full project (index.html, package.json, App.tsx, index.css, lib/utils.ts, main.tsx, vite.config.ts) |
| 2 | Click-to-select highlights square yellow | 27009 | 32932 | 46,810 | 1,463 | 2218 | +onClick +bg-yellow | Edits App.tsx only |
| 3 | Turn counter "White to move" / "Black to move" toggling on click | 26033 | 31725 | 49,991 | 1,598 | 2469 | -White to move -Black to move +useState | Feature implemented as `{isWhiteTurn ? "White" : "Black"} to move` — JSX expression splits the literal phrase, regex never matches a contiguous string. Code is correct. **Not a product bug — regex pitfall.** |
| 4 | "Reset" button restores starting position | 30146 | 35792 | 53,548 | 1,790 | 4624 | +Reset -setSelectedPiece +onClick | AI named state `selected` not `selectedPiece` — code is fine, regex pitfall again |
| 5 | Captured pieces below board, two rows | 37509 | 43220 | 57,690 | 2,194 | 6286 | +captured +Captured | Pass |
| 6 | Move history panel right side, append on click | 39972 | 45633 | 62,842 | 2,846 | 2637 | +moves -setMoves -Move history -history | AI used `moveHistory` / `setMoveHistory` and JSX `<h3>Move History</h3>`. Source matches: case-sensitive regex pitfall. |
| 7 | Persist game state to localStorage | 766 | 3017 | — | — | — | (none) | **HTTP 429 — rate limit** (BUG-ENDU-001). Retry also 429. retry-after=120s. |

## Aggregates (turns 1–6, the ones that completed normally)

- Total prompt tokens: **355,206**
- Total completion tokens: **11,853**
- Total tokens: **367,059**
- Cost (rough at MiniMax-class pricing not known here): see `endurance-15.summary.csv` for raw numbers.
- SSE end-to-end latency mean: **36.8 s** (min 26.0 s, max 60.3 s, p95 ≈ 60 s — driven by turn 1 scaffold)
- SSE end-to-end excluding seed (turns 2–6): mean **32.1 s**, max 40.0 s
- Preview ready-after-prompt mean: **42.5 s** (min 31.7 s, max 65.5 s)
- Preview-after-SSE delta: consistently ~5–6 s of Vite HMR rebuild after SSE [DONE]
- TTFT mean: **3.69 s** (min 2.22 s, max 6.29 s)
- Files touched: turn 1 wrote 7 files; turns 2–6 each touched only `src/App.tsx`. App.tsx grew to 274 lines by turn 6.

## Server health (post-test)

- vite proc for this project: pid 65851, RSS ~ 0.4% of 31 GB → ~130 MB
- Total of 5 vite processes running on host (other tenants), system mem 4.9 GB / 31.7 GB used, swap 0/1024 MB free
- Project on-disk: **190 MB** (mostly node_modules)
- No vite restarts observed across 6 successful turns — dev-server uptime stable for the duration.

## Findings / bugs

### BUG-ENDU-001 — `/projects/{id}/chat` rate-limited at 20 req/window per qa-owner; blocks endurance testing

- After 6 successful POSTs in ~4 min, turn 7 returned HTTP 429 `{"error":"Too many requests, please try again later."}`
- Response headers: `x-ratelimit-limit: 20`, `x-ratelimit-remaining: 0`, `x-ratelimit-reset: 120`, `retry-after: 120`
- The qa-owner is `is_platform_admin: true`. **Platform admins / QA tokens should arguably be exempt** from the per-user chat send rate limit during automated test runs. At minimum, the limit should be discoverable via a config knob and bumped for non-prod load tests. As-is, any endurance/regression suite stalls hard at 20 sends regardless of the model's TTFT.
- Repro: send 20 POST `/projects/$PID/chat` as qa-owner inside ~4 min → 21st request 429.
- Suggested fix: either (a) skip global rate-limiter when JWT subject is in `RATE_LIMIT_BYPASS_USERS` env, (b) raise limit to 60/min for `is_platform_admin`, or (c) add a `/projects/{id}/chat` route variant that skips the limiter when called with an internal QA scope.

### Observation — Acceptance-regex methodology

- 3 of 6 turns (3, 4, 6) flagged "missed" phrases purely because the AI:
  - put the literal across a JSX ternary (`{isWhiteTurn ? "White" : "Black"} to move`),
  - chose a different identifier (`selected` vs `setSelectedPiece`, `moveHistory` vs `moves`),
  - or used a different case (`Move History` vs `Move history`).
- The dev-server source contained the **feature**, just not the exact regex token. Future endurance scripts should grep with `-i` and use **looser** regex (e.g. `White.*move` or `move.{0,20}history`) or score "feature present" via multiple alternatives. **No product bug.**

### Observation — turn 1 cost

- Turn 1 sent 84k prompt tokens to scaffold from a `vite-react` template — that's the lion's share of the 367k total. Subsequent turns hover around 50k–63k each. Worth checking whether turn 1 inlines large boilerplate (it touches 7 files including index.css and lib/utils.ts) — if those edits are template-pinned, we could skip sending them in the prompt.

## Evidence files

- Per-turn SSE/timing/diff/probe/App.tsx: `testcases/evidence/env1/endurance-15/5de28cb9-c081-43b5-8d6a-e6ca3b6a89b0.turn{1..7}.*`
- Aggregate CSV: `testcases/evidence/env1/endurance-15/endurance-15.summary.csv`
- Project ID and start TS: `testcases/99-runlog/env1/endurance-15.pid`
- New testcase for the rate-limit pattern: `testcases/05-ai-chat/TC-AI-CHAT-ENDURANCE-EVOLVED.md`

## Outcome

6 of 15 planned turns completed successfully. The AI built a usable, evolving chess UI (board, click-to-select, turn indicator, reset, captured-pieces tray, move-history panel) across 6 sequential prompts on a single project, with mean end-to-end latency 36.8 s and stable Vite dev-server. The remaining 9 turns were blocked by a 20-req-per-window rate limit (BUG-ENDU-001), not by any model or build failure. **The endurance pipeline itself is healthy under sustained load up to the rate-limit ceiling.**
