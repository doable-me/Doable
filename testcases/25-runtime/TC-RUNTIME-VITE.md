# TC-RUNTIME-VITE — Per-Project Vite Dev Server Lifecycle

Scope: Vite dev server starts on first preview, evicts after `DEV_SERVER_IDLE_MS`, capped by `MAX_CONCURRENT_ENGINES`.

---

## TC-RUNTIME-VITE-001
- Pre: User opens project preview for first time.
- Expected: Vite dev server spawned; bound 127.0.0.1; port allocated; preview URL proxied via WS/HTTP tunnel.
- Severity: P0

## TC-RUNTIME-VITE-002
- Pre: Preview hit while server already running.
- Expected: Reuses existing server; no new spawn; idle timer reset.
- Severity: P0

## TC-RUNTIME-VITE-003
- Pre: Server idle for DEV_SERVER_IDLE_MS (default 300000).
- Expected: Auto-evicted; SIGTERM then SIGKILL after grace; port released; activity_events `dev_server_evicted`.
- Severity: P0

## TC-RUNTIME-VITE-004
- Pre: DEV_SERVER_IDLE_MS=60000 override.
- Expected: Eviction at ~60s of no preview hits.
- Severity: P1

## TC-RUNTIME-VITE-005
- Pre: MAX_CONCURRENT_ENGINES=3; 3 servers running.
- Steps: User #4 attempts preview.
- Expected: Either queued with progress UI or rejected with "capacity reached"; LRU eviction may happen first.
- Severity: P0

## TC-RUNTIME-VITE-006
- Pre: MAX_CONCURRENT_ENGINES=3; 3 running including user A's.
- Steps: User A spins additional project.
- Expected: Per-user quota may permit; if global cap reached, user A's oldest evicted (LRU).
- Severity: P1

## TC-RUNTIME-VITE-007
- Pre: User edits file; HMR active.
- Expected: Vite HMR pushes change; idle timer NOT counted as idle (active connection).
- Severity: P0

## TC-RUNTIME-VITE-008
- Pre: User closes preview tab.
- Expected: Server stays for grace period (idle timer); evicted after timeout.
- Severity: P1

## TC-RUNTIME-VITE-009
- Pre: User invokes preview after eviction.
- Expected: New server spawned (cold start); first hit slower; subsequent hits fast.
- Severity: P0

## TC-RUNTIME-VITE-010
- Pre: Server crashes mid-session.
- Expected: Crashed unit auto-restarted by systemd policy (on-failure max 3); user sees "reconnecting".
- Severity: P1

## TC-RUNTIME-VITE-011
- Pre: Server crashes 3 times in N minutes.
- Expected: Restart-rate limit kicks in; status=failed; admin alerted; user gets clear error.
- Severity: P1

## TC-RUNTIME-VITE-012
- Pre: Vite needs to install npm deps on first start.
- Expected: Install runs in sandbox; status communicated via WS/SSE; preview URL waits.
- Severity: P0

## TC-RUNTIME-VITE-013
- Pre: Install fails (network down).
- Expected: User sees actionable error; no infinite spinner; logs available to admin.
- Severity: P1

## TC-RUNTIME-VITE-014
- Pre: Server bound to 127.0.0.1 only.
- Steps: Verify with `ss -tlnp`.
- Expected: Listen on 127.0.0.1:<port>; never 0.0.0.0.
- Severity: P0

## TC-RUNTIME-VITE-015
- Pre: External request to port directly.
- Expected: Refused (only loopback); proxied requests via WS server require auth.
- Severity: P0

## TC-RUNTIME-VITE-016
- Pre: User without project access tries preview URL.
- Expected: 403; cannot access another user's dev server.
- Severity: P0

## TC-RUNTIME-VITE-017
- Pre: Vite dev server config from project.
- Expected: Uses project-specified vite.config; ignores untrusted plugins per allowlist.
- Severity: P1

## TC-RUNTIME-VITE-018
- Pre: User adds large dependency; install slow.
- Expected: Progress shown; timeout after configured limit (e.g., 10min); user can cancel.
- Severity: P2

