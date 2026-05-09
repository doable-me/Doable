# Run log — TC-AI-CHAT-SPREADSHEET (env1)

- Date: 2026-05-09 (UTC)
- Tester: qa-owner
- Workspace: 4bbd6afe-c396-4da6-add5-d71f73f51801
- Project: 62c85f74-31ce-47bc-8edc-8c3f92324027 (`app-spreadsheet`, framework `vite-react`)
- API: https://zantaz-api.doable.me
- Runner: `testcases/evidence/run-granular-turn.sh`
- Evidence dir: `testcases/evidence/env1/app-spreadsheet/`
- TC: `testcases/05-ai-chat/TC-AI-CHAT-SPREADSHEET.md`

## Per-turn results

| Turn | SSE ms | Preview ms | Prompt tok | Comp tok | Model | Changed files | Accept hits | Pass |
|-----:|-------:|-----------:|-----------:|---------:|-------|---------------|-------------|:----:|
| 1 | 74,200 | 80,316 | 106,850 | 3,193 | MiniMax-M2.7-highspeed | index.html, package.json, src/App.tsx, src/index.css, src/lib/utils.ts, src/main.tsx, vite.config.ts | -grid-cols-7 +contentEditable -onChange -rows.*=.*10 (1/4) | PASS |
| 2 | 30,690 | 36,791 | 46,942 | 1,457 | MiniMax-M2.7-highspeed | src/App.tsx | +localStorage.setItem +localStorage.getItem +cells (3/3) | PASS |
| 3 | 36,415 | 42,714 | 50,359 | 1,944 | MiniMax-M2.7-highspeed | src/App.tsx | +SUM +parse +startsWith.*= -reduce (3/4) | PASS |
| 4 | 29,399 | 34,964 | 54,445 | 2,184 | MiniMax-M2.7-highspeed | src/App.tsx | +text/csv +Blob +download +.csv (4/4) | PASS |
| 5 | 1,682 | 4,863 | — | — | — | — | — | BLOCKED — HTTP 429 rate-limit (3 retries also 429; each probe extends the bucket). See BUG-SHEET-001. |

## Notes

- **Turn 1** literal `grid-cols-7` regex missed; the AI used the
  semantically equivalent `style={{ gridTemplateColumns: "50px repeat(6, 1fr)" }}`
  on a `display:grid` container — same 7-column layout. ACCEPT regex was
  intentionally OR-of-substrings so a single hit (`contentEditable`)
  passes the turn. The TC notes this leniency explicitly.

- **Turn 2** wraps writes inside `useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data])`
  and reads via `localStorage.getItem(STORAGE_KEY)` inside `useState` initializer.
  Both `setItem` and `getItem` substrings hit; `cells` term hits as well.

- **Turn 3** parses `=SUM(A1:A3)` ranges with a regex (`/^=SUM\(([A-F])(\d+):([A-F])(\d+)\)$/i`)
  and a nested `for` loop accumulator. The literal token `reduce` did not
  appear because the AI implemented the sum imperatively rather than via
  `Array.reduce`. Behavior is correct; the regex set was over-specific.

- **Turn 4** the CSV button creates a `Blob` with type `"text/csv"` and
  triggers a hidden anchor `download` attribute with a `.csv` filename. All
  4 substrings hit.

- **Turn 5** hit a rate limit (HTTP 429, `Retry-After: 120`,
  `x-ratelimit-limit: 20`, `x-ratelimit-remaining: 0`). The `/projects/:id/chat`
  per-project budget is 20 calls / 120s. Five turns plus one manual retry
  inside ~3 minutes pushed us over. Window cleared and turn 5 re-run; see
  retry section below.

## Turn 5 retry attempts

- **Attempt 1** (after ~125s wait from initial 429 at 21:02:24): retried at
  21:04:32 — still 429. The bucket appears to extend itself on every probe
  while exhausted (`retry-after` header keeps resetting to 120).
- **Attempt 2** (after another ~130s wait, at 21:07:35): still 429.
- **Attempt 3** (manual probe at 21:08:06): still 429.

Net effect: the 5-min test cap was exceeded before the bucket could
clear. Turn 5 is therefore **BLOCKED** in this run, not failed. The first
4 turns pass on their own merits; turn 5 needs either:
1. raised per-project budget (see BUG-SHEET-001), or
2. a longer wait window without intermediate probes.

## Cumulative status

- 4 / 5 turns PASS (preview-200 within budget, App.tsx changed, ≥1 ACCEPT
  hit on each).
- 1 / 5 turns BLOCKED on rate-limit (HTTP 429), not on AI quality.
- All 4 passing turns were served by `MiniMax-M2.7-highspeed`.
- Cumulative tokens (turns 1–4): prompt ~258,596; completion ~8,778.
- Cumulative wallclock (turns 1–4 SSE): ~170 s; preview-stable: ~195 s.

## Bugs filed
- `testcases/99-runlog/env1/bugs/BUG-SHEET-001.md` — chat rate-limit budget
  too tight for granular multi-turn agent driving (20/120s).
