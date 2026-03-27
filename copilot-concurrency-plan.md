# Copilot SDK Concurrency Plan

## Problem

All users sharing the same GitHub auth token share ONE CopilotEngine → ONE CLI subprocess. The CLI serializes AI model calls internally, so User A's request blocks User B completely. With 3 concurrent users, only 1 gets active AI processing at a time.

## Current Architecture

```
CopilotEngineManager (singleton)
  └── Pool: Map<tokenHash, PoolEntry>
        ├── "__default__" → Engine A (gh CLI auth) → 1 CLI process
        │     ├── Session for Project X (User 1)
        │     ├── Session for Project Y (User 2)  ← BLOCKED by User 1
        │     └── Session for Project Z (User 3)  ← BLOCKED by User 1
        └── "sha256_of_user_token" → Engine B (BYOK) → 1 CLI process
              └── Session for Project W (User 4)
```

Multiple sessions on the same CLI process queue behind each other because:
1. The CLI sends one prompt to the AI model at a time
2. Tool execution is synchronous within a turn
3. JSON-RPC multiplexing doesn't help when the bottleneck is the model API call

## Target Architecture

Each active chat request gets its own dedicated CLI process:

```
CopilotEngineManager (singleton)
  └── Pool: Map<projectId, PoolEntry>
        ├── "project-X" → Engine 1 → CLI process 1 (User 1's chat)
        ├── "project-Y" → Engine 2 → CLI process 2 (User 2's chat)
        └── "project-Z" → Engine 3 → CLI process 3 (User 3's chat)
```

## Implementation Plan

### Step 1: Change pool key from tokenHash to projectId

**File:** `services/api/src/ai/providers/copilot-manager.ts`

Change `getEngine(githubToken?)` to `getEngine(projectId, githubToken?)`:
- Pool key becomes `projectId` instead of `tokenHash`
- Each project gets its own CopilotClient + CLI subprocess
- The `githubToken` is still used for auth when creating the engine, but doesn't determine sharing

```typescript
async getEngine(projectId: string, githubToken?: string): Promise<CopilotEngine> {
  const poolKey = projectId; // Dedicated engine per project
  // ... rest of logic stays the same, but uses poolKey instead of tokenHash
}
```

### Step 2: Update all getEngine() call sites

**File:** `services/api/src/routes/chat.ts`

Change:
```typescript
const engine = await manager.getEngine(resolvedGithubToken);
```
To:
```typescript
const engine = await manager.getEngine(projectId, resolvedGithubToken);
```

Also update `withAutoRetry`, `evictEngine`, `trackRequest` to take `projectId` as the key.

### Step 3: Adjust idle cleanup for per-project engines

**File:** `services/api/src/ai/providers/copilot-manager.ts`

- Reduce `IDLE_TIMEOUT_MS` from 30 min to 10 min (more engines = need faster cleanup)
- Keep `MAX_AGE_MS` at 60 min
- The cleanup loop already handles this — just needs the shorter idle timeout

### Step 4: Memory management

Each CLI process uses ~50-100MB. With 10 concurrent projects, that's 500MB-1GB.
- The server has 4GB RAM — can handle ~20 concurrent CLI processes
- Idle engines are cleaned up after 10 min, so only ACTIVE projects consume memory
- Add a hard cap: max 20 engines, reject new requests if exceeded (return 503)

```typescript
const MAX_ENGINES = 20;

async getEngine(projectId: string, githubToken?: string) {
  if (this.pool.size >= MAX_ENGINES && !this.pool.has(projectId)) {
    // Try to evict an idle engine
    this.cleanupIdle();
    if (this.pool.size >= MAX_ENGINES) {
      throw new Error("Server busy — too many concurrent AI sessions. Please try again.");
    }
  }
  // ... create engine
}
```

### Step 5: Session management stays the same

The `projectSessions` map already keys by projectId. Sessions are tied to engines.
When an engine is cleaned up, its sessions become invalid — the chat route already
handles "session not found" by recreating.

## Trade-offs

| Aspect | Before (per-token) | After (per-project) |
|--------|-------------------|---------------------|
| Concurrency | 1 request at a time per token | True parallel per project |
| Memory | ~100MB (1 CLI) | ~100MB per active project |
| Startup | Reuse existing CLI | New CLI per project (~2s) |
| Max concurrent | 1 | ~20 (4GB server) |
| Cleanup | 30min idle | 10min idle |

## Files to Change

1. `services/api/src/ai/providers/copilot-manager.ts` — Pool key, getEngine signature, cleanup
2. `services/api/src/routes/chat.ts` — Pass projectId to getEngine, withAutoRetry, trackRequest
3. No frontend changes needed

## Risk

- Memory pressure with many concurrent users — mitigated by idle cleanup + hard cap
- More CLI process churn (start/stop) — mitigated by 10min idle window
- Session invalidation on engine cleanup — already handled by existing retry logic
