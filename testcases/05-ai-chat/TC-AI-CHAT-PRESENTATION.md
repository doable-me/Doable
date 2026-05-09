# TC-AI-CHAT-PRESENTATION — multi-turn slide presentation app

API endpoint: `POST https://${ENV}-api.doable.me/projects/{id}/chat`
Source: `services/api/src/routes/chat/send-handler.ts`
Runner: `testcases/evidence/run-granular-turn.sh`
Template: `vite-react`

This TC validates the AI's ability to **iteratively** build a non-trivial single-page React app
across five chat turns, each adding a feature on top of the previous turn's code. Unlike the
counter/landing/form smoke tests, this one stresses **multi-turn state preservation** —
the AI must keep prior features intact while adding new ones.

## Stage taxonomy (per turn)
Same as TC-AI-CHAT-PREVIEW-E2E (T0 → T_sse_done → T_preview_http_200). Per-turn timings
are recorded in `testcases/evidence/${ENV}/app-presentation/<project>.turn<N>.timing.tsv`
and aggregated in `app-presentation.summary.csv`.

## TC-AI-CHAT-PRES-001 — Seed (turn 1)
- **Pre:** owner JWT in `_tokens-${ENV}.json`; fresh vite-react project in target workspace.
- **Prompt:** `Build a 5-slide presentation app. Use a single component that shows one slide at a time. Each slide is a div with text-3xl heading + body text. Add Previous/Next buttons at the bottom; an indicator 'Slide N of 5'. Slides: 1) Welcome to Doable, 2) What is Doable, 3) Features, 4) Pricing, 5) Get Started. Use Tailwind.`
- **Acceptance (App.tsx grep):**
  - `text-3xl` class present
  - `Previous` button label
  - `Next` button label
  - `Welcome to Doable` (slide 1 content)
  - Indicator: regex `Slide.*of` (interpolation `Slide {currentSlide + 1} of {slides.length}` is acceptable; do NOT require literal `5`)
- **Expected:** SSE ≤ 60s, preview 200 ≤ 60s, all 5 grep hits.

## TC-AI-CHAT-PRES-002 — Keyboard navigation (turn 2)
- **Prompt:** `Add keyboard navigation: ArrowRight=next, ArrowLeft=prev, Home=first, End=last.`
- **Acceptance:** any of `ArrowRight`, `ArrowLeft`, AND any one of (`onKeyDown` | `addEventListener`).
- **Mutation expectation:** only `src/App.tsx` should change.

## TC-AI-CHAT-PRES-003 — Thumbnail strip (turn 3)
- **Prompt:** `Add a slide thumbnail strip at the bottom showing all 5 mini-slides; clicking jumps to that slide. Highlight current.`
- **Acceptance:** `map`, `onClick`, `currentSlide` all present. (Word `thumbnails` is optional —
  AI may use `mini-slides`, `previews`, etc.)

## TC-AI-CHAT-PRES-004 — Fade transition (turn 4)
- **Prompt:** `Add slide transitions — fade-in animation when slide changes. Use Tailwind transition classes.`
- **Acceptance:** `transition` AND `opacity` (Tailwind `opacity-*` + `transition-*` is canonical).
  Word `fade` is optional.

## TC-AI-CHAT-PRES-005 — Fullscreen toggle (turn 5)
- **Prompt:** `Add a fullscreen toggle button (top-right) that goes fullscreen using requestFullscreen API.`
- **Acceptance:** `requestFullscreen` literal AND `fullscreen` (state/var/class).

## EVOLVE rule (granular runner)
If a turn's `accept_hits` line shows a `-pattern` (miss), turn N+1 should **clarify what was
missed** before introducing the next feature. Exception: when the miss is a literal-word
mismatch but the **semantic** intent IS in the file (e.g. interpolated `{slides.length}` vs
literal `5`, or `mini-slides` vs `thumbnails`), document the false negative in the run log
and proceed. Do NOT chain a "fix" turn for a false negative.

## Failure modes (presentation-specific)
- **PRES-state-loss**: turn N+1 deletes a feature added in turn N (e.g. keyboard handler removed when adding fade). → BUG-PRES-NNN
- **PRES-only-css**: turn 4 adds CSS classes but no `transition` actually applied to slide container. → BUG-PRES-NNN
- **PRES-fullscreen-no-handler**: turn 5 adds a button but never calls `element.requestFullscreen()`. → BUG-PRES-NNN
- **PRES-thumbnails-static**: turn 3 renders 5 mini-slides but `onClick` doesn't update `currentSlide`. → BUG-PRES-NNN

## Smoke budget
Total 5-turn run target: **≤ 5 minutes wall-clock**. As of 2026-05-09 baseline: ~2.5 min on
`MiniMax-M2.7-highspeed`.
