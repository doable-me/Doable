# 13 — AI Tool Execution: Where to Insert the Sandbox

*Author: `sdk-integrator` (Opus, 2026-05-11).*

## 1. Overview

Doable's AI is driven by `@github/copilot-sdk` (resolved at
`node_modules/.pnpm/@github+copilot-sdk@0.1.32/...` and `@0.2.0`; the
version pinned in `node_modules/@github/copilot-sdk/package.json:7` is
**0.1.32**). The SDK ships a fleet of built-in tools — including a
`bash` tool — which the model can invoke at will. Today, Doable's
only line of defense against arbitrary shell execution is a
regex-based string filter inside the `onPreToolUse` hook
(`services/api/src/ai/providers/copilot-engine.ts:120-130`). That is
not a sandbox; it is a denylist that fires on the host node process's
behalf, in the host's filesystem, with the host's UID.

This chapter describes (a) what the SDK actually gives us to insert a
sandbox, (b) what the in-tree Doable tools look like today, and (c)
the shape of the wrapper we must write so every model-issued shell
command is routed through `dovault.spawn` (or whichever backend the
platform has selected) instead of `node:child_process.spawn`.

## 2. The SDK's Built-in `bash` Tool

### 2.1 How it is exposed

The SDK does not register `bash` through the public `tools: Tool[]`
array we pass to `createSession`. It is built into the underlying
Copilot CLI binary and lives inside the JSON-RPC server the SDK
talks to. Evidence:

- The generated RPC types
  (`node_modules/@github/copilot-sdk/dist/generated/rpc.d.ts:85`)
  describe the tool identifier field with: *"Tool identifier (e.g.,
  `bash`, `grep`, `str_replace_editor`)"*. These are CLI-internal
  names, not SDK-injected ones.
- Permission requests can arrive with `kind: "shell"`
  (`node_modules/@github/copilot-sdk/dist/types.d.ts:184`) — proving
  the shell tool sits on the CLI side of the wire.
- Session events include an "agent mode" of `"shell"`
  (`node_modules/@github/copilot-sdk/dist/generated/session-events.d.ts:978`)
  and background-shell tracking (`shells[]`, line 200-208).

### 2.2 Can we disable it via config?

**No first-class disable knob exists.** Inspecting the SDK surface
turns up no `disableBuiltinTools`, `builtinTools: false`,
`toolSet: "custom-only"`, or similar. The `CopilotSessionConfig` we
pass at `copilot-engine.ts:107-152` only accepts a positive `tools`
list, a `systemMessage`, a `provider`, `skillDirectories`, and
`hooks`. There is no `excludedTools`.

The only documented escape hatch is
`systemMessage: { mode: "replace", ... }`, which the SDK warns
*"Removes all SDK guardrails including security restrictions."* That
removes guardrails, it does not remove the tool — the model can
still call `bash` and the CLI will still try to run it.

### 2.3 Practical consequence

We are stuck denying each invocation through `onPreToolUse`. Until
GitHub ships a `tools.builtin.bash: false` switch, the permission
hook is **the only choke point** for shell execution, and the
sandbox must live behind it — either by `permissionDecision: "deny"`
plus a Doable-owned replacement tool, or by
`permissionDecision: "ask"` plus a host-side executor (see §6).

## 3. The Permission Hook Contract

The hook installed at `copilot-engine.ts:117-141` (and re-installed
for resumed sessions at `:182-205`) implements the SDK's
`PreToolUseHandler` type.

### 3.1 Input shape (`PreToolUseHookInput`, lines 241-244)

```ts
export interface PreToolUseHookInput extends BaseHookInput {
    toolName: string;
    toolArgs: unknown;
}
// BaseHookInput adds: { timestamp: number; cwd: string; } — types.d.ts:234
```

### 3.2 Output shape (`PreToolUseHookOutput`, lines 248-254)

```ts
export interface PreToolUseHookOutput {
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    modifiedArgs?: unknown;
    additionalContext?: string;
    suppressOutput?: boolean;
}
```

Returning `void` is allowed: "no opinion → SDK uses its own
permission flow."

### 3.3 What it can and cannot do

Documentation quote (≤15 words): *"Intercept tool calls before
execution. Can allow/deny or modify arguments."* (`types.d.ts:680`)

The hook can:

- **Allow / deny / escalate** to a user prompt (`permissionDecision`).
- **Rewrite the arguments** the CLI will run (`modifiedArgs`). This
  is the load-bearing field for sandbox insertion — we can rewrite a
  `bash` call's `command` string in flight.
