# 00 — Overview

## Executive summary

Doable runs untrusted code in two distinct contexts: (1) the **AI's
tool layer** (build-time, short-lived, high blast radius — it reads
files, runs `npm install`, generates source), and (2) the **vite
preview** (runtime, long-lived, serves the generated React bundle
over HTTP through a per-project URL). These two contexts have very
different threat profiles and very different performance budgets, but
share one ask: **the process should see a small, synthetic world, not
the real host.**

Today only (2) is properly jailed. (1) runs as the `doable` system user
in the API process's own namespace, with full read access to `/proc`,
`/etc/passwd`, `/opt/doable`, and uncapped outbound network. The
existing `packages/dovault/` already has the abstraction shape and
several backend stubs (bubblewrap, psroot, sandbox-exec, systemd,
gvisor) — the work in this PRD is to **finish the abstraction, route
all spawns through it, and make backend selection an operator
choice.**

## Outcomes if we land this

1. The AI's `cat /proc/cpuinfo` returns a synthetic single-core
   string (or nothing at all).
2. The AI's `cat /etc/passwd` returns only the project's synthetic
   user.
3. The AI's `ls /opt/doable` returns "No such file or directory".
4. The AI's `curl ipinfo.io` is blocked (or returns a configured
   stub) when network policy says deny.
5. A workspace admin can pick a different backend (psroot vs bwrap)
   per-environment via `doable admin` or a settings.yaml.
6. The chosen backend, the layers it actually provides, and the
   layers Doable adds on top are all visible at startup so operators
   can audit "what isolation am I actually getting?"
7. Migration is reversible — the old non-jailed path remains until
   the new path is shown stable across two release cycles.

## Out of scope

- VM-grade isolation per AI call (Firecracker, Kata) — discussed in
  chapter 03 only for comparison. The latency cost (100 ms+ per
  spawn) is unacceptable for the AI's tool loop.
- Network-level multi-tenant separation (separate VLANs per
  workspace). Doable runs on a single host today; revisit when we
  shard.
- Replacing the Copilot SDK. We register a Doable-owned bash tool
  that runs through the new layer, and deny the SDK's built-in one
  via the existing permission hook (see chapter 13).
- The doable-CLI UI for editing rules — that lives in the
  doablechore repo, not here. This PRD specifies the API shape it
  consumes.

## Why now

- Concrete leak observed: projects
  `61f90528-5414-48db-84b2-ff6354b979ea` and
  `ae6930ab-8171-4bb0-876e-47a9a7e458af` ship host snapshots to
  every viewer. This is a "fix immediately" class incident in any
  product with non-vetted users.
- The existing sandbox allowlist scaffold (Migration 073) gives us
  a clean policy plane, but no enforcement point for the AI shell
  tool. The architecture this PRD describes is what would make 073
  effective.
- The `dovault` abstraction already exists. The cost of doing this
  *now* is much lower than after another year of code paths bypass
  it.

## Success criteria (acceptance for the eventual implementation)

The PRD's job is the design; this is what "done" looks like for the
implementation that follows it.

| Criterion | Test |
|---|---|
| AI can no longer read host `/proc/cpuinfo` | Tool-call escape harness runs `cat /proc/cpuinfo`; output is the synthetic profile, not Intel i7-7700K |
| AI can no longer enumerate host users | `cat /etc/passwd` returns only `project:x:65534:65534:project:/work:/bin/sh` (or equivalent) |
| AI can no longer enumerate other tenants | `ls /opt/doable/services/api/projects/` returns ENOENT or empty |
| Backend is switchable at runtime | `DOVAULT_BACKEND=psroot pnpm dev:api` swaps backend; logs the layer matrix at boot |
| Backend missing on host fails loud | Setting `DOVAULT_BACKEND=podman` on a host without Podman installed exits at boot with a clear "missing backend binary" |
| Workspace policy can deny tools | Admin adds `rule_type='tool', pattern='install:lodash', action='deny'`; AI's install_package returns the deny verdict |
| Network egress can be locked down | Workspace admin sets `network_default_action='deny'` + allow rules for registry/github; AI's `curl ipinfo.io` blocked |
| No regression in vite preview | Existing per-project preview keeps working, same latency budget (±10%) |

## Reading map for this PRD

Each chapter is intended to stand alone. Cross-references are by chapter
number. If you only have 30 minutes, read 00 → 02 → 06 → 13. The rest
are deeper dives.
