# docore Security and Policy System: Implementation Plan

## Goal

Make every sandbox rule, isolation limit, tool permission, and security setting
**runtime configurable** at two scopes:

1. **Global** (applies to ALL users as default)
2. **Per user** (override any global setting for a specific user)

Changes take effect **immediately** without restarting the server.
Settings are **persistent** (survive restarts) and **auditable** (every change is logged).

---

## Architecture Overview

```
                       PolicyStore (in memory + disk/DB)
                      /            |              \
               SandboxPolicy   IsolationPolicy   ToolPolicy
              /     |      \        |               |
         commands  paths  urls   resources      mcp/tools
              \     |      /        |               |
               [Global defaults]  [Global defaults]  [Global defaults]
                      |              |              |
              [Per user overrides]                 ...
                      |
           UserManager.acquire(userId)
                      |
      merge(global, perUser) => effective policy
                      |
          Engine + Sandbox + Isolator all use it
```

---

## Part 1: PolicyStore (Core Runtime Config System)

### File: `src/policy/store.ts`

The central brain. Holds all policies in memory, persists changes to disk,
and notifies listeners when anything changes.

```ts
interface PolicyStore {
  // Read
  getGlobal<K extends PolicyKey>(key: K): PolicyValue<K>;
  getUser<K extends PolicyKey>(userId: string, key: K): PolicyValue<K> | undefined;
  getEffective<K extends PolicyKey>(userId: string, key: K): PolicyValue<K>;  // merged

  // Write
  setGlobal<K extends PolicyKey>(key: K, value: PolicyValue<K>): void;
  setUser<K extends PolicyKey>(userId: string, key: K, value: PolicyValue<K>): void;
  clearUser<K extends PolicyKey>(userId: string, key: K): void;  // fall back to global
  clearAllUser(userId: string): void;  // remove all user overrides

  // Bulk
  exportAll(): SerializedPolicies;
  importAll(data: SerializedPolicies): void;

  // Events
  onChange(listener: (change: PolicyChange) => void): () => void;

  // Persistence
  save(): Promise<void>;
  load(): Promise<void>;
}
```

### Merge strategy

For **set based** policies (allowed commands, blocked commands, URL allowlist):
- Per user `add` items are UNIONED with global
- Per user `remove` items are SUBTRACTED from global
- Per user `replace` completely overrides global

For **scalar** policies (maxWriteBytes, memoryMax, cpuQuota):
- Per user value REPLACES global if set

For **boolean** policies (blockAllShell, blockNetworkCommands):
- Per user value REPLACES global if set
- Principle of least privilege: if EITHER scope says blocked, it is blocked

For **map based** policies (MCP servers, custom tools):
- Per user entries are MERGED on top of global (per key override)

### Persistence backend (pluggable)

```ts
interface PolicyPersistence {
  save(data: SerializedPolicies): Promise<void>;
  load(): Promise<SerializedPolicies | null>;
}
```

Built in backends:
- `FilePersistence` (JSON file on disk, good for single server)
- `MemoryPersistence` (no persistence, good for tests)

Users can plug in Redis, PostgreSQL, SQLite, etc. by implementing the interface.

---

## Part 2: SandboxPolicy (Application Layer)

### File: `src/policy/sandbox-policy.ts`

Replaces the current hardcoded constants in `sandbox.ts`. Every rule that is
currently a `const Set` or `const Array` becomes a policy key.

### Policy keys

