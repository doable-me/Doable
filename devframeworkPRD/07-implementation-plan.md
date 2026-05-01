# 07 — Implementation Plan: Framework Agnosticism + Sandbox

> Master implementation plan produced by scanning the full codebase at HEAD
> (`542d294`, branch `main`, snapshot at `snapshot/vite-only-2026-05-02`).
> Covers: framework abstraction, AI awareness, connector accessibility,
> and cross-platform sandboxing.

---

## Executive Summary

**29 hardcoded Vite surfaces** (24 original + 5 discovered) must be abstracted.
**2 AI system prompts** hardcode "Vite + React 19 + TypeScript".
**Server-side connector credentials** already flow through `resolveVaultEnv()` but
are unusable in a Vite SPA — switching to backend-capable frameworks (Next.js,
Express, Django) unlocks them automatically.

**Sandboxing** currently has no filesystem isolation on Windows and nothing on
macOS. Psroot provides kernel-level AppContainer isolation for Windows without
VT-x. Linux already has systemd cgroups v2. macOS needs `sandbox-exec` or
accepts "dev-only no-isolation" as a known limitation.

---

## Phase 0: Foundation (Week 1)

### 0.1 Database Migration

```sql
-- Add framework_id to projects
ALTER TABLE projects ADD COLUMN framework_id TEXT NOT NULL DEFAULT 'vite-react';

-- Add framework_id to templates
ALTER TABLE templates ADD COLUMN framework_id TEXT NOT NULL DEFAULT 'vite-react';

-- Index for lookups
CREATE INDEX idx_projects_framework ON projects(framework_id);
```

### 0.2 FrameworkRegistry + FrameworkPack + FrameworkAdapter Interface

**New files:**
```
services/api/src/frameworks/
├── types.ts                    # FrameworkPack, FrameworkAdapter, Capability types
├── registry.ts                 # FrameworkRegistry: id → { pack, adapter }
├── context.ts                  # FrameworkContext, DevContext, BuildContext, etc.
└── adapters/
    ├── vite-react.ts           # Extract current behavior into adapter
    ├── nextjs-app.ts           # Next.js App Router adapter (Wave 2)
    ├── express-react.ts        # Express + React SSR (Wave 3)
    └── index.ts                # Re-exports
```

### 0.3 Vite-React Adapter (Extract, Don't Rewrite)

The first adapter is a **mechanical extraction** of existing behavior:
- `dev()` returns the existing `viteEntry + args` spec
- `build()` returns `["vite", "build", "--outDir", "dist"]`
- `install()` wraps the existing `npm install --legacy-peer-deps`
- `readinessSignal` = `{ kind: "log-substring", patterns: ["Local:", "ready in"] }`
- All 24 surfaces mapped to adapter methods per PRD 02 §5

**Zero behavior change for existing projects.** This is a refactor, not a feature.

---

## Phase 1: Abstract the 13 HIGH-Priority Surfaces (Week 2-3)

Priority order (dependency-driven):

