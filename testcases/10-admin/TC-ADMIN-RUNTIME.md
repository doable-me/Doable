# TC-ADMIN-RUNTIME — Systemd Unit Management

Scope: `/admin/runtime`. Lists Doable systemd units (api, web, ws, doable.service, cloudflared, per-project units). Actions: start/stop/restart/status, journal tail.

---

## TC-ADMIN-RUNTIME-001
- Pre: Admin on Linux server.
- Steps: GET `/admin/runtime`.
- Expected: Lists units with name, ActiveState, SubState, MemoryCurrent, CPUUsageNSec, last restart.
- Severity: P0

## TC-ADMIN-RUNTIME-002
- Pre: Non-admin.
- Expected: 403.
- Severity: P0

## TC-ADMIN-RUNTIME-003
- Pre: Admin.
- Steps: Click "Restart" on doable.service.
- Expected: 2-step confirmation; admin_audit_log entry; tmux session restarts; brief downtime banner shown.
- Severity: P0

## TC-ADMIN-RUNTIME-004
- Pre: Admin.
- Steps: Click "Stop" on web.
- Expected: Confirmation w/ impact warning; on confirm, web stops; users get 502 from Caddy until start.
- Severity: P0

## TC-ADMIN-RUNTIME-005
- Pre: Admin.
- Steps: Click "Start" on stopped api.
- Expected: Unit starts; ActiveState transitions to active.
- Severity: P0

## TC-ADMIN-RUNTIME-006
- Pre: Admin.
- Steps: Click "Status".
- Expected: Inline panel shows `systemctl status` output last 50 lines.
- Severity: P1

## TC-ADMIN-RUNTIME-007
- Pre: Admin.
- Steps: Click "Tail journal" on api.
- Expected: SSE stream of `journalctl -u api -f`; respects throttling; closes on navigate.
- Severity: P1

## TC-ADMIN-RUNTIME-008
- Pre: Admin.
- Steps: Tail journal for non-existent unit.
- Expected: 404; no 500.
- Severity: P2

## TC-ADMIN-RUNTIME-009
- Pre: Admin attempts to start unrelated system unit (e.g., sshd).
- Expected: Allowlist enforced; only Doable-managed units accepted; 403 otherwise.
- Severity: P0

## TC-ADMIN-RUNTIME-010
- Pre: Admin.
- Steps: Inject `;rm -rf /` in unit name.
- Expected: Strict regex on unit name; rejected at API boundary; security_finding recorded.
- Severity: P0

## TC-ADMIN-RUNTIME-011
- Pre: Admin in non-Linux env (dev mac/win).
- Expected: Page shows "Runtime management only available on Linux server"; controls disabled.
- Severity: P2

## TC-ADMIN-RUNTIME-012
- Pre: Admin.
- Steps: Verify systemd-run uses correct user (not root) for per-project units.
- Expected: Per-project units run as confined user; main services may run as systemd's configured user.
- Severity: P0

## TC-ADMIN-RUNTIME-013
- Pre: Admin.
- Steps: View unit detail for `doable-vite@<projectId>`.
- Expected: Unit type=service; restart policy on-failure; sandbox env vars.
- Severity: P1

## TC-ADMIN-RUNTIME-014
- Pre: Admin restarts cloudflared.
- Expected: Tunnel reconnects within ~10s; published URLs continue working after reconnect.
- Severity: P0

## TC-ADMIN-RUNTIME-015
- Pre: Admin tries reboot host.
- Expected: Not exposed via UI; only systemd unit operations allowed.
- Severity: P0

## TC-ADMIN-RUNTIME-016
- Pre: Admin filter unit-state=failed.
- Expected: Only failed units shown.
- Severity: P1

## TC-ADMIN-RUNTIME-017
- Pre: Admin views memory usage column.
- Expected: Bytes formatted MB/GB; refresh every 5s.
- Severity: P3

## TC-ADMIN-RUNTIME-018
- Pre: Admin sets refresh interval to 1s.
- Expected: Polling backs off if browser tab inactive.
- Severity: P3

## TC-ADMIN-RUNTIME-019
- Pre: Admin clicks "Reload" (systemd daemon-reload).
- Expected: 2-step confirmation; runs reload; success toast.
- Severity: P1

## TC-ADMIN-RUNTIME-020
- Pre: Admin verifies all actions audited.
- Expected: Every start/stop/restart/reload writes admin_audit_log row with unit name and outcome.
- Severity: P0

## TC-ADMIN-RUNTIME-021
- Pre: Admin under reboot scenario.
- Expected: After host reboot, doable.service starts; per-project units NOT auto-started until first preview hit.
- Severity: P1

## TC-ADMIN-RUNTIME-022
- Pre: Admin.
- Steps: Restart doable while user editor is open.
- Expected: Editor reconnects WS within 30s; no data loss (Yjs CRDT).
- Severity: P0

## TC-ADMIN-RUNTIME-023
- Pre: Admin tries to delete a unit file via UI.
- Expected: Not exposed; only manage state.
- Severity: P0

## TC-ADMIN-RUNTIME-024
- Pre: Admin sees a unit in `activating` state.
- Expected: Spinner; status updates as transition completes.
- Severity: P2

## TC-ADMIN-RUNTIME-025
- Pre: Admin.
- Steps: Verify D-Bus auth path used.
- Expected: API uses systemd1 D-Bus with PolicyKit grant for the doable user; no shell-out to bash.
- Severity: P1

## TC-ADMIN-RUNTIME-026
- Pre: Admin restarts ws.
- Expected: WS clients reconnect; Yjs y-websocket auto-syncs once back.
- Severity: P1

## TC-ADMIN-RUNTIME-027
- Pre: Admin checks Caddy unit (if managed).
- Expected: Listed; restart works; published sites momentarily 502.
- Severity: P1

## TC-ADMIN-RUNTIME-028
- Pre: Admin.
- Steps: Search unit by name "vite".
- Expected: Filters by partial match.
- Severity: P2

## TC-ADMIN-RUNTIME-029
- Pre: Admin clicks "Drain" on per-project unit.
- Expected: Stops accepting new connections then SIGTERM after grace period.
- Severity: P2

## TC-ADMIN-RUNTIME-030
- Pre: Admin sees unit failure with non-zero exit.
- Expected: Failure reason shown; "View logs" jumps to journal at the failure timestamp.
- Severity: P1
