# 11 — Cross-Platform Sandbox Backends (Deep Design)

> **Relationship to existing PRDs:**
> `07-implementation-plan.md` §4 sketches the three-tier sandbox strategy
> (Psroot / systemd / sandbox-exec) with concrete code samples. **This doc is
> the deep design behind that sketch** — per-OS detection logic, bundling,
> the opt-in tier (Apple Container, gVisor), test matrix, the bubblewrap
> vs nsjail decision for non-systemd Linux, and the explicit "honest gaps"
> each backend ships with. Read 07 §4 first; come here for specifics.
>
> Companion to `06-runtime-and-publish.md`. Adds concrete `ResourceBackend`
> implementations to `packages/dovault` so Windows, Linux (without systemd
> cgroup delegation), and macOS all have a real isolation path. PRD 06
> specifies *intent* (lockConfigs, blockChildProcess, resourceLimits, no
> outbound except allowlist); this doc specifies *mechanism* per OS.
>
> **Constraints (from user):**
> - **No host code execution** — user/AI code never runs unsandboxed.
> - **No GPU required.**
> - **No VT-x required** as the primary path. VM-based sandboxes are
>   opt-in fallback / hardening.
> - **Low CPU + RAM budget** (laptop-class dev, 4-vCPU/16-GB VPS).
> - **Cross-platform: Windows, Linux, macOS** all must have a working
>   primary path.
>
> **Date:** 2026-05-02. Branch baseline: `main` @ `88de0b3`.

---

## 1. Goals & non-goals

### Goals

1. **Eliminate the "no isolation on macOS" failure mode.** Today
   `packages/dovault/src/backends/direct.ts` is the macOS path — zero
   isolation, only cwd hygiene.
2. **Promote Windows from "Job Objects only" to "AppContainer + Job
   Objects".** Today's `windows.ts` enforces resource limits but provides no
   FS or registry isolation. The user's Psroot project (local at
   `C:\Users\gj\Documents\workspace\Psroot`) is the right path.
3. **Add a Linux fallback for non-systemd hosts** (Alpine, containers without
   cgroup delegation, dev laptops not running systemd). Today the systemd
   backend is the only Linux backend; without it we drop to `direct.ts`.
4. **Plug into the existing `ResourceBackend` interface** without changing
   `Vault`. The `backends/types.ts` shape (`name`, `priority`, `available()`,
   `wrapSpawn()`, optional `wrapExec()`) already supports this.
5. **Honest about limits.** Each backend's "what it cannot do" section is
   explicit so callers don't oversell isolation strength.

### Non-goals

- We do **NOT** require a VM for the primary path on any OS.
- We do **NOT** ship a custom Linux kernel module. Landlock is upstream.
- We do **NOT** rewrite `Vault` or `process-jail.ts`. The Node Permission
  Model layer is unchanged.
- We do **NOT** unify the per-OS APIs into a single virtual interface beyond
  what `ResourceBackend` already provides. Backend implementations stay
  separate.

---

## 2. Audit: existing dovault backends

| Backend | OS | Priority | What it does | What it doesn't |
|---|---|---|---|---|
| `systemd.ts` | linux | 80 | `systemd-run --scope` + cgroups v2: `MemoryMax`, `CPUQuota`, `TasksMax`, `IPAddressDeny`, `ProtectSystem=strict`, `ReadWritePaths`, `PrivateTmp`. Real FS jail. | Requires user-cgroup delegation; not all distros; not Alpine. |
| `windows.ts` | win32 | 60 | Win32 Job Objects via inline P/Invoke C# in PowerShell — memory cap, CPU rate, kill-on-close. Proxy poisoning of `HTTP_PROXY`/`HTTPS_PROXY`. | **No FS isolation. No registry isolation. No network isolation.** |
| `win-heap.ts` | win32 | 40 | V8 `--max-old-space-size` only. | Heap-only, anything outside V8 is unbounded. |
| `direct.ts` | any | 0 | No-op. | **Nothing.** Used on macOS and any platform without a higher-priority backend. |

