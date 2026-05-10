# 08 — Syscall and MAC Filtering

This chapter expands on the two layers that sit *underneath*
namespacing and are the most commonly forgotten: **seccomp-bpf** (per-process
syscall allowlist/denylist) and **MAC** (AppArmor / SELinux / Landlock —
mandatory access control labels applied by the kernel regardless of UID
or capability). See chapter 02 for the layer overview; this chapter
specifies how Doable composes them.

## Why these are not optional

A namespace + capability drop is necessary but not sufficient. Concretely:

- A process with `CAP_DAC_READ_SEARCH` dropped *and* uid != root *and*
  mounted into a clean mount-ns can still call `bpf()`,
  `userfaultfd()`, `keyctl()`, `io_uring_setup()`. Every one of those
  has had a kernel CVE (`Dirty Pipe`, `Dirty Cred`, the eBPF verifier
  CVE-2022-23222, the userfaultfd race CVE-2022-32250, etc.) that
  achieves arbitrary kernel R/W from inside the namespace.
- seccomp-bpf cuts the syscall surface to a few dozen that the
  workload actually uses. Even if the namespace leaks, the kernel
  attack surface is small.
- AppArmor/SELinux/Landlock take it further: the kernel refuses
  syscall arguments that violate a policy, even if the syscall
  itself is in the allowlist. `open("/etc/shadow", O_RDONLY)` returns
  `EACCES` regardless of UID, caps, or mount-ns.

The 2026-05-09 leak's `curl ipinfo.io` would have been blocked at
seccomp (no `socket(AF_INET)`) or at AppArmor (no outbound `network`
permission) even without a network namespace.

## Seccomp-bpf

### The Doable policy

Profile-driven (chapter 07). Each profile specifies:

```ts
syscalls: {
  capsKeep: string[];               // empty for AI-bash; add nothing
  seccompDefault: "errno" | "kill" | "trap" | "log";
  seccompDeny: string[];            // always blocked
  seccompAllow?: string[];          // when set, allowlist mode
}
```

The orchestrator's `seccomp-bpf` composer (chapter 06) loads a BPF
filter via libseccomp before the spawned process's first instruction.
Bubblewrap's `--seccomp <fd>` slot is the canonical attach point;
systemd-run takes the same filter via `SystemCallFilter=` directives.

### The denylist (shipping default)

These syscalls are denied for every profile unless a specific profile
opts in. The list is curated from gVisor's deny set + Docker's
default profile + recent kernel CVEs:

```
bpf, keyctl, add_key, request_key,
io_uring_setup, io_uring_enter, io_uring_register,
userfaultfd, perf_event_open, ptrace, process_vm_readv, process_vm_writev,
unshare, setns, mount, umount, umount2, pivot_root, chroot,
kexec_load, kexec_file_load,
init_module, finit_module, delete_module, create_module, query_module, get_kernel_syms,
syslog, _sysctl, lookup_dcookie, uselib,
iopl, ioperm,
fanotify_init, fanotify_mark,
quotactl, nfsservctl,
acct, swapon, swapoff,
reboot, sethostname, setdomainname,
clock_settime, settimeofday, adjtimex,
move_pages, mbind, migrate_pages, set_mempolicy, get_mempolicy,
nfsservctl, vmsplice,
```

Each entry is justified by either: documented CVE, ability to
bypass other isolation (mount → escape mount-ns; unshare → nested
namespace tricks; ptrace → cross-process read), or no legitimate
need (kexec, reboot, init_module).

### The allowlist mode (opt-in per profile)

For the tightest profiles (e.g. `ai-bash` if we want to escalate)
the policy can flip to **default-deny**: list every syscall the
workload uses, deny the rest. This is what gVisor does internally.
The cost is maintenance: every new feature might add a syscall the
allowlist doesn't know about.

Recommended posture: ship with denylist mode for v1. After a
workload class proves stable for 90 days, optionally graduate it to
allowlist mode using audit-logged actuals.

### Per-architecture caveat

A seccomp filter must be **architecture-aware** — the syscall number
for `mount` on x86_64 is different from arm64. libseccomp handles
this if you express the filter symbolically (which we do). Don't
write raw BPF.

### What does "deny" actually do?

`seccompDefault` controls the action:

- `errno` (recommended for AI-bash): syscall returns `EPERM`. The
  caller sees a normal error and can adapt or fail. The model
  gets stderr like "Operation not permitted" and stops retrying.
- `kill`: thread is killed immediately. Better for builds where
  any attempt at a dropped syscall is itself a bug.
- `trap`: send `SIGSYS` so a debugger can attach. Useful only in
  staging.
- `log`: allow but audit-log. Useful for *building* an allowlist
  before flipping to allowlist mode.

## Landlock

### What it adds

Landlock (kernel 5.13+, expanded in 5.19 and 6.x) lets an
unprivileged process **voluntarily lock itself** to a filesystem
allowlist. It's enforced by the kernel LSM hooks, not by mount or
DAC, so it composes with mount-ns and survives bind-mount edge
cases.

A Landlock rule set is:

```c
struct landlock_ruleset_attr {
  __u64 handled_access_fs;   // which access modes the ruleset controls
};
// then add path rules: landlock_add_rule with LANDLOCK_RULE_PATH_BENEATH
```

### Why use it on top of mount-ns

