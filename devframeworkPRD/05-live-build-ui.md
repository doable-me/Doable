# 05 — Live Build UI (PRD)

> Surface that turns the 60–120 s "loading…" wait into a real-time, honest stream
> of meaningful build progress. Read-only design doc — no code changes proposed
> in this file. Cites discovery briefs by filename + section.
>
> Scope: the UI layer only. The wire protocol is owned by
> `03-build-event-protocol.md` (planned). The UI **must** degrade to a raw line
> tail when a framework adapter ships without a structured-event parser.

---

## 1. Goals & non-goals

### Goals

1. **Show wait time, don't hide it.** The user sees what is actually happening
   right now — file currently being compiled, the route currently rendering,
   the dependency currently being optimized — not a spinner that is the same
   at second 5 and second 95.
2. **Honest progress.** No fake percentage bars. The "Step Ladder" advances
   only when a real event says it has. If the parser falls behind or the
   stream drops, the UI **holds** the last known state and shows a faint
   pulse rather than inventing motion.
3. **Useful at a glance, deep on demand.** Three nested layers — a phase
   ladder, a structured highlights rail, and a raw log tail — give a casual
   user a glanceable status and let a power user drop down to the last
   `[plugin:vite-plugin-react]` line.
4. **Framework-adapter neutral.** When the adapter has zero structured-event
   parser (e.g. a brand-new Django adapter), only `build_log` raw lines are
   emitted; the same UI continues to work — just with the Highlights Rail
   empty and the Step Ladder showing a single coarse "Building…" pill.
5. **Actionable.** A `build_error` event renders an inline error card with
   `file:line`, snippet, and a **Fix with AI** button that hands off to the
   existing `POST /chat/fix-error` flow (`_discovery/03-streaming.md`,
   §"SSE endpoints").
6. **Multi-collaborator aware.** Build progress mirrors over WS
   `ai:status`-style broadcasts so anyone in the project room sees the same
   ladder lighting up (`_discovery/03-streaming.md`, §"WebSocket").

### Non-goals

- **Not a generic terminal emulator.** No ANSI colour rendering beyond
  redacted strip-and-class-mapping; no PTY, no readline, no input. The raw
  log tail is read-only, line-oriented, decorative.
- **Not the wire protocol.** This PRD assumes the event vocabulary defined in
  the planned `03-build-event-protocol.md` (`build_phase`, `build_log`,
  `build_route`, `build_artifact`, `build_error`, `build_warning`,
  `build_complete`, `build_failed`). Until that PRD lands, the UI consumes
  whatever the adapter happens to emit and falls back to raw-line passthrough.
- **Not a deploy console.** Deploy is a separate flow with its own SSE channel
  (`apps/web/src/modules/editor/toolbar/deploy-dialog.tsx:95`,
  `_discovery/03-streaming.md` §"SSE endpoints"). We may share components with
  it later, but the live build UI ships scoped to the dev-build / preview-rebuild
  surface inside the editor.
- **Not a log search engine.** The raw tail is a capped ring buffer (~5 k
  lines). Persistent build-log archive is the deploy/CI surface, not this one.

---

## 2. Information architecture

Three-layer stack, top to bottom in the panel:

### 2.1 Step ladder (top, always visible)

5–7 named phases lighting up in order:

| # | Phase id (event) | Default label | Adapter override |
|---|------------------|---------------|------------------|
| 1 | `scaffolding`    | "Setting up files" | Skipped if project exists |
| 2 | `installing`     | "Installing packages" | Skipped if `node_modules` already populated (per `01-vite-flow.md` §"Project scaffold" `ensureDependencies`) |
| 3 | `dev-server`     | "Starting dev server" | Vite: "Starting Vite"; Next: "Starting Next" |
| 4 | `compiling`      | "Compiling code" | Vite shows dep-optimize sub-line |
| 5 | `routes`         | "Resolving routes" | Hidden when adapter emits 0 `build_route` events |
| 6 | `bundling`       | "Bundling assets" | Build-only (deploy / `vite build`) |
| 7 | `ready`          | "Ready" | Terminal (also reached via `build_complete`) |

- The current phase row carries a sub-line: e.g. *"Building 7 of 23 — `/dashboard`"*.
  Sub-line content is derived from the most recent `build_route` /
  `build_log` event for that phase.
