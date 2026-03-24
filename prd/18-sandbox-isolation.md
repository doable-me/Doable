# 18. Sandbox & Isolation Architecture

## Open Source Policy

**All components in this architecture must be open source.** Doable does not use, depend on, or integrate any commercially licensed or proprietary software for sandboxing or isolation. Every provider listed below is open source or built-in to the Linux kernel/browser platform.

| Component | License |
|-----------|---------|
| nsjail | Apache 2.0 (Google) |
| Docker / containerd | Apache 2.0 |
| Bubblewrap | LGPL 2.0+ |
| gVisor | Apache 2.0 (Google) |
| Firecracker | Apache 2.0 (AWS) |
| Lifo | MIT |
| noVNC | MPL 2.0 (Mozilla) |
| iframe sandbox | Web standard (no license) |

Any component requiring a commercial license (e.g., StackBlitz WebContainers) is explicitly rejected and must not be introduced.

## Overview

Doable needs a pluggable, runtime-agnostic sandbox system where **everything runs inside the jail per user** — the AI agent (Copilot CLI/SDK), dev servers, package installs, builds, and published server-side apps. This "jail-everything" model means:

- **No restrictions on what users can build** — Python, Rust, Go, anything
- **No restrictions on what the AI agent can do** — shell commands, system packages, full autonomy
- **Full confidence** — nothing can escape the jail regardless of what runs inside
- **No code-level security checks needed** — the jail enforces isolation at the OS level

### Core Principle: Jail-Everything Model

```
API Server (thin orchestrator — NOT sandboxed)
  │
  ├── User A's jail ──── full Linux environment
  │     ├── Copilot CLI (with user A's token)
  │     ├── Dev server (vite, flask, cargo, anything)
  │     ├── Package installs (npm, pip, cargo, apt — unrestricted)
  │     ├── Builds (any toolchain)
  │     ├── Shell commands (unrestricted inside jail)
  │     └── All file operations
  │
  ├── User B's jail ──── full Linux environment
  │     └── (completely isolated from A)
  │
  └── User C's jail ──── ...
```

The API server becomes a thin proxy: it authenticates requests and forwards them into the correct user's jail. It does not execute any user code or AI tools itself.

### What This Replaces

| Concern | Old approach (code-level) | New approach (jail-level) |
|---|---|---|
| Path traversal | `startsWith()` checks in code | Jail can't see other dirs — no check needed |
| npm postinstall | `--ignore-scripts` flag | Let them run — they're jailed |
| AI shell commands | Blocked (no shell tool) | Unrestricted — it's jailed |
| Package blocklist | 3 packages blocked | No blocklist — nothing can escape |
| Python/Rust/Go support | Not possible (JS only) | Install anything in the jail |
| Copilot CLI isolation | Shared process for all users | Per-user process with own token |
| Published server apps | Static files only | Persistent jail running the server |

## Threat Model

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Filesystem escape | Critical | Jail chroot — process cannot see host filesystem |
| Resource abuse | High | cgroup limits (RAM, CPU, disk, processes) |
| Network exfiltration | High | Network disabled by default; allowlist for specific needs |
| Privilege escalation | Critical | User namespaces — no root on host even if root in jail |
| Cross-user interference | High | Separate jail per user — complete namespace isolation |
| npm/pip postinstall attacks | Eliminated | Runs inside jail — can't affect host or other users |
| Kernel exploits | Low | Upgrade to gVisor/Firecracker if threat model changes |

## Published Server-Side Apps

When a user publishes a Django, Flask, or Rust app, it's not static files — it needs a running server process. Published server-side apps run in **persistent jails**:

```
Published sites:

  Static (React/Vite):     Caddy serves /data/sites/{subdomain}/live/
                           No jail needed — just static files

  Server-side (Django/Go): Persistent nsjail running the server process
                           Caddy reverse-proxies {subdomain}.doable.me → jail's port
                           Auto-restarts on crash (systemd or supervisor)
                           Same resource limits as dev jails
                           Network allowed (outbound only, for APIs the app calls)
```

### Custom Domains for Server-Side Apps

Custom domains (see PRD 07 — Deployment & Hosting, section 3.2.1) use a **target-agnostic schema** with `target_type` field:
- `static` → Caddy serves files from disk (current behavior)
- `process` → Caddy reverse-proxies to the persistent jail's port
- `remote` → Caddy reverse-proxies to a remote machine

