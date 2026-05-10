# 03 — Backend Landscape: Sandbox Options for Doable

*Author: `backend-surveyor` (Opus, 2026-05-11).*

> Companion chapter: 04 ("Psroot Assessment").

## 1. Framing

Doable executes two categorically different kinds of untrusted code,
and the sandbox we pick has to be honest about which it serves well:

- **Workload A — AI build-time bash tool.** Short-lived (seconds to a
  couple minutes), one-shot, high-isolation. Blast radius if it
  escapes: the entire `doable` user's writable tree, including
  `~/.config`, the Postgres unix socket, and the published-site staging
  dir. Throughput "tens per minute, per host." Cold-start latency
  matters because users wait on it interactively.
- **Workload B — `vite` preview dev server.** Long-lived (hours),
  file-watch-heavy (`inotify` on hundreds of files), network listener
  on a localhost port the reverse proxy forwards to, low CPU once warm
  but spiky on save. Same blast radius, plus whatever it can `fetch()`
  outbound.

A namespace-heavy backend with expensive setup (gVisor, microVMs) is
fine for B and terrible for A. A purely-RLIMIT backend (today's
`direct.ts`) is fine for neither.

The rest of this chapter surveys ten candidates, scores them on ten
isolation/property dimensions, and recommends a short list aligned
with Doable's stated constraints (open-source only, low ops footprint,
no Docker-as-backend, runs as non-root `doable` user on zantaz).

## 2. Candidate Backends

### 2.1 bubblewrap (`bwrap`)

- **Mechanism:** Setuid (or unprivileged with user-namespaces enabled)
  wrapper around Linux namespaces. Creates new mount, PID, IPC, UTS,
  network, user, and (optionally) cgroup namespaces. Used as the
  underlying sandbox by Flatpak.
- **Isolation layers:** FS (`--ro-bind`, `--bind`, `--tmpfs`, `--proc`,
  `--dev`) ✓ strong; PID ✓ (`--unshare-pid`); NET ✓ (`--unshare-net`
  for full deny, or share host); USER ✓ (`--unshare-user`); UTS ✓;
  IPC ✓; syscall: only via add-on (`--seccomp <fd>` with a
  user-supplied BPF filter — not built-in); capabilities ✓
  (`--cap-drop ALL`); cgroups: ✗ (delegates to caller — typical
  pairing is `systemd-run --user --scope`); MAC: ✗ unless paired with
  Landlock/AppArmor on host.
- **Maturity:** Production-grade. Ships with every modern desktop
  Linux via Flatpak. Stable since ~2017.
- **License:** LGPL-2.0-or-later.
- **Install footprint:** ~200 KB binary. Single dependency on a
  recent-ish kernel with user namespaces.
- **Root required?** No, if `kernel.unprivileged_userns_clone=1`
  (Ubuntu/Debian default since 24.04). Otherwise needs setuid bit.
- **Performance overhead:** Negligible — bare namespace setup, no
  syscall interception, no virt. Startup ~10–30 ms.
- **Cross-platform:** Linux-only.
- **Workload A fit:** **Excellent.** Cheap startup, strong FS+NET+PID
  isolation, easy seccomp slot.
- **Workload B fit:** **Good.** Long-running is fine; cgroup caps
  must come from caller (systemd-run wrap).

### 2.2 Psroot

One-paragraph slot — full treatment in chapter 04.

Psroot is Doable's Windows-primary backend, layered on AppContainer
SIDs, Job Objects, and named-object isolation. It is a process
sandbox, not a namespace container — the "Docker-style" framing in
older docs is marketing. Standard tier gives kernel-level
FS/registry/named-object isolation and resource caps without VT-x or
admin; that's the right primary on Windows because the alternatives
(WSL2, Windows Sandbox, Hyper-V containers) all need virtualization.
It is **not** a Linux option and should not be evaluated against
bwrap/systemd.

### 2.3 Docker (rootful + rootless)