| Key | Type | Current default | Description |
|---|---|---|---|
| `sandbox.commands.allowed` | `SetPolicy` | SAFE_COMMANDS (30 items) | Commands that can be executed |
| `sandbox.commands.blocked` | `SetPolicy` | DANGEROUS_COMMANDS (60+ items) | Commands that are always denied (overrides allowed) |
| `sandbox.commands.blockAll` | `boolean` | `false` | Kill switch: deny ALL shell commands |
| `sandbox.commands.blockNetwork` | `boolean` | `true` | Block curl, wget, ssh, nc, etc. |
| `sandbox.paths.traversalPatterns` | `RegExp[]` | PATH_TRAVERSAL_PATTERNS (20 patterns) | Patterns that trigger path traversal detection |
| `sandbox.paths.readOnlyRoots` | `string[]` | `[]` | Extra directories users can read (not write) |
| `sandbox.files.maxWriteBytes` | `number` | `10_000_000` | Max file size for writes |
| `sandbox.files.allowedExtensions` | `SetPolicy` | `null` (all allowed) | Restrict writable file extensions (e.g. `.ts`, `.jsx`, `.css`) |
| `sandbox.files.blockedExtensions` | `SetPolicy` | `null` (none blocked) | Block specific extensions (e.g. `.exe`, `.sh`, `.bat`) |
| `sandbox.urls.allowlist` | `RegExp[]` | localhost + CDNs | URL patterns that are allowed |
| `sandbox.urls.denylist` | `RegExp[]` | `[]` | URL patterns that are always denied (overrides allow) |
| `sandbox.urls.blockAll` | `boolean` | `false` | Kill switch: deny ALL URL access |
| `sandbox.mcp.enabled` | `boolean` | `false` | Whether MCP tools are allowed at all |
| `sandbox.mcp.allowedServers` | `SetPolicy` | `[]` | Which MCP server names are allowed |
| `sandbox.mcp.blockedTools` | `SetPolicy` | `[]` | Specific MCP tools to block even on allowed servers |
| `sandbox.customTools.enabled` | `boolean` | `false` | Whether custom tools are allowed |
| `sandbox.customTools.allowed` | `SetPolicy` | `[]` | Which custom tool names are allowed |
| `sandbox.rateLimit.commandsPerMinute` | `number` | `60` | Max shell commands per minute per user |
| `sandbox.rateLimit.writesPerMinute` | `number` | `120` | Max file writes per minute per user |

### SetPolicy shape

```ts
interface SetPolicy {
  mode: "extend" | "replace";
  // When mode = "extend": these are added to (or removed from) the global set
  add?: string[];
  remove?: string[];
  // When mode = "replace": this completely replaces the global set
  values?: string[];
}
```

### How sandbox.ts changes

Current:
```ts
export function createSandboxedPermissionHandler(userId, options) {
  const allowedCommands = new Set([...SAFE_COMMANDS]);  // hardcoded
  ...
}
```

New:
```ts
export function createSandboxedPermissionHandler(userId, store: PolicyStore) {
  // Every permission check pulls the EFFECTIVE policy (global + user merged)
  return async (request) => {
    const effective = store.getEffective(userId, "sandbox.commands.allowed");
    ...
  };
}
```

The handler closes over the `PolicyStore` reference, so when a policy changes
at runtime, the very next permission check uses the new value. No need to
recreate the handler.

---

## Part 3: IsolationPolicy (OS Layer)

### File: `src/policy/isolation-policy.ts`

Controls resource limits passed to the isolation backend.

### Policy keys

| Key | Type | Current default | Description |
|---|---|---|---|
| `isolation.memory.max` | `string` | `"200M"` | Memory limit per user CLI process |
| `isolation.cpu.quota` | `string` | `"50%"` | CPU time quota |
| `isolation.cpu.affinity` | `number[]` | `null` (all cores) | Pin to specific CPU cores |
| `isolation.tasks.max` | `number` | `64` | Max processes/threads |
| `isolation.time.limitSec` | `number` | `0` | Wall clock time limit (0 = none) |
| `isolation.files.maxSize` | `number` | `50_000_000` | Max file size the process can create |
| `isolation.io.weight` | `number` | `100` | IO priority weight (1 to 10000) |
| `isolation.network.enabled` | `boolean` | `false` | Allow network access inside the jail |
| `isolation.network.allowedPorts` | `number[]` | `[]` | Outbound ports allowed (when network enabled) |
| `isolation.backend.preferred` | `string` | `"auto"` | Force a specific backend |
| `isolation.backend.config` | `BackendConfig` | `{}` | Opaque config passed to the active backend |

### How it integrates

When `UserManager.acquire()` spawns an isolated process, it pulls effective
isolation policy for that user and passes it to `ProcessIsolator.spawn()`.

For **already running** processes: resource limit changes are applied via
`cgroup` writes (Linux) or `SetInformationJobObject` (Windows) without
restarting the CLI. This is OS supported and immediate.

---

## Part 4: ToolPolicy (SDK Tool Layer)

### File: `src/policy/tool-policy.ts`

Controls which SDK tools the user's agent can invoke, which MCP servers it
can connect to, and which custom agents are available.

### Policy keys

| Key | Type | Default | Description |
|---|---|---|---|
| `tools.builtin.blocked` | `SetPolicy` | `[]` | Block specific built in tools (e.g. `editFile`, `runCommand`) |
| `tools.mcp.servers` | `McpServerPolicy[]` | `[]` | MCP servers available to users |
| `tools.mcp.globalBlock` | `boolean` | `true` | Kill switch for all MCP |
| `tools.custom.definitions` | `CustomToolDef[]` | `[]` | Custom tool definitions available |
| `tools.custom.globalBlock` | `boolean` | `true` | Kill switch for all custom tools |
| `tools.agents.available` | `CustomAgentConfig[]` | `[]` | Custom agents available to users |
| `tools.agents.default` | `string` | `null` | Pre selected agent for new sessions |