When a user publishes a server-side app and adds a custom domain, the `custom_domains` row stores `target_type = 'process'` and `target_port = {jail_port}`. Caddy config is regenerated to route the domain to the jail. No separate implementation needed — the same domain management UI and verification flow works for both static and server-side apps.

### Persistent Jail Lifecycle

```
User clicks "Publish" for a Django app
        │
        ▼
  Build step inside jail (pip install, collectstatic)
        │
        ▼
  Jail switches to production command (gunicorn)
        │
        ▼
  Caddy route: {subdomain}.doable.me → localhost:{jail_port}
        │
        ▼
  Jail runs indefinitely (with idle timeout for free tier)
  Auto-restart on crash, health checks
```

## Architecture: Pluggable Sandbox Providers with Per-Context Routing

The system does **not** use a single global sandbox provider. Instead, it maintains a **registry of all available providers** and a **routing table** that maps different contexts to different providers. The routing table is configurable from the **Doable admin UI** — no code changes or redeployments needed to switch providers.

```
Browser request
       │
       ▼
API Server (thin orchestrator)
       │
       ▼
SandboxRouter
       │  Looks up routing table:
       │    - What runtime? (node, python, rust)
       │    - What context? (dev, published, AI agent)
       │    - What user/tier? (free, pro, enterprise)
       │
       ▼
SandboxProviderRegistry
       │  All installed providers:
       │
       ├── NsjailProvider        (available: yes)
       ├── DockerProvider        (available: yes)
       ├── BubblewrapProvider    (available: no — not installed)
       ├── gVisorProvider        (available: yes)
       ├── FirecrackerProvider   (available: no — not installed)
       └── PassthroughProvider   (available: always)
               │
               ▼
         Spawn jail using the provider selected by routing rules
```

### Provider Interface

```typescript
interface SandboxProvider {
  /** Unique identifier (e.g. "nsjail", "docker", "gvisor") */
  name: string;

  /** Human-readable label for admin UI */
  label: string;

  /** Check if this provider is installed and usable on the current system */
  available(): Promise<boolean>;

  /** Spawn a sandboxed process */
  spawn(config: SandboxConfig): Promise<SandboxProcess>;

  /** Kill a running sandbox */
  kill(processId: string): Promise<void>;

  /** Clean up all resources (called on shutdown) */
  cleanup(): Promise<void>;

  /** Provider capabilities — used by admin UI to show what each provider supports */
  capabilities(): ProviderCapabilities;
}

interface ProviderCapabilities {
  supportsNetworkIsolation: boolean;
  supportsCgroupLimits: boolean;
  supportsReadonlyRootfs: boolean;
  supportsGpuPassthrough: boolean;
  overheadMB: number;              // approximate memory overhead per jail
  bootTimeMs: number;              // approximate cold start time
  platformSupport: ("linux" | "macos" | "windows")[];
}

interface SandboxConfig {
  projectId: string;
  projectPath: string;
  runtime: RuntimeType;
  command: string[];
  port: number;
  env?: Record<string, string>;
  memorySoftLimitMB: number;       // guaranteed (default: 128)
  memoryHardLimitMB: number;       // burst cap (default: 512)
  cpuLimit: number;                // cores (default: 0.5)
  networkAccess: boolean;
  idleSuspendSeconds: number;      // SIGSTOP after idle (default: 1800)
  idleKillSeconds: number;         // kill after idle (default: 3600)
  readonlyRootfs: boolean;
  maxProcesses: number;            // fork bomb protection (default: 64)
  maxDiskMB: number;               // writable space limit (default: 500)
}

interface SandboxProcess {
  id: string;
  pid: number;
  port: number;
  provider: string;                // which provider is running this
  stdout: Readable;
  stderr: Readable;
  kill(): Promise<void>;
  suspend(): Promise<void>;        // SIGSTOP — freeze, reclaim CPU
  resume(): Promise<void>;         // SIGCONT — resume from suspend
  onExit: Promise<{ code: number | null; signal: string | null }>;
}

type RuntimeType = "node" | "python" | "rust" | "go" | "static";
```

### Routing Table (Admin-Configurable)

The routing table is stored in the database (`sandbox_routing_rules`) and editable from the admin panel under a new **"Sandbox"** section. Rules are evaluated top-to-bottom; first match wins.

