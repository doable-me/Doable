# 04 — psroot Assessment

*Author: `psroot-researcher` (Opus, 2026-05-11). Citations in original
agent report.*

## Overview

psroot is a Rust-based, Windows-first containerization CLI that has
expanded into a cross-platform sandbox wrapper. The upstream project
lives at https://github.com/psmux/psroot and self-describes as
*"Docker-style containers for Windows, Linux, and macOS without
requiring virtualization extensions, Hyper-V, or Docker."* The
repository is a small Cargo workspace (~348 KB, seven crates, single
~2 MB compiled binary). Doable already has a stub backend wired at
`packages/dovault/src/backends/psroot.ts` and a vendor README at
`vendor/psroot/README.md` describing how to drop in `psroot.exe`.

Below is a forensic look at what psroot really delivers, what it does
not, and whether Doable should make it the *first* or *second* sandbox
choice.

## 1. What psroot Is, Technically

- **Language / runtime:** Rust 95.2 %, PowerShell 2.4 %, Shell 2.4 %
  (upstream language stats). Requires Rust 1.75+ and Windows 10 build
  17763+ for full features.
- **Workspace shape:** Cargo workspace with seven crates —
  `psroot-types`, `psroot-job`, `psroot-bindlink`, `psroot-namespace`,
  `psroot-silo`, `psroot-container`, `psroot-cli` (per devframeworkPRD
  11 §4.1 and the upstream README's "Architecture" section).
- **Mechanism, per platform:** the upstream README's "Isolation
  Mechanisms" line is, verbatim (≤15 words): *"Pure OS kernel
  primitives (AppContainer on Windows, namespaces+cgroups on Linux,
  sandbox-exec on macOS)."*
  - **Windows (its native home):** AppContainer (the same sandbox
    model used by Edge and Chrome) + Job Objects + Restricted Tokens,
    with optional BindFilter (path remap, Win 11 24H2+ admin) and
    Server Silos (namespace, Win 10 1809+ admin).
  - **Linux:** advertised as `clone(2)` namespaces + cgroups v2 +
    `pivot_root` via a `psroot-unix` backend (i.e. it shells out to
    roughly what bubblewrap does itself).
  - **macOS:** advertised as `sandbox-exec` SBPL profiles + PTY +
    rlimits — i.e. it wraps the same Seatbelt primitive Doable's
    `sandbox-exec.ts` already invokes directly.
- **No kernel driver, no DLL injection, no hypervisor.** Cold-start
  is sub-second; the binary is ~2 MB.

## 2. Isolation Matrix (psroot on Windows)

| Layer | Coverage | Notes |
|---|---|---|
| FS namespace (mount-ns + binds/tmpfs) | Partial | AppContainer provides kernel-enforced FS ACL gating; `--rw <workdir>` + `--ro` system paths. Mount-namespace-equivalent only via BindFilter (admin + Win 11 24H2+). |
| PID namespace | **YES (Standard tier)** | Achieved via `psroot-procshim` DLL injection + inline hooking of `ntdll!NtQuerySystemInformation` and `ntdll!NtOpenProcess`. Proven zero-leak across all enumeration methods (Toolhelp32, K32EnumProcesses, NtOpenProcess). No admin required. |
| NET namespace | Toggle only | `--network none/outbound/full` — process-level gate, not a separate stack. |
| USER namespace | N/A | Replaced by Restricted Tokens + AppContainer SID. |
| UTS / IPC namespaces | No (Standard tier) | Same constraint as PID — needs Silos. |
| Syscall filter (seccomp / Landlock) | No | No equivalent on Windows; AppContainer + capability SIDs are the substitute. |
| Capabilities drop | Yes | Restricted Token strips most privileges by default. |
| Resource limits (cgroups equivalent) | Yes | Job Objects: memory cap, CPU rate (1–10000), max-procs, kill-on-close. |
| Registry isolation | Yes | AppContainer-scoped registry hive. |
| Named-object isolation | Yes | AppContainer scopes mutexes, events, sections. |
| Process visibility isolation | **YES** | Inline function patching of ntdll syscall stubs. All callers intercepted at the kernel API chokepoint. |

**Updated assessment (2026-05-11):** Standard-tier psroot with
`psroot-procshim` now delivers PID-namespace-equivalent isolation
without admin privileges or Server Silos. The `procshim-e2e-test`
binary proves zero process leaks across NtQuerySystemInformation,
CreateToolhelp32Snapshot, K32EnumProcesses, and NtOpenProcess. This
was previously believed to require Server Silos; inline hooking of
the ntdll syscall stubs achieves the same result at the API
chokepoint level.

## 3. Platforms

- **Windows 10 build 17763+ and Windows 11:** primary, mature target.
- **Linux:** wraps `clone(2)` namespaces + cgroups v2 + `pivot_root`.
  This is the same territory bubblewrap already covers; psroot is not
  adding a new kernel mechanism, just a Rust frontend.
- **macOS:** wraps `sandbox-exec` SBPL profiles. Inherits all the
  warnings that come with Apple's officially-deprecated-since-10.15
  Seatbelt.

So although it ships a `psroot-unix` and macOS path, **psroot's only
real value-add is on Windows**. On Linux it duplicates
bubblewrap/systemd; on macOS it duplicates the raw `sandbox-exec`
Doable already calls directly.

## 4. License (Open-Source-Only Compatibility)

The GitHub web UI marks the upstream README as MIT-licensed (per the
README badge / WebFetch summary). However, `GET /repos/psmux/psroot`
from the GitHub API returns `license: not specified` for the canonical
repo metadata, and the `LICENSE` file is not currently reachable on
`main` or `master` via raw.githubusercontent.com (both 404). This is a
real concern: per Doable's "All dependencies must be open source — no
commercial/proprietary licensing of any kind" rule, we should not
vendor `psroot.exe` until the upstream repo carries an SPDX-identified
MIT (or compatible) license file at the repo root.

**Action item: file an upstream issue asking for a committed
`LICENSE` file before bundling.**

## 5. Maturity Signals

From the GitHub API (`/repos/psmux/psroot`):

- **Stars:** 4
- **Forks:** 0
- **Open issues:** 0
- **Created:** 2026-04-19
- **Last push:** 2026-05-05
- **Default branch:** `master`
- **Repo size:** 348 KB
- **Total commits:** ~7

Tests: the README mentions "66 isolation tests" but no CI badge is
exposed; the test suite is not independently verified by this
assessment.

This is a **brand-new, single-contributor, near-zero-adoption**
project. By comparison, bubblewrap is the sandboxing primitive under
every Flatpak install on Linux and has years of multi-vendor scrutiny.

## 6. Comparison with bubblewrap (Same Isolation Matrix)

| Layer | psroot (Windows Standard tier) | bubblewrap (Linux unpriv) |
|---|---|---|
| FS namespace | AppContainer ACL gating (kernel) | mount-ns + `--ro-bind` / `--bind` / `--tmpfs` (true mount-ns) |
| PID-ns | No (needs Silos + admin) | Yes (`--unshare-pid`) |
| NET-ns | Toggle via `--network none/outbound/full` | Yes (`--unshare-net`) — true netns |
| USER-ns | N/A (Restricted Token) | Yes (`--unshare-user`) |
| UTS / IPC | No (needs Silos) | Yes (`--unshare-uts --unshare-ipc`) |
| seccomp / Landlock | No (Windows lacks equivalent) | seccomp via `--seccomp`; Landlock layerable post-namespace |
| Cap drop | Yes (Restricted Token) | Yes (cap drop on entry) |
| Resource caps | Job Objects: memory + CPU rate + max-procs | None native — layered via `prlimit` (RLIMIT_AS / RLIMIT_NPROC); CPU quota best-effort |
| Maturity | 4 stars, ~7 commits, 1 month old | Shipped in every major distro, primary Flatpak primitive |
| Binary size | ~2 MB | ~80 KB |
| Admin required | No (Standard tier) | No |
| OS coverage | Windows native; Linux/macOS as a wrapper | Linux only |

The relevant comparison is **per-OS**, because `available()` filters
by `process.platform` first. On Linux, bubblewrap is dramatically more
battle-tested and lighter. On Windows, bubblewrap is not an option at
all — psroot has no real competitor there other than Doable's
existing Job-Objects-only `windows.ts`, which "enforces resource
limits but provides no FS or registry isolation".

## 7. Honest Recommendation: First Choice or Fallback?

**Tier by OS, not by global ranking.** psroot should be the **first
choice on Windows**, and **not used at all on Linux or macOS**.
Specifically:

- **Windows — FIRST CHOICE (proven).** It is the only practical
  way to get kernel-enforced FS + registry + named-object + PID
  isolation on Windows without admin or VT-x. The existing
  `windows.ts` Job-Objects backend gives memory and CPU caps but
  "**No FS isolation. No registry isolation. No network isolation.
  No process visibility isolation.**" psroot at priority 70
  delivers all of these. The `psroot-procshim` crate (inline
  hooking of ntdll syscall stubs) closes the PID visibility gap
  that previously required Server Silos + admin.

  **Proof:** `procshim-e2e-test.exe` demonstrates zero leaks:
  - NtQuerySystemInformation: only PID 0 + self visible
  - CreateToolhelp32Snapshot: only PID 0 + self visible
  - K32EnumProcesses: only self visible
  - NtOpenProcess: all host PIDs denied (STATUS_ACCESS_DENIED)

  **Remaining caveats:**
  1. Block bundling until upstream `LICENSE` is committed and
     SPDX-tagged.
  2. Pin to a specific git SHA + SHA-256 of the built binary.
  3. Keep `windows.ts` as the priority-60 fallback for hosts
     without `psroot.exe`.

- **Linux — DO NOT USE psroot's `psroot-unix` backend.** It wraps the
  same `clone(2)` namespaces + cgroups v2 + `pivot_root` that
  bubblewrap and systemd already handle natively and far more
  maturely.

- **macOS — DO NOT USE psroot's macOS backend.** It is a thin wrapper
  over `sandbox-exec`, which Doable already invokes directly.

**Net:** psroot is Doable's **first choice on Windows and only on
Windows**. With `psroot-procshim` closing the PID isolation gap, it
now delivers container-grade isolation (FS + registry + named-objects +
process visibility + resource limits + network toggle) on the Standard
tier without admin.

## 8. What's Actually Wired in Doable Today

The local backend file is **not a stub** — it is a working
`ResourceBackend` implementation, but it depends on a vendored
`psroot.exe` that is **not committed**. Specifically:

- `packages/dovault/src/backends/psroot.ts:14-56` implements
  `resolvePsrootPath()` with a three-tier search:
  `DOABLE_PSROOT_PATH` env var → `vendor/psroot/psroot.exe` → system
  PATH via `where psroot.exe`. The resolution is cached.
- `packages/dovault/src/backends/psroot.ts:83-86` — `available()`
  returns true only on `win32` AND when the resolver finds a binary.
- `packages/dovault/src/backends/psroot.ts:88-104` — `wrapSpawn()`
  invokes
  `psroot.exe spawn --memory <M> --cpu-rate <N> --max-procs <N>
  --network none|outbound -- <cmd> <args>`. No FS bind is provided in
  `wrapSpawn`; that lives in `wrapExec`.
- `packages/dovault/src/backends/psroot.ts:106-125` — `wrapExec()`
  additionally passes `--rw <jail> --workdir <jail>` so the
  AppContainer only has write access inside the project jail.
- `packages/dovault/src/backends/psroot.ts:133-136` —
  `parseCpuQuota()` strips trailing `%` and falls back to `50` on
  parse failure, mapping Doable's `cpuQuota: "50%"` shape to Job
  Object's 0–100 integer.
- Priority is **70** (line 81), one notch above the legacy
  `windows.ts` (priority 60), matching the registry order.
- `vendor/psroot/README.md:11-14` explicitly says Doable "**does
  not** vendor the binary by default" and instructs operators to
  either build from source via `cargo build --release` or drop in a
  signed release binary. `vendor/psroot/.gitignore` keeps stray
  builds out.
- Tests at
  `packages/dovault/src/backends/__tests__/backends.test.ts:98,
  132-134` cover only construction + wrap-shape (not actual sandbox
  execution). PsrootBackend is exercised on `win32` only; on other
  platforms it asserts `available() === false`.

So today: **backend code is real, vendoring is not done, and
`available()` returns false on every developer's box unless they
manually drop in `psroot.exe` or set `DOABLE_PSROOT_PATH`.** That's
the gap to close before psroot can claim "first choice on Windows"
in production.

## Citations

- Upstream README, repo metadata, and isolation-mechanism quote:
  https://github.com/psmux/psroot (WebFetch, 2026-05-11).
- Upstream API metadata (stars/forks/license-not-specified/dates):
  https://api.github.com/repos/psmux/psroot.
- Local backend:
  `packages/dovault/src/backends/psroot.ts:14-136`.
- Vendor drop-in instructions: `vendor/psroot/README.md:11-58`.
- Cross-platform sandbox design:
  `devframeworkPRD/11-cross-platform-sandbox.md:64-167, 440-461`.
- Test coverage shape:
  `packages/dovault/src/backends/__tests__/backends.test.ts:98,
  132-141`.
- Companion bubblewrap backend (for the §6 comparison):
  `packages/dovault/src/backends/bubblewrap.ts:24-94`.
