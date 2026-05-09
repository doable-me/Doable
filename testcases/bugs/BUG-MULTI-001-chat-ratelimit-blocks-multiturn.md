# BUG-MULTI-001 — chat rate-limit (20/120s) blocks multi-turn integration tests

- **Severity:** medium (test-infra; user-facing impact = QA agents can't finish 5+ turn suites in a single budget)
- **Env:** env1 (zantaz, `https://zantaz-api.doable.me`)
- **Reproduced:** 2026-05-09T21:04:34Z
- **Owner workspace token:** `qa-owner` (`_tokens-env1.json`)

## What happened

While running TC-AI-CHAT-MULTIPAGE (5 sequential `POST /projects/{id}/chat` turns):
- Turn 1 succeeded (129.6 s SSE, project `3f3dd37c-276a-426f-8632-d4c89b0eb6a0`).
- Turn 2's POST returned **HTTP 429** within 800 ms — empty body, no SSE.

Response headers:
```
HTTP/1.1 429 Too Many Requests
retry-after: 120
x-ratelimit-limit: 20
x-ratelimit-remaining: 0
x-ratelimit-reset: 120
x-request-id: req_a31ded4bd4df4654
```

## Why it matters

A QA test that legitimately needs to send N back-to-back chat messages (multi-turn app build, edit/refine flows, regression suites) cannot complete inside the standard 5-min budget once turn 1 burns ≥2 minutes of SSE. The 20-req/120s window was sized for human pacing, not automated multi-turn flows from a single token.

## Suggested fixes (pick any)

1. **Per-route bucket separation.** Carve `POST /projects/:id/chat` into its own bucket (e.g. 60 req / 600s) since each request is already heavy and self-rate-limiting via SSE backpressure.
2. **Workspace-owner allow-list.** Workspaces with role=owner on plan=enterprise (qa-owner is) get a 3× multiplier — keeps UX friendly for ordinary users while letting QA + power-users iterate.
3. **Bypass header for QA.** Honour `X-QA-Token` (signed, server-side env var) → skip chatLimiter. Used only by `_tokens-${ENV}.json` test runs.
4. **Better 429 telemetry.** When the limiter trips, emit a structured SSE `{type:"error", data:{code:"rate_limited", retry_after:120}}` *before* closing the stream so client agents can wait gracefully instead of seeing an empty body.

## Repro

```
TOK=$(jq -r '.["qa-owner"].access' testcases/evidence/_tokens-env1.json)
for i in {1..21}; do
  curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
    "https://zantaz-api.doable.me/projects/<id>/chat" \
    -H "Authorization: Bearer ${TOK}" \
    -H "Content-Type: application/json" \
    -d '{"content":"hi"}' &
done; wait
# → first ~20 return 200, rest return 429 with retry-after: 120
```

## Workaround (until fixed)

- Use **two different QA tokens** for parallel multi-turn runs (each gets its own bucket).
- Or pad the test to ≥7 min so a single 120-s wait between cluster-of-3 turns fits.

## Evidence

- `testcases/evidence/env1/app-multipage/3f3dd37c-…turn2.timing.tsv` — empty (no SSE).
- Direct probe HTTP 429 captured in run log: `testcases/99-runlog/env1/app-multipage.md`.