```typescript
interface SandboxRoutingRule {
  id: string;
  priority: number;               // lower = higher priority
  name: string;                   // human-readable label

  // Match conditions (all optional — omitted = match any)
  matchRuntime?: RuntimeType[];   // e.g. ["python", "rust"]
  matchContext?: SandboxContext[]; // e.g. ["dev", "published"]
  matchPlan?: string[];           // e.g. ["pro", "enterprise"]
  matchUserId?: string[];         // specific users (e.g. for testing)

  // Action
  provider: string;               // "nsjail" | "docker" | "gvisor" | "firecracker" | "none"
  overrides?: Partial<SandboxConfig>; // override default limits for this rule
}

type SandboxContext = "dev" | "published" | "build" | "ai_agent";
```

**Example routing table** (configured via admin UI):

| Priority | Name | Runtime | Context | Plan | Provider | Memory | Notes |
|----------|------|---------|---------|------|----------|--------|-------|
| 1 | Enterprise users | * | * | enterprise | firecracker | 1024MB hard | Full VM isolation |
| 2 | Published server apps | python, rust, go | published | * | docker | 512MB hard | Persistent, auto-restart |
| 3 | Rust dev (heavy builds) | rust | dev | * | nsjail | 768MB hard | Cargo needs more RAM |
| 4 | Default dev | * | dev | * | nsjail | 512MB hard | Standard dev jail |
| 5 | Fallback | * | * | * | nsjail | 512MB hard | Catch-all |

### Admin UI: Sandbox Configuration

A new tab in the admin panel (`/admin` → **Sandbox** tab) provides:

**1. Provider Status Dashboard**
```
┌─────────────────────────────────────────────────────────┐
│  Installed Providers                                     │
│                                                          │
│  ● nsjail        Available    ~0ms boot    ~0MB overhead │
│  ● docker        Available    ~500ms boot  ~80MB overhead│
│  ● bubblewrap    Not installed                           │
│  ● gvisor        Available    ~200ms boot  ~50MB overhead│
│  ○ firecracker   Not installed                           │
│  ● passthrough   Available (dev only)                    │
│                                                          │
│  Active jails: 5 / 25 max                                │
│  Memory used: 640MB / 3200MB available                   │
└─────────────────────────────────────────────────────────┘
```

**2. Routing Rules Editor**
- Drag-and-drop priority ordering
- Add/edit/delete rules
- Match conditions: runtime, context, plan, specific users
- Provider selection dropdown (only shows available providers)
- Per-rule resource limit overrides
- "Test rule" button: enter a scenario and see which rule matches

**3. Default Limits Editor**
- Global defaults for memory soft/hard, CPU, timeouts, disk
- Per-provider override defaults
- Live resource usage graph

**4. Active Jails Monitor**
- List of all running jails with user, project, provider, runtime, resource usage
- Kill / suspend / resume buttons per jail
- Bulk actions: kill all idle, suspend all free-tier

### Provider Registry and Auto-Detection

```typescript
class SandboxProviderRegistry {
  private providers = new Map<string, SandboxProvider>();
  private routingRules: SandboxRoutingRule[] = [];

  async init() {
    // Register all known providers
    const all = [
      new NsjailProvider(),
      new DockerProvider(),
      new BubblewrapProvider(),
      new GVisorProvider(),
      new FirecrackerProvider(),
      new PassthroughProvider(),
    ];

    // Check which are available on this system
    for (const p of all) {
      if (await p.available()) {
        this.providers.set(p.name, p);
        console.log(`[Sandbox] Provider available: ${p.name}`);
      }
    }

    // Load routing rules from database
    await this.loadRoutingRules();
  }

  /** Resolve which provider to use for a given context */
  resolve(context: {
    runtime: RuntimeType;
    sandboxContext: SandboxContext;
    plan?: string;
    userId?: string;
  }): { provider: SandboxProvider; config: Partial<SandboxConfig> } {

    for (const rule of this.routingRules) {
      if (this.ruleMatches(rule, context)) {
        const provider = this.providers.get(rule.provider);
        if (provider) {
          return { provider, config: rule.overrides ?? {} };
        }
        // Provider in rule not available — fall through to next rule
      }
    }

    // Fallback: first available provider
    const fallback = this.providers.values().next().value;
    return { provider: fallback, config: {} };
  }
}
```

## Provider Details

### 1. NsjailProvider (Primary — Production)

**What**: Google's lightweight process isolation tool using Linux namespaces, cgroups, and seccomp-bpf.

**Why primary**: Near-zero overhead (~0% CPU, ~0 memory beyond the process itself), purpose-built for sandboxing untrusted code, no daemon.

