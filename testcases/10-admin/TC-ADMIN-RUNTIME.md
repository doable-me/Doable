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

---

# Deep Functional Verification (031–050)

## TC-ADMIN-RUNTIME-031
**Title:** Dev server PID matches actual process
**Pre:** Admin logged in; one project has running dev server
**Steps:**
1. Navigate to /admin/runtime
2. Switch to Dev Servers tab
3. Note PID column value for the running server row
4. SSH to server; run `ps -p <PID> -o pid,comm,args`
**Expected:** Process exists with that exact PID; process is node/vite; not a stale/recycled PID.
**Severity:** Critical

## TC-ADMIN-RUNTIME-032
**Title:** Dev server memory reading matches /proc
**Pre:** Admin logged in; one project has running dev server with known PID
**Steps:**
1. Navigate to /admin/runtime → Dev Servers tab
2. Note the Memory column value (e.g. "48 MB") for a running server
3. SSH to server; run `cat /proc/<PID>/status | grep VmRSS`
4. Compare VmRSS value with the UI value
**Expected:** UI memory value is within ±5% of VmRSS from /proc; unit (MB) is correct; value is non-zero.
**Severity:** Critical

## TC-ADMIN-RUNTIME-033
**Title:** Dev server listen port matches ss output
**Pre:** Admin logged in; one project has running dev server
**Steps:**
1. Navigate to /admin/runtime → Dev Servers tab
2. Note the Listen (port) column value for the running server
3. SSH to server; run `ss -tlnp | grep <port>`
**Expected:** Port in UI matches actual listening port in ss output; port is in 3100–3200 range; PID in ss matches PID in UI.
**Severity:** Critical

## TC-ADMIN-RUNTIME-034
**Title:** Kill button actually terminates dev server process
**Pre:** Admin logged in; one project has running dev server; note its PID
**Steps:**
1. Navigate to /admin/runtime → Dev Servers tab
2. Click Kill button for the running dev server
3. Wait for UI to update (row disappears or status changes to "dead")
4. SSH to server; run `ps -p <PID>`
**Expected:** Process no longer exists; `ps` returns "no such process"; row shows dead status or is removed; no orphaned child processes remain.
**Severity:** Critical

## TC-ADMIN-RUNTIME-035
**Title:** Auto-refresh detects newly spawned dev server within 5s
**Pre:** Admin logged in; auto-refresh toggle is ON (default); no dev servers running for a test project
**Steps:**
1. Navigate to /admin/runtime → Dev Servers tab; note row count
2. In another tab, open a project and trigger preview (spawns dev server)
3. Wait up to 10 seconds without manually refreshing the runtime page
4. Observe the Dev Servers table
**Expected:** New row appears within 5–10 seconds showing the project name, PID, status "ready" (green), a port in 3100–3200, and non-zero memory; Total count in summary increments by 1.
**Severity:** Critical

## TC-ADMIN-RUNTIME-036
**Title:** Published app shows correct systemd unit state
**Pre:** Admin logged in; at least one published app with systemd unit active
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Note the status badge and PID/Unit column for a running app
3. SSH to server; run `systemctl is-active <unit-name>` and `systemctl show <unit-name> --property=MainPID`
**Expected:** UI status badge matches systemctl is-active output (active = green "Running"); PID in UI matches MainPID from systemctl show.
**Severity:** Critical

## TC-ADMIN-RUNTIME-037
**Title:** Published app memory from cgroup matches reality
**Pre:** Admin logged in; one published app running as systemd unit
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Note the Memory column value for the running app
3. SSH to server; run `systemctl show <unit-name> --property=MemoryCurrent`
4. Compare cgroup memory with UI value
**Expected:** UI memory value matches MemoryCurrent from cgroup within ±5%; value is non-zero; units are correct (KB/MB).
**Severity:** Critical

## TC-ADMIN-RUNTIME-038
**Title:** Published app CPU% is non-zero for active app serving traffic
**Pre:** Admin logged in; one published app actively serving requests
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Generate traffic to the published app (open it in browser, refresh several times)
3. Observe CPU% column for that app within 5s (auto-refresh)
**Expected:** CPU% shows a non-zero value (e.g. "0.3%", "1.2%"); value is not permanently stuck at "0%"; value fluctuates with load.
**Severity:** High

## TC-ADMIN-RUNTIME-039
**Title:** Restart assigns new PID to published app
**Pre:** Admin logged in; one published app running; note current PID
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Note current PID for the app
3. Click Restart action; confirm in dialog
4. Wait for status to return to "Running" (green)
5. Note new PID
**Expected:** New PID is different from old PID; status transitions through restarting→running; Uptime resets to 0s/just now; Memory value is present.
**Severity:** Critical

## TC-ADMIN-RUNTIME-040
**Title:** Stop changes published app state badge from Running to Stopped
**Pre:** Admin logged in; one published app in "Running" state (green badge)
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Note the app row shows green "Running" badge
3. Click Stop action; confirm in dialog
4. Wait for UI to update
**Expected:** Badge changes to "Stopped" (grey/neutral); PID/Unit shows "–" or empty; Memory and CPU% show "–"; app URL returns 502; Summary "Running ✓" count decrements by 1 and "Stopped ○" increments by 1.
**Severity:** Critical

