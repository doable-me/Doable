# TC-RUNTIME-SYSTEMD — Per-Project Systemd Unit Lifecycle

Scope: Systemd template `doable-vite@.service`, transient units, lifecycle controls (start, stop, restart, status), dovault sandboxing.

---

## TC-RUNTIME-SYSTEMD-001
- Pre: Linux server; systemd available.
- Steps: First preview hits backend.
- Expected: `systemd-run` (transient) or template instance starts; unit name `doable-vite@<projectId>.service`.
- Severity: P0

## TC-RUNTIME-SYSTEMD-002
- Pre: Stop unit.
- Expected: `systemctl stop` returns success; ActiveState=inactive; SubState=dead.
- Severity: P0

## TC-RUNTIME-SYSTEMD-003
- Pre: Restart unit.
- Expected: New MainPID; old PID terminated; clean transition.
- Severity: P0

## TC-RUNTIME-SYSTEMD-004
- Pre: Status query.
- Expected: Returns ActiveState, SubState, MemoryCurrent, MainPID.
- Severity: P1

## TC-RUNTIME-SYSTEMD-005
- Pre: Unit defined with `ProtectSystem=strict`, `ProtectHome=yes`, `NoNewPrivileges=yes`.
- Expected: Verified in `systemctl show` output.
- Severity: P0

## TC-RUNTIME-SYSTEMD-006
- Pre: Unit `RestartSec=5s`, `Restart=on-failure`.
- Expected: Crash → restart with backoff.
- Severity: P1

## TC-RUNTIME-SYSTEMD-007
- Pre: Unit ReadWritePaths includes only project dir.
- Expected: Cannot write outside; verified by attempting writeto /tmp/foo from inside.
- Severity: P0

## TC-RUNTIME-SYSTEMD-008
- Pre: Unit InaccessiblePaths includes other project dirs.
- Expected: Cannot read other projects.
- Severity: P0

## TC-RUNTIME-SYSTEMD-009
- Pre: Unit run as confined user (not root).
- Expected: `ps -o user` shows non-root user; UID corresponds to dovault sandbox user.
- Severity: P0

## TC-RUNTIME-SYSTEMD-010
- Pre: Unit drops capabilities.
- Expected: `CapabilityBoundingSet=` empty or minimal; `AmbientCapabilities=` not set.
- Severity: P0

## TC-RUNTIME-SYSTEMD-011
- Pre: Unit memory limit (e.g., MemoryMax=1G).
- Expected: cgroup memory.max=1073741824; kill on overrun.
- Severity: P1

## TC-RUNTIME-SYSTEMD-012
- Pre: Unit CPU quota (CPUQuota=100%).
- Expected: cgroup cpu.max set; throttled.
- Severity: P1

## TC-RUNTIME-SYSTEMD-013
- Pre: Unit network restriction.
- Expected: `IPAddressDeny=any`, `IPAddressAllow=` allowlist; or via Squid egress.
- Severity: P0

## TC-RUNTIME-SYSTEMD-014
- Pre: Unit timer-based eviction.
- Expected: idle timer is part of doable supervisor, not systemd Timer; supervisor calls stop.
- Severity: P1

## TC-RUNTIME-SYSTEMD-015
- Pre: Stop hook with grace.
- Expected: TimeoutStopSec=30; SIGTERM then SIGKILL.
- Severity: P1

## TC-RUNTIME-SYSTEMD-016
- Pre: Server reboot.
- Expected: Per-project units NOT auto-started; doable.service starts and waits for first preview hit.
- Severity: P1

## TC-RUNTIME-SYSTEMD-017
- Pre: doable.service configured.
- Expected: Wraps tmux session `doable` with windows api/web/ws; restarts on failure.
- Severity: P0

## TC-RUNTIME-SYSTEMD-018
- Pre: cloudflared.service present.
- Expected: ExecStart points to tunnel config; restart on failure.
- Severity: P0

## TC-RUNTIME-SYSTEMD-019
- Pre: Unit list via D-Bus org.freedesktop.systemd1.
- Expected: API uses D-Bus, not shell `systemctl` invocation, to avoid command injection.
- Severity: P0

