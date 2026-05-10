# 06 — Architecture: The Sandbox-Agnostic Layer

This is the central design chapter. Read 02 (Layers) and 05 (Current
State) first.

## The framing

Doable already has the **skeleton** of a sandbox-agnostic system in
`packages/dovault/`: a `ResourceBackend` interface, a registry, and
nine backend stubs (`direct`, `systemd`, `bubblewrap`, `psroot`,
`sandbox-exec`, `apple-container`, `gvisor`, `win-heap`, `windows`).
What it lacks:

1. A **profile object** that decouples *what isolation a workload
   needs* from *which backend executes it*.
2. A **composition layer** that adds layers a backend doesn't
   natively provide (`/proc` masking, Landlock, nft, seccomp).
3. A **selection contract** that is explicit, observable, and
   fail-closed in production.
4. A **single chokepoint** for every spawn so no caller can
   accidentally route around the sandbox (today the AI bash tool
   does exactly that).

This chapter specifies all four.

## The mental model

```
                     ┌─────────────────────────────────────────┐
                     │            Caller code                  │
                     │   (AI bash tool / vite preview /        │
                     │    install / build)                     │
                     └─────────────────┬───────────────────────┘
                                       │
                                       │ jailedSpawn(cmd, ctx, profileKey)
                                       ▼
                     ┌─────────────────────────────────────────┐
                     │  Sandbox Orchestrator                   │
                     │  (services/api/src/sandbox/orchestrator.ts) │
                     │  1. Resolve profile from profileKey     │
                     │  2. Resolve backend from policy         │
                     │  3. Compose layers backend doesn't do   │
                     │  4. Hand off to backend                 │
                     │  5. Capture, time, audit                │
                     └─────────────────┬───────────────────────┘
                                       │
                                       │ backend.spawn(profile, cmd)
                                       ▼
                     ┌─────────────────────────────────────────┐
                     │  Backend adapter                        │
                     │  (psroot / bubblewrap / systemd / ...)  │
                     │  Translates profile into backend's      │
                     │  CLI flags. Spawns. Returns child.      │
                     └─────────────────┬───────────────────────┘
                                       │
                                       │ extra layers if needed
                                       ▼
                     ┌─────────────────────────────────────────┐
                     │  Layer composers (kicked in only when   │
                     │  the backend lacks them):               │
                     │   procfs-masker  / etc-synth / Landlock │
                     │   seccomp-bpf    / nft-egress / cgroups │
                     └─────────────────────────────────────────┘
```

The orchestrator owns the contract. The backend adapter owns the
backend-specific flags. Layer composers fill the gaps.

## The interface

### `SandboxProfile`

A profile is a serializable description of "what world should this
process see." It is the **same object every backend consumes**.

```ts
// packages/dovault/src/profile.ts (proposed)

export type ScopeAction = "allow" | "deny";

export interface SandboxProfile {
  /** Stable id, e.g. "ai-bash", "vite-preview", "build". */
  id: string;

  /** Filesystem view */
  fs: {
    /** Project root, bind-mounted rw at /work inside the jail */
    rootDir: string;
    /** Additional read-only binds: `[hostPath, jailPath]` */
    readOnlyBinds: Array<{ host: string; jail: string }>;
    /** tmpfs mounts inside the jail: `[jailPath, sizeBytes]` */
    tmpfs: Array<{ jail: string; sizeBytes: number }>;
    /** Files in /proc to overlay with synthetic content (see 02 §correction). */
    procOverlay: ProcOverlay;
    /** Synthetic /etc files. Key=jail path, value=content. */
    etcSynth: Record<string, string>;
    /** Paths explicitly *not* visible (mask). Higher-precedence than binds. */
    masks: string[];
  };

  /** Process / namespace knobs */
  ns: {
    pid: boolean;     // PID namespace
    net: "none" | "loopback" | "egress-allowlist" | "host";
    uts: boolean;
    ipc: boolean;
    user: boolean;    // user-ns; map host uid to synthetic uid inside
  };

  /** UID drop */
  user: {
    /** Numeric uid inside the jail. Synthetic. */
    uid: number;
    gid: number;
    /** Map of uid -> /etc/passwd line for visible users. */
    passwd: Record<number, string>;
  };

  /** Syscall / capability surface */
  syscalls: {
    /** Drop ALL caps by default; rare exceptions go here. */
    capsKeep: string[];
    /** Seccomp action when an unlisted syscall is called. */
    seccompDefault: "errno" | "kill" | "trap" | "log";
    /** Syscall denylist (always blocked) and allowlist (only these). */
    seccompDeny: string[];
    seccompAllow?: string[];   // when set, this is an allowlist
  };

  /** Resource limits */
  limits: {
    memBytes: number;
    cpuQuotaPercent: number;
    nproc: number;
    nofile: number;
    cpuTimeSeconds: number;
  };

  /** Network egress allowlist (used only when ns.net = "egress-allowlist") */
  network: {
    /** Default action when no rule matches. */
    defaultAction: ScopeAction;
    /** Allowlist host patterns; supports * wildcards. */
    allow: string[];
    /** Denylist host patterns; takes precedence. */
    deny: string[];
  };

  /** Environment policy */
  env: {
    /** Variables the spawned process is allowed to inherit. */
    allowlist: string[];
    /** Variables to inject. */
    inject: Record<string, string>;
  };

  /** Timeout (orchestrator-enforced; not a backend concern) */
  timeoutMs: number;
}

export interface ProcOverlay {
  cpuinfo: { cores: number; modelName: string; mhz: number };
  meminfo: { totalKb: number; availableKb: number };
  uptimeSec: number;
  loadavg: [number, number, number];
  /** Files to flat-mask with /dev/null. */
  mask: string[];
}
```