- **Mechanism:** `runc` under the hood. Rootful Docker runs daemon as
  root; rootless via `slirp4netns` / `fuse-overlayfs` / sub-uid.
- **Isolation:** FS ✓; PID ✓; NET ✓; USER ✓ (sub-uid in rootless);
  UTS ✓; IPC ✓; syscall ✓ (default seccomp denies ~44); caps ✓; cgroups
  ✓; MAC ✓.
- **Maturity:** Industry default. Rootless GA since ~20.10 (2020).
- **License:** Apache-2.0 (Docker CE / Moby).
- **Install footprint:** ~150–300 MB plus daemon.
- **Root required?** Rootful: yes. Rootless: no, but needs
  `newuidmap`/`newgidmap` setuid helpers.
- **Performance overhead:** Near-zero CPU steady-state; container
  start 100–500 ms.
- **Cross-platform:** Linux native; macOS/Windows via Linux VM
  (Docker Desktop **commercial license** for orgs >250 employees).
- **Workload A fit:** **Poor** — startup latency and daemon are wrong
  for a 50-invocations-per-minute tool.
- **Workload B fit:** **Acceptable** but heavy.

### 2.4 Podman (rootless)

- **Mechanism:** Daemon-less wrapper around `runc`/`crun`. OCI-compat.
- **Isolation:** Same set as Docker.
- **Maturity:** Production at Red Hat. Default on Fedora since 2019.
- **License:** Apache-2.0.
- **Install footprint:** ~80–150 MB.
- **Root required?** No (rootless is primary).
- **Performance overhead:** Container-start ~100–300 ms; zero steady.
- **Cross-platform:** Linux native; podman-machine on macOS/Windows
  uses QEMU+Linux VM.
- **Workload A fit:** **Marginal** — better than Docker, still has
  container-start latency.
- **Workload B fit:** **Good.** Long-lived containers, rootless mode
  clean, slirp4netns fine for single listen port.

### 2.5 nsjail

- **Mechanism:** Google's namespace+seccomp+rlimit wrapper, built for
  competitive programming judge use case. Like bwrap but richer policy
  language (protobuf config) and tighter syscall filtering.
- **Isolation:** FS ✓; PID ✓; NET ✓ (full deny via `clone_newnet`);
  USER ✓; UTS ✓; IPC ✓; syscall ✓ (default-deny templates); caps ✓;
  cgroups ✓ (v1 only — known gap); MAC: ✗.
- **Maturity:** Stable, used in CTF/judge platforms.
- **License:** Apache-2.0.
- **Install footprint:** ~1 MB binary + protobuf-c; build from source
  (no Debian package on most distros).
- **Root required?** No with unprivileged user namespaces.
- **Performance overhead:** Very low. Comparable to bwrap.
- **Cross-platform:** Linux-only.
- **Workload A fit:** **Excellent.** Designed for one-shot judges.
  Seccomp policy is its strong suit.
- **Workload B fit:** **Mediocre.** cgroup-v1-only is a real concern
  on modern Debian/Ubuntu (v2 unified).

### 2.6 gVisor (`runsc`)

- **Mechanism:** Google's user-space kernel. Intercepts guest syscalls
  and reimplements them in Go in userspace. OCI-runtime drop-in.
- **Isolation:** FS ✓ (own VFS); PID ✓; NET ✓ (own netstack — or host
  pass-through); USER ✓; UTS ✓; IPC ✓; syscall ✓✓ (host kernel never
  sees guest syscalls directly); caps ✓; cgroups ✓.
- **Maturity:** Used in Google Cloud Run, App Engine standard, Cloud
  Functions. Some syscalls unimplemented (`io_uring` historically).
- **License:** Apache-2.0.
- **Install footprint:** Single Go binary, ~50 MB.
- **Root required?** No for `--rootless`; yes for full ptrace mode on
  some kernels.
- **Performance overhead:** **10–30% CPU** typical, worse on
  syscall-heavy workloads. I/O 2–5× slower vs native.
