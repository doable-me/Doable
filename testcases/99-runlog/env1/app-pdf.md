# RUN — env1 — TC-AI-CHAT-PDF (app-pdf)

- Date: 2026-05-10
- Env: env1 (zantaz)  API: https://zantaz-api.doable.me
- Tester: qa-owner (uniquegodwin@gmail.com)
- Workspace requested: `4bbd6afe-c396-4da6-add5-d71f73f51801`
- Workspace actual: `e860bfcb-36ce-4cfe-823f-a1660e0e1514`
  (qa-owner only has membership in `e860bfcb…`; the API silently rewrote
  `workspace_id` on POST /projects to qa-owner's actual workspace.
  Prerequisite gap, not a test bug.)
- Project: `bc2a40b8-0fd2-4c61-9c66-7cc73cace4f3` (name `app-pdf`,
  framework `vite-react`, created via POST /projects).
- Hard time cap: 5 min
- Model used: `MiniMax-M2.7-highspeed`

## Turn results

| Turn | SSE ms | Preview ms | Prompt tok | Comp tok | Accept hits | Result |
|------|--------|------------|------------|----------|-------------|--------|
| 1    | 71466  | TIMEOUT    | 79486      | 3522     | +jsPDF; +jspdf; +new jsPDF; +doc\\.save | PASS |
| 2    | 49898  | TIMEOUT    | 50697      | 3923     | +preview; +grid-cols-2; +invoice | PASS |
| 3    | n/a    | n/a        | n/a        | n/a      | n/a (HTTP 429) | BLOCKED |
| 4    | not run | n/a       | n/a        | n/a      | n/a | BLOCKED |
| 5    | not run | n/a       | n/a        | n/a      | n/a | BLOCKED |

### Turn 1 — seed (PASS)
Files changed: `index.html, package.json, src/App.tsx, src/index.css,
src/lib/utils.ts, src/main.tsx, vite.config.ts`.
SSH-side verification:
```
$ sudo grep -E '"jspdf"|"jsPDF"' /opt/doable/services/api/projects/bc2a40b8.../package.json
    "jspdf": "^4.2.1",
```
Dep correctly persisted to `package.json` — **BUG-PDF-DEPS not needed**.

### Turn 2 — live preview (PASS)
Only `src/App.tsx` rewritten. ACCEPT regexes `preview`, `grid-cols-2`,
`invoice` all matched in the new App.tsx.

### Turn 3 — PDF content (BLOCKED — HTTP 429)
Two consecutive POST /chat returns within ~1s with `{"error":"Too many
requests, please try again later."}`. The chat rate limiter on
`zantaz-api.doable.me` is firing after 2 rapid AI turns by the same user.
Probed again ~1 min later: still 429. See **BUG-PDF-001**.

### Turns 4 & 5 — not run
Could not be executed within the 5-min cap because turn 3 was blocked by
the same 429 rate limiter. Re-run after rate-limit cooldown / config tune.

## Preview observation
`/preview/<id>/` returned `TIMEOUT` (60s) on every successful turn.
This is consistent with the existing TC-AI-CHAT-PREVIEW-E2E findings
(dev server boot lag) and is **not** a regression introduced by this TC.
The Generate-PDF behaviour was verified by SHA-diff of `App.tsx` and
ACCEPT-phrase matching, not by hitting the running preview.

## Evidence
- `testcases/evidence/env1/app-pdf/app-pdf.summary.csv`
- `testcases/evidence/env1/app-pdf/bc2a40b8-….turn{1,2}.{sse.jsonl,timing.tsv,diff.log,App.tsx,prompt.txt,probe.tsv}`
- `testcases/evidence/env1/app-pdf/bc2a40b8-….turn3.*` (no SSE — 429)

## Bugs filed
- BUG-PDF-001 — Chat rate limiter (HTTP 429) blocks legitimate multi-turn
  AI sessions after only 2 turns; default window too aggressive for
  iterative prompting on env1.