Why a single profile shape? Because the orchestrator can:
- Compose layers a backend doesn't natively give. Example: psroot
  doesn't do `/proc` overlays — orchestrator applies a procfs mask
  via bind-mounting synthetic content before psroot wraps the
  command.
- Audit + log a single object at session start: "this AI session
  was sandboxed with profile X, backend Y, layers Z."
- Test profiles in isolation from backends (golden-file tests of
  procfs synthesis logic).

### `SandboxBackend`

```ts
// packages/dovault/src/backends/types.ts (extends current shape)

export interface SandboxBackend {
  readonly id: string;
  readonly priority: number;

  /**
   * Probe at process start. Returns true only when this backend can
   * actually do what its profile promises. Must be cheap and side-effect free.
   * Examples:
   *  - bwrap: `which bwrap` + `bwrap --version` succeeds + kernel supports user-ns
   *  - systemd: `which systemd-run` + cgroup-v2 delegation actually works
   *  - psroot: psroot.exe resolvable + AppContainer API responds
   */
  available(): Promise<{ ok: true } | { ok: false; reason: string }>;

  /**
   * Describes which profile layers this backend natively provides.
   * Used by the orchestrator to know which composers to layer on top.
   */
  declaredLayers(): {
    fs: "full" | "partial" | "none";
    pidNs: boolean;
    netNs: boolean;
    seccomp: boolean;
    cgroups: boolean;
    capsDrop: boolean;
    procMask: boolean;
    /** ... */
  };

  /**
   * Build the spawn shape (argv + env) for a command run under a profile.
   * Does NOT spawn. The orchestrator calls Node's spawn on the returned shape
   * after composers run.
   */
  buildSpawn(profile: SandboxProfile, command: string, args: string[]): {
    argv: string[];
    env: Record<string, string>;
    /** Setup steps the orchestrator runs before spawn (mounts, chowns). */
    preflight: PreflightStep[];
    /** Cleanup steps after exit. */
    teardown: TeardownStep[];
  };
}
```

The key change vs today's `ResourceBackend`: backends declare what
they cover. The orchestrator fills gaps. Today every backend pretends
to cover everything its CLI flags imply, and silent skipping is the
norm.

### The orchestrator

```ts
// services/api/src/sandbox/orchestrator.ts (proposed)

export async function jailedSpawn(
  command: string,
  args: string[],
  ctx: SpawnContext,
  profileKey: ProfileKey,
): Promise<JailedSpawnResult> {
  // 1. Resolve profile (see chapter 07)
  const profile = await resolveProfile(profileKey, ctx);

  // 2. Resolve backend (see §"selection contract" below)
  const backend = await resolveBackend(ctx);

  // 3. Check what the backend natively covers; pick composers for the rest
  const declared = backend.declaredLayers();
  const composers = pickComposers(profile, declared);

  // 4. Build spawn shape
  const shape = backend.buildSpawn(profile, command, args);

  // 5. Run preflight (mounts, chowns), then composers (procfs mask, etc.)
  for (const step of [...shape.preflight, ...composers.preflight]) {
    await step.run();
  }

  // 6. Spawn and supervise
  const child = await supervisedSpawn(shape.argv, shape.env, profile.timeoutMs);

  // 7. Teardown (always)
  for (const step of [...shape.teardown, ...composers.teardown].reverse()) {
    await step.run().catch(/* log only */);
  }

  // 8. Audit
  await audit({ ctx, profileKey, backend: backend.id, declared, composers });

  return resultOf(child);
}
```