- **Cross-platform:** Linux-only (x86_64, arm64).
- **Workload A fit:** **Strong on security, weak on latency.** Cold
  start 100–300 ms.
- **Workload B fit:** **Poor.** `vite`'s `inotify` storms and high
  syscall rate are exactly gVisor's worst case.

### 2.7 Firecracker (microVM)

- **Mechanism:** Rust-written KVM-based VMM from AWS. Boots minimal
  Linux kernel + initrd in <125 ms per microVM. No emulated devices
  beyond virtio.
- **Isolation:** FS ✓✓; PID ✓✓; NET ✓✓; USER ✓✓; UTS ✓✓; IPC ✓✓;
  syscall ✓✓ (VT-x boundary); caps ✓; cgroups ✓; MAC ✓.
- **Maturity:** Powers AWS Lambda and Fargate. Production at extreme
  scale.
- **License:** Apache-2.0.
- **Install footprint:** ~5 MB VMM, but needs guest kernel + rootfs
  image (~50–200 MB), plus orchestration.
- **Root required?** Needs `/dev/kvm` access — group `kvm` suffices.
- **Performance overhead:** ~125 ms cold boot; near-native steady.
- **Cross-platform:** Linux host with KVM only.
- **Workload A fit:** **Overkill** but viable — Lambda-style use case.
  Cold start is borderline.
- **Workload B fit:** **Good security; ops-heavy.**

### 2.8 Kata Containers

- **Mechanism:** OCI-compatible runtime that launches each container
  as a microVM (QEMU, Cloud Hypervisor, or Firecracker).
- **Isolation:** Same as Firecracker plus standard OCI niceties.
- **Maturity:** CNCF graduated incubation; production at Baidu, Ant,
  Alibaba.
- **License:** Apache-2.0.
- **Install footprint:** ~100 MB (VMM + guest image + shim + agent).
- **Root required?** Needs KVM.
- **Performance overhead:** Cold start 200–500 ms.
- **Cross-platform:** Linux+KVM only.
- **Workload A fit:** **Overkill.**
- **Workload B fit:** **Fine** if already on containerd — but Doable
  isn't.

### 2.9 runc directly

- **Mechanism:** OCI runtime reference. Reads OCI bundle, creates
  container via Linux namespaces.
- **Isolation:** Same set as Docker/Podman.
- **Maturity:** Maximum — layer Docker and Podman delegate to.
- **License:** Apache-2.0.
- **Install footprint:** Single ~10 MB Go binary.
- **Root required?** Optional rootless mode.
- **Performance overhead:** Same as Docker minus daemon.
- **Cross-platform:** Linux-only.
- **Workload A/B fit:** **Workable but DIY** — inherits OCI bundle
  construction problem.

### 2.10 WebAssembly / WASI

- **Mechanism:** Sandbox at bytecode level. WASI provides
  capability-scoped FS and (experimentally) sockets. Runtimes:
  Wasmtime, WasmEdge, Wasmer.
- **Isolation:** FS ✓ (preopen capabilities only); PID: n/a; NET
  partial; USER/UTS/IPC: n/a; syscall ✓✓ (no host syscalls — only
  host-provided imports); caps ✓✓.
- **Maturity:** Production for specific niches (Fastly Compute@Edge,
  Shopify Functions). General-purpose tool replacement: not yet.
- **License:** Apache-2.0 (Wasmtime, Wasmer Community).
- **Install footprint:** Wasmtime ~30 MB binary.
- **Root required?** No.
- **Performance overhead:** Near-native compute; I/O slower than
  native syscalls.
- **Cross-platform:** ✓✓ Linux, macOS, Windows, BSDs.
- **Workload A/B fit:** **Does not apply.** Bash tool runs `bash`,
  `node`, `pnpm`, `git`, `gcc` — none are Wasm modules.

WASI is here only to record why it's deferred: would only matter if
Doable shifted the AI tool surface from "spawn arbitrary processes"
to "run code through a Wasm-compiled language stack." Different
product, not different backend.