- **Append context** the model sees on its next turn
  (`additionalContext`).
- **Suppress output** going back into the transcript
  (`suppressOutput`).

Side-effect timing: hook runs **synchronously in the JSON-RPC
request path** before the CLI starts the tool. The handler is
`Promise<PreToolUseHookOutput | void> | PreToolUseHookOutput | void`
(`types.d.ts:258-260`), so async is fine but the model is blocked
until it resolves.

### 3.4 What it cannot do

The hook cannot replace the executor. Even if we set
`modifiedArgs = { command: "echo blocked" }`, the **CLI still runs
the command** on the host with the host's privileges. The hook is a
filter, not a hand-off to a different runtime. That is why we need
(a) a Doable-owned `bash` replacement tool **plus** (b)
`permissionDecision: "deny"` on the built-in.

## 4. Tool Name Collisions and Overriding the Built-in

### 4.1 Names must be unique — with one explicit opt-in

`Tool` (`types.d.ts:121-132`) carries an `overridesBuiltInTool?: boolean`
flag whose JSDoc states:

> "When true, explicitly indicates this tool is intended to override
> a built-in tool of the same name. If not set and the name clashes
> with a built-in tool, the runtime will return an error."

So:

- Registering custom `name: "bash"` **without** `overridesBuiltInTool: true`
  → SDK errors at session create.
- Registering custom `name: "bash"` **with**
  `overridesBuiltInTool: true` → our handler is called instead of the
  CLI's. **We become the executor.**

`defineTool` (`types.d.ts:137-142`) forwards the flag, so the
recommended pattern is:

```ts
defineTool("bash", { overridesBuiltInTool: true, ... })
```

### 4.2 Recommended strategy

Two viable paths. The PRD recommends **(B)**:

- **(A) Different name + deny built-in.** Register `doable_bash` (or
  `run_command`) and deny `toolName === "bash"` in the hook. Pro: no
  risk of a future SDK change breaking the override. Con: every model
  needs to be retrained/system-prompted away from `bash`, and the SDK
  still pesters us with `bash` calls we have to log-and-reject.
- **(B) Same name + `overridesBuiltInTool: true`.** Register `bash`
  ourselves, mark the override, and the SDK quietly routes every
  model `bash` call into our handler. Pro: zero prompt churn, zero
  model retraining. Con: depends on the SDK honoring the override
  (the flag is documented and typed in 0.1.32 — see
  `types.d.ts:131`).

In either case, the Doable-owned tool is the one that drops into the
sandbox. The hook remains the second line of defense.

## 5. Doable's Existing Tool Contract

### 5.1 The `Tool` interface

`services/api/src/ai/tools/index.ts:12-17`:

```ts
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
```

`ToolContext` (`index.ts:5-10`) gives the handler
`{ projectId, userId, sessionId, projectPath }`. This is internal
Doable shape (`ToolResult` from `@doable/shared/types/ai.js`),
distinct from the SDK's `ToolResult`
(`@github/copilot-sdk/dist/types.d.ts:84-99`). The bridge between the
two formats lives in `copilot-tools.ts` (referenced from
`copilot-tool-loader.ts:13` as `createDoableTools`) — same place the
new `bash` tool will be wired.

The registry (`index.ts:21-76`) throws on duplicate registration,
but that is an internal Doable-side check.

### 5.2 How a Doable-owned tool spawns today

The canonical example is `install_package`
(`services/api/src/ai/tools/install-package.ts`). The actual spawn:

```ts
// install-package.ts:237-242
const child = spawn(pm, args, {
  cwd,
  shell: true,
  stdio: "pipe",
  env: buildSafeEnv(undefined, { FORCE_COLOR: "0" }),
});
```

This is **`node:child_process.spawn` directly on the host**, with
`shell: true`. The only mitigations today are:

- Hardcoded denylist of package names (`install-package.ts:15-19`).
- Workspace-level sandbox rules consulted before spawning
  (`install-package.ts:120-133` via `evaluateSandbox`).
- 2-minute `SIGTERM` timeout (`install-package.ts:272-274`).
- `--ignore-scripts` baked into `buildArgs`
  (`install-package.ts:209-213`).

