# docore + dovault Integration Plan

> Integrate docore (AI sandbox + policy engine) and dovault (Vite runtime jail) into Doable.
> All existing functionality continues to work identically. Zero breaking changes to the frontend.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           DOABLE API SERVER                        │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     PER-USER AI SESSION                      │  │
│  │                                                              │  │
│  │  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐  │  │
│  │  │   docore     │    │  PolicyStore  │    │   EventBus     │  │  │
│  │  │   Engine     │───▶│  (per-user    │    │  (all events   │  │  │
│  │  │             │    │   sandbox     │    │   → trace +    │  │  │
│  │  │  Copilot SDK │    │   rules)      │    │   XRAY + WS)  │  │  │
│  │  └──────┬──────┘    └──────────────┘    └────────────────┘  │  │
│  │         │                                                    │  │
│  │         │ tools: file_write, shell, MCP, Activepieces        │  │
│  │         ▼                                                    │  │
│  │  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐  │  │
│  │  │  Sandbox      │  │  Tool Bridge    │  │  MCP Bridge   │  │  │
│  │  │  Permission   │  │  (Activepieces  │  │  (Supabase,   │  │  │
│  │  │  Handler      │  │   500+ tools)   │  │   custom)     │  │  │
│  │  └──────────────┘  └─────────────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    PER-PROJECT VITE SANDBOX                   │  │
│  │                                                              │  │
│  │  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐  │  │
│  │  │   dovault    │    │  ConfigGuard  │    │  ResourceLimiter│  │  │
│  │  │   Vault      │───▶│  (lock vite   │───▶│  (cgroups /    │  │  │
│  │  │             │    │   config)     │    │   Job Objects) │  │  │
│  │  │  spawn()     │    └──────────────┘    └────────────────┘  │  │
│  │  │  → jailed    │                                            │  │
│  │  │    Vite      │    ┌──────────────┐    ┌────────────────┐  │  │
│  │  │    process   │───▶│  ProcessJail  │    │  AuditLog      │  │  │
│  │  │             │    │  (Node.js     │    │  (→ trace +    │  │  │
│  │  │             │    │   permissions)│    │   XRAY)        │  │  │
│  │  └─────────────┘    └──────────────┘    └────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     SHARED INFRASTRUCTURE                    │  │
│  │                                                              │  │
│  │  TraceCollector ─── XRAY ─── WS Broadcast ─── PostgreSQL    │  │
│  │  (unified timeline: AI events + sandbox events + vault events)│  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What Changes vs What Doesn't

### Unchanged (zero modifications)

| Component | Why unchanged |
|-----------|--------------|
| **Preview proxy** (`preview-proxy.ts`) | Still reverse-proxies to localhost:{port}. dovault doesn't change ports or protocols. |
| **HMR / Live reload** | Vite HMR WebSocket runs on the same port. dovault jails the process, not its network to localhost. |
| **Preview iframe injection** | Storage namespace, error capture, HMR detection — all identical. |
| **Activepieces tool-bridge** (`integrations/tool-bridge.ts`) | Tools still registered as `defineTool()`. docore's sandbox approves/denies them, same interface. |
| **MCP tool-bridge** (`mcp/tool-bridge.ts`) | MCP connectors still resolve per-user. Tools registered same way. |
| **Credential vault** (`credential-vault.ts`) | Encryption/decryption unchanged. docore doesn't touch credentials. |
| **Env var resolution** (`env/resolve.ts`) | Same VITE_* split. dovault receives the resolved env vars in spawn(). |
| **Frontend** (`apps/web/`) | Zero frontend changes. SSE event types unchanged. WebSocket messages unchanged. |
| **WebSocket server** (`services/ws/`) | Broadcast, Yjs write, presence — all identical. |
| **Database schema** | No migrations needed for core functionality. One optional table for policy persistence. |

### What changes

| Component | Current | After integration |
|-----------|---------|-------------------|
| **Session creation** (`chat.ts`) | Raw `CopilotClient` + `CopilotSession` | `DoCoreUserManager.acquire()` → `DoCoreEngine` |
| **Permission handler** | `approveAll` (no restrictions) | `createPolicySandbox()` (per-user policy-driven) |
| **Vite spawn** (`dev-server.ts`) | Raw `spawn()` | `vault.spawn()` (jailed, resource-limited) |
| **Tracing** (`trace-collector.ts`) | SDK events only | SDK events + docore events + dovault audit events |
| **XRAY** (`xray.ts`) | Integration/MCP calls only | + sandbox decisions + vault events |

