# 03 — Build Event Streaming Protocol

> Companion to `04-redaction-and-filters.md` (the redaction pipeline runs at
> the publisher boundary defined here, BEFORE any byte hits SSE/WS).
> All citations refer to `_discovery/01-vite-flow.md` and
> `_discovery/03-streaming.md` and to file:line in the live tree at
> `main` / `80b4f85`.

---

## 1. Goals & non-goals

### Goals

- **Format-agnostic by default.** Whatever the framework's build/dev tool
  prints to stdout/stderr is streamed to the user as raw lines. If a Next.js
  release tomorrow changes its log shape, Doable users still see live
  output. Structured event extraction is OPTIONAL enrichment, never a gate.
  (Cited rule from team-lead brief; rationale: today there is no UI surfacing
  Vite stdout at all — see `_discovery/03-streaming.md` §"Dev-server stdout
  bridge", "Forwarded to UI? **No.**")
- **Single source of truth for build/run progress** that the editor, the
  AI agent, and collaborators in the project room can all subscribe to.
- **Reusable transport.** Reuse the chat-SSE pipe and the WS
  `/internal/broadcast` fan-out — both already wired
  (`_discovery/03-streaming.md` §"SSE endpoints", §"Reusable channel
  recommendation for build events").
- **Replay-on-reconnect** semantics consistent with `chat/stream-resume`,
  but per-project (build is not turn-scoped).
- **Backpressure-safe.** A `vite build` can emit thousands of lines/sec
  during dep-optimize (`_discovery/03-streaming.md` §"Open questions" #2);
  chat SSE writer issues one `writeSSE` per event today with no batching.
  We must coalesce raw logs without ever dropping structured events.
- **Redaction enforced at the publisher** — see PRD 04. No filter, no
  emit. Fail-closed.

### Non-goals

- Format-locked structured pipelines (e.g. requiring every adapter to
  emit Webpack stats). NOT in scope.
- Anonymous read access to a published site's build status. NOT in
  scope today (`_discovery/03-streaming.md` §"Open questions" #5).
- Replacing `chat/stream-resume` for AI turn replay. Build replay is
  ADDITIVE.
- Persisting full build history forever. We keep an in-memory ring
  buffer + optional Postgres mirror with a TTL.

---

## 2. Event vocabulary

The wire envelope is the existing chat-SSE convention
(`_discovery/03-streaming.md` §"Wire format conventions"):

```
data: {"type": "<event-type>", "data": { ...payload }, "seq": N, "ts": <unix-ms>}\n\n
```

No `event:` field (consistent with chat — the `deploy/stream` route is
the lone exception in the codebase and we do NOT follow it here).
`[DONE]` literal for terminal end-of-stream as today.

```ts
// services/api/src/build-events/types.ts (new)

export type PhaseId =
  | "installing"     // pnpm/npm install (or framework equivalent)
  | "prebuild"       // codegen, type-check, lint
  | "compile"        // SWC/Babel/tsc/esbuild transform
  | "routes"         // route discovery (Next.js, Nuxt, SvelteKit)
  | "optimize"       // dep-optimize / tree-shake / minify
  | "bundle"         // chunk emission
  | "done"
  | string;          // adapters MAY add framework-specific phase IDs

export interface BuildEventBase {
  /** monotonic per-project sequence; ascending across all build events */
  seq: number;
  /** unix ms */
  ts: number;
  /** which "build session" — a build run, a dev-server run, an HMR cycle */
  buildId: string;
}

export type BuildEvent =
  | BuildPhaseStarted
  | BuildPhaseCompleted
  | BuildLog
  | BuildRoute
  | BuildError
  | BuildWarning
  | BuildProgress
  | BuildArtifact
  | BuildSummary
  | BuildEta;

export interface BuildPhaseStarted extends BuildEventBase {
  type: "build_phase_started";
  data: {
    phase: PhaseId;
    /** optional ETA based on history of past runs of this phase */
    predictedMs?: number;
    label?: string;
  };
}

export interface BuildPhaseCompleted extends BuildEventBase {
  type: "build_phase_completed";
  data: { phase: PhaseId; durationMs: number; ok: boolean };
}

/** RAW — the format-agnostic backbone. Always emitted. */
export interface BuildLog extends BuildEventBase {
  type: "build_log";
  data: {
    stream: "stdout" | "stderr";
    /** lines may be batched (see §6) */
    lines: string[];
    /** monotonic line number within (buildId, stream) */
    firstLineNo: number;
  };
}

export interface BuildRoute extends BuildEventBase {
  type: "build_route";
  data: {
    route: string;
    status: "compiling" | "ready" | "failed";
    durationMs?: number;
  };
}

export interface BuildError extends BuildEventBase {
  type: "build_error";
  data: {
    /** project-relative path (absolute paths get redacted upstream — PRD 04) */
    file?: string;
    line?: number;
    column?: number;
    message: string;
    snippet?: string;
    framework?: string;
    /** hash for de-dupe in the UI; NOT a security boundary */
    fingerprint?: string;
  };
}

export interface BuildWarning extends BuildEventBase {
  type: "build_warning";
  data: BuildError["data"];
}

export interface BuildProgress extends BuildEventBase {
  type: "build_progress";
  data: {
    percent?: number;          // 0..100
    current?: number;
    total?: number;
    label?: string;            // e.g. "transforming src/App.tsx"
  };
}

export interface BuildArtifact extends BuildEventBase {
  type: "build_artifact";
  data: { path: string; sizeBytes: number; gzipBytes?: number };
}

export interface BuildSummary extends BuildEventBase {
  type: "build_summary";
  data: {
    durationMs: number;
    success: boolean;
    routes?: number;
    artifacts?: number;
    error?: { message: string };
  };
}

export interface BuildEta extends BuildEventBase {
  type: "build_eta";
  data: {
    estimatedRemainingMs: number;
    basis: "history" | "heuristic";
  };
}
```

### Per-event firing rules

| Event | When it fires | Emitter | UI surface |
|---|---|---|---|
| `build_phase_started` | publisher detects phase entry (adapter `parseLog` or known marker) | `BuildEventPublisher` (new) | "Build Logs" header bar; chat status pill |
| `build_phase_completed` | phase boundary observed OR phase-timeout heuristic | publisher | same as above; AI uses `durationMs` for ETA learning |
| `build_log` | every stdout/stderr line, batched (§6) | publisher (always) | "Build Logs" tail; AI tool-error context |
| `build_route` | adapter `parseLog` extracts a route line | adapter | route list panel |
| `build_error` | adapter `parseLog` recognizes an error overlay payload OR exit code != 0 with no error already emitted | adapter + builder | preview-error overlay; auto-fix flow |
| `build_warning` | adapter `parseLog` recognizes a warning | adapter | inline diagnostics |
| `build_progress` | adapter emits OR generic % parser hits | adapter | progress bar in Build Logs panel |
| `build_artifact` | post-build walk of `outputDir` | builder | deploy summary card |
| `build_summary` | terminal — exit code observed | builder | chat completion message |
| `build_eta` | publisher recomputes when phase changes or every Ns | publisher | progress bar tooltip |

The UI MUST treat unknown `type` values as no-ops (the chat client
already ignores unknown types — `_discovery/03-streaming.md`
§"Editor chat client stream"). This is what makes adapter-specific
phases safe.

---

## 3. Phases

### Canonical phase IDs

Adapters SHOULD map their work into the canonical set wherever possible:

```
installing → prebuild → compile → routes → optimize → bundle → done
```

Not every adapter goes through every phase. Vite typical sequence:
`installing` (cold) → `compile` → `optimize` → `bundle` → `done`.
Next.js: `installing` → `prebuild` (type-check) → `compile` → `routes`
→ `optimize` → `bundle` → `done`.

### Adapter-supplied phases

A `FrameworkAdapter.parseLog(line)` MAY emit `build_phase_started`
with a custom phase ID (e.g. `"swc-transform"`, `"middleware-collect"`).
The UI degrades gracefully:

- Known phase ID → bespoke icon + i18n label.
- Unknown phase ID → generic spinner + raw label fallback.

Phases are NOT required to be sequential or non-overlapping; the UI
renders the most-recent unfinished phase prominently and stacks others
below.

---

## 4. Transport

### 4.1 Primary — chat SSE

Build events ride the existing `POST /projects/:id/chat` SSE response
body (`services/api/src/routes/chat/send-handler.ts:178`) under NEW
top-level `type` values (do NOT piggy-back on `status`'s `phase`
sub-field — `_discovery/03-streaming.md` §"Open questions" #6
recommends top-level types and we agree). The chat dispatcher gains
new callbacks:

```ts
// apps/web/src/app/editor/[projectId]/page.tsx streamChat()
onBuildPhase, onBuildLog, onBuildRoute, onBuildError, onBuildWarning,
onBuildProgress, onBuildArtifact, onBuildSummary, onBuildEta
```

The existing coarse `status` (`phase: "building"`) keeps working as a
high-level pill — the new types are the granular feed.

### 4.2 Secondary — WS fan-out

The same events are mirrored to the project room via
`POST /internal/broadcast` (`services/ws/src/index.ts`,
`_discovery/03-streaming.md` §"WebSocket"), wrapping each as
`{type:"build:event", data: <BuildEvent>}` (analogous to the existing
`ai:status` fan-out at `send-handler.ts:303,322`). This is what lets
collaborators in the same project room watch the build without making
the chat request.

### 4.3 Dedicated — `GET /projects/:id/build/stream?cursor=N`

A NEW SSE endpoint, defined in
`services/api/src/routes/build/build-stream.ts` (new file), tails the
project's build event ring buffer (§5) WITHOUT requiring an active
chat turn. Wire envelope: same `data: {type,data,seq,ts}` JSON, no
`event:` field.

- Open params: `cursor=<seq|"latest"|"start">`. `latest` is default —
  only events strictly after the most recent at connect time.
- On open: server streams every buffered event with `seq > cursor` in
  order, then transitions to live tail.
- Keep-alive: `{type:"keep_alive"}` every 25s, matching chat
  (`send-handler.ts:215`).
- Closes when client disconnects; server-side close on no-build idle
  >15min (configurable).

This endpoint is what powers a future "Build Logs" drawer that's
visible even when the user isn't asking the AI to do anything.

### 4.4 Why three surfaces?

| Surface | Use case |
|---|---|
| chat-SSE inline | "AI is building right now" — events ride the active turn |
| WS broadcast | "My teammate's AI is building" — fan-out without subscribing |
| `/build/stream` | "Show me the live build log" — direct user observation, no chat turn |

All three read from the same publisher (§5), so payloads are
byte-identical post-redaction.

---

## 5. Cursor / replay

### 5.1 Per-project ring buffer

`chat/stream-resume` is keyed per `messageId` — a turn
(`_discovery/03-streaming.md` §"SSE endpoints"). Build is not
turn-scoped: dev-server logs run for hours, multiple HMR cycles span
many AI turns. So the build buffer is keyed per `projectId`.

```ts
// services/api/src/build-events/buffer.ts (new)
interface ProjectBuildBuffer {
  projectId: string;
  events: RingBuffer<BuildEvent>;   // capacity: 5_000 by default
  /** monotonic, never reused across API restarts (Postgres mirror — §5.2) */
  nextSeq: number;
  /** subscribers (chat-SSE handlers + /build/stream connections) */
  subscribers: Set<(e: BuildEvent) => void>;
}
```

Capacity policy: 5 000 events default, override via
`BUILD_BUFFER_SIZE`. When full, oldest `build_log` events are
evicted first (see §6 drop policy). Structured events are NEVER
evicted from the buffer (they're <1% of volume in practice).

### 5.2 Optional Postgres mirror

To survive API restarts:

```sql
-- migration: extends or parallels ai_active_streams
CREATE TABLE build_event_buffer (
  project_id UUID NOT NULL,
  seq        BIGINT NOT NULL,
  build_id   TEXT NOT NULL,
  type       TEXT NOT NULL,
  data       JSONB NOT NULL,
  ts         BIGINT NOT NULL,
  PRIMARY KEY (project_id, seq)
);
CREATE INDEX ON build_event_buffer (project_id, ts);

CREATE TABLE build_seq_cursor (
  project_id UUID PRIMARY KEY,
  next_seq   BIGINT NOT NULL DEFAULT 1
);
```

Write strategy: structured events flushed synchronously (low volume),
`build_log` flushed in batches of 50 lines or every 250ms via a
project-scoped writer queue. TTL: rows older than 7 days reaped by a
cron (configurable).

Postgres mirror is OPTIONAL — set `BUILD_EVENT_PERSIST=false` to keep
buffer in-memory only (default for dev). Production persists.

### 5.3 Cursor semantics

```
GET /projects/:id/build/stream?cursor=42
```

Server:
1. Looks up `build_seq_cursor.next_seq` for `projectId`.
2. Streams every event in `[cursor+1, next_seq)` from buffer
   (in-memory first, falling through to Postgres if not present).
3. Transitions to live tail.
4. If `cursor > next_seq` (client claims to have seen events that
   don't exist), server emits `{type:"resume_error",
   data:{code:"cursor_ahead"}}` and closes — client retries with
   `cursor=latest`.

For chat-SSE inline build events, the existing `messageId`-keyed
`stream-resume` continues to work AS-IS — build events that fired
during a chat turn are mirrored into BOTH the per-message buffer
(for chat resume) AND the per-project buffer (for `/build/stream`).
This double-buffering is intentional.

---

## 6. Backpressure & batching

### 6.1 Cardinality problem

Vite's dep-optimize phase can emit 1 000+ lines/sec
(`_discovery/03-streaming.md` §"Open questions" #2). Issuing one
`writeSSE` per line will:
- Overwhelm the SSE writer's per-message overhead.
- Saturate the WS `/internal/broadcast` channel.
- Exhaust the 5 000-event ring buffer in <5 seconds.

### 6.2 Batching policy

| Event class | Batching | Rationale |
|---|---|---|
| `build_log` | UP TO `MAX_LINES_PER_BATCH=50` lines per event, flushed at `≥MIN_FLUSH_MS=50` ms intervals OR `≥MAX_BUFFER_BYTES=8KiB` | Bulk-tolerant; UI re-renders once per batch |
| `build_phase_started` / `_completed` | NEVER | UI relies on phase boundaries for ETA |
| `build_route` | NEVER | UI route panel needs each route distinct |
| `build_error` / `build_warning` | NEVER | each is user-actionable |
| `build_progress` | coalesced to MOST RECENT only at flush time | a stale 30% behind 80% is just noise |
| `build_artifact` | NEVER | each is a build output |
| `build_summary` | NEVER | terminal |
| `build_eta` | coalesced (last value wins) | superseded values are useless |

A flush is triggered by ANY of:
- `MAX_LINES_PER_BATCH` reached
- `MIN_FLUSH_MS` elapsed since last flush AND buffer non-empty
- `MAX_BUFFER_BYTES` reached
- a non-batchable event arrives (flush log buffer first, THEN emit
  the structured event)
- session ends

### 6.3 Drop policy

If the in-memory ring buffer is full AND a new event arrives:

1. Evict oldest `build_log` until room for new event OR no `build_log`
   left.
2. If still full, drop INCOMING new event ONLY IF it is `build_log`
   or `build_progress`. Increment `build_buffer_dropped_total{type}`
   metric.
3. Structured events (`_phase_*`, `_route`, `_error`, `_warning`,
   `_artifact`, `_summary`) are NEVER dropped. If the buffer cannot
   accept them, capacity is doubled in-memory and a one-line warning
   is logged. The buffer caps at `MAX_BUFFER_HARD_LIMIT=50_000`; past
   that, even structured events drop with an alert (this is a
   pathological case — adapter is malfunctioning).

### 6.4 Per-line caps

Each input line is truncated at `MAX_LINE_BYTES=8192` with a
`…(truncated, +N bytes)` suffix BEFORE batching. (The redactor in
PRD 04 also enforces a line-length cap — applied first, see PRD 04 §8.)

---

## 7. Reconnect

### 7.1 Chat-SSE inline (existing pattern)

`stream-resume` continues to work as today
(`services/api/src/routes/chat/misc-routes.ts:97`). Build events
buffered into the per-message replay buffer come through the resume
path identically to text/tool events.

### 7.2 Dedicated build stream

The `GET /projects/:id/build/stream?cursor=N` endpoint IS the resume
path — clients reconnect with the last `seq` they saw:

```ts
// apps/web/src/modules/build-logs/stream-client.ts
let lastSeq = 0;
function connect() {
  const es = new EventSource(`/api/projects/${pid}/build/stream?cursor=${lastSeq}`);
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data) as BuildEvent;
    lastSeq = ev.seq;
    dispatch(ev);
  };
  es.onerror = () => {
    es.close();
    setTimeout(connect, 1500);  // same retry cadence as chat (page.tsx:464-475)
  };
}
```

This client is a real `EventSource` (no auth header needed —
endpoint authenticates via signed cookie OR `?token=` query param,
same as WS — see §9).

### 7.3 Stream-end semantics

Like chat, the stream emits `[DONE]` then closes ONLY on
explicit terminal events: `build_summary` for one-shot builds,
or never (long-lived dev server). `/build/stream` clients that
see no events for 75s should consider the stream stale and reconnect
(matching `STALE_STREAM_MS` at `apps/web/src/app/editor/[projectId]/page.tsx:497`).

---

## 8. Adapter contract

The build-event publisher is FORMAT-AGNOSTIC. The framework adapter
(defined in `02-framework-abstraction.md`) optionally provides log
parsing:

```ts
// from 02-framework-abstraction.md
interface FrameworkAdapter {
  // ...other members...
  /** OPTIONAL. Called per stdout/stderr line. Return parsed event or null. */
  parseLog?(
    line: string,
    ctx: { stream: "stdout"|"stderr"; buildId: string; phase?: PhaseId }
  ): Omit<BuildEvent, "seq"|"ts"|"buildId"> | null;
}
```

### Publisher pseudo-code

```ts
// services/api/src/build-events/publisher.ts (new)
export class BuildEventPublisher {
  constructor(
    private projectId: string,
    private adapter: FrameworkAdapter,
    private filterChain: LogFilterChain,    // PRD 04
    private buffer: ProjectBuildBuffer,
  ) {}

  attach(child: ChildProcess, buildId: string) {
    const onLine = (stream: "stdout"|"stderr") => (raw: string) => {
      // 1. REDACT FIRST (PRD 04 invariant)
      const filtered = this.filterChain.run(raw, { stream, buildId, projectId: this.projectId });
      if (filtered === null) return;   // dropped by a filter

      // 2. Always emit raw build_log (format-agnostic guarantee)
      this.publishLog(stream, filtered, buildId);

      // 3. Adapter enrichment runs alongside, never instead of
      const parsed = this.adapter.parseLog?.(filtered, { stream, buildId, phase: this.currentPhase });
      if (parsed) this.publish({ ...parsed, buildId });
    };

    splitLines(child.stdout!, onLine("stdout"));
    splitLines(child.stderr!, onLine("stderr"));
  }
}
```

Two important invariants:

1. **Both flow.** Even when `parseLog` returns a `build_error`, the
   raw line that triggered it is also emitted as `build_log`. The UI
   collapses duplicates by line number, but the data is on the wire.
2. **Filter before parse.** The redaction chain runs on the raw line
   FIRST (PRD 04 §2). The adapter only ever sees redacted text.

### Where the publisher attaches

| Site | File:line | Today | After |
|---|---|---|---|
| Dev-server stdout | `services/api/src/projects/dev-server-start.ts:167-184` | Buffered to `outputBuffer` string for failure messages, never streamed | Pass `child.stdout`/`child.stderr` to `BuildEventPublisher.attach()` |
| Build runner | `services/api/src/deploy/builder.ts:113-123` | Streams via `onLog` callback | `onLog` becomes a `BuildEventPublisher.publishLog()` shim |
| AI build tool | `services/api/src/ai/build.ts:31,91` | Spawns its own `npx vite build` | Same publisher, framework-blind via adapter |

---

## 9. Auth / scope

| Subscriber | Access control |
|---|---|
| Project member (chat-SSE inline) | Existing chat auth — `Authorization: Bearer` (`page.tsx:1061`) |
| Project member (`/build/stream`) | Same JWT, accepted via `Authorization` header OR `?token=` query (EventSource cannot set headers — match WS auth at `services/ws/src/index.ts:202-216`) |
| Collaborator in project room (WS fan-out) | Existing WS auth + `room:join` |
| AI / Copilot SDK | Trusted in-process — bypasses auth (it IS the publisher) |
| Internal services (deploy worker) | `X-Internal-Secret` header, same as `/internal/broadcast` |
| Anonymous (published-site visitors) | **No.** Out of scope. (See `_discovery/03-streaming.md` §"Open questions" #5.) |

Subscription scope:
- A user can subscribe to `/build/stream` for a project IFF they have
  read access to that project (workspace membership check).
- The Postgres-mirror table is project-scoped; RLS not needed because
  reads go through the API (which authorizes).

---

## 10. Open issues

1. **Phase detection without `parseLog`.** When the adapter has no
   parser, we never emit `build_phase_*`. Should the publisher have
   a generic "any-line-after-N-seconds-of-quiet implies phase change"
   heuristic? Probably not in v1 — UI should fall back to "running"
   spinner.
2. **buildId lifecycle for HMR.** A long-running Vite dev server
   produces many HMR cycles — does each cycle get a new `buildId`?
   Proposal: yes, `buildId = "${devServerPid}-${cycleSeq}"`, where
   the cycle bumps on either an "update" log line or a transient
   error+recovery. Adapter decides via `parseLog` returning a
   synthetic `build_phase_started` with a fresh `buildId`.
3. **Cross-AI-turn replay UX.** If a user opens the editor mid-build,
   should they see the prior build's `build_summary`? Proposal:
   `cursor=latest` returns ONLY in-flight events; UI fetches last
   summary separately via `GET /projects/:id/build/last-summary`.
4. **Predicting `predictedMs` / `build_eta`.** Needs a per-project
   per-phase rolling history. Trivial to add as a Postgres table
   `build_phase_history`; defer to a follow-up PRD if not needed v1.
5. **`build.ts` AI path** (`_discovery/01-vite-flow.md` §"Hardcoded
   Vite assumptions" item 20) — should this collapse into the
   publisher or remain a separate one-shot path? Recommendation:
   collapse, route through the same publisher and same adapter. PRD
   for that lives outside this document.
6. **WS `build:event` message type vs. wrapping in `ai:status`.** The
   existing `ai:status` wrapper is overloaded. Proposal: a NEW WS
   message type `build:event` so collab clients can dispatch
   independently of AI status. Backward-compat: keep `ai:status`
   firing the coarse `phase: "building"` pill for older clients.
7. **Postgres mirror cardinality.** A pathological Vite run could
   write tens of thousands of rows. Mitigation: only mirror
   `build_log` in batches of 50; keep structured events 1:1.
   Acceptable.
