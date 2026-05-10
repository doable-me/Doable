# 14 — References

## Linux primitives

- **Namespaces overview** — `man 7 namespaces`. The canonical
  reference for mount-ns, PID-ns, UTS-ns, IPC-ns, user-ns, net-ns,
  cgroup-ns, time-ns.
- **bubblewrap** — github.com/containers/bubblewrap; `man bwrap(1)`.
  Setuid-or-userns wrapper. Used by Flatpak as the production
  sandbox primitive.
- **seccomp-bpf** — `man 2 seccomp`; libseccomp at
  github.com/seccomp/libseccomp. The BPF filter format and the
  symbolic syscall vocabulary.
- **Landlock** — landlock.io; `man 7 landlock`. Per-process FS
  allowlist, available since kernel 5.13, expanded in 5.19+/6.x.
- **AppArmor** — apparmor.net; ubuntu.com/wiki/AppArmor. Path-based
  MAC, Ubuntu/Debian default.
- **SELinux** — selinuxproject.org; lcl.fi/selinux. Label-based MAC,
  RHEL/Fedora default.
- **cgroups v2** — `man 7 cgroups`; kernel.org/doc/Documentation/
  admin-guide/cgroup-v2.rst.
- **Capabilities** — `man 7 capabilities`; the 41 distinct
  privileges the kernel can grant separately from root.

## Sandboxing runtimes surveyed

- **psroot** — github.com/psmux/psroot. Rust-Windows-first wrapper
  around AppContainer + Job Objects. Cross-platform via shells to
  bubblewrap-like primitives on Linux and sandbox-exec on macOS.
- **Docker** — docker.com; security model docs at
  docs.docker.com/engine/security. Rootless: docs.docker.com/
  engine/security/rootless.
- **Podman** — podman.io; rootless guide at docs.podman.io;
  Red Hat's "Manage containers without daemons" article.
- **nsjail** — github.com/google/nsjail. Google's
  namespace+seccomp+rlimit wrapper, popular in competitive
  programming judges.
- **gVisor (runsc)** — gvisor.dev. Google's user-space syscall
  intercept. Powers Cloud Run / App Engine standard / Cloud
  Functions. Compatibility matrix at
  gvisor.dev/docs/user_guide/compatibility.
- **Firecracker** — firecracker-microvm.github.io. AWS Lambda's
  microVM. Paper: Agache et al., *Firecracker: Lightweight
  Virtualization for Serverless Applications*, NSDI '20.
- **Kata Containers** — katacontainers.io. CNCF graduated
  incubation. OCI-compat shim that boots each container as a
  microVM.
- **runc** — github.com/opencontainers/runc. The OCI runtime
  reference. Spec at github.com/opencontainers/runtime-spec.
- **WASI / Wasmtime** — wasmtime.dev, wasi.dev. WebAssembly
  System Interface — capability-scoped FS and (experimental)
  networking for Wasm modules.
- **sandbox-exec (Seatbelt)** — macOS-specific, deprecated since
  10.15. Reference: apple.com/...sandbox profile language. Still
  the only thing built into macOS without VT-x.

## CVE highlights driving the seccomp denylist

- **CVE-2022-0847 (Dirty Pipe)** — pipe pages bypass page-cache
  permissions. Mitigated by patched kernels; relevant to mount-
  immutability assumptions.
- **CVE-2022-23222** — eBPF verifier bug, local privilege escalation.
  Justifies denying `bpf()` syscall.
- **CVE-2022-32250** — userfaultfd UAF, local privilege escalation.
  Justifies denying `userfaultfd()`.
- **CVE-2022-2602 (Dirty Cred)** — io_uring credential confusion.
  Justifies denying `io_uring_setup()`.
- **CVE-2021-22555** — netfilter heap OOB. Justifies denying
  `socket(PF_NETLINK)` in seccomp.
- **CVE-2024-1086** — netfilter UAF, was actively exploited.
  Reinforces the deny on AF_NETLINK.

The recurring theme: every "obscure" syscall has had a CVE that
broke namespace isolation. Denying them by default is cheap; reusing
them is rare.

## Reference workloads

- **AWS Lambda execution environment** — uses Firecracker per
  invocation. ~125 ms cold start. Operative model: spin up, run,
  tear down.
- **Cloud Run** — uses gVisor for syscall interception inside a
  container.
- **GitHub Actions** — uses ephemeral VMs (Azure or self-hosted
  runners). No per-step sandbox; trusts the whole runner.
- **CodeSandbox / StackBlitz / Replit** — vary. StackBlitz uses
  WebAssembly + WebContainer for the whole stack. Replit uses
  Linux containers per project. CodeSandbox uses Docker rootless
  + Firecracker on some tiers.
- **Vercel / Netlify build pipelines** — Docker containers per
  build, throwaway per-build. Closest commercial analog to
  Doable's "build" profile.

## Doable internal references

- `packages/dovault/` — current sandbox primitive package.
  - `src/index.ts` — public API.
  - `src/backends/` — nine backend stubs.
  - `src/process-jail.ts` — Node Permission Model wrapper.
  - `src/config-guard.ts` — config-file lockdown layer.
- `services/api/src/projects/vite-jail.ts` — current vite spawn
  site, partially jailed.
- `services/api/src/deploy/builder.ts` — current build spawn site,
  partially jailed.
- `services/api/src/ai/tools/install-package.ts` — current
  install spawn site, **not** jailed.
- `services/api/src/ai/providers/copilot-engine.ts:117-141` — the
  Copilot SDK permission hook (the only chokepoint for AI bash
  today).
- `services/api/src/runtime/dev-uid-allocator.ts` — per-project UID
  drop helper.
- `services/api/src/runtime/hardening-level.ts` —
  `DOABLE_HARDENING` env handler.
- `services/api/src/db/migrations/073_workspace_sandbox_rules.sql`
  — the policy plane this PRD extends.
- `devframeworkPRD/11-cross-platform-sandbox.md` — earlier sandbox
  PRD, the source of priority numbers in chapter 03 / 05.
- `servertodo/05-dovault-spawn-wiring.md` — operator-side audit
  document.

## Operator memory (this session)

- `project_sandbox_architecture.md` — cross-platform backend
  intent.
- `project_dodev_security_posture.md` — current sandbox gap audit
  (2026-05-07).
- `project_sandbox_allowlist_feature.md` — the feature memo this
  PRD operationalizes.
- `feedback_security.md` — bind-127.0.0.1-only invariant relevant
  to chapter 09.
- `feedback_no_redis.md`, `feedback_no_god_mode.md`,
  `feedback_opensource_only.md` — constraints honored throughout.

## Books / talks worth knowing

- **Aleph Security, "Bypassing kernel hardening features"** —
  conference talks documenting how each isolation layer has been
  bypassed individually, motivating layered defense.
- **Container Security** by Liz Rice (O'Reilly). Practical
  treatment of namespaces, capabilities, seccomp, MAC.
- **Linux Kernel Self-Protection Project** —
  kernsec.org/wiki/index.php/Kernel_Self_Protection_Project. The
  upstream defense-in-depth catalog Doable's seccomp policy
  mirrors.

## Discussion threads

- Linux kernel mailing list — namespace + procfs threads (Eric W.
  Biederman's annual "let's talk about /proc and namespaces"
  emails) explain *why* `/proc/cpuinfo` doesn't get namespaced.
- Flatpak design notes on bubblewrap — why setuid was preferred
  over kernel patches for the userns-disabled distros.
- gVisor commit history on `io_uring` support — the canonical
  case study in "syscall surface is hard to keep up with."
