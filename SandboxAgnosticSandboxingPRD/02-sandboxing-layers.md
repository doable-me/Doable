# 02 — Sandboxing Layers

*Author: `layers-analyst` (Opus, 2026-05-11).*

This chapter enumerates every Linux isolation primitive Doable can
compose, what each one actually prevents, which backends provide it,
which Doable workload needs it, and — where applicable — the exact
recon command from the 2026-05-09 leak that the absence of that
layer enabled.

## Doable workload glossary

Three workload classes appear throughout:

- **AI-bash** — the project AI's bash tool. Short-lived,
  high-blast-radius. Source of the 2026-05-09 leak.
- **vite-preview** — the per-project Vite dev server serving the
  live preview. Long-running, runs tenant-authored code that may
  include untrusted plugin chains.
- **install** — `pnpm install` / `npm install` style dependency
  fetch + lifecycle scripts. Notorious for arbitrary code execution
  via `postinstall`.
- **build** — production `pnpm build` / `vite build`. Less
  arbitrary than install, but still executes tenant code.

## The Layers

### 1. Mount namespace + bind mounts + tmpfs

**Prevents.** Reading the host filesystem outside an
explicitly-mounted whitelist. The single most important FS boundary.

**Provided natively by.** bwrap, psroot, podman, docker, nsjail,
gVisor, Firecracker (via root-fs replacement).

**Doable workloads needing it.** All four. AI-bash absolutely —
`cat /etc/passwd` and `ls /opt/doable/services/api/projects/` both
fall here.

**Leak example.** Lines 2 and 5 of the leak (`cat /etc/passwd`,
`ls /opt/doable/services/api/projects/`) succeeded because the
sandbox bind-mounted `/` instead of a curated `/usr` + `/bin` +
tenant workdir tmpfs.

### 2. PID namespace

**Prevents.** Seeing or signalling host processes via
`/proc/<pid>`, `ps`, `kill`. Inside, PID 1 is your sandbox init.

**Provided natively by.** bwrap, psroot (Windows-equivalent),
podman, docker, nsjail, gVisor, Firecracker.

**Doable workloads needing it.** AI-bash, install, build (preview
can share if isolated otherwise).

**Leak example.** Not in this leak — but `ps auxf` without a PID-ns
would have enumerated every tenant's running process and AI session.

### 3. UTS namespace

**Prevents.** Reading/changing host hostname & NIS domain.
Low-value isolation but cheap.

**Provided natively by.** bwrap, podman, docker, nsjail.

**Doable workloads needing it.** All; mostly defense-in-depth
against fingerprinting.

**Leak example.** `hostname` would have returned the host's
identifier (`doable-prod-1` etc.) — useful adjunct to the IP
geo-leak in line 6.

### 4. IPC namespace

**Prevents.** Cross-tenant System V IPC, POSIX message queues,
shared memory access.

**Provided natively by.** bwrap, podman, docker, nsjail.

**Doable workloads needing it.** Install, build (npm postinstalls
have used shm for coordination). Lower priority for AI-bash.

### 5. User namespace

**Prevents.** Being "real root" outside. Maps a non-root host UID
into UID 0 inside, so a successful privilege bug inside the jail
still hits an unprivileged real-UID outside.

**Provided natively by.** bwrap (rootless), podman (rootless),
nsjail, gVisor; docker requires `userns-remap`.

**Doable workloads needing it.** All. *But:* nested user-ns is
itself a CVE hotspot — pair with seccomp blocking
`unshare(CLONE_NEWUSER)` for AI-bash.

**Leak example.** None directly, but `dpkg -l` (line 3) ran because
the dpkg binary and `/var/lib/dpkg` were visible from the host — a
user-ns alone wouldn't have stopped this; mount-ns was the missing
layer.

### 6. Network namespace

**Prevents.** Seeing host NICs, listening sockets, routes, ARP
tables, conntrack. Each net-ns is its own loopback.

