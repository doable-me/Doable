# BUG-PDF-001 — Chat rate limiter blocks legitimate multi-turn AI sessions

- **Env:** env1 (zantaz)  API: https://zantaz-api.doable.me
- **Date observed:** 2026-05-10
- **Severity:** High — kills the iterative-prompting UX that Doable's AI flow is built around
- **Reporter:** qa-owner
- **Project under test:** `bc2a40b8-0fd2-4c61-9c66-7cc73cace4f3`
- **Test case:** TC-AI-CHAT-PDF (turn 3 onward)

## Symptom
After **2 successful** AI chat turns on a single project (turn 1 ran 71 s,
turn 2 ran 50 s, total wallclock ~3 min including network probes) every
subsequent `POST /projects/<id>/chat` returns:

```
HTTP/2 429
{"error":"Too many requests, please try again later."}
```

The 429 was reproduced 3 times in succession (immediate retry, 60 s wait,
90 s wait — all 429). This blocks turns 3–5 of TC-AI-CHAT-PDF entirely.

## Repro
1. Authenticate as qa-owner on env1.
2. Create a vite-react project.
3. Send 2 normal chat prompts (each completes successfully with SSE
   `[DONE]` and updates `App.tsx`).
4. Immediately send a 3rd prompt → 429.
5. Wait 60 s, retry → still 429.

Curl probe:
```bash
curl -sS -X POST "https://zantaz-api.doable.me/projects/bc2a40b8-.../chat" \
  -H "Authorization: Bearer <qa-owner JWT>" \
  -H "Content-Type: application/json" \
  -d '{"content":"ping"}' -o /dev/null -w 'HTTP=%{http_code}\n'
# HTTP=429
```

## Expected
Iterative prompting is the entire point of the Doable AI flow. A creator
should be able to send at least 5–10 chat turns per project per minute
without being throttled. The 429 should fire only on clearly abusive
patterns (e.g. > 30 prompts/min from one user, or unauthenticated
floods).

## Suspected location
- `services/api/src/middleware/rate-limit*.ts` — chat-specific bucket
  size / refill rate is too tight.
- Look for a per-route rate limit on `POST /projects/:id/chat`.
- KV store: `@doable/shared/kv-store.js` (memory backend on env1, no
  Redis).

## Workarounds (none clean)
- Wait an undefined cooldown (>90 s observed, exact threshold unknown).
- Restart API service (clears in-memory KV bucket — not acceptable in prod).

## Impact
- Blocks 3 of 5 turns of TC-AI-CHAT-PDF (turns 3, 4, 5).
- Will block any QA TC that drives more than 2 quick AI turns on one
  project, including future PDF / form / table / dashboard tests.
- Real users iterating on a design will hit this and assume the AI is
  broken.

## Suggested fix
1. Raise the per-user / per-project chat rate limit on env1 to at least
   10 requests / minute (matching real iterative-prompt cadence).
2. Surface the rate-limit window in the 429 response (`Retry-After`
   header + body field) so the client can show a humane countdown
   instead of a generic error.
3. Consider exempting chat from the global API rate limit and giving it
   its own bucket whose size is tuned to AI-iteration UX, not anti-abuse
   for cheap CRUD endpoints.