## TC-ADMIN-RUNTIME-041
**Title:** Logs modal shows actual systemd journal entries
**Pre:** Admin logged in; one published app running with recent activity
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Click Logs action for the running app
3. Observe the modal content
**Expected:** Modal opens with scrollable log output; logs contain real journal entries with timestamps; entries include stdout/stderr from the app process; logs are not empty; most recent entry is within last few minutes.
**Severity:** Critical

## TC-ADMIN-RUNTIME-042
**Title:** Egress modal shows network connections for published app
**Pre:** Admin logged in; one published app running and actively serving connections
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Click Egress action for the running app
3. Observe the modal content
**Expected:** Modal opens showing network connection visualization; displays outbound connections (if any) with destination IPs/ports; shows listening socket; data is from actual `ss` or netstat output, not placeholder.
**Severity:** High

## TC-ADMIN-RUNTIME-043
**Title:** Restart confirmation dialog actually restarts on confirm
**Pre:** Admin logged in; one published app running; note PID and uptime
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Click Restart for a running app
3. Confirmation dialog appears — click Cancel; verify nothing changes
4. Click Restart again — click Confirm
5. Wait for completion
**Expected:** Cancel leaves app untouched (same PID, same uptime); Confirm triggers actual restart; PID changes; uptime resets; status briefly shows "restarting" then "running"; SSH `systemctl show --property=MainPID` confirms new PID.
**Severity:** Critical

## TC-ADMIN-RUNTIME-044
**Title:** Stop with active users shows impact warning count
**Pre:** Admin logged in; one published app running; at least 1 user currently has the app open in browser
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Click Stop for the app that has active users
3. Observe the confirmation dialog
**Expected:** Dialog shows warning about active users/connections that will be affected; count of active connections is non-zero and matches reality; dialog text is not generic but specific to the app being stopped.
**Severity:** High

## TC-ADMIN-RUNTIME-045
**Title:** Logs modal updates in real-time as app produces output
**Pre:** Admin logged in; Logs modal open for a running published app
**Steps:**
1. Open Logs modal for a running app
2. Note the last visible log line
3. Trigger activity on the app (e.g. make an HTTP request to it)
4. Watch the Logs modal without closing/reopening it
**Expected:** New log entries appear in the modal within 2–5 seconds without manual refresh; scroll position auto-follows to bottom if user was at bottom; new entries are highlighted or visually distinct; timestamp on new entries is current.
**Severity:** High

## TC-ADMIN-RUNTIME-046
**Title:** Dev Servers summary Total count matches table row count
**Pre:** Admin logged in; multiple dev servers running (at least 3)
**Steps:**
1. Navigate to /admin/runtime → Dev Servers tab
2. Read Total count from summary row
3. Count actual rows in the table
**Expected:** Summary Total exactly equals the number of table rows; no off-by-one; includes both alive and dead servers in total if dead are shown.
**Severity:** Critical

## TC-ADMIN-RUNTIME-047
**Title:** Dev Servers summary Alive count matches green status rows
**Pre:** Admin logged in; mix of alive and dead dev servers visible
**Steps:**
1. Navigate to /admin/runtime → Dev Servers tab
2. Read "Alive ✓" count from summary row
3. Count rows with green "ready" status badge in the table
**Expected:** Alive count exactly equals number of rows with green/ready status; dead/starting servers are not counted in Alive; if a server dies during viewing, count updates on next auto-refresh.
**Severity:** Critical

## TC-ADMIN-RUNTIME-048
**Title:** Dev Servers summary Total RAM equals sum of individual row memory values
**Pre:** Admin logged in; multiple dev servers running with memory displayed
**Steps:**
1. Navigate to /admin/runtime → Dev Servers tab
2. Read Total RAM from summary row (e.g. "256 MB")
3. Add up all individual Memory values from each table row
**Expected:** Total RAM in summary equals arithmetic sum of all individual row memory values (within ±1 MB rounding tolerance); units are consistent; zero-memory rows (dead servers) do not inflate the sum.
**Severity:** High

## TC-ADMIN-RUNTIME-049
**Title:** Published Apps summary Failed count matches red status rows
**Pre:** Admin logged in; at least one published app in failed state (crashed or exited non-zero)
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab
2. Read "Failed ✗" count from summary row
3. Count rows with red "Failed" status badge in the table
4. Use State filter dropdown to filter by "failed" and count
**Expected:** Failed count in summary exactly equals number of red/failed rows in full table; filtering by "failed" shows same count; SSH `systemctl list-units --state=failed` for doable app units confirms the count.
**Severity:** Critical

## TC-ADMIN-RUNTIME-050
**Title:** Summary cards update within 5s of state change
**Pre:** Admin logged in; auto-refresh ON; note current summary values (Total, Running, Stopped counts)
**Steps:**
1. Navigate to /admin/runtime → Published Apps tab; note summary card values
2. SSH to server; manually stop one running app unit: `systemctl stop <unit>`
3. Watch the summary cards on the runtime page without manual refresh
4. Time how long until Running count decrements and Stopped count increments
**Expected:** Summary cards update within 5–10 seconds (matching auto-refresh interval); Running count decreases by 1; Stopped count increases by 1; Total remains unchanged; no full page reload occurs — only data refreshes.
**Severity:** Critical