**Provided natively by.** bwrap (`--unshare-net`), podman, docker,
nsjail, gVisor, Firecracker.

**Doable workloads needing it.** AI-bash (`ss`, `netstat`), preview
(must allow only outbound HTTPS to package CDN), install (same).

**Leak example.** Line 4 — `ss -tlnp` listed every host listener
including the rogue `0.0.0.0` binder. A per-tenant net-ns would have
shown only the loopback inside the jail.

### 7. cgroups v2

**Prevents.** Exhausting host CPU, RAM, IO, or PIDs. Includes
freezer for instant suspension.

**Provided natively by.** podman, docker, systemd-run, nsjail,
Firecracker; bwrap relies on caller (systemd-run wrapping).

**Doable workloads needing it.** All. Preview especially — runaway
HMR loops, install — fork bombs in postinstalls, build — memory
blowups.

**Leak example.** Not a confidentiality leak per se, but the AI ran
`dpkg -l` (826 entries) without any IO/CPU brake — under load this
is a DoS vector.

### 8. Capabilities

**Prevents.** Specific privileged operations even when UID==0
inside the jail. Drop `CAP_SYS_ADMIN`, `CAP_NET_ADMIN`,
`CAP_NET_RAW`, `CAP_BPF`, `CAP_SYS_PTRACE`, `CAP_SYS_MODULE`,
`CAP_DAC_READ_SEARCH`, `CAP_MKNOD`, etc.

**Provided natively by.** bwrap (`--cap-drop ALL`), podman, docker,
nsjail, gVisor, Firecracker.

**Doable workloads needing it.** All. Default should be
`cap-drop=ALL` and add back nothing for AI-bash.

**Leak example.** `cat /etc/passwd` — under aggressive DAC the AI's
UID shouldn't have been able to read it; if it had
`CAP_DAC_READ_SEARCH` it could bypass DAC entirely.

### 9. seccomp-bpf

**Prevents.** Specific syscalls regardless of capability/UID. The
runtime kernel-attack-surface reducer.

**Provided natively by.** bwrap (custom filter via libseccomp),
podman, docker (default profile), nsjail, gVisor (intercepts via
its own syscall table).

**Doable workloads needing it.** All. AI-bash should run with a
*deny-everything-network-ish* profile; install/build need broader
but still deny `bpf`, `keyctl`, `io_uring_setup`, `userfaultfd`,
`unshare(CLONE_NEWUSER)`, `mount`, `pivot_root`, `kexec_*`,
`perf_event_open`, `ptrace`.

**Leak example.** `curl ipinfo.io` (line 6) — seccomp can deny
`socket(AF_INET, SOCK_STREAM)` for AI-bash entirely, which kills
curl/wget/nc at the libc layer with `EPERM`.

### 10. Landlock

**Prevents.** Filesystem access at the per-process (no-root,
no-CAP) level — a process voluntarily restricts itself to a path
allowlist. Composes with mount-ns; useful when mount-ns isn't
available or as defense-in-depth.

**Provided natively by.** nsjail (recent), bwrap (recent), systemd
via `LandlockPaths=`; not yet in docker/podman defaults. Available
since kernel 5.13, expanded in 5.19+/6.x.

**Doable workloads needing it.** AI-bash especially — even if
mount-ns drifts, Landlock pins the FS view to `/work/<project>` +
`/usr` read-only.

**Leak example.** Belt-and-braces against line 5
(`ls /opt/doable/...`). With Landlock the syscall fails at LSM hook
regardless of mount visibility.

### 11. AppArmor / SELinux (MAC)

**Prevents.** Mandatory access control labels override DAC; even
root cannot exceed the profile.

**Provided natively by.** Host-level; podman/docker integrate
(`--security-opt apparmor=...` / `--security-opt label=...`); bwrap
inherits host profile.