Conclusion: macOS and Windows have **no real FS isolation** today. Linux
without systemd cgroup delegation has none either.

---

## 3. New backend matrix

**Priorities harmonized with `07-implementation-plan.md` §4** (Psroot=70,
systemd=80, sandbox-exec=50, direct=0). Within an OS, higher = preferred.
Cross-OS numbers don't compete because `available()` filters by OS first.

| OS | Backend | Priority | Mechanism | Replaces |
|---|---|---|---|---|
| **win32** | `psroot.ts` | **70** | AppContainer + Job Objects + (admin) BindFilter via Psroot CLI/lib | Promotes over `windows.ts` (drops to 60 fallback) |
| **linux** | (existing) `systemd.ts` | 80 | unchanged | — |
| **linux** | `bubblewrap.ts` | **65** | Unprivileged user/mount/net namespaces via `bwrap` | New — fills the non-systemd gap |
| **darwin** | `sandbox-exec.ts` | **50** | SBPL profile (Seatbelt) | Replaces `direct.ts` on macOS |
| **darwin** | `apple-container.ts` | 45 (opt-in) | Apple Containerization Framework / `container` CLI | New — opt-in for macOS 15+ Apple Silicon |
| **linux** | `gvisor.ts` | 40 (opt-in) | User-space syscall interception (`runsc`) | New — opt-in hardening profile |
| **linux** | `nsjail.ts` | 60 (opt-in) | Google-built namespace jail with rich seccomp DSL | Documented alternative to bubblewrap; opt-in for hardened multi-tenant |

`direct.ts` stays as the priority-0 universal fallback.

### Why bubblewrap as primary non-systemd Linux fallback (not nsjail)

`07-implementation-plan.md` §4.3 lists nsjail as the alternative. Both are
namespace-based unprivileged jails. The trade-off:

| | bubblewrap | nsjail |
|---|---|---|
| Binary size | ~80 KB | ~1 MB |
| Daemon | none | none |
| User base | Flatpak (every Linux desktop) | CTF sandboxes, Google internal |
| Unprivileged user namespaces | yes (modern distros) | yes |
| Seccomp profile DSL | basic | richer |
| Cgroups v2 native | no (pair with prlimit/landlock) | yes |
| Threat model fit | "isolate dev code from host" ✓ | "harden against APT" ✓✓ |
| Debug-when-broken | simpler API | more flags = more rope |

**Decision:** ship `bubblewrap` as the default non-systemd Linux backend.
Smaller, mainstream (Flatpak ships it on every Linux desktop), simpler
integration, well-tested in user-facing apps. **Document nsjail as the
upgrade path** for the day Doable hosts AI-generated code from untrusted
public users at scale (>100 tenants), and ship a `nsjail.ts` backend at
priority 60 (opt-in via `DOVAULT_BACKEND=nsjail`) for that scenario.

The honest line: bubblewrap is the right default for our threat model
*today*; nsjail is the right default for "we are now an AI sandboxing-as-
a-service company". Same code seam in dovault either way.

---

## 4. Per-backend specification

### 4.1 `psroot.ts` (Windows, primary)

**Local reference:** `C:\Users\gj\Documents\workspace\Psroot` — a Rust-built
Windows sandbox CLI. README claims AppContainer (kernel-enforced FS+registry+
named-object isolation), Job Objects (resource limits), Restricted Tokens
(privilege drop), optional BindFilter (path remap, Win 11 24H2+ admin),
optional Server Silos (namespace, Win 10 1809+ admin). Crate split:
`psroot-types`, `psroot-job`, `psroot-bindlink`, `psroot-namespace`,
`psroot-silo`, `psroot-container`, `psroot-cli`.

**No VT-x. No admin required for Standard tier.** Single ~2 MB binary.

**`wrapSpawn` strategy:**