## 3. Decision Matrix

Cell legend: ✓ = first-class, ◐ = partial / requires external glue,
✗ = absent, — = not applicable. ✓✓ = kernel/VT boundary.

| Backend | FS | PID | NET | USER | UTS | IPC | syscall | caps | cgroups | MAC |
|---|---|---|---|---|---|---|---|---|---|---|
| **bubblewrap** | ✓ ro/rw binds, tmpfs, proc | ✓ `--unshare-pid` | ✓ `--unshare-net` deny-all | ✓ `--unshare-user` | ✓ | ✓ | ◐ caller-supplied BPF fd | ✓ `--cap-drop ALL` | ✗ caller's job | ◐ via host Landlock/AppArmor |
| **Psroot** (Win) | ✓ AppContainer + named-object | ✓ Job Object | ◐ network-mode gate | ✓ AppContainer SID | — | ✓ named-object isolation | ✗ no syscall filter | ◐ Win token rights | ✓ Job Object | ✗ no MAC analog |
| **Docker rootful** | ✓ overlay2 | ✓ | ✓ bridge | ◐ uid 0 = host root unless userns | ✓ | ✓ | ✓ default seccomp | ✓ default drop | ✓ v2 | ✓ AppArmor/SELinux |
| **Docker rootless** | ✓ fuse-overlayfs | ✓ | ✓ slirp4netns | ✓ sub-uid | ✓ | ✓ | ✓ | ✓ | ◐ needs cgroup delegation | ◐ |
| **Podman rootless** | ✓ fuse-overlayfs | ✓ | ✓ slirp4netns / pasta | ✓ sub-uid | ✓ | ✓ | ✓ default seccomp | ✓ | ◐ needs cgroup-v2 delegation | ✓ |
| **nsjail** | ✓ chroot+bind | ✓ | ✓ deny / veth | ✓ | ✓ | ✓ | ✓✓ rich seccomp | ✓ | ◐ cgroup-v1 only | ✗ |
| **gVisor** | ✓ own VFS | ✓ | ✓ own netstack | ✓ | ✓ | ✓ | ✓✓ host surface hidden | ✓ | ✓ | ◐ |
| **Firecracker** | ✓✓ separate kernel | ✓✓ | ✓✓ virtio-net | ✓✓ | ✓✓ | ✓✓ | ✓✓ VT boundary | ✓ on host | ✓ on host | ✓ on host |
| **Kata Containers** | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓ | ✓ | ✓ |
| **runc** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ per OCI spec | ✓ | ✓ | ✓ |
| **WASI/Wasmtime** | ◐ preopen only | — | ◐ experimental | — | — | — | ✓✓ no host syscalls | ✓✓ capability | ◐ runtime fuel/memlimit | — |

## 4. Short-list Recommendation

Doable should ship **three** backends out of the box on Linux, mirror
on Windows/macOS via the existing dovault registry, and **explicitly
defer** the rest. The three:

### 4.1 Linux primary: `systemd-run --scope` (already shipped)

The existing `systemd.ts` backend at priority 80 is correct. It pairs
cgroups-v2, `ProtectSystem=strict`, `PrivateTmp`, `PrivateNetwork`,
and `IPAddressDeny` into a single `systemd-run` invocation. Zero
install footprint (systemd is PID 1 on zantaz), runs unprivileged via
`--user`, gives real CPU/memory/task caps. Stays the default for both
workload A and workload B on Linux.

### 4.2 Linux fallback (no cgroup delegation): **bubblewrap**

When `systemd-run --user --scope` fails because the user session
lacks cgroup-v2 delegation (a real problem on RHEL-likes), bubblewrap
slots in at priority 70:

- **Constraint fit:** LGPL (open source ✓), zero daemon, ~200 KB,
  runs as `doable` without setuid on modern Debian/Ubuntu, no Docker.
- **Workload A:** 10–30 ms startup matches AI bash tool budget.
  Seccomp filter loaded as fixed BPF blob shipped in
  `packages/dovault/policies/`.