### McpServerPolicy

```ts
interface McpServerPolicy {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  allowedTools?: string[];     // whitelist (null = all tools on this server)
  blockedTools?: string[];     // blacklist (overrides allowedTools)
  enabled: boolean;            // quick toggle without removing config
}
```

---

## Part 5: AuditPolicy (Observability Layer)

### File: `src/policy/audit-policy.ts`

Controls what gets logged, where, and how aggressively.

### Policy keys

| Key | Type | Default | Description |
|---|---|---|---|
| `audit.log.permissions` | `boolean` | `true` | Log every permission decision |
| `audit.log.commands` | `boolean` | `true` | Log every shell command executed |
| `audit.log.fileAccess` | `boolean` | `false` | Log every file read/write |
| `audit.log.toolUse` | `boolean` | `true` | Log every tool invocation |
| `audit.log.policyChanges` | `boolean` | `true` | Log every policy change |
| `audit.alert.deniedBurst` | `number` | `10` | Alert after N denied requests in 1 minute |
| `audit.alert.callback` | `Function` | `null` | Called when alert threshold is hit |
| `audit.rateLimit.action` | `"warn" \| "throttle" \| "suspend"` | `"warn"` | What happens when rate limit is exceeded |
| `audit.retention.maxEntries` | `number` | `10000` | Max audit log entries in memory |

---

## Part 6: Admin API (Runtime Control Surface)

### File: `src/policy/admin.ts`

A typed API that server code (Express route, WebSocket handler, admin CLI)
calls to read and modify policies at runtime.

```ts
class PolicyAdmin {
  constructor(private store: PolicyStore) {}

  // === Commands ===
  allowCommand(cmd: string, scope?: { userId?: string }): void;
  blockCommand(cmd: string, scope?: { userId?: string }): void;
  removeCommandRule(cmd: string, scope?: { userId?: string }): void;

  // === URLs ===
  allowUrl(pattern: string | RegExp, scope?: { userId?: string }): void;
  blockUrl(pattern: string | RegExp, scope?: { userId?: string }): void;

  // === File limits ===
  setMaxWriteBytes(bytes: number, scope?: { userId?: string }): void;
  setAllowedExtensions(exts: string[], scope?: { userId?: string }): void;
  setBlockedExtensions(exts: string[], scope?: { userId?: string }): void;

  // === Resource limits ===
  setMemoryLimit(limit: string, scope?: { userId?: string }): void;
  setCpuQuota(quota: string, scope?: { userId?: string }): void;
  setTasksMax(max: number, scope?: { userId?: string }): void;

  // === Tools ===
  enableMcp(scope?: { userId?: string }): void;
  disableMcp(scope?: { userId?: string }): void;
  addMcpServer(config: McpServerPolicy, scope?: { userId?: string }): void;
  removeMcpServer(name: string, scope?: { userId?: string }): void;
  enableCustomTools(scope?: { userId?: string }): void;
  disableCustomTools(scope?: { userId?: string }): void;

  // === Agents ===
  addAgent(config: CustomAgentConfig, scope?: { userId?: string }): void;
  removeAgent(name: string, scope?: { userId?: string }): void;
  setDefaultAgent(name: string | null, scope?: { userId?: string }): void;

  // === Rate limits ===
  setCommandRateLimit(perMinute: number, scope?: { userId?: string }): void;
  setWriteRateLimit(perMinute: number, scope?: { userId?: string }): void;

  // === Bulk ===
  getUserOverrides(userId: string): Record<string, unknown>;
  clearUserOverrides(userId: string): void;
  exportPolicies(): SerializedPolicies;
  importPolicies(data: SerializedPolicies): void;

  // === Kill switches ===
  suspendUser(userId: string, reason: string): void;
  unsuspendUser(userId: string): void;
  blockAllShellGlobal(block: boolean): void;
  blockAllUrlsGlobal(block: boolean): void;
}
```

### Usage examples (from server code)

```ts
// Allow Python globally (maybe you trust it now)
admin.allowCommand("python3");

// But block it for a specific abusive user
admin.blockCommand("python3", { userId: "user-456" });

// Give a paying user more memory
admin.setMemoryLimit("1G", { userId: "user-premium-789" });

// Open up an MCP server for all users
admin.addMcpServer({
  name: "github",
  command: "npx",
  args: ["@modelcontextprotocol/server-github"],
  enabled: true,
});

// Emergency: shut down all shell access RIGHT NOW
admin.blockAllShellGlobal(true);

// Changes are immediate. The NEXT permission check uses the new rules.
// Also auto-persisted to disk.
```

