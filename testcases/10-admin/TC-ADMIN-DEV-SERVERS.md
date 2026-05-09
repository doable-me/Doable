# TC-ADMIN-DEV-SERVERS — Active Vite Dev Servers

Scope: `/admin/dev-servers` showing running per-project Vite engines, ports, idle since, project, owner, controls (kill, restart). Backed by runtime registry.

---

## TC-ADMIN-DEV-SERVERS-001
- Pre: Admin; 3 dev servers running.
- Steps: GET `/admin/dev-servers`.
- Expected: List with: Project, Owner, PID/Unit, Port, Started at, Idle since, Memory MB, CPU %, Status.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-002
- Pre: Non-admin.
- Steps: GET endpoint.
- Expected: 403.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-003
- Pre: Admin; zero servers running.
- Expected: Empty state "No dev servers active"; KPIs show 0 / MAX_CONCURRENT_ENGINES.
- Severity: P2

## TC-ADMIN-DEV-SERVERS-004
- Pre: Admin; MAX_CONCURRENT_ENGINES=3, 3 running.
- Steps: User #4 attempts preview.
- Expected: Server queued or rejected with "capacity reached"; admin list shows 3/3 capacity.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-005
- Pre: Admin clicks "Stop" on a server.
- Expected: Confirmation; on confirm, systemd unit stopped; row disappears or marked stopped within 10s; audit row.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-006
- Pre: Admin clicks "Restart".
- Expected: Unit restarted; new PID shown; project still reachable post-restart.
- Severity: P1

## TC-ADMIN-DEV-SERVERS-007
- Pre: Admin.
- Steps: Click "Tail logs".
- Expected: Streams journald output; respects per-second update; 1k line cap.
- Severity: P2

## TC-ADMIN-DEV-SERVERS-008
- Pre: Admin.
- Steps: Filter by owner email.
- Expected: Subset matching; case-insensitive partial.
- Severity: P2

## TC-ADMIN-DEV-SERVERS-009
- Pre: Admin.
- Steps: Sort by Memory MB DESC.
- Expected: Heaviest server first.
- Severity: P2

## TC-ADMIN-DEV-SERVERS-010
- Pre: Admin.
- Steps: Sort by Idle since ASC.
- Expected: Most idle (oldest idle timestamp) first; useful for eviction debug.
- Severity: P2

## TC-ADMIN-DEV-SERVERS-011
- Pre: Admin; DEV_SERVER_IDLE_MS=300000 (5min).
- Steps: Wait 6 min after last preview hit.
- Expected: Server auto-evicted; row removed; activity_events `dev_server_evicted`.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-012
- Pre: Admin; DEV_SERVER_IDLE_MS overridden via env to 60000.
- Steps: Wait 90s.
- Expected: Eviction at ~60s.
- Severity: P1

## TC-ADMIN-DEV-SERVERS-013
- Pre: Admin watching list during traffic.
- Expected: Idle timer resets each preview hit; auto-refresh every 5s.
- Severity: P2

## TC-ADMIN-DEV-SERVERS-014
- Pre: Admin; DOABLE_HARDENING=full, DOVAULT_BACKEND=systemd.
- Steps: Inspect a unit.
- Expected: Unit confined under sandbox; `ProtectSystem=strict`, `NoNewPrivileges=yes`, listens on 127.0.0.1 port only.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-015
- Pre: Admin; DOABLE_HARDENING=relaxed.
- Expected: Unit still 127.0.0.1 bound; some restrictions relaxed (capabilities) but never bound to public.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-016
- Pre: Admin; DOABLE_HARDENING=off (dev only).
- Expected: Banner warns hardening off; refuse to enable in production env.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-017
- Pre: Admin.
- Steps: Click "Force kill".
- Expected: SIGKILL; row disappears within 5s; possible orphan port released.
- Severity: P1

## TC-ADMIN-DEV-SERVERS-018
- Pre: Admin; server crashed and stuck zombie.
- Steps: Click "Reap".
- Expected: Cleanup process invoked; port released; registry cleared.
- Severity: P1

## TC-ADMIN-DEV-SERVERS-019
- Pre: Admin viewing list while server is being created.
- Expected: Status "starting" → "running"; transition visible.
- Severity: P2

## TC-ADMIN-DEV-SERVERS-020
- Pre: Admin tries to bind unit to 0.0.0.0 via override.
- Expected: Rejected at config; security_finding logged; unit stays 127.0.0.1.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-021
- Pre: Admin.
- Steps: View server with port collision attempt.
- Expected: System retries different port; eventually succeeds; admin sees actual bound port.
- Severity: P1

## TC-ADMIN-DEV-SERVERS-022
- Pre: Admin.
- Steps: Verify per-project unit naming `doable-vite@<projectId>.service`.
- Expected: Unit name matches; isolated.
- Severity: P1

## TC-ADMIN-DEV-SERVERS-023
- Pre: Admin uses `ss -tlnp` on box.
- Expected: All bound to 127.0.0.1; never 0.0.0.0.
- Severity: P0

## TC-ADMIN-DEV-SERVERS-024
- Pre: Admin clicks owner email.
- Expected: Drills to user detail (if available).
- Severity: P3

## TC-ADMIN-DEV-SERVERS-025
- Pre: Admin.
- Steps: Click project name.
- Expected: Drill to /admin/projects/:id.
- Severity: P2

## TC-ADMIN-DEV-SERVERS-026
- Pre: Admin under heavy load (10 servers running).
- Expected: List query <500ms; no N+1.
- Severity: P2

## TC-ADMIN-DEV-SERVERS-027
- Pre: Admin.
- Steps: Trigger eviction manually via /api/admin/dev-servers/:id/evict.
- Expected: Honored; audit row.
- Severity: P1

## TC-ADMIN-DEV-SERVERS-028
- Pre: Admin.
- Steps: Verify CSV export.
- Expected: Snapshot of current servers.
- Severity: P3

## TC-ADMIN-DEV-SERVERS-029
- Pre: Admin sets MAX_CONCURRENT_ENGINES=0.
- Expected: All preview attempts rejected; existing servers may continue or all evicted (per policy).
- Severity: P1

## TC-ADMIN-DEV-SERVERS-030
- Pre: Admin.
- Steps: Drag column widths.
- Expected: Persisted across reload.
- Severity: P3