- **Workload B:** Long-lived vite fine; cgroup caps fall back to
  `RLIMIT_AS` (per-process, fork-evadable) — acceptable trade.
- **Honest gap:** cgroup caps must be applied outside bwrap (caller
  wraps with `systemd-run` if available).

### 4.3 Linux opt-in hardening: **gVisor (`runsc`)**

For platform-admin tenants who want stronger syscall isolation and
accept the 10–30% perf hit:

- **Constraint fit:** Apache-2.0 ✓, single Go binary, rootless-capable,
  no Docker required.
- **Workload A:** Good fit — short-lived high-isolation is exactly
  what gVisor's design targets.
- **Workload B:** **Don't use it here.** vite's inotify storm is the
  worst-case workload class. Doable's policy should keep workload B
  on bubblewrap/systemd even when gVisor is enabled for A.
- **Slot:** Priority 40, opt-in via env or per-project policy.

### 4.4 Cross-platform parity (already in plan)

- **Windows:** Psroot stays primary at priority 90.
- **macOS:** `sandbox-exec` at priority 70 with `apple-container.ts`
  at 50 (opt-in, Apple-Silicon only).

### 4.5 Explicitly NOT short-listed

| Backend | Why not |
|---|---|
| Docker (rootful) | Daemon-as-root violates "runs as doable user"; project memory bans Docker as backend. |
| Docker (rootless) | Inherits daemon model + Docker Desktop's commercial license on macOS/Windows. |
| Podman rootless | Closest miss. Strong on security and OSS. Pruned because (a) ~150 MB install footprint vs. bwrap's 200 KB, (b) container-start latency hurts workload A, (c) two-backend redundancy with systemd already covers OCI. Re-evaluate if Doable adopts OCI images. |
| nsjail | Functionally a more-opinionated bubblewrap. bwrap wins on packaging (Debian/Ubuntu pkg ✓ vs. build-from-source) and cgroup-v2 story. |
| Firecracker | KVM dependency excludes Windows/macOS dev boxes. Ops complexity wrong for ~100-user scale. |
| Kata Containers | Inherits Firecracker's KVM constraint plus containerd dependency. |
| runc directly | Would re-implement Podman badly. |
| WASI | Doesn't apply to current workloads. |

### 4.6 What the short list looks like wired up

```
priority  backend         OS        workload role
   90     psroot          Windows   primary (A and B)
   80     systemd         Linux     primary (A and B)
   70     bubblewrap      Linux     fallback when systemd unavailable
   70     sandbox-exec    macOS     primary (A and B)
   50     apple-container macOS     opt-in, Apple-Silicon only
   40     gvisor          Linux     opt-in hardening for workload A only
    0     direct          all       no-op last resort
```

This is the minimum viable matrix that honors every project-memory
constraint (open-source-only, non-root, cross-platform, no
Docker-as-backend, low ops) while leaving a clear escalation path.

## 5. Citations & Further Reading

- bubblewrap upstream: github.com/containers/bubblewrap — `bwrap(1)`.
- Psroot: local repo + chapter 04 in this PRD.
- Docker rootless guide: docs.docker.com/engine/security/rootless.
- Podman rootless: docs.podman.io, "Rootless containers."
- nsjail: github.com/google/nsjail.
- gVisor: gvisor.dev — "Production guide" and "Compatibility" pages;
  perf data in Young et al., USENIX ATC '21.
- Firecracker: Agache et al., NSDI '20.
- Kata Containers: katacontainers.io, CNCF graduation report.
- runc: github.com/opencontainers/runc, OCI Runtime Spec v1.1.
- Wasmtime / WASI: wasmtime.dev, wasi.dev.
- Doable internal: `packages/dovault/src/backends/` (current
  registry), `devframeworkPRD/08-cross-platform-sandbox.md`, memory
  entries `project_sandbox_architecture.md` and
  `project_dodev_security_posture.md`.
