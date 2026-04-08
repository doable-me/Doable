# Bugs — 2026-04-09 AI Chat E2E Audit

Findings from an end-to-end observation of the AI chat flow on localhost. **Caveat: this audit was shallow — a single-message probe, not a real user journey. Re-test with multi-turn prompts, functional app building, iterate-and-refine cycles, error recovery, and follow-up edits before relying on this list as comprehensive.**

## Test setup

- Project: `db9a5d1c-7164-47df-8402-17910ffabe75` (fresh Vite + React scaffold)
- User: `uniquegodwin@gmail.com` (platform admin)
- Single prompt: "Build a simple landing page at app/page.tsx with H1 'Doable Demo', 3-feature grid (Fast/Collaborative/Reliable), and a contact form with name+email + Submit. Use Tailwind."
- Stream wall time: ~49 seconds
- Result: stream completed cleanly, file `src/App.tsx` written, DOM matches

## Index (priority order)

| # | Severity | Title | File |
|---|---|---|---|
| 1 | 🔴 Critical | Preview + file tree + Monaco frozen during streaming | [bug-01-preview-frozen-during-streaming.md](bug-01-preview-frozen-during-streaming.md) |
| 9 | 🔴 Critical | Fresh scaffold ships with broken preview | [bug-09-scaffold-broken-preview.md](bug-09-scaffold-broken-preview.md) |
| 11 | ✅ Fixed 2026-04-09 | ~~"AI didn't respond in time" shown on successful multi-file turns~~ | [bug-11-sdk-silent-bail-emits-error-after-stream-done.md](bug-11-sdk-silent-bail-emits-error-after-stream-done.md) |
| 10 | 🟠 High | React Fast Refresh disabled in preview iframe | [bug-10-react-fast-refresh-disabled.md](bug-10-react-fast-refresh-disabled.md) |
| 2 | 🟠 High | Silent CRDT fallback + no `/internal/yjs/write` success logging | [bug-02-silent-crdt-fallback.md](bug-02-silent-crdt-fallback.md) |
| 12 | ✅ Partially fixed 2026-04-09 | ~~Preview `localStorage` leaks across projects~~ (Storage-only; SW/IDB/cookies still open) | [bug-12-preview-localstorage-leaks-across-projects.md](bug-12-preview-localstorage-leaks-across-projects.md) |
| 6 | 🟡 Medium | `ai_messages.tool_actions` column empty despite 4 tool_calls | [bug-06-tool-actions-not-persisted.md](bug-06-tool-actions-not-persisted.md) |
| 3 | 🟡 Medium | WS server stdout detached from tmux on dev box | [bug-03-ws-stdout-detached.md](bug-03-ws-stdout-detached.md) |
| 8 | 🟡 Medium | `localhost` ≠ `127.0.0.1` drops auth on navigation | [bug-08-localhost-vs-127-auth-drop.md](bug-08-localhost-vs-127-auth-drop.md) |
| 4 | 🟢 Low | Unmapped SDK event `session.custom_agents_updated` | [bug-04-unmapped-sdk-event.md](bug-04-unmapped-sdk-event.md) |
| 5 | 🟢 Low | Inconsistent `tool.execution_*` logging | [bug-05-inconsistent-tool-logging.md](bug-05-inconsistent-tool-logging.md) |
| 7 | 🟢 Low | `POST /projects/` (trailing slash) returns 404 | [bug-07-projects-trailing-slash-404.md](bug-07-projects-trailing-slash-404.md) |

## Recommended fix sequence

1. **Bug 10 → Bug 1.** Bug 10 restores React Fast Refresh; with it, Bug 1's live-refresh becomes a cheap component swap instead of a jarring full iframe reload every 3–6s.
2. **Bug 9.** First-impression killer: new projects look broken until the first prompt lands.
3. **Bug 2.** Add observability *before* the Yjs path silently breaks in prod.
4. **Bug 6.** Trivial persistence fix; richer chat history.
5. **Bug 3.** Dev-ops hygiene on this machine.
6. **Bugs 4, 5, 7, 8.** Polish, at leisure.

## What's NOT in this audit (and should be in a follow-up)

A single one-shot probe cannot surface bugs that only appear in realistic use. Before trusting this list, re-run with:

- **Multi-turn conversations.** Build a feature, then ask for a modification, then fix a bug, then add polish. Does context carry? Do subsequent edits conflict? Does the assistant re-read the right files?
- **Actually-functional apps**, not a static landing page. Build a to-do list with persistence. Build a form that POSTs to an API route. Build something with state, effects, data fetching, error boundaries.
- **Intentional error induction.** Ask for something that won't compile, then see if the auto-fix loop works. Kill the WS server mid-stream and watch the silent fallback bite. Disconnect from the internet mid-tool-call.
- **Concurrent sessions.** Two browser tabs on the same project. Does Yjs keep them in sync? Do chat turns collide?
- **Long runs.** A 5-minute generation. A 20-minute plan-mode build. Does the SSE heartbeat actually prevent the Cloudflare Tunnel idle-timeout drop? Does the engine pool leak?
- **Resume flows.** Submit, refresh the page mid-stream, watch recovery.
- **Abort + retry.** Hit Stop mid-stream. Does it actually stop? Can you then continue?
- **Deploy + publish.** Click Deploy after a build. Does the published version match the preview?
- **Install packages.** Ask for a feature that requires a new npm dep. Does `install-package` actually run? Does the build pick it up?

## Audit methodology

- Team: 6 Opus 4.6 agents via TeamCreate (`chat-e2e-watch`)
- Roles: ui-driver (Chrome), api-watcher (API server logs), ws-watcher (WS state), db-watcher (Postgres), fs-watcher (disk), browser-watcher (Chrome devtools)
- Outcome: 3 agents delivered thoroughly (ui-driver, api-watcher, ws-watcher). 3 stalled on environment friction (db/fs/browser) — team-lead ran their work directly via Bash+Read+node/pg rather than wait indefinitely
- Methodology flaw: idle teammates should have been pinged with a hard deadline after ~60s, not left to silently spin
- Methodology flaw: the single-prompt probe was too shallow; should have been a multi-turn user journey