**Requirements**: Linux kernel 4.6+ with user namespaces. Works on Ubuntu 22.04/24.04 and WSL2.

**Constraints applied per process**:
```
--mode o                          # one-shot mode
--chroot /srv/rootfs/{runtime}    # read-only root filesystem
--bindmount {projectPath}:/project # project dir read-write
--cwd /project                    # working directory
--rlimit_as 512                   # 512MB virtual memory
--rlimit_cpu 30                   # 30s CPU burst
--rlimit_fsize 50                 # 50MB max file writes
--rlimit_nofile 256               # 256 open file descriptors
--cgroup_mem_max 268435456        # 256MB hard RAM limit
--disable_clone_newnet            # no network access
--time_limit 1800                 # 30 min timeout
```

**Shared rootfs images** (read-only, one per runtime, all include Copilot CLI):
```
/srv/rootfs/
  ├── node/       Ubuntu minimal + Node 20 + npm + vite + copilot-cli     (~350MB)
  ├── python/     Ubuntu minimal + Python 3.12 + pip + Node 20 + copilot-cli (~400MB)
  ├── rust/       Ubuntu minimal + rustc + cargo + Node 20 + copilot-cli  (~550MB)
  └── go/         Ubuntu minimal + Go 1.22 + Node 20 + copilot-cli       (~450MB)
```

Note: All rootfs images include Node.js and the Copilot CLI because the AI agent runs inside the jail regardless of the project's runtime. The Copilot CLI is the same binary across all runtimes.

### 2. DockerProvider (Fallback)

**What**: Standard container runtime.

**Why fallback**: Works on macOS, Windows, and Linux. Heavier than nsjail but universally available.

**Overhead**: Docker daemon (~100MB), per-container ~50-100MB overhead on top of process.

**Security flags**:
```
docker run \
  --rm \
  --read-only \
  --tmpfs /tmp:size=50m \
  --memory=256m \
  --cpus=0.5 \
  --network=none \
  --security-opt=no-new-privileges \
  --mount type=bind,src={projectPath},dst=/project \
  doable-runtime-{runtime} \
  {command}
```

### 3. BubblewrapProvider (Alternative)

**What**: Lightweight sandboxing tool used by Flatpak. Similar to nsjail but simpler.

**Why**: Good middle ground if nsjail isn't installed but Linux namespaces are available.

### 4. PassthroughProvider (Development Only)

**What**: No sandboxing — just spawns the process directly.

**Why**: Fast iteration during development. No Linux kernel features required.

**Warning**: Logged clearly at startup: `[Sandbox] WARNING: Using PassthroughProvider — no isolation. Do not use in production.`

### 5. gVisorProvider (Future — Public Platform)

**What**: Google's user-space kernel. Intercepts syscalls and runs them in a sandboxed kernel implementation.

**When needed**: Only if Doable opens to untrusted anonymous users from the public internet, where kernel exploit protection becomes important.

**Overhead**: 10-30% CPU, higher memory. Not justified for ~100 invited users.

### 6. RemoteMachineProvider (Future — Cross-Platform Builds)

**What**: SSH-based provider that runs jails on remote hardware. Implements the same `SandboxProvider` interface but executes on a remote machine instead of locally.

**When needed**: iOS/macOS apps (requires macOS + Xcode), GPU workloads (ML training), ARM-native builds, Windows-only stacks (.NET/UWP).

**Architecture**:
```
API Server (local)
       │
       │  SSH tunnel
       ▼
Remote Mac / GPU server / Windows machine
       │
       ├── Project files synced (rsync / NFS bind)
       ├── Copilot CLI runs on remote machine
       ├── Build tools run natively (Xcode, CUDA, etc.)
       ├── Preview streamed back via noVNC (open source, MPL 2.0)
       └── Results synced back to API server
```

**Remote machine config** (stored in admin UI):
```typescript
interface RemoteMachineConfig {
  host: string;                    // "mac-builder.internal"
  port: number;                    // SSH port
  user: string;
  authMethod: "key" | "agent";
  keyPath?: string;
  platform: "macos" | "linux" | "windows";
  arch: "x64" | "arm64";
  capabilities: string[];          // ["xcode", "ios-simulator", "gpu", "android-sdk"]
  remoteSandboxProvider: string;   // sandbox to use ON the remote machine
  maxConcurrentJails: number;
}
```

**Platform requirements by runtime**:

| Runtime | Requires | Can run on |
|---------|----------|------------|
| iOS (Swift/SwiftUI) | Xcode, iOS Simulator | **macOS only** |
| macOS (Swift/AppKit) | Xcode | **macOS only** |
| Android (Kotlin) | Android SDK, emulator | Linux, macOS |
| .NET / UWP | Visual Studio, .NET SDK | Windows, Linux (.NET Core) |
| ML / GPU | CUDA, GPU drivers | Linux with GPU |
| Everything else | Standard toolchains | Linux (local nsjail) |

**iOS preview streaming**: iOS Simulator runs on the remote Mac. Screen is captured via VNC server and streamed to the browser using **noVNC** (open source, MPL 2.0) over WebSocket, rendered in an iframe inside Doable's preview panel.

**Admin UI**: Remote machines are registered in the Sandbox admin tab. Each machine shows its platform, capabilities, and current load. Routing rules can target specific machines by capability (e.g., `capabilities contains "xcode"` → route to mac-builder).

### 7. FirecrackerProvider (Future — Enterprise)

**What**: AWS's microVM technology. Each sandbox runs in its own lightweight VM with a separate kernel.

**When needed**: Enterprise deployments requiring the strongest isolation guarantees (e.g., compliance, multi-tenant SaaS).

**Overhead**: ~125ms boot, ~30MB fixed per VM.

## Client-Side Sandbox: Lifo and Alternatives

> **Licensing policy**: All sandbox components must be open source (MIT, Apache 2.0, GPL, or equivalent). No commercial/proprietary licensed dependencies. We do not use, recommend, or integrate any component that requires a commercial license for production use.

Server-side providers handle backend runtimes (Python, Rust, Go). For **frontend/JS projects**, a separate client-side sandbox layer runs entirely in the user's browser — zero server cost, instant boot.

### ClientSandboxProvider Interface

```typescript
interface ClientSandboxProvider {
  name: string;
  supportedRuntimes: RuntimeType[];  // e.g. ["node"] for JS-only
  available(): boolean;              // synchronous — checks browser capabilities
  createSandbox(config: ClientSandboxConfig): Promise<ClientSandbox>;
}

interface ClientSandboxConfig {
  projectId: string;
  files: Record<string, string>;     // virtual filesystem contents
  entryCommand?: string;             // e.g. "npm run dev"
}

interface ClientSandbox {
  fs: VirtualFileSystem;             // read/write files in sandbox
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  destroy(): void;
}
```

### Providers

| Provider | Runtime | Boot Time | Isolation | Offline | Use Case |
|----------|---------|-----------|-----------|---------|----------|
| **Lifo** (lifo.sh) | JS/TS only | ~0ms | Browser sandbox | Yes | AI agent sandbox, instant preview, tutorials. **MIT license.** |
| ~~WebContainers~~ | Full Node.js | ~2-5s | Browser WASM | Partial | **Rejected — requires commercial license for production. Not open source.** |
| **iframe sandbox** | HTML/CSS/JS | ~0ms | Browser origin | Yes | Simple static previews (current approach). **No license needed.** |

### Lifo (Recommended for JS/TS)

**What**: Browser library that maps POSIX/Unix APIs to Web APIs (IndexedDB for filesystem, Web Workers for processes, Fetch for network).

**Key features**:
- Virtual filesystem with 60+ Unix commands (ls, grep, awk, sed, curl, tar)
- Node.js compatibility shims (fs, path, process, child_process)
- Bash-like shell with pipes, redirects, command chaining
- Zero cloud round-trips, $0 infrastructure cost
- Instant boot (~0ms) — no container pull, no VM provision

**What it enables for Doable**:
- AI agent executes file operations and shell commands **in the user's browser**
- Package installs happen client-side (no server load)
- Preview renders instantly without waiting for server-side Vite
- Works offline — users can keep editing without connectivity
- Dramatically reduces VPS load for JS/TS projects

**Limitations**: JavaScript/TypeScript only (no native binaries). IndexedDB storage limits vary by browser. No true process isolation beyond browser sandbox.

### Decision Matrix: Server vs Client Sandbox

```
User creates a project
        │
        ▼
  What runtime?
        │
        ├── JS/TS only (React, Vue, Svelte, static)
        │       │
        │       ▼
        │   Client-side sandbox (Lifo / WebContainers)
        │   - Runs in browser, zero server cost
        │   - AI tools execute client-side
        │   - Sync to server for persistence/publish
        │
        └── Server-side (Python, Rust, Go, etc.)
                │
                ▼
            Server-side sandbox (nsjail / Docker)
            - Runs on VPS, resource-limited
            - AI tools execute in sandboxed process
            - Files on server filesystem
```