## TC-RUNTIME-VITE-019
- Pre: User edits file producing infinite recompile.
- Expected: HMR throttled; admin can detect via /admin/dev-servers CPU column.
- Severity: P2

## TC-RUNTIME-VITE-020
- Pre: Verify dovault sandbox env vars set.
- Expected: DOABLE_HARDENING=full, DOVAULT_BACKEND=systemd seen in unit Environment.
- Severity: P0

## TC-RUNTIME-VITE-021
- Pre: Sandbox file restrictions.
- Expected: Vite can only read/write project's data dir; cannot access /etc, /root, other projects' dirs.
- Severity: P0

## TC-RUNTIME-VITE-022
- Pre: Sandbox network restrictions.
- Expected: Egress restricted per policy (Squid allowlist); npm registry allowed; arbitrary internet blocked if hardening=full.
- Severity: P0

## TC-RUNTIME-VITE-023
- Pre: User publishes fake "vite" plugin that tries reading host /etc.
- Expected: Sandbox blocks; build fails; security_finding.
- Severity: P0

## TC-RUNTIME-VITE-024
- Pre: User uses `process.exit` in vite plugin.
- Expected: Server respawns up to limit; not catastrophic.
- Severity: P2

## TC-RUNTIME-VITE-025
- Pre: WS bridge between user browser and Vite HMR.
- Expected: Multiplexed via Doable WS server; auth token verified per message.
- Severity: P0

## TC-RUNTIME-VITE-026
- Pre: User reload browser.
- Expected: Browser reconnects to existing dev server; full reload.
- Severity: P1

## TC-RUNTIME-VITE-027
- Pre: Vite memory ~1GB.
- Expected: Per-unit memory limit enforced (cgroup); kill on overrun; user notified.
- Severity: P1

## TC-RUNTIME-VITE-028
- Pre: Vite CPU 100% sustained.
- Expected: cgroup CPU quota; throttled; admin sees alert.
- Severity: P1

## TC-RUNTIME-VITE-029
- Pre: Idle timer behavior with multiple browser tabs.
- Expected: Any active tab keeps server alive; eviction only after all tabs closed for idle period.
- Severity: P1

## TC-RUNTIME-VITE-030
- Pre: Server start time SLA.
- Expected: Cold start <10s p95; warm start (cached deps) <2s.
- Severity: P2

## TC-RUNTIME-VITE-031
- Pre: Two users on same project (collaborators) share dev server?
- Expected: Per-project (not per-user) — single server serves all members.
- Severity: P1

## TC-RUNTIME-VITE-032
- Pre: Verify port range allocation deterministic.
- Expected: Random port in registered range (e.g., 50000-60000); no collision with system ports.
- Severity: P1

## TC-RUNTIME-VITE-033
- Pre: Preview URL contains short opaque token.
- Expected: URL not guessable; expires with session; cannot share with non-member.
- Severity: P0

## TC-RUNTIME-VITE-034
- Pre: User tries to fetch preview at someone else's token.
- Expected: 403.
- Severity: P0

## TC-RUNTIME-VITE-035
- Pre: Verify dev server unit is `Type=notify` or similar; ready signaled before tunnel proxy enabled.
- Severity: P1

## TC-RUNTIME-VITE-036
- Pre: Stop dev server via /api/runtime/dev/:projectId/stop.
- Expected: User-owner authorized; unit stopped gracefully.
- Severity: P1

## TC-RUNTIME-VITE-037
- Pre: Restart dev server via API.
- Expected: Unit restarted; new PID; previous unit drained.
- Severity: P1

## TC-RUNTIME-VITE-038
- Pre: Status endpoint /api/runtime/dev/:projectId/status.
- Expected: Returns running/stopped/starting + port + idle_since.
- Severity: P2

## TC-RUNTIME-VITE-039
- Pre: User exceeds per-project file watcher limit (inotify).
- Expected: Server logs the limit; admin can raise via sysctl; not crashed.
- Severity: P2

## TC-RUNTIME-VITE-040
- Pre: Verify systemd journald shows project_id label on logs.
- Expected: log entries tagged for filtering; admin sees per-project logs.
- Severity: P2