---

## Modularity Principles

### Problem: chat.ts is 3,689 lines

The current `routes/chat.ts` is a monolith containing 22 functions spanning AI engine resolution, context building, plan parsing, SSE mapping, tool message formatting, error detection, thumbnail capture, and the main POST handler — all in one file. This is the **first thing to fix** before adding docore.

### Target Module Structure

After integration, no file exceeds ~300 lines. Every module has a single responsibility:

```
services/api/src/
├── ai/
│   ├── docore-bridge.ts          (~80 lines)  NEW — singleton: pool, userManager, policyStore, event wiring
│   ├── context-builder.ts        (~120 lines) EXTRACTED from chat.ts — buildProjectContext, buildProjectContextForMode
│   ├── plan-parser.ts            (~80 lines)  EXTRACTED from chat.ts — parsePlanSteps, extractPlanFromResponse
│   ├── sse-mapper.ts             (~200 lines) EXTRACTED from chat.ts — mapEventToSSE, SSE event types
│   ├── tool-messages.ts          (~200 lines) EXTRACTED from chat.ts — friendlyToolMessage, friendlyToolResult, sanitize*
│   ├── preview-errors.ts         (~100 lines) EXTRACTED from chat.ts — detectPreviewError, extractViteErrorOverlay, buildAutoFixPrompt
│   ├── engine-resolver.ts        (~150 lines) EXTRACTED from chat.ts — resolveAiEngine, resolveProvider, BYOK config
│   ├── thumbnail.ts              (~40 lines)  EXTRACTED from chat.ts — scheduleThumbnailCapture
│   ├── trace-collector.ts        (~250 lines) EXISTS — add ~20 lines for vault/sandbox event types
│   ├── usage-collector.ts        EXISTS — unchanged
│   ├── providers/
│   │   ├── copilot.ts            (1,302 lines → ~400 lines) — extract tool creation into tool-factory.ts
│   │   └── copilot-manager.ts    EXISTS — unchanged
│   ├── tool-factory.ts           (~300 lines) EXTRACTED from copilot.ts — createAllTools, createDoableTools
│   └── yjs-bridge.ts             EXISTS — unchanged
├── integrations/
│   ├── xray.ts                   (~500 lines) EXISTS — add ~40 lines for sandbox/vault methods
│   └── ...                       unchanged
├── projects/
│   ├── dev-server.ts             (~530 lines → ~300 lines) — extract vault setup into vite-jail.ts
│   └── vite-jail.ts              (~80 lines)  NEW — dovault initialization and spawn wrapper
├── routes/
│   ├── chat.ts                   (3,689 lines → ~500 lines) — only the POST handler + session lifecycle
│   └── ...                       unchanged
└── index.ts                      add 3 lines for docore startup/shutdown
```

### File Size Rules (enforced going forward)

| Rule | Limit |
|------|-------|
| Max lines per file | **400 lines** (hard limit for new code, soft target for existing) |
| Max functions per file | **5-8** (each file has one clear purpose) |
| Max function length | **80 lines** (extract helpers if longer) |
| Naming convention | `noun-verb.ts` or `noun.ts` — never ambiguous names |

### Why This Matters for AI

- AI agents (Copilot, Claude, etc.) work best with files that fit in a single context window
- 300-line files can be read in one `read_file` call — no scrolling, no missing context
- Clear module boundaries mean AI can find the right file by name alone
- Single-responsibility modules mean changes are localized — editing `plan-parser.ts` can't break SSE streaming

---

## Implementation Phases

### Phase 0: Decompose chat.ts (prerequisite)

**Before** integrating docore, break `chat.ts` into focused modules. This is a pure refactor — zero behavior changes.

