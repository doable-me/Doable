# BUG-DEV-WS-OOM-001 — WS process OOM-killed; watchdog broken by PrivateTmp

**Severity:** medium
**Status:** FIXED 2026-05-13
**Target:** https://dev-ws.doable.me
**Found:** 2026-05-13 by Ralph R9 (dev probe)
**Fixed by:** commits 91282a7 + manual tmux restart

## Summary
The WebSocket server on dev (pnpm dev:ws in tmux pane doable:ws) was OOM-killed after ~14 hours of uptime, returning 502 for hours. The systemd watchdog service designed to detect and restart the process was silently broken on two fronts:

1. **Permission issue**: watchdog.sh wrote to `/var/log/doable-watchdog.log`, but user `doable` had no write permission → script exited 0 (silent success) → systemd never escalated.
2. **Namespace isolation**: watchdog.service ran under `PrivateTmp` while checking `tmux has-session -t doable`, but the doable.service tmux socket lived in doable.service's PrivateTmp namespace, invisible to the watchdog's isolated namespace → session check always failed.

## Reproduction
1. On dodev, inspect doable-watchdog.service systemd unit.
2. Check `ss -tlnp | grep ws` — no listening socket on :3001 (WS crashed).
3. Check tmux doable:ws window — process exited 137 (OOM) ~14h prior.
4. Attempt to curl https://dev-ws.doable.me/ → 502 Bad Gateway.

## Expected
Watchdog should detect OOM within 1 minute, log to a writable location, and spawn `tmux send-keys -t doable:ws "pnpm dev:ws" Enter` to auto-restart the process.

## Actual
- Watchdog log entries are not written (permission denied silently).
- `tmux has-session -t doable` fails due to namespace isolation.
- systemd sees exit code 0 and does not escalate or restart.
- WS remains dead, 502 persists for hours.

## Root Cause (CONFIRMED)
Two separate bugs in `services/api/scripts/watchdog.sh` and its systemd service wrapper:

1. **Log path issue**: watchdog.sh writes to `/var/log/doable-watchdog.log` (world-readable only; user `doable` cannot write). Should be `/var/log/doable/watchdog.log` with proper ownership.
2. **Namespace isolation**: `doable-watchdog.service` does not have `JoinsNamespaceOf=doable.service`, so its PrivateTmp is independent of doable.service's PrivateTmp, making `tmux has-session -t doable` fail (socket is invisible).

## Fix Applied
**PR:** fix/watchdog-tmux-namespace (commit 91282a7)

1. Updated `services/api/scripts/watchdog.sh` to write `/var/log/doable/watchdog.log`.
2. Updated `setup-server.sh` to:
   - Create `/var/log/doable` directory with `chmod 755 doable:doable`.
   - Set `JoinsNamespaceOf=doable.service` on doable-watchdog.service.
   - Set `PrivateTmp=true` on doable-watchdog.service (so it shares doable.service's namespace).
3. Fresh servers via `setup-server.sh` now ship with correct watchdog configuration.

**Manual remediation on dodev (2026-05-13):**
- Restarted pnpm dev:ws in tmux pane doable:ws.
- Verified `curl https://dev-ws.doable.me/` → 404 (expected; app-layer response, not 502).

## Underlying OOM Cause (UNINVESTIGATED)
Why does pnpm dev:ws OOM after 14 hours? Possible leak in Yjs/awareness or event listeners. Needs heap profiling on next occurrence. This bug only tracks the watchdog failure; the leak itself is deferred.

## Evidence
- Commit 91282a7: watchdog.sh + setup-server.sh changes.
- dodev tmux pane doable:ws history (WS process restarted 2026-05-13).
- `/var/log/doable/watchdog.log` now writable and actively logging on dodev.

## Filed by
Ralph R9 (dev probe round)

## Filed date
2026-05-13