```ts
// packages/dovault/src/backends/psroot.ts
import { spawn } from "node:child_process";

export class PsrootBackend implements ResourceBackend {
  name = "psroot";
  priority = 90;
  async available(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    return whichSync("psroot.exe") != null;
  }
  wrapSpawn(opts: SpawnOptions, limits: ResourceLimits): SpawnDescriptor {
    const args = [
      "spawn",
      "--name", opts.projectId,
      "--workdir", opts.cwd,
      "--ro", "C:\\Windows", "--ro", "C:\\Program Files",
      "--rw", opts.cwd,
      "--memory", limits.memoryMax ?? "512M",
      "--cpu-rate", String(parseCpuQuota(limits.cpuQuota ?? "50%")),
      "--max-procs", String(limits.tasksMax ?? 256),
      "--network", opts.blockOutboundNet ? "none" : "outbound",
      "--",
      opts.command,
      ...opts.args,
    ];
    return { command: "psroot.exe", args, env: opts.env, cwd: opts.cwd };
  }
}
```

**Registration:** add to `packages/dovault/src/backends/index.ts` registry.
`Vault.spawn` already auto-selects highest-priority `available()` backend.

**What it gives us:**
- AppContainer = kernel FS + registry + named-object isolation.
- Job Objects = memory cap, CPU rate, max-procs, kill-on-close.
- Network mode `none|outbound|full` = real network gating.
- Zero VT-x, zero admin (Standard tier).
- Cold start <1 s (single-binary launch + AppContainer creation).

**What it doesn't:**
- Clipboard, display, system clock, network metadata still shared (Psroot's
  own `docs/isolation.md` "What's NOT Isolated" section).
- Standard tier is process sandbox, not namespace container — it's NOT
  VM-grade. Don't pitch it as such.
- BindFilter and Server Silos require admin / Win 11 24H2+ → unused by
  default.

**Bundling:** Doable should ship `psroot.exe` in `packages/dovault/vendor/win32-x64/`
and prepend that path to `PATH` when looking up `psroot.exe`. Document
licensing (MIT) in `THIRD_PARTY_NOTICES.md`.

### 4.2 `bubblewrap.ts` (Linux, fallback to systemd)

**Mechanism:** `bwrap` uses unprivileged user/mount/PID/net namespaces. No
SUID, no daemon. Same primitive Flatpak uses.

**`wrapSpawn` strategy:**

```ts
wrapSpawn(opts, limits) {
  const args = [
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/etc", "/etc",
    "--bind", opts.cwd, opts.cwd,
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    "--unshare-user", "--unshare-pid", "--unshare-uts", "--unshare-ipc",
    ...(opts.blockOutboundNet ? ["--unshare-net"] : []),
    "--die-with-parent",
    "--new-session",
    "--chdir", opts.cwd,
    opts.command, ...opts.args,
  ];
  return { command: "bwrap", args, env: opts.env, cwd: opts.cwd };
}
```

**Resource limits:** bubblewrap doesn't enforce cgroups itself. We layer on:

- **prlimit** — `RLIMIT_AS` (address space) for memory, `RLIMIT_NPROC` for
  task count. Imperfect (not as strict as cgroups) but works without
  delegation.
- **landlock LSM** — apply the FS ruleset post-namespace. Kernel ≥ 5.13.

CPU quota is the weakest link without cgroups; the bubblewrap backend
declares it as best-effort.

**What it gives us:** real FS jail, real network deny, unprivileged. No daemon.

**What it doesn't:** weaker memory/CPU caps than systemd. Network deny is
all-or-nothing (no per-host allow inside `--unshare-net`; for that we'd need
a network namespace + a userspace bridge — out of scope).

### 4.3 `sandbox-exec.ts` (macOS, primary)

**Mechanism:** `sandbox-exec -p '<sbpl>' -- <cmd>`. Apple's Seatbelt. Officially
deprecated since macOS 10.15 but still ships and Apple uses internally
(every browser sandbox on macOS uses it).

**Generated SBPL profile:**

