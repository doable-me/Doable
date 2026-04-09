---
description: Full E2E test of the Doable AI chat using Chrome browser automation with a team of parallel agents. Tests like a real user building a functional app over 5+ turns with parallel observers monitoring logs, API, WebSocket, and preview state.
user-invocable: true
---

# Test AI Chat - Full E2E

You are about to run a comprehensive end-to-end test of the Doable AI chat system. Follow the methodology below exactly.

## Pre-Flight

1. Verify all 3 services are running (web on 3000, API on 4000, WS on 4001). Start any that are down.
2. Get Chrome tab context via `mcp__claude-in-chrome__tabs_context_mcp`.
3. Confirm user is logged in by navigating to `http://localhost:3000/dashboard` and checking for the user avatar/name.

## Phase 1: Plan the Multi-Turn Script

Before spawning any agents, plan a **5-10 turn user journey** that builds a **functional app** (not a static page). The app MUST require state, effects, data persistence, or routing. Examples:
- A task manager with drag-and-drop, filters, and localStorage
- A recipe book with search, categories, and favoriting
- A budget planner with charts, categories, and CSV export
- A habit tracker with streaks, calendar view, and stats

Plan each turn to exercise a different class of operation:
1. **Initial build** - full app scaffolding from a detailed prompt
2. **Context-carrying refinement** - "now add X to the Y section" (tests context retention)
3. **Error correction** - "that's wrong, the X should do Y instead" (tests fix capability)
4. **Feature addition** - add a new feature that touches multiple files
5. **Polish/UX** - "make the colors more vibrant" or "add animations" (tests visual edits)
6. **Stress test** - long complex prompt OR rapid follow-up while still generating

## Phase 2: Spawn the Team

Create a team of agents with these roles:

### Agent 1: UI Driver (Opus 4.6) — LEAD
- Drives the Chrome browser as a real user
- Creates a new project from the dashboard using the build prompt
- Sends each planned turn, waits for completion, verifies preview
- After each turn: screenshot the preview, check for errors, verify the app works
- Tests the app interactively (click buttons, fill forms, verify state)
- After all turns: F5 refresh and verify full chat history + preview persist
- Records findings with screenshots

### Agent 2: Log Watcher (Haiku) — OBSERVER
- Tails the API server output continuously
- Pushes a summary to lead every ~10 seconds while builds are in flight
- Reports ANY error/warning/timeout immediately with `URGENT:` prefix
- Monitors for: SDK timeouts, grace-period logs, tool call failures, 500 errors, uncaught exceptions
- At end: summarize total request count, error count, average response time

### Agent 3: Root Cause Analyst (Opus 4.6) — ON-DEMAND
- Only activated when a bug is found
- Reads the relevant source code to find root cause
- Checks recent git history for related changes
- Produces a bug report with: description, repro steps, root cause, suggested fix, severity

## Phase 3: Execute Tests

The UI Driver runs through all planned turns while the Log Watcher monitors in parallel.

### For EACH turn, verify:
- [ ] Message appears in chat
- [ ] AI starts responding (streaming dots visible)
- [ ] "Stop Doable" button appears during generation
- [ ] Tool calls appear (Creating file, Updating file, Reading file)
- [ ] AI response renders with markdown formatting
- [ ] Preview updates after build completes (or after manual refresh)
- [ ] Suggestion chips appear after response
- [ ] Thumbs up/down and copy buttons present

### After ALL turns, verify:
- [ ] F5 refresh preserves full chat history (all turns)
- [ ] Preview still shows correct app state after refresh
- [ ] Chat input ready for new messages
- [ ] Code view shows all created/modified files with syntax highlighting
- [ ] No console errors (check via browser console)
- [ ] No hanging/pending network requests

### Deliberate Failure Tests (pick 2):
- Refresh page mid-build and verify recovery
- Send a follow-up while AI is still generating
- Open same project in a second tab and verify collaboration state
- Ask for something impossible and verify graceful error handling
- Rapidly send 3 messages and verify deduplication

## Phase 4: Bug Reporting

For every issue found, write a bug report to `bugs/` folder with:
```
Title: [BUG-NNN] Short description
Severity: Critical / High / Medium / Low
Repro Steps: 1. 2. 3.
Expected: What should happen
Actual: What actually happened
Root Cause: (from Root Cause Analyst)
Evidence: Screenshots, log excerpts, timestamps
Suggested Fix: Code-level fix suggestion
```

## Phase 5: Fix & Verify Loop

If bugs are found:
1. Close the testing team
2. Spawn a fix team with one Opus agent per bug (non-overlapping files)
3. After fixes, re-spawn the testing team to verify
4. Repeat until all bugs pass

## Key Rules
- **Drive like a real user** - not a QA script. Real users iterate, make mistakes, go back.
- **Build functional apps** - not static pages. State, effects, persistence, routing.
- **Watchers push updates** - don't wait to be polled. 10s heartbeats during builds.
- **Ping silent agents fast** - 60s silence = stuck. Take over at 120s.
- **Don't claim fixed without testing** - always verify in the browser.
- **Compare the full chain** - user action -> backend -> streamed output -> preview -> final UI.