**Doable workloads needing it.** All. Per-workload profiles:
tighter for AI-bash, looser for build (needs to write to `/work`).

**Leak example.** Same as capabilities — an AppArmor profile
denying `/etc/** r` would have blocked line 2 even if the file was
bind-mounted.

### 12. /proc masking *(see correction below)*

**Prevents.** Disclosure of host CPU/RAM/load/version/partitions/
modules via procfs entries that are *not* per-namespace.

**Provided natively by.** podman + docker (mask via `ProcMount=`
and `--security-opt`), nsjail (tmpfs over selected paths), gVisor
(synthesizes its own /proc), Firecracker (its own kernel). bwrap
requires explicit `--ro-bind /proc/cpuinfo /proc/cpuinfo` with a
synthetic file or tmpfs masking.

**Doable workloads needing it.** **All — this is the layer Doable
was missing.**

**Leak example.** Line 1 — every `/proc` file in the leak. See
correction below.

### 13. /dev minimal

**Prevents.** Direct hardware access via device nodes. Only
`/dev/null`, `/dev/zero`, `/dev/urandom`, `/dev/random`, `/dev/tty`,
`/dev/pts/*` should exist. No `/dev/kmsg`, `/dev/mem`, `/dev/kvm`,
`/dev/sd*`, `/dev/nvme*`, `/dev/kvm`, `/dev/loop*`.

**Provided natively by.** bwrap (`--dev`), podman, docker
(default), nsjail, gVisor, Firecracker.

**Doable workloads needing it.** All.

**Leak example.** Not in this leak; `cat /dev/kmsg` is the obvious
next step and would dump the host's kernel log buffer including
other tenants' OOM kills.

### 14. /sys masking

**Prevents.** Hardware fingerprinting
(`/sys/devices/system/cpu/`, `/sys/class/dmi/id/product_uuid`),
firmware peek (`/sys/firmware/`), and write-access to host knobs
(`/sys/kernel/`).

**Provided natively by.** podman + docker (mask paths), nsjail,
gVisor. bwrap needs explicit `--ro-bind` with a tmpfs.

**Doable workloads needing it.** All. AI-bash highest priority.

**Leak example.** Adjacent to line 1 —
`cat /sys/class/dmi/id/product_uuid` would have leaked the VPS's
hardware UUID, useful for correlating across compromises.

### 15. Network egress filter

**Prevents.** Outbound exfil to attacker-controlled hosts.
nftables in the host or in a per-net-ns; alternatively a forced
HTTP CONNECT proxy (Squid) with allowlist.

**Provided natively by.** Not a sandbox-runtime feature — sits
*outside* the jail. nftables on host, Squid as transparent
intercept, or per-net-ns veth pair with nft rules.

**Doable workloads needing it.** AI-bash (allow only AI gateway),
install (allow only registry mirror), build (same), preview (allow
nothing outbound by default).

**Leak example.** Line 6 — `curl ipinfo.io` would have hit
`EPERM`/connection-refused.

### 16. Resource limits (ulimit / prlimit)

**Prevents.** Per-process resource exhaustion (file descriptors,
core dump size, stack, cpu-seconds, address space).

**Provided natively by.** Caller responsibility; systemd-run,
podman, docker support; bwrap inherits.

**Doable workloads needing it.** All; install/build especially.

### 17. UID drop

**Prevents.** DAC bypass entirely — the AI runs as
`vite-jail-<tenant>` (UID 9001+), which has no read on any other
tenant's files regardless of namespace mistakes.

**Provided natively by.** All backends; trivial.

**Doable workloads needing it.** All. This is the cheapest, most
reliable layer and should never be skipped.

**Leak example.** Line 5 — even if
`/opt/doable/services/api/projects/` was visible, mode 0750 owned
by `doable:doable` with the AI running as `vite-jail-tenantA`
blocks the listing at DAC.

---

## Correction on /proc — the surprise gap