There is **no jail, no UID drop, no filesystem confinement, no
network policy enforcement at the syscall level.** Every Doable-owned
tool that calls `spawn` (install_package, run_build, dev-server,
vite-jail, deploy/builder) has the same shape: build args → `spawn`
→ capture stdout/stderr → close handler → return.

## 6. The Wrapper We Must Write

### 6.1 Signature

```ts
// services/api/src/ai/sandbox/spawn-jailed.ts (proposed)
export interface JailedSpawnCtx {
  projectId: string;
  userId: string;
  workspaceId: string | null;
  projectPath: string;
  sessionId: string;
}

export interface JailedSpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  oomKilled: boolean;
  durationMs: number;
}

export async function spawnJailed(
  command: string,
  ctx: JailedSpawnCtx,
  opts?: { timeoutMs?: number; profile?: string }
): Promise<JailedSpawnResult>;
```

This is what
`defineTool("bash", { overridesBuiltInTool: true, handler })` calls.
The handler then adapts the result into the SDK's `ToolResultObject`
shape (`copilot-sdk/dist/types.d.ts:91-98`):

```ts
return {
  textResultForLlm: formatForModel(result),
  resultType: result.exitCode === 0 ? "success" : "failure",
  toolTelemetry: { exitCode, durationMs, oomKilled, timedOut },
} satisfies ToolResultObject;
```

### 6.2 Backend resolution

Resolve in this order (matching how `evaluateSandbox` already
resolves rules):

1. **Per-workspace setting** — query `workspace_sandbox_settings` for
   `sandbox_backend` (extend schema from migration 073). Allowed:
   `psroot | bubblewrap | systemd | sandbox-exec | dovault | none`.
2. **Process env** — `DOABLE_SANDBOX_BACKEND` overrides per-workspace
   (ops escape hatch).
3. **Auto-detect** — same logic `vite-jail.ts` already runs: probe
   `which bwrap`, `which systemd-run`, OS = `darwin` → sandbox-exec,
   OS = `win32` → psroot.
4. **`none`** — log warning, fall back to today's
   `child_process.spawn`. Only allowed when `HARDENING_LEVEL=dev`.

### 6.3 Profile construction

```ts
interface SandboxProfile {
  rootDir: string;                    // ctx.projectPath
  readOnlyPaths: string[];            // node_modules cache, /usr, /etc-base
  readWritePaths: string[];           // project src, project node_modules
  procOverlay: "minimal" | "full";    // /proc masking
  etcSynthesis: Record<string, string>;
  network: "deny" | "loopback" | "allow";
  uidMap: { uid: number; gid: number };
  rlimits: { cpuSec: number; memBytes: number; nofile: number };
  envAllowlist: string[];
}
```

Profile built **once per AI session**, cached on the engine, passed
into every spawn.

## 7. Integration Sequence

The implementation order (no code, just the ordered dependency graph):

### a. Resolve sandbox backend
Touch points: new `services/api/src/sandbox/backend-resolver.ts`.
Reads workspace settings (extend migration 073), env, OS, hardening
level. Returns a `SandboxBackend` adapter with
`spawn(profile, command) → ChildProcess`.

### b. Build profile
Touch points: new `services/api/src/sandbox/profile-builder.ts`.
Inputs: `ctx` + workspace rules from `listSandboxRules(workspaceId)`
(already exists, used by `install-package.ts:98`). Output:
`SandboxProfile`. Validate `ctx.projectPath` exists and is under the
workspace's project root — fail closed.

### c. Spawn command inside jail
Touch points: backend adapters in
`services/api/src/sandbox/backends/{psroot,bubblewrap,systemd,sandbox-exec,dovault}.ts`.
Each adapter wraps `child_process.spawn` with the backend-specific
command prefix (`bwrap --bind ... --`,
`systemd-run --user --scope --property=...`,
`sandbox-exec -f profile.sb`, `psroot.exe --profile=...`). The
wrapper passes the original command as the **argv to a non-shell
`/bin/sh -c`** inside the jail — not `shell: true` on the host.

### d. Capture output
Stream stdout/stderr through `pipe`, accumulate with a hard byte cap
(default 1 MB each — the model doesn't need more, and unbounded
buffers are an OOM vector). Apply `timeoutMs` via
`setTimeout(() => child.kill("SIGTERM"), …)` then escalate to
`SIGKILL` after 5s.

### e. Return to SDK
Adapt `JailedSpawnResult` into `ToolResultObject`. Importantly: set
`resultType: "denied"` (not `"failure"`) when the backend itself
blocked the command. The model treats `denied` differently from
`failure` and will not retry — `types.d.ts:84`:
`ToolResultType = "success" | "failure" | "rejected" | "denied"`.