```scheme
(version 1)
(deny default)

;; Allow read on system frameworks and the project workdir.
(allow file-read*
  (subpath "/usr")
  (subpath "/System")
  (subpath "/Library")
  (subpath "/private/var/db/dyld")
  (subpath (param "WORKDIR")))

;; Read+write the workdir only.
(allow file-write*
  (subpath (param "WORKDIR")))

;; Always-allow internal namespaces.
(allow process-fork)
(allow process-exec*)
(allow signal (target self))
(allow ipc-posix-shm)
(allow mach-lookup)

;; Network policy
(allow network* (local ip "localhost"))
(deny network-outbound)         ;; flip to (allow network-outbound) when blockOutboundNet=false
```

**`wrapSpawn` strategy:** generate SBPL with `WORKDIR` parameter set to
`opts.cwd`; spawn `sandbox-exec -p '<rendered>' -- <cmd>`.

**Resource limits:** macOS has no native cgroup equivalent. We use
`launchd`-style `RLIMIT_*` via `prlimit`-equivalent (`setrlimit` syscall).
Memory cap is enforced as `RLIMIT_AS` only.

**What it gives us:** real default-deny FS profile, network-outbound block
toggle, exec gating.

**What it doesn't:**
- No real CPU quota enforcement.
- No memory cgroup-grade enforcement (RLIMIT_AS is per-process address
  space, not RSS).
- SBPL grammar is undocumented; Apple may break us.
- API is deprecated — plan migration to `apple-container.ts` for users on
  macOS 15+ Apple Silicon.

### 4.4 `apple-container.ts` (macOS, opt-in fallback)

**Mechanism:** Apple's Containerization Framework + `container` CLI (macOS
15+, Apple Silicon only). Uses `Hypervisor.framework`, runs each container in
a real Apple-Hypervisor VM. Fast on M-series (~1 s cold start).

**Why opt-in:** requires VT (Apple Hypervisor), excludes Intel Macs, excludes
pre-15 macOS. Users explicitly opt in via `dovault.profile = "hardened"` or
when the workspace policy demands VM-grade isolation.

**`wrapSpawn` strategy:** `container run --rm -v {cwd}:/work --workdir /work
--memory 512m --cpu 0.5 -- {image} {cmd}`. Image: a minimal Debian/Alpine
with the framework's runtime pre-installed.

**What it gives us:** VM-grade isolation. Independent kernel.

**What it doesn't:** rules out half the macOS install base. Adds ~150 MB
disk per image. Cold start 1–3 s.

### 4.5 `gvisor.ts` (Linux, opt-in hardening)

**Mechanism:** `runsc` from gVisor — user-space syscall interception. Pretends
to be a kernel; intercepts every syscall in userspace; fewer attack-surface
syscalls reach the host kernel.

**Why opt-in:** ~10–30% perf penalty on syscall-heavy work. Adds binary
dependency. For workspaces that explicitly want post-Linux-namespace
hardening.

**`wrapSpawn`:** `runsc do --rootfs {cwd} -- {cmd}` (simplified; real
integration uses `runsc-init` + OCI bundle).

---

## 5. Per-(OS × runtime-kind × framework-family) profile matrix

PRD 06 §8.1 has the per-adapter intent. This is the per-OS mechanism table.