The single most counterintuitive fact in Linux sandboxing — and the
exact gap that produced the 2026-05-09 leak — is this:

> **A PID namespace does *not* hide `/proc/cpuinfo`, `/proc/meminfo`,
> `/proc/loadavg`, `/proc/uptime`, `/proc/version`, `/proc/partitions`,
> `/proc/modules`, `/proc/stat`, `/proc/diskstats`, or `/proc/swaps`.**

Engineers new to sandboxing reasonably assume that "if I have a PID
namespace, my `/proc` is isolated." This is *only* true for the per-PID
subtrees (`/proc/<pid>/...`, `/proc/self`). The **global procfs files
— anything not under a numeric PID — are host-real even inside a fresh
PID namespace.** They reflect the host kernel because procfs is,
fundamentally, a window into kernel data structures, and most of those
structures are not namespaced.

This is why:

- `cat /proc/cpuinfo` from inside a Docker container with default
  settings shows the host's CPU model.
- `cat /proc/meminfo` shows host total RAM (cgroup-aware tools like
  `free` in newer util-linux read `/sys/fs/cgroup/memory.max` instead
  — but raw `/proc/meminfo` is the host's).
- `cat /proc/loadavg` shows host load, not container load.
- `cat /proc/version` shows the host kernel version — a CVE
  selector.

To actually hide these files, you must replace them at the
**mount-namespace** layer:

1. **Tmpfs-overlay with synthetic content.** Mount a tmpfs over
   `/proc/cpuinfo`, populate with a minimal CPU description matching
   the cgroup's allowed CPU set. Repeat for every leak-prone entry.
2. **Bind-mount `/dev/null` over them.** Crude but effective —
   `cat /proc/cpuinfo` returns empty. Some software panics on empty
   cpuinfo (Node.js's `os.cpus()` for one), so prefer synthetic
   content.
3. **Use a runtime that synthesizes procfs**, e.g. gVisor (which has
   its own procfs implementation) or LXC/LXCFS (which provides a FUSE
   procfs respecting cgroup limits).
4. **Hide entire subtrees** like `/proc/sys/kernel/`,
   `/proc/kallsyms`, `/proc/kcore`, `/proc/modules` with
   tmpfs-over-directory mounts.

Docker's default `runc` config does some of this — it masks
`/proc/kcore`, `/proc/keys`, `/proc/timer_list`, etc., and marks
several `/proc/sys` paths read-only. But it does *not* mask
`cpuinfo`, `meminfo`, `loadavg`, or `version` by default, because
doing so breaks too many guest tools. **Most sandboxes inherit that
same permissive default.** Doable's `psroot` and bwrap-based jails
did the same — and that is exactly the gap the AI walked through.

The PRD's procfs strategy must therefore be **explicit and per-file**,
not "we have a PID namespace, we're fine." A concrete recommendation:

- Maintain a `procfs-mask.list` of files to overlay with synthetic
  content: `cpuinfo`, `meminfo`, `loadavg`, `uptime`, `stat`,
  `version`, `partitions`, `diskstats`, `swaps`, `modules`,
  `mounts`, `mountinfo`, `mountstats`, `interrupts`, `cgroups`.
- For each, generate per-tenant synthetic content from
  cgroup-allowed values (so `/proc/cpuinfo` lists only the CPUs in
  the tenant's `cpuset.cpus`, and `/proc/meminfo` reports `MemTotal`
  equal to `memory.max`).
- Run the procfs-mask logic as part of sandbox init *before*
  dropping caps, so the mounts succeed.
- Audit-test on every release with the exact recon prompt from the
  leak ("collect all system info") and assert the output contains
  only synthetic values.

This single correction — that procfs masking is a *required, explicit
step*, not a free side-effect of namespacing — is the load-bearing
insight of this PRD. Every backend Doable ships on (psroot, bwrap,
podman, gVisor, Firecracker) must be configured with this assumption
made loud, not assumed away.
