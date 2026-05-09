# 05 — Dev preview spawn bypasses dovault.spawn (no systemd-stack hardening)

**Severity:** HIGH

tl;dr: Per-project Vite dev servers drop UID but skip the dovault systemd backend entirely — no MemoryMax, no CPUQuota, no ProtectSystem, no NoNewPrivs, no seccomp filter, full bounding capability set retained.

## Evidence

`/proc/<vitepid>/status` for a running preview child:

```
Uid:    10016   10016   10016   10016
NoNewPrivs:     0
Seccomp:        0
CapBnd: 000001ffffffffff
```

NoNewPrivs is 0 (setuid binaries reachable), Seccomp is 0 (no syscall filter), CapBnd is the full 41-bit mask (no bounding set reduction).

PRD `sandboxagnosticPRD/01-architecture.md` §5 explicitly flags this:

> Dev preview spawn caller — `services/api/src/projects/vite-jail.ts:128-220` (TODAY: bypasses dovault for the spawn itself; PROPOSED: route through `dovault.spawn` per `06-migration-plan.md` Phase 1).

Process tree confirms the bypass — the Vite child's PPID is the root `tsx` API process directly, with no intervening `systemd-run --scope` unit. There is no `run-r*.scope` cgroup for previews under `systemd-cgls`.

`DOVAULT_BACKEND` is unset in `/root/doable/.env`, so even if vite-jail were wired, `createVault()` in `packages/dovault/src/index.ts` would fall through to auto-detection.

Contrast: build-time spawn at `services/api/src/deploy/builder.ts:29-110` already routes through `dovault.spawn`. The API logs `[builder] Vault initialized (backend=systemd, fullIsolation=true)` at startup (`services/api/src/deploy/builder.ts:79-81`) — proof the backend works in this environment.

## Impact

For each PRD §4 invariant, the preview spawn fails:

- §4.1 stdout/stderr passthrough — preserved (vite-jail forwards), but only by accident.
- §4.2 idempotent UID acquisition — preserved (setpriv path).
- §4.3 fail-closed on identity exhaustion — preserved.
- §4.4 egress firewalled — NOT enforced from systemd side; depends entirely on the nft skuid rule (Finding 04). One regression there and previews go straight to the internet.
- §4.5 project dir owned by sandbox identity — preserved (independent of backend).
- §4.6 crash signals visible — partial; without a scope unit, OOM kills don't surface as `systemctl status` events.
- §4.7 backend selection observable — FAILS. No startup log for vite-jail; operators can't tell which backend (if any) wraps preview spawns.

What the missing systemd wrap actually costs:

- No `MemoryMax=1G` — one runaway preview can OOM the host. Observed: tmux peak swap 5.8 G during testing.
- No `CPUQuota=100%` — a preview build loop can starve the API and WS processes.
- No `ProtectSystem=strict` / `ReadOnlyPaths=/` — the UID-10016 process can read every world-readable file on the host (.env at 0644, /etc/passwd, other tenant project dirs if perms slip).
- No `ReadWritePaths=<jail>` — write surface is whatever the UID owns, not what we want it to own.
- No `NoNewPrivileges=true` — setuid root binaries (`/usr/bin/sudo`, `/usr/bin/passwd`, `/usr/bin/su`, mount helpers) are reachable. UID drop alone is shallow defense.
- No `SystemCallFilter` — full syscall surface, including `keyctl`, `bpf`, `ptrace`, `userfaultfd`, `mount`, `unshare`, `kexec_*`.
- Full `CapBnd` — any future privilege regression in node, vite, or a transitive dep silently fails open instead of being capped.

UID drop without any of the above is a 1990s `chroot` model — useful, but not what the dovault contract promises.

## Fix — implement PRD `06-migration-plan.md` Phase 1

1. Add `DOVAULT_BACKEND=systemd` to `/root/doable/.env`. Note the ordering dependency: this requires the non-root migration (Finding 02) first, because `systemd-run --scope` from a non-root user needs polkit rules or `systemctl --user`. Until then, set `DOVAULT_BACKEND=systemd` only after the API runs as `doable` with the right `AmbientCapabilities`.

2. Wire `services/api/src/projects/vite-jail.ts:128-220` through `dovault.spawn`:
   - Today vite-jail composes `[setpriv --reuid <uid> --regid <uid> --clear-groups, --, <pkg-mgr exec>]` and calls `child_process.spawn` directly.
   - Phase 1: hand the composed argv to `vault.spawn(cmd, args, opts)` from `packages/dovault/src/index.ts`.
   - The systemd backend prepends `systemd-run --scope --property=...` per `packages/dovault/src/backends/systemd.ts`.
   - Keep vite-jail's setpriv composition. PRD §6 explicitly says "we deliberately do NOT replace vite-jail's wrapping; backend just gets a pre-wrapped command to spawn". Don't push UID drop into the backend in this phase.