| OS | runtime_kind | Framework family | Primary backend | Resource caps | FS jail | Network |
|---|---|---|---|---|---|---|
| linux | static | n/a | n/a (Caddy `file_server`) | n/a | n/a | n/a |
| linux | process | node | systemd (priority 80) | 512M / 50% / 256 | `ProtectSystem=strict` + `ReadWritePaths=/data/projects/{id}` | `IPAddressDeny=any` + project egress allowlist |
| linux | process | python | systemd | 512M / 50% / 256 | same | same |
| linux (no cgroup) | process | any | bubblewrap (priority 70) | RLIMIT_AS, RLIMIT_NPROC | `--ro-bind /usr,/lib` + `--bind {cwd}` | `--unshare-net` (deny) or share (allow) |
| win32 | static | n/a | n/a (Caddy on win-dev) | n/a | n/a | n/a |
| win32 | process | node | psroot (priority 90) | `--memory 512M --cpu-rate 50 --max-procs 256` | AppContainer + `--rw {cwd}` | `--network outbound` |
| win32 | process | python | psroot | same | same | same |
| win32 (no Psroot) | process | any | windows (Job Objects, priority 60) | memory + CPU rate | **none** ← gap | proxy poison only |
| darwin | static | n/a | n/a | n/a | n/a | n/a |
| darwin (Intel or <15) | process | node/python | sandbox-exec (priority 70) | RLIMIT_AS | SBPL `(deny default) (allow … (subpath WORKDIR))` | SBPL `(deny network-outbound)` toggle |
| darwin (15+ Apple Silicon, opt-in) | process | any | apple-container (priority 50) | container `--memory --cpu` | bind-mount only | container `--network` |

**The dev preview path** (Vite HMR, Next.js dev) reuses the same backend
matrix but loosens the profile per PRD 06 §8 (allow outbound for npm, allow
child process for esbuild).

---

## 6. Integration into dovault

No `Vault` change. Each new backend is a file in
`packages/dovault/src/backends/<name>.ts` that implements
`ResourceBackend` and is registered in `backends/index.ts`:

```ts
// packages/dovault/src/backends/index.ts (existing — extend)
import { SystemdBackend } from "./systemd.js";
import { BubblewrapBackend } from "./bubblewrap.js";
import { GvisorBackend } from "./gvisor.js";
import { PsrootBackend } from "./psroot.js";
import { WindowsBackend } from "./windows.js";
import { WinHeapBackend } from "./win-heap.js";
import { SandboxExecBackend } from "./sandbox-exec.js";
import { AppleContainerBackend } from "./apple-container.js";
import { DirectBackend } from "./direct.js";

export const ALL_BACKENDS: ResourceBackend[] = [
  new PsrootBackend(),         // win32, prio 90
  new SystemdBackend(),        // linux, prio 80
  new BubblewrapBackend(),     // linux, prio 70
  new SandboxExecBackend(),    // darwin, prio 70
  new WindowsBackend(),        // win32, prio 60
  new AppleContainerBackend(), // darwin, prio 50 (opt-in)
  new WinHeapBackend(),        // win32, prio 40
  new GvisorBackend(),         // linux, prio 40 (opt-in)
  new DirectBackend(),         // any,   prio 0
];
```

`Vault.selectBackend()` (existing) walks the list, takes the first
`available()`. `available()` for opt-in backends returns false unless
`process.env.DOVAULT_PROFILE === "hardened"` or the workspace policy says
so.

---

## 7. Detection logic per OS

| OS | `available()` checks |
|---|---|
| psroot | `process.platform === "win32"` AND `which("psroot.exe")` succeeds |
| systemd | `process.platform === "linux"` AND `await fs.access("/sys/fs/cgroup/cgroup.controllers")` succeeds AND `systemctl --user status` returns 0 |
| bubblewrap | `process.platform === "linux"` AND `which("bwrap")` succeeds |
| sandbox-exec | `process.platform === "darwin"` AND `await fs.access("/usr/bin/sandbox-exec")` succeeds |
| apple-container | `process.platform === "darwin"` AND `os.release()` major ≥ 24 (macOS 15) AND `process.arch === "arm64"` AND `which("container")` succeeds AND `DOVAULT_PROFILE === "hardened"` |
| gvisor | `process.platform === "linux"` AND `which("runsc")` succeeds AND `DOVAULT_PROFILE === "hardened"` |
| windows / win-heap / direct | always true on their platform (last-resort) |

---

## 8. Bundling and install

