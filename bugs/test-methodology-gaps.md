# Test methodology gaps in the 2026-04-08 audit

Honest retrospective on the end-to-end AI chat audit so the next round of testing is actually trustworthy.

## What this audit was

- **One** chat prompt, sent **once**, in a **fresh** project
- Prompt: build a static landing page with an H1, a 3-column feature grid, and a contact form
- Prompt complexity: no state, no data, no API integration, no multi-file work, no error cases
- Duration of real chat interaction: ~49 seconds
- Duration of watcher/observer activity afterwards: way, way longer than that

## What a real user would do that this audit didn't

A real user building something on Doable would, in approximately one session:

1. **Start vague, refine**: "build me a landing page" → "add a pricing section" → "make the pricing cards feel more premium" → "the submit button should email me" → "that's not working, check the form"
2. **Multi-turn conversation** — at least 5-20 prompts per session, with the assistant carrying context across turns
3. **Functional app building** — to-do list with state, a chat app with real-time updates, a dashboard with data, a form that POSTs to an API route — not a static landing page
4. **Deliberate errors + recovery** — ask for something impossible, ask for something with a syntax error, run into a build failure and use the auto-fix flow
5. **File-aware prompts** — "make the header in App.tsx use a dark theme" (requires the AI to actually read and edit a specific file)
6. **Abort + resume** — hit Stop mid-stream, maybe retry the same prompt with tweaks
7. **Page refresh mid-build** — F5 while the AI is working, verify the resume path (the one code path we *did* find dead but only through code reading, not testing)
8. **Concurrent tabs** — two browser tabs on the same project. Does Yjs sync? Do chat turns collide? Can two users chat simultaneously?
9. **Long runs** — a 5-minute plan-mode build. Does the SSE heartbeat keep the connection alive? Does the engine pool leak?
10. **Deploy + publish** — after building, click Deploy. Does the published URL match the preview? Does the subdomain work?
11. **Install packages** — ask for a feature that requires `npm install some-lib`. Does `install-package` actually run? Does Vite pick up the new dep?
12. **Visual edit** — use the element-picker overlay to click a button in the preview and ask the AI to "make this blue." Does the visual-edit bridge actually work end-to-end?
13. **Git + GitHub** — connect a repo, commit changes, push to GitHub. Does the OAuth flow hold up?
14. **Custom domains** — associate a domain, verify DNS. Does it work?

This audit covered essentially item 0: "a single static page prompt produces a file that renders correctly." That's the happy path of the happiest path.

## What the audit did well

- **Team architecture** — parallel observers (Chrome driver + API logs + WS state + DB + disk) gave good triangulation across layers. The methodology is sound; the inputs were too narrow.
- **Root cause analysis** — when a symptom was found (preview not live-updating), we dug into the code to find the actual mechanism (wrong useEffect gate + missing wire-up in the local stream handler). The findings are actionable.
- **Cross-layer correlation** — proving the CRDT path worked by comparing filesystem states across `services/api/projects/` and `services/ws/projects/` was genuinely clever triangulation in the absence of proper logging.

## What the audit did poorly

- **Too shallow.** One prompt, one turn, one file, one test. Any bug that only appears after the 2nd or 10th turn — invisible.
- **Too static.** A landing page is the easiest possible thing an LLM can build. Bugs that require real app complexity (state management, effects, routing, data fetching) — invisible.
- **No error induction.** We didn't ask for anything that would fail. The auto-fix loop was never exercised. The error recovery path was never tested.
- **No duration stress.** The test ran for 49 seconds. The SSE heartbeat's 45s abort timeout wasn't even approached. Long-run behavior (memory, pool, heartbeat) — untested.
- **No concurrency.** A single tab, single user. Everything about Yjs multi-client collaboration — untested.
- **Watcher discipline was poor.** Three of six watchers (db, fs, browser) went silent after initial assignment and were never pinged with a hard deadline. Team-lead waited indefinitely, eventually ran their work directly. Should have been: "no response in 60s → ping. No response in 120s → take over." Teammates with environment friction (MCP tool loading, missing pg module path) should have self-reported instead of silently retrying.
- **"Watching after the party ended."** Once ui-driver finished its single prompt, the actually-interesting observational window closed. The watchers continued to poll/wait for more, and the team-lead continued to wait for reports, long past the point where there was nothing new to observe. Should have either (a) immediately sent follow-up prompts to keep the actual work going, or (b) wrapped up the watch phase and moved to synthesis.
- **Gif recording was useless.** The gif creator only captures frames on `computer`/`navigate` MCP actions, and the driver chose to use `javascript_tool` instead. Result: a 1-frame gif. Either don't claim to record a gif, or drive with actions that actually produce frames.