| Order | Surface# | File | Change |
|-------|----------|------|--------|
| 1 | 5,6,7 | dev-server-start.ts | Replace Vite CLI construction with `adapter.dev(ctx)` |
| 2 | 14,15 | deploy/builder.ts | Replace build command with `adapter.build(ctx)` |
| 3 | 1,2 | file-manager.ts | Replace `["index.html","package.json"]` with `adapter.defaults.requiredFiles` |
| 4 | 3 | file-manager.ts | Replace npm install with `adapter.install(ctx)` |
| 5 | 4 | scaffolder.ts | Replace constants with adapter lookup |
| 6 | 12 | proxy-handler.ts | Replace `.vite/deps` with `adapter.shouldReloadOnError()` |
| 7 | 17 | doable-cloud.ts | Gate on capability `static-spa` vs `requires-long-lived-process` |
| 8 | 18 | caddy-domains.ts | Branch Caddy config on capability |
| 9 | 19 | templates/*.ts | Add `frameworkId` field to all templates |
| 10 | 20 | ai/build.ts | Replace `npx vite` with adapter lookup |
| 11 | 10 | vite-plugin-source-annotations.ts | Move into vite-react adapter as scaffold step |

### Validation Gate (Phase 1 complete when):
- All existing projects still work identically (Vite adapter selected via `framework_id = 'vite-react'`)
- `grep -rn "vite" services/api/src/ --include="*.ts" | grep -v frameworks/adapters/vite` returns ZERO outside the adapter

---

## Phase 2: AI Framework Awareness (Week 3-4)

### 2.1 Dynamic System Prompt

**File**: `services/api/src/routes/chat/system-prompts.ts`

Replace:
```typescript
`The project is a Vite + React 19 + TypeScript app with Tailwind CSS v4...`
```

With:
```typescript
function getFrameworkDescription(frameworkId: string, adapter: FrameworkAdapter): string {
  // Returns dynamic description based on adapter metadata
  // e.g. "Next.js 15 (App Router) + TypeScript + Tailwind CSS v4"
  // Includes: server capabilities, available API routes, database access patterns
}
```

### 2.2 Server-Side Code Generation Instructions

When `adapter.capabilities.has("ssr-node")` or `requires-long-lived-process`:

```typescript
const serverInstructions = `
## Server-Side Capabilities
This project has a backend runtime. You can:
- Create API routes (${adapter.apiRoutePattern}) 
- Access databases directly using server-side env vars
- Use server actions / server components
- Import any Node.js module (fs, crypto, etc.)

## Connected Integration Credentials (Server-Side)
${manifest.filter(m => m.serverEnvVars.length > 0).map(m => 
  `- ${m.displayName}: ${m.serverEnvVars.join(', ')} (available in server code only)`
).join('\n')}

## Code Generation Rules
- Database queries go in API routes or server actions, NEVER in client components
- Use \`process.env.VAR_NAME\` for server credentials (NOT import.meta.env)
- Client components fetch from API routes; never import server-only modules
`;
```

### 2.3 Framework-Specific Tool Descriptions

Update `copilot-tools.ts` to reflect framework:
- `list_files` description uses `adapter.listIgnore()` instead of hardcoded "dist"
- Add `restart_server` tool when framework has long-lived process
- `install_package` uses adapter's package manager

### 2.4 Integration Manifest Enhancement

Update `buildConnectedIntegrationsContext()` to include framework-specific guidance:
```
- supabase: Server env: SUPABASE_SERVICE_ROLE_KEY (use in API routes with @supabase/supabase-js createClient(url, serviceKey))
```

---

## Phase 3: Next.js Adapter (Week 4-5)

### 3.1 Adapter Implementation

```typescript
export const nextjsAppAdapter: FrameworkAdapter = {
  id: "nextjs-app",
  family: "node",
  capabilities: new Set([
    "ssr-node", "static-export", "hmr-supported",
    "html-injection-supported", "requires-long-lived-process",
    "supports-base-path"
  ]),
  displayName: "Next.js (App Router)",
  
  defaults: {
    requiredFiles: ["package.json", "next.config.ts"],
    criticalFiles: ["package.json"],
    listIgnore: ["node_modules", ".git", ".next", "out"],
    lockedConfigFiles: ["next.config.ts", "postcss.config.js"],
    devReadinessTimeoutMs: 120_000,
    buildTimeoutMs: 300_000,
  },

  dev(ctx: DevContext): DevSpec {
    return {
      command: "node",
      args: [
        path.join(ctx.projectPath, "node_modules/.bin/next"),
        "dev", "-p", String(ctx.port), "-H", ctx.host
      ],
      cwd: ctx.projectPath,
      env: ctx.env,
      readinessSignal: { kind: "log-substring", patterns: ["Ready in", "✓ Ready"] },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },

  build(ctx: BuildContext): BuildSpec {
    return {
      command: "node",
      args: [path.join(ctx.projectPath, "node_modules/.bin/next"), "build"],
      cwd: ctx.projectPath,
      env: { ...ctx.env, NEXT_TELEMETRY_DISABLED: "1" },
      outputDir: ctx.target === "production" ? ".next/standalone" : ".next",
      timeoutMs: 300_000,
    };
  },

  serve(ctx: ServeContext): ServeSpec {
    return {
      command: "node",
      args: [path.join(ctx.buildOutputDir, "server.js")],
      cwd: ctx.buildOutputDir,
      env: { ...ctx.env, PORT: String(ctx.port), HOSTNAME: ctx.host },
      port: ctx.port,
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
      readinessSignal: { kind: "log-substring", patterns: ["Listening on", "Ready"] },
    };
  },
};
```

### 3.2 Next.js Templates

- `nextjs-blank.ts` — App Router + TypeScript + Tailwind CSS
- `nextjs-dashboard.ts` — With API routes, server components, example DB query
- `nextjs-saas.ts` — Full-stack with auth + database pattern

### 3.3 Next.js Connector Usage Pattern

When Supabase (or any DB) is connected, AI generates:
```typescript
// app/api/data/route.ts (Server Route)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,         // server-side, not VITE_ prefixed
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // admin access, server-only
)

export async function GET() {
  const { data } = await supabase.from('items').select('*')
  return Response.json(data)
}
```

---

## Phase 4: Cross-Platform Sandboxing (Week 5-6)

### 4.1 Architecture: Three-Tier Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                      dovault (Node.js)                            │
│     ResourceBackend interface — auto-selects best available      │
├──────────────┬──────────────────┬──────────────────┬────────────┤
│   Windows    │      Linux       │      macOS       │  Fallback  │
├──────────────┼──────────────────┼──────────────────┼────────────┤
│ PsrootBackend│ SystemdBackend   │ SandboxBackend   │ Direct     │
│ (priority:70)│ (priority:80)    │ (priority:50)    │ (priority:0│
│              │                  │                  │            │
│ AppContainer │ cgroups v2       │ sandbox-exec     │ No limits  │
│ +Job Objects │ +ProtectSystem   │ +RLIMIT_*        │ Dev only   │
│ +NetworkShim │ +IPAddressDeny   │ +launchd limits  │            │
│              │ +SeccompBpf      │                  │            │
│              │                  │                  │            │
│ FS: kernel   │ FS: namespace    │ FS: sandbox      │ FS: none   │
│ Net: shim    │ Net: IPAddress   │ Net: profile     │ Net: none  │
│ Mem: JO hard │ Mem: cgroup hard │ Mem: soft only   │ Mem: none  │
│ CPU: JO hard │ CPU: cgroup hard │ CPU: RLIMIT      │ CPU: none  │
│              │                  │                  │            │
│ VT-x: NO    │ VT-x: NO         │ VT-x: NO         │ VT-x: NO  │
│ GPU: NO     │ GPU: NO          │ GPU: NO          │ GPU: NO    │
│ Admin: NO*  │ Admin: NO        │ Admin: NO        │ Admin: NO  │
└──────────────┴──────────────────┴──────────────────┴────────────┘
  * Standard tier no admin; Enhanced tier needs admin (optional)
```

### 4.2 Windows: PsrootBackend

**No VT-x, No GPU, Low resources:**
- AppContainer: kernel-enforced filesystem boundary (same tech as Edge browser)
- Job Objects: hard memory/CPU/process limits (OS-enforced OOM-kill)
- Network Shim: userspace TCP proxy blocks unauthorized connections
- Requires: Windows 10 1809+ (universally available)
- Admin: NOT required for Standard tier

**Implementation**: New dovault backend that shells out to `psroot` CLI:
```typescript
// packages/dovault/src/backends/psroot.ts
export class PsrootBackend implements ResourceBackend {
  readonly name = "psroot";
  readonly priority = 70;

  available(): boolean {
    return process.platform === "win32" && this.hasPsroot();
  }

  wrapSpawn(command: string, args: string[], opts): WrapResult {
    return {
      command: "psroot",
      args: [
        "exec",
        "--memory", opts.limits.memoryMax,
        "--cpu", opts.limits.cpuQuota,
        "--tasks", String(opts.limits.tasksMax),
        ...(opts.blockNetwork ? ["--network", "none"] : ["--network", "outbound"]),
        "--mount", `${opts.jail}:/work`,
        "--workdir", "/work",
        "--", command, ...args
      ],
      env: {},
    };
  }
}
```

### 4.3 Linux: Enhanced SystemdBackend (Already Good)

Current systemd backend already provides:
- **cgroups v2**: MemoryMax, CPUQuota, TasksMax (hard limits)
- **ProtectSystem=strict**: Read-only root filesystem
- **ProtectHome=true**: No access to /home
- **IPAddressDeny=any + IPAddressAllow=localhost**: Network isolation
- **SeccompBpf** (optional enhancement): Syscall filtering

**Enhancement for Phase 4:**
```typescript
// Add to existing SystemdBackend
wrapSpawn(command, args, opts): WrapResult {
  return {
    command: "systemd-run",
    args: [
      "--scope", "--user",
      `-p`, `MemoryMax=${opts.limits.memoryMax}`,
      `-p`, `CPUQuota=${opts.limits.cpuQuota}`,
      `-p`, `TasksMax=${opts.limits.tasksMax}`,
      `-p`, `IPAddressDeny=any`,
      `-p`, `IPAddressAllow=localhost`,
      // NEW: filesystem isolation
      `-p`, `ProtectSystem=strict`,
      `-p`, `ProtectHome=true`,
      `-p`, `PrivateTmp=true`,
      `-p`, `BindPaths=${opts.jail}`,
      // NEW: seccomp (blocks ptrace, mount, reboot, etc.)
      `-p`, `SystemCallFilter=~@mount @reboot @swap @raw-io @clock @debug`,
      command, ...args
    ],
    env: {},
  };
}
```

**Alternative without systemd** (Alpine, containers):
- **nsjail** — Google's lightweight namespace jail
  - User namespaces (no root needed if `sysctl kernel.unprivileged_userns_clone=1`)
  - Mount namespace (chroot-equivalent, stronger)
  - PID namespace (can't see host processes)
  - Network namespace (isolated or none)
  - Seccomp-BPF (syscall filter)
  - cgroups v2 resource limits
  - Single static binary, zero deps

### 4.4 macOS: sandbox-exec Backend (Best Available Without VT)

macOS has no namespaces or cgroups. The options without VT-x:

| Option | Verdict |
|--------|---------|
| `sandbox-exec` (Seatbelt) | **Best available**. Deprecated but still works on macOS 15. Used by system processes. |
| App Sandbox (entitlements) | Only for .app bundles, not spawned processes |
| Virtualization.framework | Requires VT-x — ruled out |
| `setrlimit` / RLIMIT_* | Memory/CPU soft limits only (no hard kill) |

**sandbox-exec approach:**
```typescript
// packages/dovault/src/backends/macos-sandbox.ts
export class MacOSSandboxBackend implements ResourceBackend {
  readonly name = "macos-sandbox";
  readonly priority = 50;

  available(): boolean {
    return process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
  }

  wrapSpawn(command: string, args: string[], opts): WrapResult {
    const profile = this.generateProfile(opts);
    return {
      command: "sandbox-exec",
      args: ["-p", profile, command, ...args],
      env: {},
    };
  }

  private generateProfile(opts: { jail?: string; blockNetwork?: boolean }): string {
    return `
(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow file-read* (subpath "/usr/lib"))
(allow file-read* (subpath "/System"))
(allow file-read* (subpath "/Library/Frameworks"))
(allow file-read* (subpath "/usr/local/lib"))
${opts.jail ? `(allow file-read* file-write* (subpath "${opts.jail}"))` : ''}
(allow file-read* (subpath "/dev"))
(allow sysctl-read)
${opts.blockNetwork ? '(deny network*)' : '(allow network-outbound)'}
(deny network-inbound)
    `.trim();
  }
}
```

**Known macOS limitations:**
- `sandbox-exec` is deprecated (works but Apple may remove it eventually)
- No hard memory limits (only RLIMIT_RSS which is advisory)
- No CPU quota (only RLIMIT_CPU which sends SIGXCPU)
- For dev/testing only — production runs on Linux

### 4.5 Fallback: Graceful Degradation

```
Production (Linux VPS)    → SystemdBackend (full isolation)
Dev (Windows)             → PsrootBackend (full isolation)
Dev (macOS)               → MacOSSandboxBackend (FS isolation, soft limits)
CI/Docker                 → nsjail or SystemdBackend
Unknown                   → DirectBackend (no isolation, log warning)
```

---

## Phase 5: Runtime Supervisor for Long-Lived Processes (Week 6-7)

### Per PRD 06: Published Apps with Backend

When a Next.js/Express/Django app is published:

1. **Build** produces server artifact (`.next/standalone/server.js`)
2. **RuntimeAdapter** registers a systemd unit:
   ```ini
   [Service]
   ExecStart=/usr/bin/node /data/sites/{slug}/server/server.js
   Environment=PORT=%i
   MemoryMax=256M
   CPUQuota=25%
   Restart=always
   ```
3. **Caddy** reverse-proxies: `reverse_proxy unix//run/doable/{slug}.sock`
4. **Sleep/Wake**: Idle detection after 30min → SIGSTOP; Caddy on-demand wake

---

## Implementation Order (Critical Path)

```
Phase 0 (Foundation)
  └→ DB migration + types + registry + vite-react adapter extraction
     ├→ Phase 1 (13 HIGH surfaces) — pure refactor, zero behavior change
     │    └→ Phase 2 (AI awareness) — dynamic prompts + integration manifest
     │         └→ Phase 3 (Next.js adapter) — first non-Vite framework
     │              └→ Phase 5 (Runtime supervisor) — publish Next.js apps
     └→ Phase 4 (Sandboxing) — can run in parallel with Phases 1-3
          ├→ PsrootBackend (Windows)
          ├→ Enhanced SystemdBackend (Linux)
          └→ MacOSSandboxBackend (macOS)
```

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Breaking existing Vite projects | Phase 1 is extract-only; vite-react adapter replicates exact current behavior |
| AI generates wrong code for framework | Framework description in system prompt + integration manifest with explicit patterns |
| macOS sandbox removal by Apple | Accept dev-only limitation; production always Linux |
| Psroot not ready for integration | WindowsBackend (Job Objects) remains fallback at priority 60 |
| Next.js preview proxy complexity | Next.js handles its own HMR over `/_next/webpack-hmr`; proxy just forwards |

---

## Connector Accessibility Summary

**Before** (Vite SPA):
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` → client-side only
- `SUPABASE_SERVICE_ROLE_KEY` → dead (no server to use it)
- Other databases → impossible (no server-side runtime)

**After** (Next.js / Express / Django):
- All `server.*` credentials available via `process.env` in API routes
- AI generates server-side code that uses connected integrations
- Any database with a Node.js driver (pg, mysql2, better-sqlite3, mongoose, redis) is directly accessible
- Row-level security optional, not mandatory

---

## Files Changed Summary

| Phase | New Files | Modified Files | Deleted Files |
|-------|-----------|----------------|---------------|
| 0 | 5 (frameworks/*) | 1 (migration) | 0 |
| 1 | 0 | 13 (all HIGH surfaces) | 0 |
| 2 | 1 (framework-prompt.ts) | 4 (system-prompts, context-builder, copilot-tools, prompt-manifest) | 0 |
| 3 | 4 (nextjs adapter + templates) | 2 (registry, migration) | 0 |
| 4 | 3 (psroot, macos-sandbox, nsjail backends) | 1 (backend auto-select) | 0 |
| 5 | 3 (runtime-adapter, supervisor, caddy-dynamic) | 2 (deploy pipeline, caddy-domains) | 0 |

**Total**: ~16 new files, ~23 modified files, 0 deleted.