| Backend | Source | How shipped | Install command |
|---|---|---|---|
| psroot | local Psroot project | bundled in `packages/dovault/vendor/win32-x64/psroot.exe` (~2 MB) | none (already bundled) |
| systemd | OS | distro package | n/a |
| bubblewrap | OS | distro package (`bubblewrap` on Debian/Ubuntu/Fedora; `bwrap` aur on Arch) | `setup-server.sh`: `apt-get install -y bubblewrap` |
| sandbox-exec | macOS | always present | n/a |
| apple-container | Apple | `container` CLI (Brew or Apple's installer) | user-installed, opt-in |
| gvisor | upstream | Doable does NOT bundle; user installs `runsc` | opt-in only |

`setup-server.sh` (already enumerates packages — see CLAUDE.md "Fresh Server
Setup") gains one line:

```bash
apt-get install -y bubblewrap   # fallback when systemd cgroup delegation absent
```

---

## 9. Testing matrix

For each backend, a smoke test in `packages/dovault/src/backends/<name>.test.ts`:

1. **Spawn a noop binary** — assert it runs, exits 0.
2. **Try to read outside the jail** — assert EACCES / EPERM.
3. **Try to write outside the jail** — assert EACCES / EROFS.
4. **Try to bind a port** — assert success when network allowed, failure when
   denied.
5. **Allocate > memoryMax** — assert OOM-kill or RLIMIT_AS deny.
6. **Spawn N+1 child processes (N=tasksMax)** — assert deny.
7. **Cold-start time** — record p50/p99 for budget tracking.

CI matrix: GitHub Actions runners are linux/ubuntu (systemd ✓, bubblewrap
install), macos-14 (Apple Silicon, sandbox-exec ✓), windows-2022 (psroot ✓
when bundled). Each backend tested only on its OS.

---

## 10. Honest gaps

- **Psroot's "Docker-style containers" framing is marketing.** Standard tier
  is a process sandbox; namespace container needs Server Silos (admin +
  Win 10 1809+). Our default tier is fine for "tenant ↔ host" but is NOT a
  multi-tenant security boundary against a determined attacker.
- **`sandbox-exec` is on borrowed time.** Apple has been "deprecating" it
  since 10.15. There's no public replacement on Intel/older macOS. Our
  migration path is `apple-container.ts` for the subset of users on macOS 15+
  Apple Silicon.
- **bubblewrap's resource caps are weaker than systemd.** Without cgroups,
  RLIMIT_AS is per-process and easy to circumvent by forking. Memory + CPU
  quotas are best-effort.
- **Node Permission Model** (`packages/dovault/src/process-jail.ts`) is
  `--experimental-permission` and silently no-ops if the entry point can't
  be resolved. It's defense-in-depth, not the boundary.
- **macOS without `sandbox-exec`** (some hardened configurations remove the
  binary) falls through to `direct.ts`. Document and detect.
- **Windows without Psroot bundled** falls through to `windows.ts` (Job
  Objects only — no FS isolation). For self-hosters who don't want our
  vendored binary, this is the documented failure mode.

---

## 11. Open issues

1. **Per-host network allow-list inside the jail.** Linux `--unshare-net` +
   userspace bridge for selective egress is doable but heavy. Defer to PRD
   06 §13.3 follow-up.
2. **gVisor compatibility.** Some Node native modules (sharp, sqlite3
   prebuilds) don't work under gVisor. Catalogue at adoption time.
3. **psroot bundling and updates.** Vendored binary needs a refresh
   discipline. Consider a `dovault-vendor-update` script that fetches latest
   release with checksum verification.
4. **Sandbox profile escalation under load.** If we ever multi-tenant heavily,
   Standard-tier Psroot / `sandbox-exec` are not enough. Document the
   escalation path: `apple-container` on Mac, `Server Silo` on Win 10+ admin,
   `gVisor` or `Docker rootless` on Linux.
5. **Telemetry: which backend was selected per spawn.** Add to the existing
   `AuditEntry` (`packages/dovault/src/types.ts:123-127`) so we can answer
   "what's the % of dev sessions running with real FS isolation?"