---

## Part 7: Worker Pool (1000+ Concurrent Users)

### File: `src/worker-pool.ts`

Decouples "registered users" from "active CLI processes."

### Architecture

```
  1000+ connected users (WebSocket / SSE)
         |
    RequestQueue (priority queue, fair scheduling)
         |
    WorkerPool (N CLI workers, where N = RAM / 150MB)
         |
    Worker acquires CLI -> resumes session -> processes request -> streams events -> releases CLI
```

### WorkerPool design

```ts
interface WorkerPoolOptions {
  /** Max concurrent CLI processes. @default auto-detected from available RAM */
  maxWorkers?: number;
  /** Max queued requests per user. @default 5 */
  maxQueuePerUser?: number;
  /** How long a worker stays idle before being killed. @default 30_000 (30s) */
  workerIdleMs?: number;
  /** Max time a single request can hold a worker. @default 300_000 (5 min) */
  maxRequestDurationMs?: number;
  /** Policy store for per-user config */
  policyStore: PolicyStore;
  /** Base directory for user workspaces */
  baseDir: string;
  /** Isolator for OS level sandboxing */
  isolator?: ProcessIsolator;
}
```

### Request lifecycle

1. User sends a message via WebSocket
2. `pool.enqueue(userId, { token, prompt, sessionId, provider? })` adds to queue
3. Pool assigns request to next available worker (or spawns new one if under limit)
4. Worker calls `client.resumeSession(sessionId, config)` (re-providing token + provider)
5. Events stream back to the user via a callback/EventEmitter
6. When session goes idle (response complete), worker marks itself "available"
7. After `workerIdleMs` with no new requests, worker is killed (CLI stopped)
8. Session state stays on disk for next request

### Fair scheduling

- Round robin among users with pending requests
- No single user can starve others
- Priority tiers: paying > free (configurable via PolicyStore)

### Queue overflow protection

- Each user has `maxQueuePerUser` slots
- If queue is full, return HTTP 429 with estimated wait time
- Global queue cap prevents memory exhaustion

---

## Part 8: Integration (Wiring It All Together)

### File: `src/docore-server.ts`

The top level entry point that wires everything together.

```ts
class DoCoreServer {
  readonly policyStore: PolicyStore;
  readonly admin: PolicyAdmin;
  readonly workerPool: WorkerPool;
  readonly isolator: ProcessIsolator;

  constructor(options: DoCoreServerOptions) {
    // 1. Create policy store with persistence
    this.policyStore = new PolicyStore({
      persistence: new FilePersistence(options.policyDir),
    });

    // 2. Load saved policies from disk
    await this.policyStore.load();

    // 3. Create admin API
    this.admin = new PolicyAdmin(this.policyStore);

    // 4. Create isolator (auto-detects best backend)
    this.isolator = new ProcessIsolator();

    // 5. Create worker pool
    this.workerPool = new WorkerPool({
      policyStore: this.policyStore,
      baseDir: options.baseDir,
      isolator: this.isolator,
    });
  }

  // Handle a user request (called from WebSocket/Express handler)
  async handleRequest(userId: string, request: UserRequest): Promise<AsyncIterable<DoCoreEvent>> {
    // Check if user is suspended
    if (this.policyStore.getEffective(userId, "user.suspended")) {
      throw new Error("Account suspended");
    }

    return this.workerPool.enqueue(userId, request);
  }
}
```

---

## Part 9: File Structure (Complete)

```
docore/src/
  policy/
    store.ts              PolicyStore (core key-value with scoping)
    persistence.ts        FilePersistence, MemoryPersistence interfaces
    merge.ts              Merge strategies (set union, scalar replace, etc.)
    types.ts              PolicyKey, PolicyValue, SetPolicy, PolicyChange types
    sandbox-policy.ts     SandboxPolicy defaults and key definitions
    isolation-policy.ts   IsolationPolicy defaults and key definitions
    tool-policy.ts        ToolPolicy defaults and key definitions
    audit-policy.ts       AuditPolicy defaults and key definitions
    admin.ts              PolicyAdmin (typed admin API)
    index.ts              Barrel exports
  worker-pool.ts          WorkerPool + RequestQueue
  docore-server.ts        Top level wiring
  (existing files unchanged, just updated to accept PolicyStore)
  sandbox.ts              Updated: reads from PolicyStore instead of hardcoded
  isolator.ts             Updated: reads from PolicyStore for default limits
  user-manager.ts         Updated: passes PolicyStore to sandbox/isolator
  engine.ts               Unchanged (no policy awareness needed)
  event-bus.ts            Unchanged
  events.ts               Unchanged
  pool.ts                 Unchanged (replaced by WorkerPool for multi-tenant)
  backends/               Unchanged
```

