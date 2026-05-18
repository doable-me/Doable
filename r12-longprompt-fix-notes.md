# R12 — Long-Prompt UI Stall Fix

## Evidence (r11-longprompt-samples.json)

The reproducing run (`longgg-prompt.txt`, a long jewelry calculator prompt) produced:
- 207 samples over 103 seconds
- Only 5 distinct subtitle/header transitions
- **47.0 s gap** between `Setting up your workspace...` (t=41 s) and `Connecting to AI...` (t=88 s)
- During that gap, only the *suffix* of the raw text changed every ~3.5 s (`Spawning dev server… (15 s)` → `(18 s)`), so to the user the screen looked frozen.

Distinct H3 transitions across the whole run:
| t (s) | subtitle |
|---|---|
| 0.5  | Setting up your workspace... |
| 40.0 | Understanding your request... |
| 41.0 | Setting up your workspace... |
| 88.0 | Connecting to AI... |
| 90.0 | Preparing live preview... |

## Root cause

Two systems write to the editor overlay:

1. **H3 heading** (`apps/web/src/app/editor/[projectId]/page.tsx:4615-4620`) is driven *only* by client state `scaffoldStatus`:
   - `"scaffolding"` → `"Setting up your workspace..."`
   - `"starting"` → `"Preparing live preview..."`
   - `"ready"` → overlay hidden

2. **Subtitle** is driven by `liveStatus || scaffoldProgressMsg || fallback`. `liveStatus` is fed from server SSE `status` events; `scaffoldProgressMsg` is a client-side elapsed-time ticker (page.tsx:2189-2200).

The bug is in the H3 path: `scaffoldStatus` only flips from `"scaffolding"` → `"starting"` when the client's own `scaffoldProject()` HTTP call (line 2203) resolves. That call POSTs `/projects/:id/scaffold`, which the server short-circuits behind an in-flight `scaffoldLocks` (see `services/api/src/routes/project-files/scaffold.ts:21,31`) because the chat-stream pipeline is *already* scaffolding via `scaffoldAndStartDev()` (`services/api/src/routes/chat/send-helpers.ts:12`). Both block on the same `createProject` + `startDevServer`.

While those run, the chat-stream pipeline DOES emit fine-grained SSE status events with rich `phase` values:
- `phase: "scaffolding"` — creating files, npm install ticks (send-helpers.ts:15, 48, 57, 62)
- `phase: "dev-server"` — `Starting dev server...`, `Spawning dev server… (Xs)`, `Compiling project… (Xs)`, `Dev server ready (Xs)` (send-helpers.ts:75, 106, 115)
- `phase: "thinking"` — `Connecting to AI...`, soft-heartbeat texts (send-handler.ts:442, 465)
- `phase: "building"` — `Working on <toolname>...` (send-handler.ts:577)

But the SSE consumer at the client side (page.tsx:758-768 in `streamChat` and page.tsx:1001-1005 in `processOneSSEPayload` for bridge/resume) only forwarded `message` to `onStatusChange` — `phase` was *dropped on the floor*. So the H3 had no way to know the server had moved past install.

**Result:** the H3 sat at "Setting up your workspace..." for the entire ~47 s of dev-server boot (server emitting `phase:"dev-server"` ticks), even though the server already knew it was past scaffolding. Only when the synchronous `scaffoldProject()` POST finally returned could the client flip to `"starting"`.

## Fix (commit 2f142eb9 on r12/longprompt-stall-fix)

Forward the server-supplied `phase` through the SSE callback chain into a new `applyServerPhase` callback that drives `scaffoldStatus` from real server signals — independent of the synchronous `scaffoldProject()` POST.

Changes in `apps/web/src/app/editor/[projectId]/page.tsx`:

1. **Signature extension** (page.tsx:420, 848): widen `onStatusChange?: (status: string) => void` → `onStatusChange?: (status: string, phase?: string) => void` on both `streamChat` and `BridgeCallbacks`.
2. **Forward `phase`** at the two SSE parse points (page.tsx:758-768 in `streamChat`, page.tsx:1001-1005 in `processOneSSEPayload`).
3. **New `applyServerPhase` callback** (page.tsx:1687-1714): pure setter that monotonically advances `scaffoldStatus`:
   - `phase: "scaffolding"` → keep `"scaffolding"`
   - `phase: "dev-server"` → flip to `"starting"` (H3 now reads **"Preparing live preview..."**)
   - `phase: "thinking" | "connecting" | "building"` → flip to `"starting"` if still idle/scaffolding
   - Never regresses past `"ready"` or `"error"` (the mount-effect poll still owns the final `"ready"` transition once `previewUrl` is fetched).
4. **Wire `applyServerPhase` into all three `onStatusChange` callsites:**
   - page.tsx:3180 (bridge consumer)
   - page.tsx:3447 (bridge resume path)
   - page.tsx:3998-4003 (direct `streamChat` callsite)

No server-side changes were needed — the server already emits `phase` values in every `type:"status"` SSE event. The client was simply discarding them.

## Acceptance criteria

A repeat of the long jewelry prompt should now show, within the same 103 s window:
1. **H3 transitions** at the server-driven boundaries:
   - t ≈ 0  s — `Setting up your workspace...` (scaffold begins)
   - t ≈ 40 s — `Preparing live preview...` (dev-server boot starts; server sends `phase:"dev-server"`)
   - t ≈ 88 s — overlay disappears or shifts as `previewUrl` lands and `scaffoldStatus="ready"`
2. **Subtitle** continues to tick (server `message` text: `Spawning dev server… (Xs)` → `Compiling project… (Xs)` → `Dev server ready`).
3. **No 47-second window** where the H3 doesn't change. Maximum distinct-H3 gap drops to ≤ 15 s (the soft-heartbeat cadence).
4. Existing `BUG-WS-001/003` sidebar fixes remain unaffected (no overlap with sidebar.tsx changes).

## Why not also touch the API side?

The API already emits exactly the events the UI needs (`phase: "scaffolding" | "dev-server" | "thinking" | "building"`). Adding a heartbeat there would only paper over the symptom; the client genuinely was ignoring the signal. Keeping the fix purely client-side avoids touching the SSE wire format, the resume buffer, and the trace pipeline.

## Validation

- `pnpm tsc --noEmit` in `apps/web` passes (no type errors after the signature widening).
- The new `applyServerPhase` callback is `useCallback`-stabilized and idempotent — safe to invoke on every event tick.
- `phase` is optional in the callback so the auto-fix watcher and any other consumer that doesn't pass `phase` still type-check (and behave identically).
- All three SSE consumer code paths (`streamChat`, `consumeStreamResume` via `processOneSSEPayload`, and the bridge replay loop via `resumeBridgeStream`) now forward `phase`.

## Files touched

- `apps/web/src/app/editor/[projectId]/page.tsx` (signature + 3 callsites + 1 helper, ~35 line addition net)

## Not touched (per instructions)

- `apps/web/src/modules/editor/chat/chat-panel.tsx` — dead code per project memory, never imported.
- No service binding changes (still 127.0.0.1 only per CLAUDE.md).
- No `git push` (branch-local commit only).