- Right edge of the ladder shows two counters: **elapsed** (`mm:ss` since
  `startedAt`) and **eta** (e.g. `~45 s remaining`). When the ETA confidence
  drops (parser can't keep up, server stops sending events), the ETA fades to
  `—` rather than wandering — see §6.
- A phase that errors switches to the danger colour and the ladder STOPS
  advancing; the ladder is honest about failure.

### 2.2 Highlights rail (middle, scrollable)

Structured event cards in chronological order:

- **ErrorCard** — file path, line/col, codeframe snippet, message, **Fix with
  AI** button. Pinned to top of the rail when active so user always sees the
  blocker.
- **WarningRow** — collapsed one-liner; expand for snippet.
- **RouteRow** — `▣ /dashboard  ✓ 142 ms` style. Compiles in place, swapping
  spinner → check mark.
- **BundleSizeDiff** — appears once on `build_complete`: `JS 240 KB → 251 KB
  (+11 KB)`. Color-coded only beyond ±2 KB (see §7).
- **ArtifactRow** — links to produced artifacts (e.g. `dist/index.html`,
  `dist/assets/index-abc123.js`) when emitted via `artifact_ready`
  (already in chat SSE vocabulary, `_discovery/03-streaming.md` §"SSE
  endpoints").
- **InfoBanner** — adapter-emitted hints, e.g. "Cold cache — first build will
  take longer".

### 2.3 Raw log tail (bottom, collapsed by default)

- Every redacted log line as it streams. One row per line, mono font,
  zebra striping. Source side-tag (`stdout` / `stderr` / `system`).
- Collapsed by default at ~80 px (showing last 3 lines only). Expand button
  pops the tail to ~50 % of panel height.
- Sticky-to-bottom toggle (auto-on; auto-off when the user scrolls up; a
  "Jump to live" pill reappears).
- Inline filter input: substring match across visible buffer (does NOT hit
  the network — purely client-side over the ring buffer).
- Copy-to-clipboard and "Save as file" affordances.
- When the adapter has no parser, this layer is the **only** layer with
  content. The Step Ladder still shows a single "Building…" pill, the
  Highlights Rail shows a "No structured events from this adapter yet" empty
  state, and the Raw Tail does the work.

---

## 3. Component tree

All paths under `apps/web/src/modules/editor/build/` (a new sibling to the
existing `apps/web/src/modules/editor/toolbar/` tree where `deploy-dialog.tsx`
lives — `_discovery/03-streaming.md` §"SSE endpoints"). **Do not create files
yet — this PRD is design only.**

```
apps/web/src/modules/editor/build/
├── BuildPanel.tsx                        # outer shell, takes `projectId`
├── StepLadder.tsx                        # horizontal phase ladder + counters
│   ├── PhaseChip.tsx
│   └── PhaseSubLine.tsx
├── HighlightsRail.tsx                    # virtualised list of structured cards
│   ├── ErrorCard.tsx                     # red, has Fix-with-AI button
│   ├── WarningRow.tsx
│   ├── RouteRow.tsx
│   ├── BundleSizeDiff.tsx
│   ├── ArtifactRow.tsx
│   └── InfoBanner.tsx
├── LogTail.tsx                           # virtualised raw log tail
│   ├── LogLine.tsx
│   ├── LogTailHeader.tsx                 # stick-to-bottom, filter, copy
│   └── useLogVirtualizer.ts              # @tanstack/react-virtual wrapper
├── BuildPanelEmptyState.tsx              # see §10
├── BuildPanelDisconnectedState.tsx
├── BuildPanelCompletedState.tsx
├── store/
│   ├── build-store.ts                    # Zustand, see §4
│   ├── reducers.ts                       # event → state, see §5
│   ├── eta.ts                            # ETA calculator, see §6
│   ├── ring-buffer.ts                    # 5 k-line cap
│   └── selectors.ts                      # memoised derived data
├── hooks/
│   ├── useBuildEvents.ts                 # subscribes via the existing
│   │                                     # streamChat() reader at
│   │                                     # apps/web/src/app/editor/[projectId]/page.tsx:387
│   │                                     # (does NOT add a second SSE; reuses
│   │                                     # the chat pipe per
│   │                                     # _discovery/03-streaming.md
│   │                                     # §"Reusable channel recommendation")
│   └── useBuildAria.ts                   # screen-reader live-region announcer
└── stories/
    ├── BuildPanel.stories.tsx
    └── fixtures/
        ├── happy-path.sse.txt
        ├── error-mid-build.sse.txt
        ├── adapter-without-parser.sse.txt
        ├── disconnected-then-resumed.sse.txt
        └── massive-log-burst.sse.txt
```

Render structure:

```tsx
<BuildPanel projectId>
  <StepLadder phases={derivedFromEvents} elapsedMs etaMs status />
  <HighlightsRail events={structuredEvents}>
    <ErrorCard onFixWithAi/>
    <RouteRow/>
    <BundleSizeDiff/>
    <WarningRow/>
    <ArtifactRow/>
    <InfoBanner/>
  </HighlightsRail>
  <LogTail lines={rawLines} stickToBottom search />
</BuildPanel>
```

`BuildPanel` mounts inside the editor sidebar (peer of the existing chat
panel). It does NOT replace the chat — it lives as a tab/panel adjacent to
it. The same Zustand store is read by both the chat panel (so chat can show
"build is failing" affordances) and BuildPanel.

---

## 4. State model

Single Zustand store. TypeScript shape:

```ts
// apps/web/src/modules/editor/build/store/build-store.ts

export type BuildStatus =
  | "idle"        // no build in flight, no completed build to show
  | "running"     // events arriving
  | "stalled"     // no events for >12 s, holding last state (see §6)
  | "completed"   // build_complete reached
  | "failed"      // build_failed or unrecovered build_error
  | "disconnected"; // SSE pipe dropped, awaiting stream-resume

export type PhaseId =
  | "scaffolding"
  | "installing"
  | "dev-server"
  | "compiling"
  | "routes"
  | "bundling"
  | "ready";

export interface PhaseState {
  id: PhaseId;
  label: string;          // adapter-overridable
  status: "pending" | "active" | "done" | "skipped" | "failed";
  startedAt?: number;     // epoch ms
  endedAt?: number;
  subLine?: string;       // "Building 7 of 23 — /dashboard"
}

export interface RouteState {
  path: string;            // "/dashboard"
  status: "pending" | "compiling" | "compiled" | "failed";
  durationMs?: number;
  error?: string;
}

export interface BuildErrorState {
  id: string;              // stable id from event
  file: string;            // relative path
  line?: number;
  col?: number;
  message: string;
  snippet?: string;        // codeframe
  receivedAt: number;
  resolved: boolean;       // flipped true when auto-fix completes
}

export interface BuildWarningState {
  id: string;
  message: string;
  file?: string;
  line?: number;
  receivedAt: number;
}

export interface BuildArtifact {
  path: string;            // "dist/assets/index-abc123.js"
  bytes: number;
  kind: "js" | "css" | "html" | "asset";
  hash?: string;
}

export interface RawLogLine {
  id: number;              // monotonic local id
  ts: number;              // epoch ms
  source: "stdout" | "stderr" | "system";
  text: string;            // already redacted server-side per 04-redaction.md
}

export interface BundleSizeSnapshot {
  totalJs: number;
  totalCss: number;
  totalAsset: number;
  perFile: Record<string, number>;
  takenAt: number;
}

export interface BuildStoreState {
  // identity
  projectId: string | null;
  buildId: string | null;       // server-issued id for the current build
  startedAt: number | null;
  elapsedMs: number;            // updated by a 250 ms ticker while running
  etaMs: number | null;         // null when unknown / stalled
  etaConfidence: "first" | "warm" | "stalled";
  status: BuildStatus;

  // structured
  phases: PhaseState[];
  currentPhase: PhaseId | null;
  routes: Record<string, RouteState>;
  errors: BuildErrorState[];
  warnings: BuildWarningState[];
  artifacts: BuildArtifact[];
  bundleNow: BundleSizeSnapshot | null;
  bundlePrev: BundleSizeSnapshot | null;   // from last successful build, see §7

  // raw
  rawLogLines: RawLogLine[];               // ring-buffer-capped, see below
  rawDropped: number;                      // how many were evicted

  // ui-only
  logTailFilter: string;
  stickToBottom: boolean;
  rawExpanded: boolean;

  // actions
  reset(projectId: string): void;
  ingest(event: BuildEvent): void;         // dispatches into reducers (§5)
  setLogFilter(s: string): void;
  setStick(b: boolean): void;
  setRawExpanded(b: boolean): void;
  acknowledgeError(id: string): void;
}
```

### Capacity / housekeeping

- `rawLogLines` is a fixed-capacity ring buffer (5 000 entries). On overflow,
  oldest entries are dropped and `rawDropped` is incremented. The LogTail
  shows a "(+N earlier lines dropped)" sticky banner above the first row when
  `rawDropped > 0`.
- Store writes for log batches are **debounced** (50 ms window, batched via
  `requestIdleCallback` fallback to `setTimeout`) — see §12.
- Phase / error / route state is never debounced; those updates need to
  feel instant.
- A 250 ms ticker (`setInterval`) updates `elapsedMs` while `status === "running"`;
  it stops on terminal states and on `disconnected`.

---

## 5. Reducer rules

Each `BuildEvent` type from `03-build-event-protocol.md` (planned). Each rule
is pure; unknown event types are a graceful no-op.

| Event `type` | Reducer behaviour |
|---|---|
| `build_started` | `reset()`; `status="running"`; `startedAt=now`; `buildId=event.id`; pre-populate `phases` with adapter's declared list. Emit aria announce "Build started". |
| `build_phase` | Find phase by id; mark previous active phase `done` (with `endedAt`), mark new phase `active` (with `startedAt`). If unknown id: append a phase with `label = event.data.label ?? id`. |
| `build_phase_subline` | Update only `phases[currentPhase].subLine`. No aria announce (too chatty). |
| `build_log` | Append to `rawLogLines` (debounced batch). Source defaults to `stdout` if not provided. |
| `build_route` | Upsert in `routes` keyed on `data.path`. Side-effect: derive `subLine` for `compiling`/`routes` phase (`"Building 7 of 23 — /dashboard"`). |
| `build_artifact` | Append to `artifacts`. Recompute `bundleNow` totals. |
| `build_error` | Append to `errors`. Render ErrorCard immediately. If `phases[currentPhase].status === "active"`, mark it `failed`. Aria announce. The store does NOT change `status` to `failed` — a single error during dev HMR is recoverable. `status` flips to `failed` only on `build_failed`. |
| `build_warning` | Append to `warnings`. No aria announce. |
| `build_complete` | Set `status="completed"`; mark all remaining `pending` phases `skipped`; mark current `done`; persist `bundleNow` to DB as the new "previous" for next build's diff. Aria announce "Build complete in `mm:ss`". |
| `build_failed` | Set `status="failed"`; mark current phase `failed`. |
| `keep_alive` | No state change. Reset stall timer. (Already keep-alived per chat-SSE convention, `_discovery/03-streaming.md` §"Wire format conventions".) |
| `error` (generic chat error) | Promote to a synthetic `build_error` if `data.phase === "building"`; else ignore. |
| `auto_fix_complete` | Mark matching `errors[*].resolved = true`. Highlights rail collapses the resolved card with a check mark. |
| `[DONE]` (chat terminator) | If `status === "running"`, downgrade to `completed` only if a `build_complete` was already seen; otherwise leave `status` untouched and start a 5 s grace window before flipping to `stalled`. |
| any other / unknown | No-op, but log the type **once per session** to console (deduped via a `Set`) so we notice protocol drift without spamming. |

### Stall detection

A 12 s timer resets on every event. On expiry, `status` flips to `stalled`,
the ETA fades to `—`, and the Step Ladder shows a faint pulse on the active
phase. Crucially, `phases`, `routes`, `errors`, `bundleNow` are NOT reset —
the UI holds the last truthful state.

### Disconnect / resume

When the underlying SSE reader observes a fetch failure or
`STALE_STREAM_MS` (75 s, `apps/web/src/app/editor/[projectId]/page.tsx:497`,
per `_discovery/03-streaming.md` §"Editor chat client stream"), `status`
flips to `disconnected`. The existing `stream-resume` flow re-attaches and
replays buffered events. The reducer is idempotent — `build_phase` events
that arrive again only re-mark `active` (no flicker), and `build_log` lines
include a `seq` so duplicates can be filtered.

---

## 6. ETA calculation

ETA is the part of the UI most likely to lie, so we are conservative.

### First build (no history)

Per-framework baseline constant. The framework adapter declares one:

```ts
// example values; adapter-owned
const FIRST_BUILD_BASELINE_MS: Record<Framework, number> = {
  "vite-react": 15_000,
  "nextjs": 60_000,
  "astro": 25_000,
  "django-static": 8_000,
  unknown: 30_000,
};
```

The Step Ladder shows a label `"first build (cold cache)"` next to the ETA.

### Subsequent builds

For a given `projectId`, the API persists the last N (default 10) build
durations on `deployments` / a sibling table. The UI requests the trailing-N
median on mount. While the build runs:

```ts
etaMs = Math.max(0, predictedTotalMs - elapsedMs);
predictedTotalMs = movingMedian(lastN.durations);
```

Phase weighting (optional, behind a feature flag):

```ts
// if the adapter declared per-phase share-of-time on a previous build,
// we can refine ETA mid-build:
predictedTotalMs = sum(
  phases.map((p) =>
    p.status === "done" ? (p.endedAt - p.startedAt)
                         : prevPhaseDurations[p.id] ?? defaultShare(p.id)
  )
);
```

The ladder shows a label `"rebuild (warm)"`.

### Honesty rules

- **Never show a percent bar.** A pill with `~45 s remaining` is the ceiling.
- **Never count down past zero.** If `etaMs` would be negative, show `~now`.
- **Never accelerate.** ETA can only stay equal or grow; we don't pretend to
  finish sooner than we predicted.
- **Stalled ⇒ `—`.** ETA blanks out the moment we stop receiving events. Do
  not extrapolate.
- **No ETA on first builds with `unknown` framework.** Show only elapsed.

---

## 7. Bundle-size diff

The build emits `build_artifact` events as files are produced (`dist/assets/...`).
On `build_complete`, the UI computes:

```ts
const delta = (now: number, prev?: number) => {
  if (prev == null) return { display: formatBytes(now), color: "neutral" };
  const diff = now - prev;
  const abs = Math.abs(diff);
  return {
    display: `${formatBytes(prev)} → ${formatBytes(now)} (${diff >= 0 ? "+" : ""}${formatBytes(abs)})`,
    color: abs < 2_048 ? "neutral" : diff > 0 ? "warn" : "good",
  };
};
```

- The previous bundle snapshot is fetched from the API on mount: `GET
  /projects/:id/builds/last-successful` → `BundleSizeSnapshot`. Server-side
  this comes from a `builds` row written at the end of `build_complete`.
- We diff three rollups: total JS, total CSS, total assets. Per-file diff is
  **opt-in** behind a "Show file-by-file" toggle inside the BundleSizeDiff
  card — virtualised list so a 200-file build doesn't tank performance.
- Color thresholds:
  - `|Δ| < 2 KB` → neutral grey, no badge.
  - `2 KB ≤ |Δ| < 50 KB` → warn yellow on grow, success green on shrink.
  - `|Δ| ≥ 50 KB` → red on grow, prominent green on shrink.
- Tailwind 4 theme tokens: reuse `text-warning-600`, `text-success-600`,
  `text-danger-600` from the existing Doable palette (no new tokens).
- If no previous snapshot exists (first build ever), show only absolute
  sizes with the label "First successful build — no diff yet".

---

## 8. Error surfacing

The moment a `build_error` event lands, the Highlights Rail does:

```
┌────────────────────────────────────────────────┐
│ ✗ src/components/Header.tsx:42:8               │
│   Unexpected token, expected ","               │
│                                                │
│   40 |   const items = [                       │
│   41 |     { label: "Home" }                   │
│ → 42 |     { label: "About" }   ← here         │
│   43 |   ];                                    │
│                                                │
│   [Fix with AI]   [Open file]   [Dismiss]      │
└────────────────────────────────────────────────┘
```

- **Fix with AI**: POSTs to `/projects/:id/chat/fix-error` with the error
  payload (already wired per `_discovery/03-streaming.md` §"SSE endpoints").
  The chat panel takes over the stream; the BuildPanel shows a "Auto-fixing…"
  inline status on the error card. On `auto_fix_complete`, the card collapses
  to a single line with a check.
- **Open file**: dispatches the editor to focus that file at `line:col`.
- **Dismiss**: hides the card from the rail (does NOT mark resolved on the
  server — purely visual). Recoverable on next build occurrence.
- The card is rendered with `role="alert"` so screen readers announce it
  immediately. Color is NEVER the sole indicator — the `✗` glyph and the
  literal word "Error" carry the meaning (§11).
- Multiple concurrent errors stack with the most recent on top; the card
  count badge appears on the rail header (`Errors · 3`).

---

## 9. Route map (advanced, feature-flagged)

Behind `NEXT_PUBLIC_FEATURE_BUILD_ROUTE_MAP=1`. Defer if implementation
phase is time-pressed.

A small visual of the route tree, drawn from the project's discovered routes
(server-side, from filesystem analysis or framework adapter introspection).
As `build_route` events arrive, nodes light up:

```
   /
   ├── /dashboard       ✓ 142ms
   ├── /settings        ⠋ compiling…
   ├── /pricing         ◌ pending
   └── /admin
        ├── /admin/users   ✓ 88ms
        └── /admin/audit   ◌ pending
```

- Tree is collapsible per-segment.
- Node click → opens the route's source file in the editor.
- Failure on a route paints the row in danger colour and pins the matching
  ErrorCard at the top of the rail.
- Treemap variant (size by JS bundle weight) is a follow-up — not in this
  PRD's first cut.

---

## 10. Empty / loading / error / disconnected / completed states

ASCII wireframes (panel inner area, ~520 px wide):

### 10.1 Empty (no build yet)

```
┌────────────────────────────────────────────────────┐
│  Live build                                        │
├────────────────────────────────────────────────────┤
│                                                    │
│              ⌐¬                                   │
│              │ │   No build running                │
│              ⌐¬   Start a chat or run             │
│                    `npm run dev` to see live       │
│                    progress here.                  │
│                                                    │
│              [ Start dev server ]                  │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 10.2 Running (the canonical layout)

```
┌────────────────────────────────────────────────────┐
│  Live build                          rebuild (warm)│
├────────────────────────────────────────────────────┤
│  ✓ Setup  ✓ Install  ● Compile  ○ Routes  ○ Ready  │
│                       ┃                            │
│           Building 7 of 23 — /dashboard            │
│                                                    │
│           elapsed 0:32         ~12 s remaining     │
├────────────────────────────────────────────────────┤
│  ⠋ /dashboard      compiling…                      │
│  ✓ /pricing        142 ms                          │
│  ⚠ Vite warning    duplicate import in Header.tsx  │
│  ⚠ /settings       slow asset (412 KB)             │
├────────────────────────────────────────────────────┤
│  ▾ Logs                          [filter ____] ▣   │
│  10:42:08  vite v6.0.0 dev server running          │
│  10:42:08  ➜  Local:   http://127.0.0.1:3142/      │
│  10:42:09  [vite] page reload src/App.tsx          │
│                                            ▣ live  │
└────────────────────────────────────────────────────┘
```

### 10.3 Error mid-build

```
┌────────────────────────────────────────────────────┐
│  Live build                                        │
├────────────────────────────────────────────────────┤
│  ✓ Setup  ✓ Install  ● Compile  ○ Routes  ○ Ready  │
│  ──────────────────  ✗  ────────────────────       │
│                                                    │
│  build halted on src/Header.tsx                    │
│  elapsed 0:18         ETA —                        │
├────────────────────────────────────────────────────┤
│  ✗ src/components/Header.tsx:42:8                  │
│    Unexpected token, expected ","                  │
│                                                    │
│    40 |   const items = [                          │
│    41 |     { label: "Home" }                      │
│  → 42 |     { label: "About" }    ← here           │
│    43 |   ];                                       │
│                                                    │
│    [ Fix with AI ]  [ Open file ]  [ Dismiss ]     │
├────────────────────────────────────────────────────┤
│  ▾ Logs                          [filter ____] ▣   │
│  …                                                 │
└────────────────────────────────────────────────────┘
```

### 10.4 Disconnected (network blip)

```
┌────────────────────────────────────────────────────┐
│  Live build       ⟳ reconnecting…                  │
├────────────────────────────────────────────────────┤
│  ✓ Setup  ✓ Install  ● Compile  ○ Routes  ○ Ready  │
│  (state preserved — last update 8 s ago)           │
│                                                    │
│  elapsed 0:32         ETA —                        │
├────────────────────────────────────────────────────┤
│  …existing highlights remain visible…              │
├────────────────────────────────────────────────────┤
│  Logs (paused)                                     │
└────────────────────────────────────────────────────┘
```

### 10.5 Completed

```
┌────────────────────────────────────────────────────┐
│  Live build                                  ✓ done│
├────────────────────────────────────────────────────┤
│  ✓ Setup  ✓ Install  ✓ Compile  ✓ Routes  ✓ Ready  │
│  built in 0:54                                     │
├────────────────────────────────────────────────────┤
│  Bundle  JS  240 KB → 251 KB  (+11 KB)             │
│          CSS  18 KB → 18 KB                        │
│          assets  64 KB → 64 KB                     │
│          [ show file-by-file ]                     │
│                                                    │
│  23 routes compiled · 0 errors · 1 warning         │
├────────────────────────────────────────────────────┤
│  ▾ Logs (collapsed)                                │
└────────────────────────────────────────────────────┘
```

### 10.6 Adapter without parser (raw passthrough)

```
┌────────────────────────────────────────────────────┐
│  Live build           django-static (no parser)    │
├────────────────────────────────────────────────────┤
│  ● Building…                                       │
│  elapsed 0:09         ETA —                        │
├────────────────────────────────────────────────────┤
│  No structured events from this adapter yet.       │
│  Watch the log tail for progress.                  │
├────────────────────────────────────────────────────┤
│  Logs (live)                          [filter __]  │
│  10:42:08  Collecting static files…                │
│  10:42:08  124 static files copied                 │
│  …                                          ▣ live │
└────────────────────────────────────────────────────┘
```

---

## 11. Accessibility

- **Keyboard navigation**:
  - `Tab` cycles: panel → step ladder → highlights rail → log tail header →
    log tail.
  - In the rail, ↑/↓ moves between cards; `Enter` activates the primary
    action of the focused card (Fix with AI for ErrorCard; toggle for
    BundleSizeDiff).
  - In the log tail, ↑/↓ scrolls one line, PgUp/PgDn one page, `End` jumps
    to live, `/` focuses the filter.
- **Screen-reader live region**: a visually-hidden `aria-live="polite"` div
  announces phase transitions (`"Compiling phase started"`,
  `"Build complete in 54 seconds"`) and `aria-live="assertive"` for errors.
  Throttled to one announce per 1.5 s to avoid spam.
- **Color is never the sole signal**: each phase status carries a glyph
  (`◌` pending, `●` active, `✓` done, `✗` failed, `⚠` warning) so users with
  color-vision differences read the same state. Same for BundleSizeDiff —
  `+` / `−` symbols accompany every delta.
- **Reduced motion**: respect `prefers-reduced-motion`; the active-phase
  pulse, route-row spinner, and "live" indicator collapse to static states.
- **Contrast**: reuse the Doable dark/light tokens that already pass WCAG
  AA (per `MEMORY.md → project_copilot_sdk_issues.md` and the recent MCP
  card contrast fix in commit `97abd09`).

---

## 12. Performance

- **Log tail virtualisation**: `@tanstack/react-virtual` (already in
  `package.json` deps per the team-lead brief). Fixed-row-height variant
  (line height = ~18 px) with 6-row overscan. The list reads from the
  Zustand `rawLogLines` ring buffer via a memoised selector keyed on
  `(rawLogLines.length, filter)`.
- **Ring buffer**: 5 000 entries, evict-oldest. Implemented as a circular
  array + `head` index; the React-facing selector returns a
  reference-equal array when nothing changed (avoids needless re-renders).
- **Debounced log writes**: log events arrive in bursts (Vite dep-optimize
  can fire dozens per second; `_discovery/03-streaming.md` §"Open questions"
  flags this as a cardinality concern). The store buffers incoming
  `build_log` events for 50 ms then flushes a single update — keeps React
  renders < 20/s during peaks.
- **Highlights & phases NOT debounced**: low cardinality, high importance —
  they update synchronously.
- **Selector memoisation**: `zustand`'s `useStore(selector, shallow)` for
  every component. The Step Ladder reads only `phases`, `currentPhase`,
  `elapsedMs`, `etaMs`, `status`. The Highlights Rail reads only the
  structured arrays. No component re-renders on log-line writes unless it
  reads `rawLogLines`.
- **Elapsed ticker**: a single 250 ms interval lives on `BuildPanel`, not
  per child. The ticker writes only `elapsedMs`; only the StepLadder
  subscribes.
- **Codemirror / Monaco isolation**: the codeframe in ErrorCard uses a
  static syntax-highlighted snippet (Shiki SSR-compatible), NOT a Monaco
  instance. Monaco is heavyweight; we never spin up an extra editor for a
  read-only 5-line snippet.

---

## 13. Test plan

### 13.1 Storybook stories

One `.stories.tsx` per state under `apps/web/src/modules/editor/build/stories/`:

- `BuildPanel.Empty.stories.tsx` — no build, empty state CTA.
- `BuildPanel.Running.stories.tsx` — mid-build, all three layers populated.
- `BuildPanel.Errored.stories.tsx` — Vite syntax error with codeframe,
  Fix-with-AI button enabled.
- `BuildPanel.Warned.stories.tsx` — multiple warnings, no errors.
- `BuildPanel.Stalled.stories.tsx` — 15 s no-event simulation, ETA shows `—`.
- `BuildPanel.Disconnected.stories.tsx` — network drop banner.
- `BuildPanel.Completed.stories.tsx` — final state with bundle diff.
- `BuildPanel.Completed.NoPrev.stories.tsx` — first-ever build, no diff.
- `BuildPanel.AdapterNoParser.stories.tsx` — raw-tail-only mode.
- `BuildPanel.HugeLogBurst.stories.tsx` — 50 k lines flushed in 5 s; perf
  smoke test (uses the virtualised list).
- `BuildPanel.RouteMap.stories.tsx` — feature-flagged route tree.
- Dark / light theme variants generated by Storybook decorator.

### 13.2 Replay-fixture-driven UI tests

- Recorded SSE streams in `stories/fixtures/*.sse.txt` (raw `data:` lines as
  produced by the API server).
- A `replayFixture(filename, opts?)` test util pumps the fixture into the
  store at original or accelerated wall-clock pace (`speed: 10x` for CI),
  letting Playwright assert against deterministic frames.
- Suites:
  - `happy-path` — fixture taken from a real Vite rebuild → assert ladder
    transitions through expected phases in order.
  - `error-mid-build` — assert ErrorCard renders within 100 ms of the
    `build_error` line, Fix-with-AI button is focusable.
  - `adapter-without-parser` — only `build_log` lines → ladder shows single
    "Building…" pill, rail empty-state visible, tail scrolls.
  - `disconnected-then-resumed` — fixture cuts off mid-build, then a
    `stream-resume` fixture replays with `seq` cursor → assert no duplicate
    routes, no flicker.
  - `massive-log-burst` — synthetic 50 k-line burst → assert frame budget
    via Playwright tracing (< 16 ms p95 main-thread blocking).

### 13.3 Unit tests

- `reducers.test.ts` — every event type, plus unknown-event no-op behaviour
  (logged once).
- `eta.test.ts` — first-build baseline, trailing-N median, monotonic
  non-decrease, stalled-blanks-eta.
- `ring-buffer.test.ts` — 5 000-line cap, eviction count.

### 13.4 Manual QA (before ship)

- Visual edit + build co-occurrence — confirm WS `ai:status` mirroring
  doesn't cause double-state-updates.
- Multi-tab — two editor tabs in the same project room; both ladders move
  in lockstep.
- Cold-cache vs warm-cache labels swap correctly.
- Memory soak — 30-min dev session with Vite HMR ⇒ raw line eviction
  observed in DevTools, no leak.

---

## 14. Open issues (deferred)

1. **Build-event protocol** — the wire vocabulary is owned by the planned
   `03-build-event-protocol.md`. This UI assumes `build_phase`, `build_log`,
   `build_route`, `build_artifact`, `build_error`, `build_warning`,
   `build_complete`, `build_failed`. If the protocol picks different names
   or piggybacks on `status` (per `_discovery/03-streaming.md` §"Open
   questions" #6), the reducers must be re-mapped — the rest of the UI is
   protocol-shape-agnostic.
2. **Persistent build history** — bundle-size diff requires a
   `BundleSizeSnapshot` to be persisted server-side. Schema, retention, and
   API endpoint (`GET /projects/:id/builds/last-successful`) are out of
   scope here and need a separate API PRD.
3. **Per-route compile timing** — depends on the framework adapter exposing
   per-route timing. Vite via `vite-plugin-react` does not natively emit
   "route X compiled in Y ms" — we'd need a small plugin or post-build
   stats parse. Defer until adapter-side discovery is done.
4. **Route map (§9)** — feature-flagged. Tree-source-of-truth (file system
   crawl vs adapter introspection) decided in adapter PRD.
5. **Treemap visualisation of bundle size** — out of scope for v1.
6. **Cross-collaborator divergence** — what if user A's editor reaches
   `build_complete` via WS broadcast while user B's SSE is stalled? Today
   we trust the WS broadcast last (`_discovery/03-streaming.md` §"WebSocket"
   "secondary fan-out"). The PRD assumes the same ordering; revisit if
   `ai:status` drifts.
7. **CI / deploy reuse** — the Deploy dialog
   (`apps/web/src/modules/editor/toolbar/deploy-dialog.tsx`) has its own
   minimal log view. Once this BuildPanel is shipped and stable, the deploy
   dialog should reuse `LogTail.tsx` and `StepLadder.tsx` — but the deploy
   SSE uses Hono `event:` fields (per `_discovery/03-streaming.md`
   §"SSE endpoints"), so a small adapter is needed. Tracked as a follow-up.
8. **Anonymous build observers** — `_discovery/03-streaming.md` §"Open
   questions" #5 raises a "build observer iframe on a published site"
   case. Out of scope here; this UI assumes an authenticated editor user.
9. **Internationalisation** — strings in this PRD are English. If/when
   Doable picks an i18n stack, every label, sub-line template, and aria
   announcement is a string-table candidate.
10. **Mobile / narrow viewport** — design assumes ≥ 480 px panel width. A
    narrow-viewport collapse (ladder → single active pill, rail → bottom
    sheet) is a follow-up.

---

## Appendix A — TypeScript types (canonical)

```ts
// store/types.ts (proposed shape; not yet written)

export type BuildEvent =
  | BuildStartedEvent
  | BuildPhaseEvent
  | BuildPhaseSubLineEvent
  | BuildLogEvent
  | BuildRouteEvent
  | BuildArtifactEvent
  | BuildErrorEvent
  | BuildWarningEvent
  | BuildCompleteEvent
  | BuildFailedEvent
  | KeepAliveEvent
  | AutoFixCompleteEvent;

export interface BuildStartedEvent {
  type: "build_started";
  data: { id: string; framework: string; trigger: "chat" | "manual" | "hmr" };
}

export interface BuildPhaseEvent {
  type: "build_phase";
  data: { id: PhaseId; label?: string };
}

export interface BuildPhaseSubLineEvent {
  type: "build_phase_subline";
  data: { phase: PhaseId; text: string };
}

export interface BuildLogEvent {
  type: "build_log";
  data: { source?: "stdout" | "stderr" | "system"; text: string; seq?: number };
}

export interface BuildRouteEvent {
  type: "build_route";
  data: { path: string; status: RouteState["status"]; durationMs?: number; error?: string };
}

export interface BuildArtifactEvent {
  type: "build_artifact";
  data: BuildArtifact;
}

export interface BuildErrorEvent {
  type: "build_error";
  data: {
    id: string;
    file: string;
    line?: number;
    col?: number;
    message: string;
    snippet?: string;
  };
}

export interface BuildWarningEvent {
  type: "build_warning";
  data: { id: string; message: string; file?: string; line?: number };
}

export interface BuildCompleteEvent {
  type: "build_complete";
  data: { durationMs: number };
}

export interface BuildFailedEvent {
  type: "build_failed";
  data: { reason: string };
}

export interface KeepAliveEvent {
  type: "keep_alive";
  data?: never;
}

export interface AutoFixCompleteEvent {
  type: "auto_fix_complete";
  data: { errorIds: string[] };
}
```

## Appendix B — Key prop shapes

```ts
// BuildPanel
interface BuildPanelProps {
  projectId: string;
  /** initial expanded state for raw tail; default false */
  defaultRawExpanded?: boolean;
}

// StepLadder
interface StepLadderProps {
  phases: PhaseState[];
  currentPhase: PhaseId | null;
  elapsedMs: number;
  etaMs: number | null;
  etaConfidence: BuildStoreState["etaConfidence"];
  status: BuildStatus;
}

// HighlightsRail
interface HighlightsRailProps {
  errors: BuildErrorState[];
  warnings: BuildWarningState[];
  routes: Record<string, RouteState>;
  artifacts: BuildArtifact[];
  bundleNow: BundleSizeSnapshot | null;
  bundlePrev: BundleSizeSnapshot | null;
  onFixWithAi(errorId: string): void;
  onOpenFile(file: string, line?: number, col?: number): void;
  onDismissError(id: string): void;
}

// LogTail
interface LogTailProps {
  lines: RawLogLine[];
  dropped: number;
  filter: string;
  stickToBottom: boolean;
  expanded: boolean;
  onSetFilter(s: string): void;
  onSetStick(b: boolean): void;
  onSetExpanded(b: boolean): void;
}
```
