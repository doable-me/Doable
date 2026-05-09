# Doable TC Author Guide — Acceptance Regex, Path Validation, Multi-Turn Evolution

Reference for everyone writing or evolving test cases under `testcases/`. Born from corpus-runner sessions where literal-string accept patterns rejected functionally-correct AI output. **If your TC has an `## Acceptance` block, it MUST follow rules 1 and 4 below.**

## 1. Acceptance regex MUST cover semantic equivalents

AI output is *intent-correct, identifier-variant*. Hard-coded literals are brittle. For each acceptance intent, write a regex that admits the common synonyms our own corpus has produced.

### Regex menu by intent

| Intent | Wrong (literal) | Right (semantic regex) |
|---|---|---|
| State setter for a "selected piece" | `setSelectedPiece` | `set(Selected\|Active\|Current)(Piece\|Square\|Cell)?\b` |
| "White to move" turn label | `White to move` | `(White\|Black)\s*(to\s+move\|'s\s+turn)` — also tolerate split JSX: `\{[^}]*?\?\s*["']White["']` |
| Tailwind fade animation | `fade` | `(fade\|transition-(opacity\|all)\|animate-(fade\|pulse))` |
| Thumbnail / mini-slide nav | `thumbnails` | `(thumbnails?\|mini[-_ ]?slides?\|slide[-_ ]?previews?)` |
| Move-history panel heading | `Move history` (case-sensitive) | `(?i)move\s+history\|history\s+of\s+moves\|moves?\s+log` |
| Reset button | `Reset` | `(?i)reset\|clear\|new\s+game\|restart` |
| Increment / decrement | `+1` / `-1` | `[\+＋]\s?1\|increment` and `[\-−–—]\s?1\|decrement` |
| Form input by name | `name="email"` | `(name\|id\|aria-label)=["'][^"']*?email[^"']*?["']\|type=["']email["']` |
| JSX expression rendering | text match only | also try `\{[^}]*?["']<literal>["']` to catch ternary/conditional renders |

### JSX expression-vs-literal trap

`"White to move"` may appear as:

```jsx
<h1>White to move</h1>                       // literal — caught by /White to move/
<h1>{turn} to move</h1>                      // identifier — needs broader regex
<h1>{isWhiteTurn ? "White" : "Black"} to move</h1>  // ternary — split across nodes in DOM
```

When asserting against rendered DOM (preview iframe), assert against `textContent` of an ancestor — never `innerHTML` or source code. When asserting against generated source, regex must allow `\{[^}]*\}` between identifier tokens.

### Tailwind class variants

Always allow the family, not the exact class: `text-(4xl\|5xl\|6xl\|7xl)`, `flex(\s+|-)(row\|col)?`, `gap-(2\|3\|4\|6)`. Designs are equivalent; pixel-exact matches reject correct work.

## 2. Path validation in TC writing

Before writing a `curl` or `fetch` example into a TC, **verify the route mount**.

1. `Grep` the API source for the verb + path tail: e.g. `app.post('/versions` or `\.post\(["']\/projects.+versions`.
2. Confirm parent mount in `services/api/src/index.ts` (or the route registrar). A handler at `/versions/restore` mounted under `/projects/:projectId` becomes `/projects/:projectId/versions/restore` — **not** `/versions/restore`.
3. Open one existing passing TC in the same area and copy its URL prefix. Don't invent.
4. If unsure, run the curl against staging once with `-i` and confirm the status before pasting into the TC.

The corpus runner found `/versions/*` paths in TCs whose handlers actually live under `/projects/:id/versions/*`. Same trap exists for any nested resource.

## 3. Multi-turn evolution — diagnose-then-evolve recipe

When an `accept_hit` is `false` but you suspect the AI output was correct, **do not retry the same prompt**. Run this 4-step recipe:

1. **Capture** — save the actual rendered DOM (or generated source) to `evidence/<TC-ID>.actual.html`. Diff against expected.
2. **Classify** the miss:
   - **regex-too-strict** → expand the regex per the menu in section 1; re-run.
   - **prompt-ambiguous** → AI made a defensible choice (e.g. "fade" vs "transition-opacity"). Tighten the prompt with an explicit example, e.g. *"Use Tailwind's `transition-opacity` and `opacity-0 hover:opacity-100` for the fade."*
   - **route-wrong** → fix the path per section 2.
   - **real bug** → file under `bugs/` and link from `99-runlog/FINDINGS.md`.
3. **Evolve, don't repeat** — the next prompt MUST add a clarification ("rename it to X" / "use class Y") OR the regex MUST be broadened. Never re-issue the identical prompt expecting different output.
4. **Record** — in the TC's `## Evolution Log` (append-only): turn N, classification, change made, new accept result.

## 4. Cross-session quality rule

Every TC file with assertions must include an `## Acceptance` section containing **both** variants:

```markdown
## Acceptance
- **Literal (display in report):** "White to move"
- **Regex (used by runner):** `(?i)(white|black)\s*(to\s+move|'s\s+turn)`
- **DOM target:** preview-iframe → first `<h1>` `textContent`
```

The literal is for human reviewers reading the TC. The regex is what the runner actually evaluates. **Authors who supply only one fail review.**

## See also
- `testcases/05-ai-chat/TC-AI-CHAT-PREVIEW-E2E.md` — preview DOM acceptance reference
- `testcases/_INDEX.md` — corpus map
- `testcases/99-runlog/FINDINGS.md` — accepted bugs vs author-guide regressions
