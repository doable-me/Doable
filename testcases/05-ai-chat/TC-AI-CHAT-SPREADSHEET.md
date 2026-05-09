# TC-AI-CHAT-SPREADSHEET — multi-turn build of an editable spreadsheet via AI

API endpoint: `POST https://${ENV}-api.doable.me/projects/{id}/chat`
Source: `services/api/src/routes/chat/send-handler.ts`
Runner: `testcases/evidence/run-granular-turn.sh`

This TC validates the AI's ability to build, evolve, and ship a non-trivial
client-side application (a 10x6 editable spreadsheet) across five sequential
turns inside one project. Each turn exercises a distinct capability area:
DOM/grid layout, browser-API persistence, formula parsing, file download,
and interactive sort. Acceptance is **substring/regex grep** against the
generated `src/App.tsx` plus a 200-OK preview probe within 60s of SSE done.

## Pre-conditions
- Owner JWT in `testcases/evidence/_tokens-${ENV}.json` (`qa-owner.access`).
- A fresh project of `framework_id = vite-react` in the test workspace.
- The AI provider is configured; rate-limit budget is 20 chat POSTs / 120s
  per project — pace turns accordingly.

## Turns

| # | Prompt (verbatim) | ACCEPT regex (`\|`-separated, OR-of-substrings on `src/App.tsx`) |
|---|-------------------|-------------------------------------------------------------------|
| 1 | Build a 10x6 editable spreadsheet. Each cell is a contentEditable div (or input) with grid borders. Use Tailwind grid (grid-cols-7 with row-header column). Show A-F as column headers, 1-10 as row numbers. | `grid-cols-7\|contentEditable\|onChange\|rows.*=.*10` |
| 2 | Persist all cell values to localStorage so values survive a refresh. | `localStorage\.setItem\|localStorage\.getItem\|cells` |
| 3 | If a cell starts with '=' followed by a SUM formula like =SUM(A1:A3), parse it and display the sum. Other formulas show as-is. | `SUM\|parse\|startsWith.*=\|reduce` |
| 4 | Add Save-as-CSV button that downloads the current sheet as a Blob (Content-Type: text/csv). | `text/csv\|Blob\|download\|\.csv` |
| 5 | Add a Sort-by-column dropdown — pick a column letter, then ascending/descending. | `sort\|select\|asc\|desc` |

## Steps (per turn)
1. Run `run-granular-turn.sh` with `ENV_NAME / API_BASE_URL / PROJECT_ID /
   TURN / TEST_NAME=app-spreadsheet / ACCEPT_PHRASES / PROMPT`.
2. The runner streams SSE, snapshots project source SHAs before/after,
   diffs them, fetches the resulting `src/App.tsx`, probes the preview
   URL until 200 (or 60s timeout), and appends a row to
   `${TEST_NAME}.summary.csv`.
3. Inspect the printed summary — at least **one** ACCEPT regex must match
   `+`, and `T_preview_http_200` must be non-`TIMEOUT`.

## Acceptance (per-turn pass criteria)
- `T_preview_http_200` < 90s (T_total budget for an evolution turn).
- `src/App.tsx` mtime/SHA changed in `diff.log` (mutation actually
  happened; not a scaffold-only no-op).
- At least **one** ACCEPT regex matches the post-turn `App.tsx`. (Multi-hit
  is recorded but a single hit is enough — the AI is allowed to phrase
  the implementation idiomatically, e.g. `gridTemplateColumns: 50px repeat(6, 1fr)`
  satisfies the "7-column grid" intent even though the literal class
  `grid-cols-7` is absent.)

## Acceptance (cumulative pass criteria)
- 5/5 turns reach SSE `[DONE]` with non-empty `App.tsx` payload.
- Cumulative changed-file set is the union of expected mutation areas
  (App.tsx every turn, plus scaffold files only in turn 1).
- Final preview iframe renders a sortable, persistable, CSV-exportable
  spreadsheet.

## Failure modes and bug filing
- **rate-limit** (HTTP 429 from `/projects/:id/chat`): turn skipped, no
  SSE produced. Retry after `Retry-After`. File only if the rate-limit
  itself is misconfigured. → BUG-SHEET-001 if budget is unreasonably low.
- **scaffold-only**: SSE done but `src/App.tsx` SHA unchanged.
  → BUG-AI-CHAT-NO-MUTATION (existing).
- **ACCEPT all-miss**: App.tsx changed but none of the regexes fire — the
  AI wrote a plausible-looking but off-spec implementation. → BUG-SHEET-NNN
  with the diff.
- **preview-stuck**: 60s timeout on preview probe. → BUG-AI-CHAT-PREVIEW-STUCK.
- **no-AI-tokens**: `usage.completionTokens=0`. → BUG-WEB-AI-001.

## Severity
- High (gates "AI builds a real, multi-feature app" claim).

## Evidence artefacts (under `testcases/evidence/${ENV}/app-spreadsheet/`)
- `<project>.turn<N>.prompt.txt` — verbatim prompt
- `<project>.turn<N>.sse.jsonl` — raw SSE event stream
- `<project>.turn<N>.timing.tsv` — wallclock per event
- `<project>.turn<N>.src-before.txt` / `src-after.txt` — sha256sum of project tree
- `<project>.turn<N>.diff.log` — SHA delta
- `<project>.turn<N>.App.tsx` — post-turn source for grep
- `<project>.turn<N>.probe.tsv` — preview HTTP probe trail
- `app-spreadsheet.summary.csv` — one row per turn (sse_ms, preview_ms, tokens, model, ACCEPT hits)

## Run log
See `testcases/99-runlog/${ENV}/app-spreadsheet.md` for the actual
chronological run with timings, diffs, and bug refs.