This hybrid approach means JS/TS projects (the majority) cost nothing to run, while server-side runtimes use the VPS sandbox only when needed.

## Multi-Runtime Support

### Extensible Project Type Registry

Project types are **data, not code**. New runtimes and frameworks are added from the admin UI without code changes or redeployments. Each project type is a record in the `project_types` database table.

```typescript
interface ProjectType {
  id: string;
  name: string;                    // "elixir"
  label: string;                   // "Elixir / Phoenix"
  icon?: string;                   // icon for project creation UI
  frameworks: string[];            // ["phoenix", "livebook"]

  // Environment
  rootfs: string;                  // "elixir" → /srv/rootfs/elixir/
  requiredCapabilities: string[];  // [] for local, ["xcode"] for iOS

  // Commands (${PORT} replaced at runtime)
  devCommand: string;              // "mix phx.server --port ${PORT}"
  buildCommand: string;            // "mix deps.get && mix compile"
  startCommand: string;            // "MIX_ENV=prod mix phx.server"

  // Auto-detection (identify project type from files)
  detectFiles: string[];           // ["mix.exs"]
  detectPatterns: Record<string, string>; // { "mix.exs": "phoenix" }

  // Starter template
  templateRepoUrl?: string;        // git repo to clone for new projects

  // Display
  enabled: boolean;                // admin can enable/disable
  sortOrder: number;               // order in project creation UI
}
```

**Admin UI**: Project Types editor under the Sandbox tab. Add, edit, enable/disable, reorder. Each type links to a rootfs image and gets routed to a sandbox provider via the routing rules.

**Adding a new runtime is three steps:**
1. Build rootfs image on server (install language + toolchain + Copilot CLI)
2. Add project type in admin UI (name, commands, detection rules)
3. Add routing rule (map runtime to provider + resource limits)

No code changes. No redeployment. No restart.

### Built-in Project Types

Each project type maps to a rootfs and a default dev command:

| Project Type | Runtime | Provider | Rootfs / Environment | Dev Command |
|---|---|---|---|---|
| React / Vite | node | local (nsjail) | `/srv/rootfs/node` | `npx vite --host 0.0.0.0 --port {PORT}` |
| Next.js | node | local (nsjail) | `/srv/rootfs/node` | `npx next dev -H 0.0.0.0 -p {PORT}` |
| Django | python | local (nsjail) | `/srv/rootfs/python` | `python manage.py runserver 0.0.0.0:{PORT}` |
| Flask | python | local (nsjail) | `/srv/rootfs/python` | `flask run --host 0.0.0.0 --port {PORT}` |
| FastAPI | python | local (nsjail) | `/srv/rootfs/python` | `uvicorn main:app --host 0.0.0.0 --port {PORT}` |
| Rust (Actix/Axum) | rust | local (nsjail) | `/srv/rootfs/rust` | `cargo run` |
| Go (Gin/Echo) | go | local (nsjail) | `/srv/rootfs/go` | `go run .` |
| Static HTML/CSS/JS | static | local (nsjail) | `/srv/rootfs/node` | `npx serve -l {PORT}` |
| iOS (SwiftUI) | swift/ios | **remote (macOS)** | Xcode + iOS Simulator | `xcodebuild` + Simulator via noVNC |
| macOS (AppKit) | swift/macos | **remote (macOS)** | Xcode | `xcodebuild` + app via noVNC |
| Android (Kotlin) | kotlin/android | local (nsjail) | `/srv/rootfs/android` | `./gradlew assembleDebug` + emulator via noVNC |
| ML / GPU | python-gpu | **remote (GPU)** | CUDA + PyTorch/TF | `python train.py` |

The project's `doable.json` (or detected framework) determines the runtime:

```json
{
  "runtime": "python",
  "framework": "django",
  "devCommand": "python manage.py runserver 0.0.0.0:${PORT}",
  "buildCommand": "pip install -r requirements.txt",
  "startCommand": "gunicorn myapp.wsgi:application"
}
```

## Frontend Preview Isolation

User-created frontend apps are previewed in iframes. The iframe sandbox attribute provides browser-level isolation:

```html
<iframe
  src="https://{projectId}.preview.doable.me"
  sandbox="allow-scripts allow-forms allow-same-origin"
  referrerpolicy="no-referrer"
  loading="lazy"
/>
```

Additional browser-level protections:
- **Content-Security-Policy** headers on preview responses to limit what user code can load
- **X-Frame-Options** to prevent preview pages from framing the main Doable app
- **Separate origin** for previews (`*.preview.doable.me`) so cookies/storage are isolated from the main app

## Resource Limits

### Per Jail (defaults — overridable per routing rule in admin UI)

| Resource | Soft Limit | Hard Limit | Rationale |
|----------|-----------|-----------|-----------|
| RAM | 128 MB (guaranteed) | 512 MB (burst) | Most dev servers idle at 40-60MB; burst for builds |
| CPU | 0.5 cores | 0.5 cores | Fair share on 2-core VPS |
| Disk writes | — | 500 MB | Project files + node_modules |
| Open files | — | 256 | Prevents fd exhaustion |
| Max processes | — | 64 | Prevents fork bombs |
| Network | Outbound only | — | Allows Copilot API + package registries |

### Idle Management (saves resources when users aren't active)

| State | Trigger | Effect | Resume |
|-------|---------|--------|--------|
| Active | User interacting | Full resources allocated | — |
| Suspended | 30 min idle | SIGSTOP — 0 CPU, RAM reclaimable by kernel | Instant (SIGCONT) |
| Killed | 60 min idle | Jail destroyed, all resources freed | Cold start (~2-3s) |

### Realistic Memory Usage Per Runtime

| Runtime | Idle | Active/Build | Recommended hard limit |
|---|---|---|---|
| Vite (React) | ~50MB | ~150MB HMR | 256MB |
| Flask/Django | ~35MB | ~100MB under load | 256MB |
| Cargo (Rust) | ~20MB | ~300MB compile | 512MB |
| Go | ~15MB | ~60MB | 128MB |
| Copilot CLI | ~40MB | ~80MB | shared with above |

### Platform-Wide (configurable in admin UI)

| Resource | Default | Rationale |
|----------|---------|-----------|
| Max concurrent jails | 25 | 4GB VPS with 128MB soft limits |
| Port range | 3100-3200 | 100 ports, expandable |
| Total disk per user | 500 MB | Project files + dependencies |

### Capacity Planning (2-core 4GB VPS)

```
Total RAM:              4096 MB
OS + API server:         ~500 MB
Caddy + Postgres:        ~300 MB
Available for jails:    ~3200 MB

At 128MB soft limit:    25 concurrent jails
At 256MB soft limit:    12 concurrent jails
With idle suspension:   Only active users consume resources

Realistic (5 active / 100 registered): plenty of headroom
```

## Network Policy

Since the Copilot CLI runs inside the jail and needs to reach GitHub's API, network access is controlled per phase:

| Phase | Network | Reason |
|-------|---------|--------|
| AI agent (Copilot CLI) | **Allowed** (outbound only) | Must reach GitHub Copilot API |
| Package install (npm/pip/cargo) | **Allowed** (outbound only) | Must reach package registries |
| Dev server preview | **Blocked** | User code shouldn't make external calls during dev |
| Published server app | **Allowed** (outbound only) | App may call external APIs |

Implementation: The jail runs with network enabled. Outbound-only is enforced via iptables rules inside the jail (block incoming, allow established+related outbound). For dev server preview, the AI agent process has network but the dev server subprocess can be further restricted.

## Configuration

Configuration lives at two levels:

### 1. Environment Variables (server-level — what's installed)

```env
# Rootfs paths (nsjail/bubblewrap)
SANDBOX_ROOTFS_DIR=/srv/rootfs

# Port range
SANDBOX_PORT_MIN=3100
SANDBOX_PORT_MAX=3200

# Copilot CLI inside jail
SANDBOX_COPILOT_IN_JAIL=true
```

### 2. Admin UI / Database (operational — how to use what's installed)

Everything else is configured from the Doable admin panel and stored in the database:

- **Which provider to use for which context** → routing rules table
- **Resource limits** (soft/hard memory, CPU, disk, timeouts) → per routing rule or global defaults
- **Max concurrent jails** → platform-wide setting
- **Idle suspend/kill timeouts** → per plan tier
- **Network policy per context** → per routing rule

This means the platform admin can:
- Switch all Python projects from nsjail to Docker with one click
- Give enterprise users Firecracker isolation without redeploying
- Increase Rust build memory limits on the fly
- Route a specific user to a different provider for testing
- Scale limits up/down based on current server capacity