### `SpawnContext`

```ts
export interface SpawnContext {
  projectId: string;
  workspaceId: string | null;
  userId: string;
  sessionId: string;
  /** Workspace-level overrides (from sandbox_rules / settings tables) */
  workspaceRules?: WorkspaceSandboxRules;
  /** Orchestrator-side hardening level */
  hardening: "off" | "dev" | "staging" | "prod";
}
```

## The selection contract

Today: implicit auto-detect via `priority` descending, first
`available()` wins. Silent fallback to `direct` (no-op).

Tomorrow:

1. **Explicit preference** at three sources (highest wins):
   - `DOABLE_SANDBOX_BACKEND` process env (operator escape hatch).
   - `workspace_sandbox_settings.sandbox_backend` per workspace
     (extends migration 073).
   - Auto-detect (only when no preference is set).
2. **Fail-closed in production**:
   - In `prod` and `staging`, if the resolved backend's
     `available()` returns `{ok: false}`, the orchestrator **throws
     at first spawn** (or, preferred, at API boot via a synthetic
     `noop-probe` spawn during startup health check).
   - Operators must see "Sandbox backend X failed health probe:
     <reason>" in logs and either fix the host or downgrade
     `HARDENING_LEVEL`.
3. **Observable at boot**:
   - On API start, log the resolved matrix:
     ```
     [sandbox] backend=systemd
     [sandbox] declared layers: fs:full pidNs=false netNs=cgroup-v2 seccomp=false ...
     [sandbox] composers: proc-mask, etc-synth, seccomp-bpf
     [sandbox] hardening=prod, fail-closed=true
     ```
   - Vigil dashboard surfaces this.
4. **Per-spawn audit**:
   - Each `jailedSpawn` emits an audit record:
     `{ projectId, profileKey, backend, declared, composers, exitCode, durationMs, oomKilled }`.
   - 90-day retention in `audit_sandbox_spawn` table.

## Layer composers

A composer is a small module that knows how to add one specific
isolation layer to a spawn shape. It runs **after** the backend
adapter, so the host's filesystem still cooperates.

### Composers planned

| Composer | When triggered | What it does |
|---|---|---|
| `proc-mask` | When `backend.declaredLayers().procMask === false` and profile has `fs.procOverlay` | Bind-mounts synthetic /proc/cpuinfo, /proc/meminfo, etc. into the jail's mount-ns. Synthetic content generated from the profile's cgroup limits. |
| `etc-synth` | Always when profile.user.passwd is non-empty | Bind-mounts a synthetic `/etc/passwd` (project user only) into the jail. |
| `seccomp-bpf` | When `backend.declaredLayers().seccomp === false` and profile.syscalls.seccompDeny is non-empty | Loads a BPF filter via libseccomp before the spawned process's first instruction. Pairs with bwrap's `--seccomp <fd>` slot. |
| `landlock` | When kernel ≥ 5.13 and profile.fs.masks non-empty | Adds Landlock rule layer on top of mount-ns. |
| `nft-egress` | When `profile.ns.net === "egress-allowlist"` and backend doesn't natively support per-net-ns nft | Generates per-spawn nft rules in a fresh net-ns; tears down on exit. |
| `cgroup-cap` | When `backend.declaredLayers().cgroups === false` but profile.limits is set | Wraps via `systemd-run --user --scope -p MemoryMax=...` even when the inner backend is bwrap. |

This composability means: **a thin backend like bubblewrap can still
deliver every layer**, because the orchestrator pairs it with
composers. A fat backend like Firecracker doesn't need composers
(microVM covers everything). The user (operator) doesn't have to
care — they just say `backend=bwrap` and the matrix gets covered.

## Where the abstraction lives

Two packages, with a clear ownership split:

### `packages/dovault/`
- `SandboxProfile` type definitions (chapter 07's catalog).
- `SandboxBackend` interface and the nine backend adapters.
- Composers (in `composers/`).
- Audit recorder.
- Backend registry + auto-detect.

### `services/api/src/sandbox/`
- `orchestrator.ts` — the `jailedSpawn` function above.
- `profile-resolver.ts` — maps a `ProfileKey` (string like
  `"ai-bash"`) to a `SandboxProfile`, layering workspace rules on
  top of defaults.
- `backend-resolver.ts` — picks the backend per the selection
  contract.
- `audit.ts` — writes to `audit_sandbox_spawn`.

Why split? `dovault` is a pure library — no Doable-specific
concepts (no workspaces, no projects, no migrations). `services/api`
holds the Doable-specific glue: workspace settings, project paths,
hardening levels, audit storage.

This split also means dovault can stay reusable by other Doable
services (the WS server, future workers) without dragging in the API
service.

## Where dovault stays vs. evolves

| Today's piece | Future role |
|---|---|
| `Vault.spawn` | Replaced by `jailedSpawn` orchestrator. Vault stays as an internal helper that holds the singleton registry. |
| `SpawnOptions` (with `lockConfigs`, `blockChildProcess`, `blockOutboundNet`) | Becomes a *legacy adapter* that converts old call-sites into profiles. New code uses profiles directly. |
| `ResourceBackend` interface | Renamed to `SandboxBackend`. `declaredLayers()` and richer `available()` return added. `wrapSpawn`/`wrapExec` collapse into `buildSpawn`. |
| Auto-detect priority list | Stays. Plus explicit prefs and fail-closed in production. |
| `ProcessJail` (Node Permission Model) | Survives as a composer for Node-only commands; orchestrator picks it when `command.endsWith(".js")`. |
| `ConfigGuard` | Survives unchanged. Independent layer, composes with the rest. |

## What the call-site looks like (caller perspective)

Before:
```ts
// install-package.ts (current)
const child = spawn(pm, args, { cwd, shell: true, stdio: "pipe", env: ... });
```

After:
```ts
// install-package.ts (future)
const result = await jailedSpawn(pm, args, {
  projectId, workspaceId, userId, sessionId,
  hardening: ctx.hardening,
}, "install-package");
```

The caller knows nothing about the backend. The orchestrator knows
nothing about the package manager. Each lives at its right altitude.

## Trade-offs the abstraction makes

- **Boot-time cost.** Probing every backend's `available()` at boot
  adds ~50 ms on Linux. Worth it for the observability win.
- **Profile-vs-backend mismatch.** A profile may request layers no
  available backend can provide (e.g., procfs mask on Windows
  before psroot ships overlay support). The orchestrator's job in
  that case is **log loud and refuse to spawn** (in prod) or **warn
  and proceed** (in dev). Never silently degrade.
- **Audit volume.** One audit record per spawn is fine at ~100-user
  scale. At higher scale, sample down or batch.
- **Per-spawn setup cost.** Composers add ~10-30 ms of overhead
  (mount + unmount, BPF load). Acceptable for AI-bash (which the
  user is waiting on anyway) and trivial for vite-preview (run
  once).

## What this PRD is asking the implementer to write, in order

1. `SandboxProfile` type + JSON schema + zod validator
   (`packages/dovault/src/profile.ts`).
2. Updated `SandboxBackend` interface
   (`packages/dovault/src/backends/types.ts`).
3. Refactor each of the nine existing backends to the new shape
   (mostly mechanical; existing `wrapSpawn` becomes `buildSpawn` and
   each adds `declaredLayers()`).
4. The six composers in `packages/dovault/src/composers/`.
5. The orchestrator in `services/api/src/sandbox/orchestrator.ts`.
6. Profile catalog in `services/api/src/sandbox/profiles/*.ts` (see
   chapter 07).
7. Replace the SDK bash tool via `defineTool("bash",
   { overridesBuiltInTool: true })` per chapter 13.
8. Migrate each caller of legacy `Vault.spawn` to `jailedSpawn` —
   `vite-jail.ts`, `builder.ts`, `install-package.ts`,
   `copilot-tools.ts`.
9. Add startup health-probe + audit table + Vigil dashboard.
10. Remove the legacy `Vault.spawn` after one release of dual-write
    is stable.

Each is bounded, testable, and individually shippable.

## Why this design vs. the alternatives

- **Vs. "just use Docker / Podman everywhere"**: violates the
  no-Docker-as-backend constraint; doesn't work on Windows/macOS
  dev boxes without paid Docker Desktop; ops overhead too heavy for
  ~100-user scale.
- **Vs. "pick one backend and hardcode it"**: doesn't survive the
  cross-platform requirement. Linux=bwrap and Windows=psroot have
  no common runtime; the only sane answer is an abstraction.
- **Vs. "extend `Vault.spawn` in place"**: workable but doesn't
  solve the silent-fallback problem and doesn't get us the
  composer pattern. Today's flat backend list assumes the backend
  is complete; the composer pattern explicitly accepts that no
  single backend is complete.
- **Vs. "build a microVM per spawn"**: cold-start latency
  (100-500 ms) and ops overhead make this wrong for AI-bash. Worth
  considering as an opt-in profile for very-untrusted tenants once
  the rest is built.