## TC-RUNTIME-SYSTEMD-020
- Pre: Sandbox: SystemCallFilter restricts dangerous syscalls (ptrace, mount, etc.).
- Expected: `seccomp` filter active; verified by attempting blocked syscall.
- Severity: P0

## TC-RUNTIME-SYSTEMD-021
- Pre: Sandbox: PrivateNetwork=no but with IP filters.
- Expected: Either private or filtered; both prevent cross-tenant LAN access.
- Severity: P0

## TC-RUNTIME-SYSTEMD-022
- Pre: Sandbox: PrivateTmp=yes.
- Expected: /tmp isolated per unit.
- Severity: P0

## TC-RUNTIME-SYSTEMD-023
- Pre: DOABLE_HARDENING=full.
- Expected: All sandbox flags active; deviation logged as security_finding.
- Severity: P0

## TC-RUNTIME-SYSTEMD-024
- Pre: DOABLE_HARDENING=relaxed.
- Expected: Some flags relaxed (e.g., NoNewPrivileges still on); never bound to public.
- Severity: P0

## TC-RUNTIME-SYSTEMD-025
- Pre: DOABLE_HARDENING=off.
- Expected: Only allowed in dev; refuses to start in env=production; admin alerted.
- Severity: P0

## TC-RUNTIME-SYSTEMD-026
- Pre: DOVAULT_BACKEND=systemd on Linux.
- Expected: Spawn via systemd-run.
- Severity: P0

## TC-RUNTIME-SYSTEMD-027
- Pre: DOVAULT_BACKEND=bubblewrap on Linux.
- Expected: Alternative path used; same isolation guarantees.
- Severity: P0

## TC-RUNTIME-SYSTEMD-028
- Pre: DOVAULT_BACKEND=psroot on Windows.
- Expected: Windows-specific isolation invoked.
- Severity: P0

## TC-RUNTIME-SYSTEMD-029
- Pre: DOVAULT_BACKEND=sandbox-exec on macOS.
- Expected: Mac-specific isolation invoked.
- Severity: P0

## TC-RUNTIME-SYSTEMD-030
- Pre: Unsupported DOVAULT_BACKEND.
- Expected: Refuses to start; clear error.
- Severity: P1

## TC-RUNTIME-SYSTEMD-031
- Pre: Mistakenly try to use Docker as backend.
- Expected: Rejected — Docker is not supported as dovault backend.
- Severity: P1

## TC-RUNTIME-SYSTEMD-032
- Pre: dovault.spawn API.
- Expected: Centralized spawn; no callsites bypass it (e.g., raw `child_process.spawn` for project code).
- Severity: P0

## TC-RUNTIME-SYSTEMD-033
- Pre: Verify vite-jail/sandbox does NOT bypass dovault.spawn.
- Expected: Uses dovault; per dodev_security_posture finding.
- Severity: P0

## TC-RUNTIME-SYSTEMD-034
- Pre: Unit env file permissions.
- Expected: 0600 owned by doable user; not readable by sandboxed UID.
- Severity: P0

## TC-RUNTIME-SYSTEMD-035
- Pre: All public services run as non-root user.
- Expected: api, web, ws systemd services User= specified; not root.
- Severity: P0

## TC-RUNTIME-SYSTEMD-036
- Pre: Verify journald rate limit per unit.
- Expected: RateLimitIntervalSec=30s, RateLimitBurst=1000; floods don't fill disk.
- Severity: P2

## TC-RUNTIME-SYSTEMD-037
- Pre: Unit log rotation.
- Expected: SystemMaxUse=2G; oldest pruned.
- Severity: P2

## TC-RUNTIME-SYSTEMD-038
- Pre: Concurrent unit creates same name.
- Expected: D-Bus returns "AlreadyExists"; supervisor handles gracefully.
- Severity: P1

## TC-RUNTIME-SYSTEMD-039
- Pre: After stop, `dovault` registry cleaned.
- Expected: Registry no longer lists project; subsequent preview spawns fresh.
- Severity: P1

## TC-RUNTIME-SYSTEMD-040
- Pre: Failover when systemd unavailable.
- Expected: Health check fails; api refuses preview; user sees maintenance message.
- Severity: P2