Defense-in-depth. If something goes wrong with the mount-ns
(missing bind, leaked fd, race during teardown), Landlock still
fails the syscall at the LSM hook. The cost is near-zero —
Landlock is a kernel-side filter, not a userspace proxy.

### How it composes in Doable

A `landlock` composer (chapter 06) runs after the backend's
mount-ns setup, takes the profile's `fs.rootDir`,
`fs.readOnlyBinds`, `fs.tmpfs`, and `fs.masks`, and installs the
matching Landlock ruleset before `execve()`.

The cost: ~50 lines of code in the composer, using
[`@indutny/landlock`](https://www.npmjs.com/package/...) or a small
N-API wrapper around libpsx/libcap.

### Kernel version gate

`available()` for the landlock composer probes
`/sys/kernel/security/landlock` and reads
`/proc/sys/kernel/seccomp/landlock_abi_version`. If < 1, the
composer no-ops (logs a warning at boot). On the deployed zantaz
kernel (6.8.0-111-generic), Landlock ABI v3 is available — full
read/write/execute scope.

## AppArmor / SELinux

### Choosing one

Doable runs on Ubuntu (zantaz, staging, dev). Ubuntu ships with
AppArmor. RHEL-likes ship with SELinux. The PRD recommends:

- **Default: AppArmor profiles** for Doable workloads on
  Ubuntu/Debian.
- **Optional: SELinux** for operators on RHEL-likes. The Doable
  profile system ships both.

### Profile shape (AppArmor)

```
profile doable-ai-bash flags=(complain) {
  /usr/bin/sh ix,
  /usr/bin/bash ix,
  /usr/bin/node ix,
  /usr/bin/npm ix,
  /usr/bin/git ix,

  /work/** rwk,
  /tmp/** rwk,

  /etc/ssl/certs/* r,
  /usr/share/** r,

  deny /etc/shadow r,
  deny /etc/passwd r,         # passwd is synthesized in /etc/passwd inside the jail
  deny /opt/doable/** r,
  deny /home/** r,
  deny /root/** r,
  deny /proc/cpuinfo r,
  deny /proc/meminfo r,
  deny /sys/devices/** r,
  deny /sys/firmware/** r,
  deny /var/lib/dpkg/** r,

  deny network,                # combined with net-ns, blocks every socket()
}
```

Per-workload AppArmor profile files in `/etc/apparmor.d/doable-*`,
loaded at `setup-server.sh` time. The backend adapter for bwrap or
systemd applies `aa-exec -p doable-ai-bash --` before the command.

### Why ship AppArmor when seccomp + Landlock + mount-ns already
look enough

Each layer denies different vocabularies:

- mount-ns: "what FS *paths* exist in this process's view"
- Landlock: "which paths this process is allowed to call open()
  on, in whose mode"
- seccomp: "which syscall *numbers* this process can issue"
- AppArmor: "which paths *and* operations *and* network
  capabilities this process can use, *labelled* by profile"

A bug in any one of mount-ns / Landlock / seccomp can be backed up
by the others. The cost of running with all four is single-digit
percent CPU. The cost of running with one is "occasional CVEs
deliver root."

### Detection

The MAC composer probes:
- `/sys/kernel/security/apparmor` → AppArmor present.
- `/sys/fs/selinux` → SELinux present.
- Both: prefer AppArmor (Doable's default profiles).
- Neither: emit a warning at boot. In `prod`, abort startup unless
  `DOABLE_ALLOW_NO_MAC=1` is set (operator escape hatch).

## Combined effect

If a workload runs under all four:

| Threat | Layer that blocks it |
|---|---|
| `cat /etc/passwd` (host) | mount-ns (synthetic file shadows host) + AppArmor (deny `/etc/passwd r`) |
| `socket(AF_INET, SOCK_STREAM, 0)` | seccomp (deny `socket` outside allowlist) + AppArmor (`deny network`) + net-ns (no outbound route) |
| `bpf(BPF_PROG_LOAD, ...)` | seccomp (deny `bpf`) |
| `io_uring_setup(...)` | seccomp (deny `io_uring_setup`) |
| `open("/etc/shadow", O_RDONLY)` | mount-ns (not bind-mounted) + Landlock (not in ruleset) + AppArmor (deny `/etc/shadow r`) |
| `mount("...")` to escape | seccomp (deny `mount`) + caps drop (no `CAP_SYS_ADMIN`) |
| `unshare(CLONE_NEWUSER)` (nested escape) | seccomp (deny `unshare`) |
| `ptrace(PTRACE_ATTACH, otherPid, ...)` | seccomp (deny `ptrace`) + PID-ns (no other pid visible) + AppArmor (deny `ptrace`) |

Each row has at least two independent failures the attacker would
need. The 2026-05-09 leak had **zero** of these — every command
succeeded at first try.

## What this chapter is asking the implementer to add

1. `packages/dovault/src/composers/seccomp.ts` — load BPF from
   profile's `syscalls` block via libseccomp.
2. `packages/dovault/src/composers/landlock.ts` — install ruleset
   from profile's `fs` block via an N-API binding.
3. `packages/dovault/src/composers/apparmor.ts` — wrap commands
   via `aa-exec -p <profile>`.
4. AppArmor profile files in
   `infra/apparmor/doable-{ai-bash,vite-preview,install,build}.profile`
   loaded by `setup-server.sh`.
5. Boot probes that fail loud in `prod` when seccomp /
   apparmor /landlock are unavailable.