| Extract to | Functions moved | Lines |
|------------|----------------|-------|
| `ai/context-builder.ts` | `buildProjectContext()`, `buildProjectContextForMode()` | ~120 |
| `ai/plan-parser.ts` | `parsePlanSteps()`, `extractPlanFromResponse()` | ~80 |
| `ai/sse-mapper.ts` | `mapEventToSSE()`, SSE type definitions | ~200 |
| `ai/tool-messages.ts` | `friendlyToolMessage()`, `friendlyToolResult()`, `prettyFileName()`, `describeFileContext()`, `sanitizeCommand()`, `sanitizeText()`, `stripServerPaths()` | ~200 |
| `ai/preview-errors.ts` | `detectPreviewError()`, `extractViteErrorOverlay()`, `buildAutoFixPrompt()` | ~100 |
| `ai/engine-resolver.ts` | `resolveAiEngine()`, `resolveProvider()`, BYOK config logic | ~150 |
| `ai/thumbnail.ts` | `scheduleThumbnailCapture()` | ~40 |
| `ai/tool-factory.ts` | `createAllTools()`, `createDoableTools()` (from copilot.ts) | ~300 |

**After extraction**: `chat.ts` → ~500 lines (POST handler + session lifecycle + SSE streaming loop).

Each extracted module exports only the functions it provides. Imports are explicit. No circular dependencies.

### Phase 1: Install dependencies

**Files touched:** `package.json` (services/api)

```bash
# From doable root
cd services/api
pnpm add docore@file:../../path-to-docore   # or npm link / git dep
pnpm add dovault@file:../../path-to-dovault  # or npm link / git dep
```

docore depends on `@github/copilot-sdk` (already a dependency).
dovault has zero runtime dependencies.

---

### Phase 2: dovault integration (~80 lines in new file, ~30 lines changed)

**Files touched:** new `services/api/src/projects/vite-jail.ts`, modify `dev-server.ts`

Instead of bloating dev-server.ts, extract all vault logic into a focused module:

**New file: `services/api/src/projects/vite-jail.ts`** (~80 lines)
```typescript
/**
 * Vite process jail — wraps Vite spawning with dovault security layers.
 * Single responsibility: configure and create jailed Vite processes.
 */
import { createVault, type Vault, type JailedProcess, ConfigGuard } from "dovault";
import { getActiveTrace } from "../ai/trace-collector.js";

const vault = createVault();
const configGuard = new ConfigGuard();

/** Default resource limits per Vite instance */
const VITE_LIMITS = {
  memoryMax: process.env.VITE_MEMORY_MAX ?? "256M",
  cpuQuota: process.env.VITE_CPU_QUOTA ?? "50%",
  tasksMax: parseInt(process.env.VITE_TASKS_MAX ?? "20", 10),
} as const;

/** Spawn a jailed Vite process */
export function spawnJailedVite(opts: {
  execPath: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  projectId: string;
}): JailedProcess {
  const jailed = vault.spawn(opts.execPath, opts.args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: "pipe",
    lockConfigs: true,
    blockChildProcess: true,
    blockOutboundNet: true,
    resourceLimits: VITE_LIMITS,
  });

  // Emit to trace collector
  const trace = getActiveTrace();
  if (trace) {
    trace.push({ type: "vault.spawn", data: { projectId: opts.projectId, ...VITE_LIMITS } });
  }

  return jailed;
}

/** Check if a file path is locked by the config guard */
export function isLockedConfig(filePath: string): boolean {
  return configGuard.isLockedFile(filePath);
}
```

**Change in dev-server.ts** (~5 lines):
```typescript
// BEFORE:
const child = spawn(process.execPath, [...], { cwd, env, ... });

// AFTER:
import { spawnJailedVite } from "./vite-jail.js";
const jailed = spawnJailedVite({ execPath: process.execPath, args: [...], cwd: projectPath, env: { ... }, projectId });
const child = jailed.process;
// Everything below is unchanged — child.stdout, child.stderr, child.on("close") all work the same
```

---

### Phase 3: docore integration into chat.ts (~120 lines changed)

This is the largest change. We replace the raw SDK usage with docore's `DoCoreUserManager`.

**Files touched:** `services/api/src/routes/chat.ts`, new file `services/api/src/ai/docore-bridge.ts`

#### 3a. Create the docore bridge module

**New file: `services/api/src/ai/docore-bridge.ts`**

This module initializes docore once and provides the bridge between Doable's existing systems and docore's API.

