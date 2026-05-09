# BUG-SHEET-001 — `/projects/:id/chat` rate-limit too tight for granular agent driving

- **Severity:** medium (productivity / agent UX)
- **Env:** env1 (https://zantaz-api.doable.me)
- **Surfaced by:** TC-AI-CHAT-SPREADSHEET turn 5
- **Date:** 2026-05-09

## Symptom

While running the 5-turn `app-spreadsheet` build (≈30–75 s SSE per turn,
back-to-back), the 5th `POST /projects/:id/chat` returned `HTTP 429 Too
Many Requests` with body `{"error":"Too many requests, please try again
later."}` and headers `x-ratelimit-limit: 20`,
`x-ratelimit-remaining: 0`, `retry-after: 120`.

The runner's curl never received SSE bytes, so `run-granular-turn.sh`
emitted `tokens=/ model= changed=[]` for that turn.

## Repro

```
TOK=...qa-owner.access...
PROJECT=62c85f74-31ce-47bc-8edc-8c3f92324027

# Run 5 chat POSTs in <120s window — the 5th may 429 even when the
# preceding 4 are legitimate AI-build turns and not abuse.
for i in 1 2 3 4 5; do
  curl -i -X POST "https://zantaz-api.doable.me/projects/$PROJECT/chat" \
    -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
    -d '{"content":"add something"}' --max-time 90
done
```

## Why it matters

A "20 chats / 120 s" cap is reasonable for guarding against runaway
client loops, but Doable's own QA harness drives 5-turn evolution
flows back-to-back, and end users testing on env1 will hit the same
budget the moment they iterate quickly. The previous turns are not
spam — they are real round-trips that the AI itself paces (each takes
30–75 s server-side already).

## Proposed remediation

- Raise per-project chat budget to ≥ 30 / 120 s, **or**
- Reset the bucket on SSE `[DONE]` (i.e., count concurrency, not
  request rate), **or**
- Exempt the granular-test JWT (`qa-owner` on the staging/dev envs)
  from the bucket via a header-keyed override.

## Workaround

Sleep `Retry-After` seconds (120) between turns 4 and 5 in the runner
when 429 is detected. Not yet wired into `run-granular-turn.sh`.

## References

- Evidence:
  `testcases/evidence/env1/app-spreadsheet/62c85f74-31ce-47bc-8edc-8c3f92324027.turn5.*`
- Summary CSV row 5 shows empty model/tokens.
- 429 response captured in this bug's "Symptom" section above.