### Wiring into the SDK
The new `bash` tool gets appended in
`services/api/src/ai/providers/copilot-tool-loader.ts:45` (inside
`createDoableTools`) so it ships with every session. The
`onPreToolUse` hook in `copilot-engine.ts:117` keeps its current
denylist as defense-in-depth.

## 8. Failure Modes

| Failure | Detection | Behavior |
|---|---|---|
| **Backend unavailable** (e.g., `bwrap` not installed) | `backend-resolver` startup probe + per-spawn `ENOENT` check | If `HARDENING_LEVEL=dev` and workspace policy is `auto`: warn + fall back to `none`. In `staging`/`prod`: return `ToolResultObject { resultType: "failure", error: "Sandbox backend unavailable" }` and emit a Vigil alert. Never silently fall through. |
| **Jail setup failure** (mount denied, cgroup creation EPERM, profile compile error) | Backend adapter returns synthetic exit code `-1` with stderr containing `[sandbox-setup]` prefix | `resultType: "denied"`, surface the setup stderr in `textResultForLlm` so the model doesn't retry, log full detail to xray-audit. |
| **Timeout** | `setTimeout` in wrapper fires before child exits | `SIGTERM` → 5s grace → `SIGKILL`. Return `JailedSpawnResult { timedOut: true, exitCode: null, signal: "SIGKILL" }`. SDK side: `resultType: "failure"`, `textResultForLlm` includes "Command exceeded {N}s timeout — consider breaking into smaller steps." |
| **OOM kill** | `child.on('exit', (code, signal))` with `signal === "SIGKILL"` plus cgroup `memory.events` `oom_kill > 0` (when systemd/bubblewrap backend); on psroot/sandbox-exec we just see SIGKILL with no cgroup data | Set `oomKilled: true`, return `resultType: "failure"`, advise model to reduce memory footprint. Emit metric to Vigil. |
| **Project path doesn't exist** | Fail closed in `profile-builder.ts` *before* spawn — `fs.stat(ctx.projectPath)` | Return `ToolResultObject { resultType: "denied", error: "Project workspace not provisioned" }`. Do not auto-create. |
| **Output buffer overflow** (1 MB cap hit) | Byte counter in stdout/stderr accumulators | Truncate, append `\n[truncated: output exceeded 1 MB]`, kill the child. `resultType: "success"` if exit was clean, otherwise `failure`. |
| **Hook contention** (model issues `bash` while session is in plan mode) | Already handled at `copilot-engine.ts:132-140` — `PLAN_ALLOWED_TOOLS` doesn't include `bash` | Hook returns `permissionDecision: "deny"` with reason; the sandboxed handler is never reached. |
| **SDK version drift** (0.2.0 changes `overridesBuiltInTool` semantics) | Integration test that creates a session, calls `bash`, asserts our handler ran | Pin SDK version in `package.json`; CI guards against silent bumps. If override breaks, fall back to strategy (A) from §4.2. |

## 9. Summary of Citations

- SDK version:
  `node_modules/@github/copilot-sdk/package.json:7` →
  `"version": "0.1.32"`.
- Permission hook installation:
  `services/api/src/ai/providers/copilot-engine.ts:117-141` (create),
  `:182-205` (resume).
- Hook input/output types:
  `node_modules/@github/copilot-sdk/dist/types.d.ts:241-260`.
- Built-in tool override flag:
  `node_modules/@github/copilot-sdk/dist/types.d.ts:126-131` and
  `:137-142`.
- SDK `ToolResult` shape:
  `node_modules/@github/copilot-sdk/dist/types.d.ts:84-99`.
- Doable `Tool` interface:
  `services/api/src/ai/tools/index.ts:5-17`.
- Tool registry: `services/api/src/ai/tools/index.ts:21-80`.
- Current unsandboxed spawn:
  `services/api/src/ai/tools/install-package.ts:237-242`.
- Workspace sandbox rules:
  `services/api/src/ai/tools/install-package.ts:94-133`, migration
  `services/api/src/db/migrations/073_workspace_sandbox_rules.sql`.
- Existing jail primitives to reuse:
  `services/api/src/projects/vite-jail.ts`,
  `services/api/src/runtime/dev-uid-allocator.ts`,
  `services/api/src/runtime/hardening-level.ts`.
