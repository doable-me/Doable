# BUG-VISUAL-EDIT-001 — "AI has been investigating without making changes" on simple Visual Edit prompts

**Severity:** HIGH (visual edit is a primary user flow; aborting on simple requests breaks the feature)
**Found:** 2026-05-10 — user-reported, replayed live in env1 editor
**Where:** AI chat → Visual Edit mode

## Reproduction

1. Open the editor for any project with a rendered preview.
2. Switch to **Design View**.
3. Select an element (user selected `<p class="text-lg sm:text-xl text-muted" selector="#root > div.min-h-screen.bg-dark > section.relative…">`).
4. In the chat, type **"animate this text"** and send.

The chat fills in the `[Visual Edit]` prefix automatically:

```
[Visual Edit] For the <p> element with class "text-lg sm:text-xl text-muted"
(selector: #root > div.min-h-screen.bg-dark > …): animate this text
```

## Actual

The AI replies:

> **The AI has been investigating without making changes. Please provide more specific guidance, or check the preview console for errors.**

No `edit_file` / `create_file` tool call. Element not animated. User has to retry.

## Expected

The AI should perform the obvious edit — wrap the `<p>` in an `animate-pulse` / `transition-all` class, or add a Framer Motion / Tailwind keyframes rule, etc. The **selector + element class + a one-word verb** is enough context for any Visual Edit request.

## Root cause hypothesis (PRIMARY)

This wording **matches the new BUG-PWA-001 thinking-loop watchdog** that bug-fixer just added in `services/api/src/routes/chat/send-handler.ts` (`CHAT_THINKING_LOOP_ABORT_MS=180000`, `CHAT_THINKING_LOOP_GRACE_MS=15000`). The watchdog fires when:
- > 15 s elapsed since turn start AND
- > 180 s since last "real event" AND
- no tool call yet AND
- no assistant content/thinking emitted

For Visual Edit prompts, the AI may legitimately think for a while before editing (it's reading the selector path, finding the relevant JSX, planning the animation). If the watchdog short-circuits before the first tool_call, the user sees this fallback message.

The message text "investigating without making changes" is *not* in the watchdog's emitted JSON (it emits `thinking_loop`), so this may be a **frontend translation** of the watchdog SSE error, OR a separate Visual-Edit-specific abort path.

## Root cause hypothesis (SECONDARY)

Visual-Edit-mode prompt template in the system prompt may require the model to explicitly call a tool, but if the user's request is ambiguous the model emits a clarifying question instead of editing — the system might then convert that into the "investigating" message.

## Investigation steps

1. `grep -rn "investigating without making changes" services/api apps/web` — find the exact emitter.
2. Check whether the watchdog's `error: thinking_loop` is the source, OR if `services/api/src/routes/chat/auto-continue.ts` has a "no-mutation detected" branch that emits this.
3. Verify the Visual Edit system prompt explicitly tells the AI: "the user has selected a specific element. You have full context. Make the edit IMMEDIATELY using `edit_file`."

## Suggested fix

- **If watchdog**: extend the grace period for Visual Edit turns (e.g. `CHAT_THINKING_LOOP_GRACE_MS=45000` when prompt starts with `[Visual Edit]`), OR exempt Visual Edit from the watchdog entirely — Visual Edit by definition has a unique selector + intent so the AI should never get truly stuck.
- **If "no-mutation" branch**: when the model emits a clarifying question on Visual Edit, FIRST nudge with one auto-continue ("perform the edit now using edit_file") before showing the user the "needs guidance" message.
- **Always**: improve the Visual Edit system-prompt suffix — explicit instruction "you must invoke `edit_file` within this turn; the selector tells you exactly what to modify".

## Acceptance

After fix:
1. User selects an element in Design View, types "animate this text" → AI emits at least one `edit_file` tool call AND the rendered preview shows the animation.
2. Watchdog still protects against genuine infinite-thinking loops on non-Visual-Edit prompts.

Regression TC at `testcases/05-ai-chat/TC-VISUAL-EDIT-SIMPLE-PROMPT.md` covering 5 cases (animate, color change, padding tweak, font weight, hide element).
