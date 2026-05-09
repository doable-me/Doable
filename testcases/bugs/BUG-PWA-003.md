# BUG-PWA-003 — Per-project chat concurrency / rate-limit rejection has no SSE channel signal

- **Severity:** medium (UX + agent-driven testing)
- **Env:** env1 (https://zantaz-api.doable.me)
- **Surfaced by:** TC-AI-CHAT-PWA turns 3–5
- **Date:** 2026-05-09
- **Related:** BUG-SHEET-001 (rate-limit budget for QA)

## Symptom

While turn 2 of the PWA build was still streaming (per `GET /projects/<id>/chat/status` returning `streaming:true`), and after the per-project chat budget was exhausted, the next three `POST /projects/:id/chat` requests **each completed in 700–850 ms** with **no SSE bytes streamed**. The runner's `sse.jsonl` files were never created (file size zero).

A reproduction call returned a plain JSON body:

```
{"error":"Too many requests, please try again later."}
```

The `Content-Type` was `application/json`, not `text/event-stream`, so the runner — which `read`s line-by-line expecting `data:` SSE frames — never logged anything to disk and the diff/probe steps still ran (preview was already healthy from prior turns, so it returned 200 quickly, falsely suggesting "everything is fine").

## Why it matters

A client (the runner, the web UI, an external integration) that opens a chat POST and gets back `application/json` instead of `text/event-stream` has no way to know via the stream protocol that the request was rejected — the connection just closes. The web UI today probably relies on the HTTP status (429), but:

- the runner logs the response body but doesn't grade by status,
- the SSE `[DONE]` was never sent, so any hook that expects a clean `[DONE]` to flip UI state will hang.

## Repro

```
# Two concurrent POSTs
TOK=$(jq -r '."qa-owner".access' _tokens-env1.json)
PID=08e11ba1-da55-4d69-9dbd-b6e4c4023d92

(curl -X POST "https://zantaz-api.doable.me/projects/$PID/chat" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"content":"first"}' --max-time 240 &) ; sleep 2

curl -i -X POST "https://zantaz-api.doable.me/projects/$PID/chat" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"content":"second"}'
# → HTTP 429 / Content-Type: application/json
# → body: {"error":"Too many requests, please try again later."}
```

## Suggested remediation

1. When `/chat` is rejected for concurrency or rate, **return SSE-shaped frames** rather than plain JSON, e.g.:

```
HTTP/1.1 429 Too Many Requests
Content-Type: text/event-stream

data: {"type":"error","data":{"code":"too_many_requests","retryAfter":120,"message":"Previous chat still streaming or budget exhausted"}}

data: [DONE]
```

   This makes every chat caller protocol-uniform and lets the runner record the rejection in `sse.jsonl` for forensics.

2. Add a server-side queue option: if `streaming:true`, optionally wait up to 30 s for the lock to clear instead of rejecting outright (gated by a `?wait=true` query param).

3. Update `run-granular-turn.sh` to:
   - poll `/projects/:id/chat/status` until `streaming:false` before each turn,
   - record HTTP status and Content-Type so a non-SSE body is captured.

## Evidence

- `testcases/evidence/env1/app-pwa/08e11ba1-…turn3.timing.tsv` — header-only.
- `testcases/evidence/env1/app-pwa/08e11ba1-…turn3.sse.jsonl` — does not exist.
- `testcases/evidence/env1/app-pwa/app-pwa.summary.csv` rows 3-5: empty `changed_files` and `accept_hits`.
- Manual repro response (above) showing `application/json` body with `error` key.