3. Pass systemd-run properties via `opts.resourceLimits` (or whatever the contract names them — see `sandboxagnosticPRD/02-dovault-backend-contract.md`):
   - `MemoryMax=1G` (dev preview default; build path can request 2G)
   - `CPUQuota=100%`
   - `ProtectSystem=strict`
   - `ReadWritePaths=<project_jail>`
   - `NoNewPrivileges=true`
   - `SystemCallFilter=@system-service` and explicit denies for `@cpu-emulation @debug @keyring @memlock @module @mount @raw-io @reboot @swap`
   - `PrivateTmp=true`
   - `ProtectHome=true`

4. Hardening level switch at `services/api/src/runtime/hardening-level.ts`: keep `shouldJail` opt-out for laptop dev. Production must be `full`. Refuse to start with `direct` backend when `NODE_ENV=production` (PRD §4.7 — backend selection must be observable AND policy-enforced).

5. Backend startup log, mirroring builder: log `[vite-jail] Vault initialized (backend=systemd)` once at first spawn, same shape as `services/api/src/deploy/builder.ts:79-81`. Operators should never have to `strace` to learn which backend is active.

6. Coordinate with Finding 02 (non-root services): this fix DEPENDS on the non-root migration. The `doable` user needs `CAP_SETUID` via systemd unit `AmbientCapabilities=CAP_SETUID CAP_SETGID`, OR a polkit rule allowing `systemd-run --uid=<sandbox_uid>` from `doable`. Pick one in the migration PR.

7. Coordinate with Finding 04 (egress jail): the systemd-stack should set `Environment=HTTP_PROXY=...` per Finding 04, but the actual enforcement is the nft `skuid` rule. Don't rely on either alone.

## Verification

```bash
# 1. Backend selection is set
grep DOVAULT_BACKEND /root/doable/.env
# expect: DOVAULT_BACKEND=systemd

# 2. After API restart, open a project preview, then:
VITEPID=$(pgrep -f "vite.js --host 127.0.0.1" | head -1)
grep -E "Uid|NoNewPrivs|Seccomp|CapBnd" /proc/$VITEPID/status
# expect:
#   Uid:        10016 10016 10016 10016   (or whichever sandbox UID)
#   NoNewPrivs: 1
#   Seccomp:    2                          (filter mode)
#   CapBnd:     0000000000000000           (or sharply reduced)

# 3. Scope unit per project visible in cgroup tree
systemd-cgls --no-pager | grep -A2 -E "doable|preview-|run-r"
# expect: a run-r<unitid>.scope per active preview

# 4. API startup log mentions vault init for vite-jail
journalctl -u doable --since "5 min ago" | grep -E "vite-jail.*Vault initialized"
# expect: [vite-jail] Vault initialized (backend=systemd)

# 5. Inspect properties on one live scope
SCOPE=$(systemctl list-units --type=scope --no-pager | grep run-r | head -1 | awk '{print $1}')
systemctl show "$SCOPE" -p MemoryMax,CPUQuotaPerSecUSec,ProtectSystem,ReadWritePaths,NoNewPrivileges,SystemCallFilter
# expect non-default values for each
```

## References

- `sandboxagnosticPRD/01-architecture.md` (full architecture; §4 invariants, §5 spawn caller table)
- `sandboxagnosticPRD/02-dovault-backend-contract.md` (the backend contract)
- `sandboxagnosticPRD/06-migration-plan.md` (Phase 1 — the actual migration steps)
- `services/api/src/projects/vite-jail.ts:128-220` (today's spawn site — the gap)
- `services/api/src/deploy/builder.ts:29-110` (working reference; already wired)
- `packages/dovault/src/index.ts` (`createVault`, auto-detect)
- `packages/dovault/src/backends/systemd.ts` (the backend that produces `systemd-run --scope` invocations)
- `services/api/src/runtime/hardening-level.ts` (`shouldJail`, `getHardeningLevel`)
- Sibling: `servertodo/02-services-as-root.md` (blocker — non-root migration must land first)
- Sibling: `servertodo/04-egress-jail.md` (nft skuid rule that compensates for the missing ProtectSystem in the meantime)