## Recommended re-test plan

### Phase A — sanity of last-turn behaviors already flagged

Before anything new, confirm each of the 10 bugs reproduces outside this specific fresh-project scenario. e.g. the frozen-preview bug should reproduce on the 2nd, 3rd, and 10th turn of an existing project, not just on the first turn of a fresh one. If any bug fails to reproduce with a slightly different scenario, note that in the bug file.

### Phase B — multi-turn user journey

Spawn a team where the ui-driver has an explicit **script** of prompts to send sequentially, not just one. Example 10-turn script:

1. "Build a to-do list app. Items should have a title, a checkbox, and a delete button. Store them in localStorage so they persist across refreshes."
2. "Add a filter at the top: All / Active / Completed. Clicking should filter the visible items."
3. "Add a count of remaining items at the bottom, and a 'Clear completed' button."
4. "The delete button is too small on mobile. Make it bigger and more obvious."
5. "Add a dark mode toggle in the header."
6. "The dark mode isn't persisting. Fix it."
7. "Add keyboard shortcuts: Cmd+K to focus the input, Esc to clear it."
8. "Export the todos as JSON when I click a button."
9. "Now let me import from JSON too."
10. "Make the whole thing feel more polished — better typography, spacing, colors."

This exercises: multi-turn context, iterative refinement, file-aware edits, error cases (turn 6), feature additions, functional state management, persistence, polish.

Each turn should have its own watcher observation window, and the final correlation should identify bugs specific to each turn's class of operation (context retention on turn 2, file-editing precision on turn 4, bug-fix mode on turn 6, etc.).

### Phase C — deliberate failure modes

Three specific tests:
- **Kill WS mid-stream** — on turn 3, have an observer send `kill -TERM` to the WS process while the AI is editing. Confirm the silent-fallback bug from [bug-02](bug-02-silent-crdt-fallback.md) actually bites.
- **Ask for something unbuildable** — "add a button that uses the `useNuclearLaunch()` hook from React 20" → observe error handling, auto-fix flow, user-facing error messages.
- **Refresh mid-stream** — on turn 5, F5 the editor during streaming → observe the resume path.

### Phase D — concurrency

Two browser tabs on the same project. One tab sends "build X", the other tab sends "build Y" at the same time. Observe: do both get queued? Does one get rejected? Does Yjs end up with a coherent file state? Does the chat history contain both turns?

### Phase E — long run

A single prompt with `mode=plan`: "build a full task management app with user auth, projects, tasks, comments, notifications, and a dashboard, using Next.js App Router, Prisma, Postgres, and NextAuth." Let it run for 10+ minutes. Observe: SSE heartbeat cadence, memory usage, engine pool behavior, any connection drops.

## Team-lead discipline rules for next audit

1. **No silent teammates.** If an agent hasn't reported in 60 seconds of in_progress task, ping with a hard deadline: "ack in 30s or I take over."
2. **No indefinite waiting.** If a teammate hasn't responded in 120 seconds, take over their task. Don't wait for three consecutive "still thinking" signals before acting.
3. **Watch windows end with the work.** When the primary action (chat stream) completes, immediately decide: send the next prompt, or wrap up. Don't sit in an observational limbo.
4. **Use the task list as a heartbeat.** Tasks stuck in `pending` after their dependencies resolve are a red flag — they mean an agent is stuck on environment setup, not actually working. Act on that signal.
5. **Drive like a user, not a QA script.** A user sends follow-up messages. A user iterates. A user asks to fix the thing that broke. Drive like that, not like you're verifying a checklist.
