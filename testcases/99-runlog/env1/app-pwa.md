# app-pwa run log — env1

- **Tester:** qa-ai (autonomous, Opus 4.7 1M)
- **Env:** env1 → `https://zantaz-api.doable.me`
- **Workspace requested:** `4bbd6afe-c396-4da6-add5-d71f73f51801` (qa-owner QA workspace)
- **Project created (turn-1 target):** `08e11ba1-da55-4d69-9dbd-b6e4c4023d92` (vite-react)
- **Note:** API placed the new project in qa-owner's *personal* workspace (`e860bfcb-…`) regardless of the supplied `workspace_id`. Filed as observation in BUG-PWA-002 below.
- **Test case:** `testcases/05-ai-chat/TC-AI-CHAT-PWA.md`
- **Runner:** `testcases/evidence/run-granular-turn.sh`
- **Evidence:** `testcases/evidence/env1/app-pwa/`
- **Summary CSV:** `testcases/evidence/env1/app-pwa/app-pwa.summary.csv`

## Per-turn results

| Turn | Prompt (excerpt) | SSE ms | Preview ms | Files mutated | ACCEPT hits | Verdict |
|------|------------------|--------|------------|---------------|-------------|---------|
| 1 | tiny notes PWA + textarea + localStorage + offline banner | 181 179 | 186 746 | `index.html, package.json, src/App.tsx, src/index.css, src/lib/utils.ts, src/main.tsx, vite.config.ts` | `+navigator.onLine; +localStorage; +textarea; +notes\.map` | **PASS** |
| 2 | manifest.json /public + standalone + theme_color | 180 710 | 183 483 | none | (App.tsx not changed → no grep) | **FAIL** — see BUG-PWA-001 |
| 3 | Register /public/sw.js, register from main.tsx | 717 | 3 161 | none | none | **FAIL** — concurrency lock; see BUG-SHEET-001 + BUG-PWA-003 |
| 4 | sw.js serves offline.html on fetch failure | 723 | 3 391 | none | none | **FAIL** — same lock |
| 5 | Install button using beforeinstallprompt | 833 | 3 582 | none | none | **FAIL** — same lock |

## Time budget

5-min hard cap was exceeded by the runner itself: turn 1 alone consumed 181 s of SSE before its first content-mutating tool call landed; turn 2 was cut at the runner's 180 s curl ceiling without producing any tool call. Turns 3-5 were rejected by the per-project chat rate-limit / streaming-still-active guard immediately, so each completed in under 1 s with **no SSE stream at all**.

After the driver exited, `GET /projects/<id>/chat/status` still reported `streaming:true` for the prior turn, and a fresh manual POST returned `{"error":"Too many requests, please try again later."}` — confirming the lock.

## Side checks (per task spec)

Could not run the SSH `find /opt/doable/services/api/projects/<id>/public -name manifest.json` check because turn 2's SSE never reached a tool call to materialise the file — the diff already showed zero file deltas, so the SSH check is moot.

Same for turn 3's `find ... -name sw.js`: no file deltas → file definitely absent.

## Failure summary

- **BUG-PWA-001-AI-LOOP-NO-MUTATION** — turn 2 streamed 51 `phase:"thinking"` events for 180 s with zero tool calls. The model entered a loop without ever invoking a write tool. New bug.
- **BUG-PWA-002-WORKSPACE-IGNORED** — `POST /projects` with explicit `workspace_id` silently routed the project into the caller's personal workspace. Observation, lower severity.
- **BUG-PWA-003-CONCURRENCY-LOCK-NO-FEEDBACK** — turns 3-5 returned in <1 s with NO SSE bytes at all. The 429 / "streaming-still-active" rejection currently surfaces as a bare body, not as an SSE `error` event the runner can parse. Variant of pre-existing BUG-SHEET-001 but with the additional finding that there's no protocol-level signal — the curl just gets the HTTP body and exits.

## Mitigation for re-run

1. After turn 1 completes, `GET /projects/:id/chat/status` and **wait until `streaming:false`** before sending turn 2.
2. Bump the runner's `--max-time` from 180 s to 300 s, or detect a thinking-loop (no `tool_use` event after N seconds) and abort early so the runner can move on.
3. For env1 specifically, raise `qa-owner`'s per-project chat-rate budget (or exempt the JWT) so end-to-end PWA builds can run unattended.
