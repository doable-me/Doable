# BUG-PWA-001 — AI enters thinking-only loop on second-turn refinement (manifest.json create)

- **Severity:** high (blocks evolutionary multi-turn building)
- **Env:** env1 (https://zantaz-api.doable.me)
- **Surfaced by:** TC-AI-CHAT-PWA turn 2
- **Date:** 2026-05-09
- **Project:** `08e11ba1-da55-4d69-9dbd-b6e4c4023d92` (qa-owner)

## Symptom

After a successful turn 1 ("tiny notes PWA"), the very next chat turn —

> "Add a manifest.json in /public with name=Doable Notes, short_name=Notes, start_url=/, display=standalone, theme_color=#000, icons (placeholder PNGs)."

— streamed for the runner's full 180 s budget while emitting **only** `{"type":"status","data":{"phase":"thinking","message":"Thinking…"}}` events (51 of them), interspersed with `{"type":"keep_alive"}`. No `tool_use` / `tool_result` / file-mutation event ever fired. Source-SHA snapshot before vs. after shows zero file changes. The user-visible result: turn 1 created the notes UI, but turn 2 failed to add `/public/manifest.json` despite "completing" from the runner's perspective.

## Evidence

- `testcases/evidence/env1/app-pwa/08e11ba1-da55-4d69-9dbd-b6e4c4023d92.turn2.sse.jsonl` — 140 lines, all `phase:"thinking"` or `keep_alive`.
- `testcases/evidence/env1/app-pwa/08e11ba1-da55-4d69-9dbd-b6e4c4023d92.turn2.diff.log` — empty (no SHA changes).
- `testcases/evidence/env1/app-pwa/app-pwa.summary.csv` row 2:
  `2,08e11ba1-…,180710,183483,,,,,"","","Add a manifest.json in /public…"`

## Repro

```
TOK=$(jq -r '."qa-owner".access' _tokens-env1.json)
PID=08e11ba1-da55-4d69-9dbd-b6e4c4023d92

# Turn 1 (succeeds, mutates 7 files including src/App.tsx)
curl -N -X POST "https://zantaz-api.doable.me/projects/$PID/chat" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  --max-time 240 \
  -d '{"content":"Build a tiny notes PWA. Page lists notes (initially empty). Single text-area to type a note + Save button. Notes persist to localStorage. Use Tailwind. Show offline banner when navigator.onLine is false."}'

# Turn 2 (loops on thinking, mutates nothing)
curl -N -X POST "https://zantaz-api.doable.me/projects/$PID/chat" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  --max-time 240 \
  -d '{"content":"Add a manifest.json in /public with name=Doable Notes, short_name=Notes, start_url=/, display=standalone, theme_color=#000, icons (placeholder PNGs)."}'
```

## Hypotheses to investigate (use tracing/X-ray, do NOT guess from code)

1. Provider returned a long thinking block but never produced a tool-use block — check the raw provider response captured in tracing.
2. The model decided this is a "no-op needed" because vite-react template already has *some* manifest? Check whether `/public/manifest.json` already existed at scaffold time and the model considered it satisfactory. (If so, fix prompt or detect existing file and instruct overwrite.)
3. Tool registry for the project lost the file-write tool between turns. Inspect SDK session state.
4. Token budget for tool-results in the SDK loop ran out so the model emitted only thinking. Check `usage` / `stop_reason` in tracing.

## Why it matters

This is a hard regression of the "AI evolves the app turn-by-turn" claim. Turn 1 worked; turn 2 — a smaller, more localized change — produced literally nothing. Without tracing it's impossible to say whether the SDK, the model, or the tool registry is at fault — but the symptom is reproducible against env1 with the qa-owner JWT.

## Suggested triage

1. Pull the OTel/X-ray trace for the turn-2 conversation id (visible in `chat-status` payload at the moment).
2. Inspect `services/api/src/routes/chat/send-handler.ts` for any guard that might short-circuit tool registration on subsequent turns of the same project session.
3. Add a server-side watchdog: if a chat session emits ≥ 30 s of `phase:thinking` with no `tool_use`, send an SSE `{type:"error",data:"AI stalled in thinking phase, no tool calls"}` so clients can escalate.