No code changes. No redeployments. No env var edits. Just the admin UI.

## Integration with Existing System

The key integration point is `DevServerManager` in `/services/api/src/projects/dev-server.ts`. Current flow:

```
Current:
  API Server runs Copilot CLI (shared, unsandboxed)
  API Server runs npm install (--ignore-scripts, unsandboxed)
  DevServerManager → spawn("npx", ["vite"]) → direct process

Future:
  API Server → SandboxManager → per-user jail
    Inside jail:
      Copilot CLI (per-user, with user's token)
      npm/pip/cargo install (unrestricted — it's jailed)
      Dev server (any runtime — vite, flask, cargo run)
      All file operations (unrestricted — it's jailed)

  API Server is just a proxy:
    Browser → API → forward to user's jail → Copilot CLI → AI response
    Browser → API → forward to user's jail → Dev server → preview
```

Changes needed:
- CopilotEngineManager moves from API server into per-user jails
- DevServerManager spawns jails instead of direct processes
- AI tool execution happens inside the jail (no code-level path checks needed)
- Preview proxy unchanged (still routes to localhost:{port})
- Project file storage unchanged (bind-mounted into jail)

## Implementation Phases

### Phase 1: Jail-Everything MVP (nsjail + Passthrough)
- Define SandboxProvider interface + SandboxProviderRegistry
- Implement PassthroughProvider (wraps current behavior for local dev)
- Implement NsjailProvider with Copilot CLI inside the jail
- Build Node.js rootfs image (includes Copilot CLI)
- Move CopilotEngineManager from API server into per-user jails
- Integrate into DevServerManager — all user processes run inside jail
- Remove code-level security checks (path traversal, package blocklist) — jail handles it
- Implement idle suspend/resume (SIGSTOP/SIGCONT) and idle kill
- Soft/hard memory limits with shared rootfs

### Phase 2: Admin UI — Sandbox Routing & Configuration
- Database schema for `sandbox_routing_rules` and `sandbox_defaults`
- Admin panel: **Sandbox** tab with:
  - Provider status dashboard (which providers are installed/available)
  - Routing rules editor (drag-and-drop priority, match conditions, provider selection)
  - Default limits editor (memory soft/hard, CPU, timeouts, disk)
  - Active jails monitor (list, kill, suspend, resume)
- Per-routing-rule resource overrides
- Per-plan-tier default overrides

### Phase 3: Multi-Runtime
- Build Python, Rust, Go rootfs images (all include Node + Copilot CLI)
- Add project type detection / `doable.json` config
- Add Django/Flask/Rust project templates
- AI agent runs unrestricted inside jail — can install system packages, run any command
- Update AI system prompt to leverage full shell access

### Phase 4: Published Server-Side Apps
- Persistent jails for published Django/Flask/Rust/Go apps
- Caddy reverse proxy routes to persistent jail ports
- Auto-restart on crash, health checks
- Idle timeout for free tier, always-on for paid tier
- Admin UI: published app monitoring (uptime, restarts, resource usage)

### Phase 5: Docker Provider + Client-Side Sandbox (Lifo)
- Implement DockerProvider for non-Linux development (macOS, Windows without WSL2)
- Admin can route specific runtimes/contexts to Docker via routing rules
- Integrate Lifo for JS/TS projects that can run entirely in-browser
- Hybrid mode: Lifo for preview, server jail for publish
- ~~WebContainers~~ — rejected, not open source

### Phase 6: Remote Machine Provider (iOS, GPU, cross-platform)
- Implement RemoteMachineProvider (SSH-based, same SandboxProvider interface)
- Admin UI: register remote machines with platform/capabilities
- macOS build machine for iOS/macOS apps (Xcode + iOS Simulator)
- noVNC streaming for Simulator/emulator preview in browser
- GPU server for ML training workloads
- Android SDK rootfs for local Android builds + emulator via noVNC
- File sync via rsync or NFS between API server and remote machine

### Phase 7: Advanced Providers & Scale (as needed)
- gVisorProvider — admin routes untrusted/public-facing projects here
- FirecrackerProvider — admin routes enterprise/compliance users here
- All configurable via the same routing rules UI — no code changes
- Per-user resource quotas tied to billing plans
- Rootfs image caching / warm jail pools for instant boot
- Remote machine auto-scaling (spin up/down cloud instances on demand)