```typescript
/**
 * docore bridge — singleton that manages the DoCoreUserManager
 * and wires docore events into Doable's trace/XRAY pipeline.
 */

import {
  DoCoreUserManager,
  DoCorePool,
  PolicyStore,
  MemoryPersistence,
  POLICY_DEFAULTS,
  createPolicySandbox,
  type DoCoreEngine,
  type SandboxAuditEntry,
} from "docore";

import { xray } from "../integrations/xray.js";
import { getActiveTrace } from "./trace-collector.js";
import { broadcastToRoom } from "./yjs-bridge.js";

// ─── Policy Store (runtime-configurable sandbox rules) ───

const policyPersistence = new MemoryPersistence();  // TODO: swap for DB-backed persistence
const policyStore = new PolicyStore({ persistence: policyPersistence });

// ─── Connection Pool ─────────────────────────────────────

const pool = new DoCorePool({
  cliUrl: process.env.COPILOT_CLI_URL,   // External CLI server (or undefined = spawn)
  poolSize: 1,                           // 1 shared client when no cliUrl
});

// ─── User Manager ────────────────────────────────────────

const DATA_DIR = process.env.DOABLE_DATA_DIR ?? "/srv/doable/data";

const userManager = new DoCoreUserManager({
  baseDir: DATA_DIR,
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT_ENGINES ?? "30", 10),
  idleTimeoutMs: 10 * 60 * 1000,        // 10 min idle eviction
  sandbox: true,
  policyStore,
  onSandboxAudit: (entry: SandboxAuditEntry) => {
    // Feed sandbox decisions into XRAY
    xray.recordSandboxDecision(entry);
    // Feed into active trace (if a chat turn is in progress)
    const trace = getActiveTrace();
    if (trace) {
      trace.push({
        type: "sandbox.decision",
        data: entry,
      });
    }
  },
  onEvict: (userId, reason) => {
    console.log(`[docore] Engine evicted: user=${userId} reason=${reason}`);
  },
});

// ─── Event wiring ────────────────────────────────────────

/**
 * Wire a DoCoreEngine's EventBus into Doable's trace/XRAY/WS pipeline.
 * Called once per engine acquire.
 */
export function wireEngineEvents(
  engine: DoCoreEngine,
  projectId: string,
  userId: string,
): () => void {
  return engine.events.onAny((event) => {
    // 1. Feed into active trace collector (persists to DB)
    const trace = getActiveTrace();
    if (trace) {
      trace.push({
        type: `docore.${event.kind}`,
        data: event,
      });
    }

    // 2. Broadcast to WS room for live debugging (frontend XRAY panel)
    broadcastToRoom(projectId, {
      type: "ai:docore",
      event,
    }, userId).catch(() => {});
  });
}

// ─── Exports ─────────────────────────────────────────────

export { pool, userManager, policyStore, wireEngineEvents };

/** Initialize the pool. Call once at server startup. */
export async function initDocore(): Promise<void> {
  await pool.start();
  console.log("[docore] Pool started");
}

/** Shutdown cleanly. Call on server stop. */
export async function shutdownDocore(): Promise<void> {
  await userManager.releaseAll();
  await pool.stop();
  console.log("[docore] Shutdown complete");
}
```

#### 3b. Modify chat.ts session creation

**Current flow** (simplified from chat.ts lines ~1100-1200):
```typescript
// Current: raw SDK
import { CopilotClient, CopilotSession, approveAll } from "@github/copilot-sdk";

const client = new CopilotClient({ cliUrl: "..." });
const session = await client.createSession({
  model,
  streaming: true,
  onPermissionRequest: approveAll,   // ← NO RESTRICTIONS
  tools: allTools,
  systemPrompt,
});
const result = await session.sendAndWait({ prompt: userMessage });
```

**New flow:**
```typescript
// New: docore
import { userManager, wireEngineEvents } from "../ai/docore-bridge.js";

// Acquire engine for this user (reuses existing or creates new)
const engine = await userManager.acquire(userId, {
  githubToken: userGithubToken,
  model,
  sessionConfig: {
    streaming: true,
    tools: allTools,
    systemPrompt,
    workingDirectory: projectPath,
  },
});

// Wire events into trace/XRAY (idempotent — noop if already wired)
const unwire = wireEngineEvents(engine, projectId, userId);

// Send message (same API — returns events via EventBus)
const result = await engine.sendAndWait(userMessage);

// unwire() called when session ends or user disconnects
```