---

## Part 10: Implementation Order

### Phase 1: Policy Store (foundation)

1. `src/policy/types.ts` with all PolicyKey/PolicyValue type definitions
2. `src/policy/merge.ts` with merge strategies
3. `src/policy/persistence.ts` with File and Memory backends
4. `src/policy/store.ts` with PolicyStore class
5. Unit tests for merge logic and store CRUD

### Phase 2: Policy Definitions (migrate hardcoded values)

6. `src/policy/sandbox-policy.ts` with default values (move SAFE_COMMANDS etc. here)
7. `src/policy/isolation-policy.ts` with default values
8. `src/policy/tool-policy.ts` with default values
9. `src/policy/audit-policy.ts` with default values

### Phase 3: Wire into existing code

10. Update `sandbox.ts` to accept PolicyStore, remove hardcoded sets
11. Update `isolator.ts` to read defaults from PolicyStore
12. Update `user-manager.ts` to pass PolicyStore through
13. Update `index.ts` with new exports

### Phase 4: Admin API

14. `src/policy/admin.ts` with PolicyAdmin class
15. `src/policy/index.ts` barrel

### Phase 5: Worker Pool

16. `src/worker-pool.ts` with WorkerPool and RequestQueue
17. Integration tests with mock CLIs

### Phase 6: Server entry point

18. `src/docore-server.ts` wiring everything together
19. Update `index.ts` with full public API

---

## Part 11: Backward Compatibility

All existing code continues to work unchanged:

- `createSandboxedPermissionHandler(userId, options)` still works (creates an
  internal ephemeral PolicyStore from options)
- `ProcessIsolator` still works standalone (uses its own defaults)
- `DoCoreUserManager` still works (passes through to sandbox/isolator as before)
- `DoCoreEngine` has ZERO policy awareness (it does not need any)
- `DoCorePool` still works for shared client mode

The PolicyStore/Admin/WorkerPool are **additive**. You opt in by using
`DoCoreServer` instead of wiring things manually.

---

## Part 12: Security Invariants (Never violated regardless of policy changes)

1. **Blocked always wins.** If something is in BOTH the allow and block list,
   it is BLOCKED. No policy change can override this logic.

2. **Per user can only restrict, not elevate** (optional strict mode).
   In strict mode, a per user override can only ADD to the block list
   or REMOVE from the allow list, never the reverse.
   In permissive mode (default), per user can do both.

3. **Token isolation.** User A can never see User B's GitHub token, BYOK API
   key, or session data. Tokens exist only in memory during active requests
   and are never persisted.

4. **Filesystem jail is absolute.** Even if an admin adds `/etc` to
   readOnlyRoots, the path traversal detection still blocks `../../../etc`.
   The jail path CANNOT be set to `/` or empty.

5. **Audit trail is immutable.** Policy changes are logged before they take
   effect. The audit log itself cannot be cleared via the admin API.

6. **Suspend is instant.** `admin.suspendUser()` immediately rejects all
   pending and future requests. The worker is killed. Session state is preserved
   (not deleted) for investigation.

7. **Rate limits are per user, not bypassable.** Even if a user opens multiple
   WebSocket connections, rate limits track by userId, not by connection.

---

## Summary

| What | Configurable? | Per user? | Runtime? | Persistent? |
|---|---|---|---|---|
| Allowed shell commands | Yes | Yes | Yes | Yes |
| Blocked shell commands | Yes | Yes | Yes | Yes |
| Path traversal patterns | Yes | Yes | Yes | Yes |
| URL allowlist/denylist | Yes | Yes | Yes | Yes |
| File size limits | Yes | Yes | Yes | Yes |
| File extension filters | Yes | Yes | Yes | Yes |
| MCP server enable/config | Yes | Yes | Yes | Yes |
| Custom tool enable/config | Yes | Yes | Yes | Yes |
| Custom agents | Yes | Yes | Yes | Yes |
| Memory/CPU/task limits | Yes | Yes | Yes | Yes |
| Network access in jail | Yes | Yes | Yes | Yes |
| Rate limits | Yes | Yes | Yes | Yes |
| Audit verbosity | Yes | Yes | Yes | Yes |
| User suspension | Yes | Per user only | Yes | Yes |
| Isolation backend choice | Yes | Yes | Yes | Yes |
