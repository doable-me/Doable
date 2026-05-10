# TC-VISUAL-EDIT-SIMPLE-PROMPT — Visual Edit short prompts produce an `edit_file` (not the "investigating" bail)

Source: BUG-VISUAL-EDIT-001 (env1, 2026-05-10).
Helpers under test:
- `services/api/src/routes/chat/stream-recovery.ts:51-72` —
  `isVisualEditPrompt()` + `userWantsBuild()` (now treats Visual Edit as
  unconditional build intent).
- `services/api/src/routes/chat/stream-recovery.ts:99-160` —
  `handleAutoContinue()` now uses `MAX_READ_ONLY_CYCLES_VISUAL_EDIT = 5`
  (vs 3 for everything else) and a selector-aware continue prompt for
  Visual Edit turns.
- `services/api/src/routes/chat/system-prompts.ts:72-90` —
  `buildVisualEditPrompt()` now mandates `edit_file` in this turn, caps
  reads at 1, and forbids the "ask for more guidance" stall.

Root cause covered: Visual Edit prompts arrive with full selector context,
but the model would sometimes do 3 short reads before committing to an
edit. The previous `MAX_READ_ONLY_CYCLES = 3` ceiling tripped, surfacing
the "AI has been investigating without making changes" bail message
instead of the obvious edit. Three layers of fix:

1. **Higher tolerance**: Visual Edit turns get 5 read-only cycles instead
   of 3 before the stall guard fires.
2. **Sharper nudge**: when the loop does fire on Visual Edit, the
   continue prompt names the selector + verb explicitly and orders an
   immediate `edit_file` (instead of the generic "create all the files").
3. **Stronger system prompt**: the Visual Edit system message now
   explicitly tells the model "you have full context, invoke `edit_file`
   in this turn, do NOT stall asking for guidance".

The watchdog (CHAT_THINKING_LOOP_*) is unchanged — it was a red herring;
its message is `thinking_loop`, not "investigating without making
changes". This bug was the auto-continue read-only-cycle stall.

---

## TC-VISEDIT-001 — "animate this text" → at least one `edit_file` call

- **Setup:** any project with a rendered preview, a simple `<p>` element
  selected via Design View. The chat panel auto-prefixes
  `[Visual Edit] For the <p> element with class "..."  (selector: ...): `.
- **Steps:** type `animate this text` and send.
- **Expected:**
  - SSE stream emits ≥ 1 `tool_call` event with `name: "edit_file"`.
  - Trace `tool_call_count > 0` for the turn (BUG-TRACE-001 regression).
  - Trace contains NO `error` event with category `auto_continue_write_free`.
  - Final assistant text reads as a short summary (≤ 2 sentences).
  - Rendered preview shows the animation (manual UI verification).
- **Severity:** high (the original BUG-VISUAL-EDIT-001 repro).

## TC-VISEDIT-002 — "make it red" → at least one `edit_file` call (color change)

- **Steps:** select any text element, send `make it red`.
- **Expected:** as 001. The edit should add a Tailwind `text-red-*` class
  or equivalent inline style.
- **Severity:** high

## TC-VISEDIT-003 — "add more padding" → at least one `edit_file` call (spacing)

- **Steps:** select any container element, send `add more padding`.
- **Expected:** as 001. The edit should add/raise a `p-*` Tailwind class.
- **Severity:** medium

## TC-VISEDIT-004 — "make this bold" → at least one `edit_file` call (font weight)

- **Steps:** select a text element, send `make this bold`.
- **Expected:** as 001. The edit should add `font-bold` or `font-semibold`.
- **Severity:** medium

## TC-VISEDIT-005 — "hide this on mobile" → at least one `edit_file` call (responsive)

- **Steps:** select any element, send `hide this on mobile`.
- **Expected:** as 001. The edit should add `hidden sm:block` or
  equivalent responsive utilities.
- **Severity:** medium

---

## Regression / negative-path guards

These are NOT new acceptance cases for this bug, but ensure the fix
didn't over-loosen the auto-continue safety net.

## TC-VISEDIT-NEG-001 — Non-Visual-Edit short prompt still bails after 3 cycles

- **Steps:** in agent mode (NOT Visual Edit), send a vague prompt that
  the model will explore without writing — e.g. `look at the project`.
- **Expected:** after 3 read-only auto-continue cycles, the SSE stream
  emits the original `error: "The AI has been investigating without making changes…"` message. Confirms the looser ceiling is gated on Visual Edit only.
- **Severity:** medium

## TC-VISEDIT-NEG-002 — Visual Edit with no selectable JSX still bails gracefully

- **Setup:** synthetic Visual Edit turn whose selector points at an
  element that doesn't exist in any source file.
- **Steps:** craft `[Visual Edit] For the <p> element (selector: #nonexistent): make it red`.
- **Expected:** after 5 read-only cycles, the SSE stream emits the
  Visual-Edit-specific bail:
  `"I couldn't apply the visual edit automatically. Try rephrasing — for example, name the exact change…"`
  NOT the generic "investigating without making changes" message.
- **Severity:** medium

## TC-VISEDIT-NEG-003 — `userWantsBuild` still skips auto-continue on read-only intent (non-Visual-Edit)

- **Steps:** send `what does the layout file do?` in agent mode.
- **Expected:** auto-continue is skipped (log line `auto-continue skipped — read-only user intent`); no continue prompt fires; trace contains no `auto_continue` events. Confirms the Visual Edit shortcut in `userWantsBuild` doesn't accidentally treat normal read-only prompts as builds.
- **Severity:** low (regression guard only).