**What changes in chat.ts specifically:**

1. **Remove** direct `CopilotClient` / `CopilotSession` imports
2. **Remove** the `projectSessions` Map (docore's UserManager handles caching)
3. **Remove** the `approveAll` import (docore's sandbox replaces it)
4. **Add** `userManager.acquire()` call (replaces `client.createSession()`)
5. **Add** `wireEngineEvents()` call (replaces manual `session.onEvent()` wiring)
6. **Keep** all tool creation (`createAllTools()`) — tools are passed to engine via `sessionConfig.tools`
7. **Keep** all SSE streaming logic — docore's EventBus events map 1:1 to current SSE events
8. **Keep** all tool result recording, persistence, thumbnail capture

**The key insight**: docore's `DoCoreEngine` is a drop-in wrapper around `CopilotSession`. The `send()` and `sendAndWait()` methods have the same signature. The EventBus events are a superset of raw SDK events (same data, just normalized into flat objects).

---

### Phase 4: Extend XRAY for sandbox + vault events (~40 lines)

**Files touched:** `services/api/src/integrations/xray.ts`

Add a new category alongside existing `"integration"` and `"mcp"`:

```typescript
// New call kinds
export type CallKind = "integration" | "mcp" | "sandbox" | "vault";

// New method on the xray singleton:
export function recordSandboxDecision(entry: SandboxAuditEntry): void {
  // Store in a rolling buffer (same pattern as integration stats)
  sandboxHistory.push({
    timestamp: entry.timestamp,
    userId: entry.userId,
    kind: entry.kind,
    decision: entry.decision,
    reason: entry.reason,
    details: entry.details,
  });
  // Trim to last 500 entries
  if (sandboxHistory.length > 500) sandboxHistory.shift();
}

export function recordVaultEvent(event: VaultAuditEvent): void {
  vaultHistory.push(event);
  if (vaultHistory.length > 500) vaultHistory.shift();
}

// New query methods:
export function getSandboxHistory(userId?: string, limit = 50): SandboxAuditEntry[] { ... }
export function getVaultHistory(projectId?: string, limit = 50): VaultAuditEvent[] { ... }
```

**XRAY CLI extension** (`tools/xray.cjs`):
```
xray sandbox [userId]      — show recent sandbox decisions
xray vault [projectId]     — show vault events (config locks, resource limits)
```

---

### Phase 5: Extend trace-collector for unified timeline (~20 lines)

**Files touched:** `services/api/src/ai/trace-collector.ts`

The trace-collector already accepts any `{ type, data }` event via `.push()`. No structural changes needed. Just ensure the new event types are properly categorized:

```typescript
// These are already handled by the existing push() method:
// type: "docore.session.start"
// type: "docore.assistant.message_delta"
// type: "docore.tool.started"
// type: "docore.sandbox.decision"     ← NEW (from docore sandbox)
// type: "vault.spawn"                 ← NEW (from dovault)
// type: "vault.config_locked"         ← NEW (from dovault)
// type: "vault.resource_limit_set"    ← NEW (from dovault)

// Optional: add a filter method for the frontend to query by category
export function filterTraceByCategory(
  events: TraceEvent[],
  category: "sdk" | "tool" | "sandbox" | "vault"
): TraceEvent[] {
  const prefixes = {
    sdk: ["docore.session.", "docore.assistant.", "docore.user."],
    tool: ["docore.tool.", "tool_start", "tool_end"],
    sandbox: ["docore.sandbox.", "sandbox."],
    vault: ["vault."],
  };
  return events.filter(e => prefixes[category].some(p => e.type.startsWith(p)));
}
```

---

### Phase 6: Auth gap fixes (4 quick wins) (~20 lines total)

These were identified in the original security audit. Quick fixes:

#### 6a. Chat route — add project access check

**File:** `services/api/src/routes/chat.ts`

```typescript
// BEFORE (line ~53): authMiddleware only, no project access check
app.post("/projects/:id/chat", authMiddleware, async (c) => {

// AFTER: add requireProjectAccess
app.post("/projects/:id/chat", authMiddleware, requireProjectAccess, async (c) => {
```

#### 6b. Preview proxy — add auth

**File:** `services/api/src/routes/preview-proxy.ts`

```typescript
// BEFORE: no auth at all
app.all("/preview/:projectId/*", async (c) => {

// AFTER: add cookie-based auth (preview is in an iframe, can't use Authorization header)
app.all("/preview/:projectId/*", previewAuthMiddleware, async (c) => {
```

#### 6c. Direct-save — add auth

**File:** `services/api/src/direct-save/index.ts`

```typescript
// BEFORE: no auth
app.post("/projects/:id/direct-save", async (c) => {

// AFTER:
app.post("/projects/:id/direct-save", authMiddleware, requireProjectAccess, async (c) => {
```

#### 6d. WS room:join — add access check

**File:** `services/ws/src/index.ts`

```typescript
// In room:join handler, after parsing projectId:
const hasAccess = await verifyProjectAccess(ws.userId, projectId);
if (!hasAccess) {
  ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
  return;
}
```

---

### Phase 7: Server startup wiring (~10 lines)

**File:** `services/api/src/index.ts` (or wherever the Hono app starts)

```typescript
import { initDocore, shutdownDocore } from "./ai/docore-bridge.js";

// On startup:
await initDocore();

// On shutdown (SIGTERM/SIGINT):
process.on("SIGTERM", async () => {
  await shutdownDocore();
  process.exit(0);
});
```

---

## Integration Summary

| Phase | Files touched | Lines changed | Risk |
|-------|--------------|---------------|------|
| 0. Decompose chat.ts | 8 new files, 2 existing | ~0 (pure refactor) | Low — no behavior change |
| 1. Install deps | `package.json` | 2 | None |
| 2. dovault → dev-server | `vite-jail.ts` (new), `dev-server.ts` | ~80 new, ~30 changed | Low — spawn() wrapper |
| 3. docore → chat.ts | `docore-bridge.ts` (new), `chat.ts` | ~80 new, ~50 changed | Medium — session lifecycle |
| 4. XRAY extension | `xray.ts` | ~40 | Low — additive only |
| 5. Trace extension | `trace-collector.ts` | ~20 | Low — additive only |
| 6. Auth fixes | 4 files | ~20 | Low — adding middleware |
| 7. Startup wiring | `index.ts` | ~10 | Low — lifecycle hooks |

**After all phases**: No file exceeds 500 lines. All new code is in focused, single-purpose modules.

---

## What Doesn't Break (Verification Checklist)

- [ ] Preview iframe loads and shows project
- [ ] HMR updates reflect in preview without full reload
- [ ] AI chat streaming works (text + thinking + tool calls)
- [ ] Tool calls appear in chat UI with args and results
- [ ] Activepieces integrations execute (e.g., Supabase, Slack)
- [ ] MCP tools execute (e.g., supabase MCP)
- [ ] XRAY CLI shows integration call traces
- [ ] Trace collector records full turn timeline
- [ ] Live trace events appear in frontend XRAY panel
- [ ] Yjs collaboration (multi-cursor, real-time edits)
- [ ] File write via AI updates both disk and CRDT
- [ ] Env vars injected into Vite process correctly
- [ ] VITE_* vars visible in browser, non-VITE_ hidden
- [ ] Thumbnail capture after AI edits
- [ ] Session resume after idle timeout / page reload
- [ ] BYOK provider keys work per-user
- [ ] Multiple users on same project get separate AI sessions
- [ ] Visual edit mode works
- [ ] Plan mode works
- [ ] Error capture from preview shows in editor

---

## Performance Characteristics

| Metric | Current | After integration |
|--------|---------|-------------------|
| **Vite startup** | ~2-5s | ~2-5s (dovault adds <10ms for config lock + spawn wrap) |
| **AI response latency** | SDK direct | Same (docore is a thin wrapper, <1ms overhead per event) |
| **Memory per Vite** | Unbounded | Capped at 256M (configurable) |
| **CPU per Vite** | Unbounded | Capped at 50% (configurable) |
| **Concurrent users** | Limited by memory | Predictable: 30 engines × ~80MB CLI = ~2.4GB |
| **Session resume** | Manual | Automatic (UserManager handles idle eviction + resume) |

---

## Future Extensibility (Android/iOS)

When adding mobile development:

1. **New dev-server backend**: Create `mobile-dev-server.ts` that calls `vault.spawn()` with `expo start` or `react-native start` instead of Vite. Same jail, same resource limits.

2. **New tools**: Add `defineTool("build_apk", ...)`, `defineTool("run_simulator", ...)` as Copilot SDK tools. docore's sandbox controls which users can access them via PolicyStore.

3. **New preview**: Replace iframe with emulator stream embed. Preview proxy routes to emulator WebRTC stream instead of Vite port.

4. **Same infrastructure**: docore (AI sessions), dovault (process jail), credential vault, Activepieces, MCP, XRAY, trace-collector — all unchanged.

---

## Implementation Order

```
Phase 0 (decompose chat.ts) → pure refactor, test everything still works
  ↓
Phase 1 (install deps) → Phase 2 (dovault) → Phase 7 (startup) → test preview
                       → Phase 6 (auth fixes) → test auth
                       → Phase 3 (docore) → test AI chat
                       → Phase 4 + 5 (XRAY + tracing) → test observability
```

Phase 0 is the foundation — do it first, verify nothing breaks.
Then Phases 2, 6, and 4+5 are independent and can proceed in parallel.
Phase 3 depends on Phase 1. Phase 7 depends on Phase 3.

---

## Growth-Proofing: Adding Features Won't Create Monoliths

### Module map for future features

| Future feature | Where new code goes | Max file size |
|---------------|--------------------|----|
| Android/iOS dev server | `projects/mobile-dev-server.ts` (~200 lines) | New file |
| Mobile preview (emulator) | `projects/emulator-preview.ts` (~150 lines) | New file |
| New AI tools | `ai/tools/tool-name.ts` (~50 lines each) | One file per tool |
| New Activepieces piece | Auto-generated in `integrations/registry/` | Registry only |
| New MCP preset | `mcp/presets/name.ts` (~50 lines) | One file per preset |
| Admin policy UI | `routes/admin-policies.ts` (~150 lines) | New file |
| Usage billing | `services/billing-service.ts` (~200 lines) | New file |
| Rate limiting | `middleware/rate-limit.ts` (~80 lines) | New file |

### The pattern: one concern = one file

Every new feature follows the same pattern:
1. Create a focused module under the appropriate directory
2. Export only public functions (no god-objects, no mega-classes)
3. Import from existing modules — never duplicate logic
4. If a module grows past 400 lines, split it by sub-concern

### docore and dovault are already modular by design

**docore** (external package):
```
engine.ts        — session lifecycle (~200 lines)
event-mapper.ts  — SDK event → docore event (append-only, one case per event)
sandbox.ts       — permission handler (~200 lines)
policy/store.ts  — runtime policy CRUD (~150 lines)
pool.ts          — connection pooling (~150 lines)
user-manager.ts  — per-user engine lifecycle (~200 lines)
```

**dovault** (external package):
```
vault.ts         — main API (~195 lines)
config-guard.ts  — config file locking (~145 lines)
process-jail.ts  — Node.js permissions (~175 lines)
resource-limiter.ts — OS limits (~95 lines)
backends/        — one file per OS backend (~60-250 lines each)
```

Both packages are consumed as dependencies — their internals don't bloat Doable's codebase. Doable only touches them through thin bridge modules (`docore-bridge.ts`, `vite-jail.ts`).

---

## Risk Mitigation

1. **docore EventBus → SSE mapping**: The event-mapper.ts in docore maps every SDK event 1:1. If a new SDK event type is added, add a case to event-mapper.ts. Unmapped events return `null` and are safely ignored.

2. **dovault config lock**: If a user legitimately needs a custom Vite plugin, the AI can't modify vite.config.ts. Solution: provide a `dovault.allowlist` option for approved plugins. Not needed initially — the safe template includes React, Tailwind, and source-annotations (all currently used).

3. **Resource limits too tight**: Start with generous limits (256M RAM, 50% CPU) and monitor. XRAY will show if Vite processes hit limits. Adjustable per-project via PolicyStore in the future.

4. **docore session caching differs from current**: Current code caches by `projectId` or `projectId:visual-edit`. docore's UserManager caches by `userId`. This is actually better — prevents session mixing when two users edit the same project. But we need to handle mode switching (agent → visual-edit) by passing mode in sessionConfig.
