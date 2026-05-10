# Sandbox-Agnostic Sandboxing PRD

A multi-chapter design book for making Doable's sandboxing layer pluggable —
so the actual isolation backend (bubblewrap, psroot, Podman, Docker, gVisor,
…) becomes a deploy-time choice instead of a hardcoded dependency.

This is a planning document. No code lands as part of this PRD. The
intent is to nail down threat model, layers, contracts, and migration
shape so the actual implementation can be done with a clean conscience.

## Why this exists

The kickoff incident: an end-user prompted *"collect all system info like
CPU, RAM…"* and Doable's AI happily ran `cat /proc/cpuinfo`,
`/etc/passwd`, `dpkg`, `curl ipinfo.io`, `ls /opt/doable/services/api/projects/`
and baked the whole snapshot into the user's React bundle. The leak
spans hardware specs, all 119 host users, every dpkg package, host IP geo,
and — most importantly — the names of *other tenants' projects* on the
same host.

Today's "sandbox" is really only one thing: the vite preview process is
jailed via `dovault.bubblewrap`. The AI's tool layer (which is what
actually ran those commands at build time) is not in any jail. The
existing `dovault` package already has a clean abstraction with
multiple backend stubs (bubblewrap, psroot, sandbox-exec, systemd,
gvisor, …); the gap is wiring callers through it and tightening the
default profile.

## Goals

1. **Sandbox-agnostic core.** A single backend-neutral interface every
   spawn in Doable goes through. Operators pick a backend per-deployment
   (env var, admin TUI). Defaults differ per OS (Linux server → psroot
   or bwrap; macOS dev → sandbox-exec; Windows dev → psroot).
2. **Layered defense.** Each backend may cover only some isolation
   layers (see chapter 02). Doable composes additional layers on top
   (seccomp, Landlock, nft egress, cgroups) when the backend lacks them.
3. **Per-purpose profiles.** AI bash tool, vite preview, install step,
   build step — each has a different "what world the process sees"
   profile. Profiles are first-class config objects, not scattered
   spawn flags.
4. **Admin-configurable.** Switching backend, tweaking allow/deny lists,
   pinning a per-workspace policy — all reachable from doable CLI.
5. **No false advertising.** When the chosen backend doesn't actually
   provide a layer, Doable surfaces that to the admin instead of
   silently degrading.

## Non-goals

- Building a new container runtime. We use existing ones.
- Replacing dovault. We extend it.
- VM-level isolation for the AI shell tool (Firecracker / Kata) —
  too heavy for short-lived AI calls; mentioned in chapter 03 for
  comparison only.
- Rewriting the Copilot SDK. We register a Doable-owned bash tool that
  replaces the SDK's built-in via the existing permission hook.

## Table of contents

| # | File | Topic | Author |
|---|---|---|---|
| 00 | [00-overview.md](00-overview.md) | Executive summary, scope, success criteria | me |
| 01 | [01-threat-model.md](01-threat-model.md) | What we're defending against; the actual leak | layers-analyst (Opus) |
| 02 | [02-sandboxing-layers.md](02-sandboxing-layers.md) | The 17 layers; what each masks; which backends provide which | layers-analyst (Opus) |
| 03 | [03-backend-landscape.md](03-backend-landscape.md) | bubblewrap / psroot / Podman / Docker / gVisor / Firecracker / nsjail / Kata / runc; decision matrix | backend-surveyor (Opus) |
| 04 | [04-psroot-assessment.md](04-psroot-assessment.md) | github.com/psmux/psroot deep dive + verdict | psroot-researcher (Opus) |
| 05 | [05-current-state-dovault.md](05-current-state-dovault.md) | What's in `packages/dovault/` today; where each backend is wired; the gaps | dovault-auditor (Opus) |
| 06 | [06-architecture-sandbox-agnostic.md](06-architecture-sandbox-agnostic.md) | The interface; how backends plug in; how layers compose | me |
| 07 | [07-jail-profiles.md](07-jail-profiles.md) | Per-purpose profiles (AI bash, vite preview, install, build); concrete YAML/TS shape | me |
| 08 | [08-syscall-and-mac-filtering.md](08-syscall-and-mac-filtering.md) | seccomp + Landlock + AppArmor/SELinux on top of namespacing | me |
| 09 | [09-network-isolation.md](09-network-isolation.md) | net-ns, nft, Squid, slirp4netns; egress allowlist | me |
| 10 | [10-config-management.md](10-config-management.md) | Env vars, workspace settings, doable CLI integration | me |
| 11 | [11-migration-path.md](11-migration-path.md) | Phased rollout so nothing breaks during the transition | me |
| 12 | [12-testing-strategy.md](12-testing-strategy.md) | Escape-test harness, golden tests, fuzz | me |
| 13 | [13-ai-tool-integration.md](13-ai-tool-integration.md) | The Copilot SDK shell-tool wrap; concrete hook | sdk-integrator (Opus) |
| 14 | [14-references.md](14-references.md) | Citations | me |

## Reading order

Read 00 → 01 → 02 first; they set the problem space. Then 05 to see
what we have. Then 03 + 04 to pick backends. Then 06 + 07 + 13 for the
shape of the abstraction. The rest (08-12) deepen specific axes and
can be read selectively.

## Status

Drafting — chapters land as agents return. Last update: see git log.
