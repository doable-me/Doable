# Bug 3 — WS server stdout detached from tmux on the dev box

**Severity:** 🟡 Medium (dev-ops, not a code bug)
**Area:** dev environment on this machine
**Discovered:** 2026-04-08 during audit
**Status:** Open

## Symptom

The tmux session `doable` has three windows (from `CLAUDE.md`): `api`, `web`, `ws`. During the audit:

- `doable:0` (`esbuild`, the API window) — correctly showed live `@doable/api:dev` output
- `doable:1` (`web-`) — correctly showed `@doable/web:dev` output
- `doable:2` (`ws-`) — **showed an idle shell prompt, no WS output at all**

But the WS server was running fine — port 4001 was listening, `/health` returned `{"status":"ok","rooms":1,"users":1}`, and the room stayed populated throughout the test. The process existed; its stdout was just not piped into `doable:2`.

Process inspection:
- pid 17240: `node tsx watch src/index.ts`
- Parent chain: orphaned pnpm/tsx under a detached `cmd.exe`
- Meaning: someone restarted WS outside the tmux session at some point, and the original tmux window was never re-attached

## Impact

On this dev box, **nobody can tail WS logs**. That means:

- Yjs room join/leave events — invisible
- `yjs:update` frame counts from clients — invisible
- `/internal/yjs/write` errors — invisible (even after fixing [bug-02](bug-02-silent-crdt-fallback.md))
- Presence updates — invisible
- Any WS crash or restart — invisible until the HTTP health check notices

This bug made the 2026-04-08 audit much harder than it should have been — ws-watcher had to fall back to HTTP polling `/health` + `/internal/presence` every 3s and triangulate via indirect evidence.

## Fix

### Immediate

Relaunch WS inside `doable:2`:

```bash
tmux send-keys -t doable:2 C-c
tmux send-keys -t doable:2 "cd /root/doable/services/ws && pnpm dev" Enter
```

On Windows dev it's the equivalent `cd services/ws && pnpm dev` inside the correct window.

### Better

Don't rely on operator discipline to keep three tmux windows in sync. Either:

1. **Single-window turbo runner.** Use `pnpm dev` at repo root with `turbo run dev`, which pipes all three services to one readable stdout (it already does this — API + web both logged to `doable:0` in the test; WS would have if it had been started that way).

2. **File-based logging.** Pipe each service to `/tmp/doable-{api,web,ws}.log` and have operators `tail -f` them. Survives tmux restarts.

3. **Systemd/pm2.** Already what production uses per `CLAUDE.md` (`doable.service` wraps tmux). On dev, mirror the pattern so services don't get orphaned on terminal kills.

### Check for similar rot on production

Worth SSHing into `do.fid.pw` (`~/Documents/itdept` key) and verifying that the `doable` tmux session there actually shows all three services' stdouts. If production has the same drift, a silent WS failure in prod would be equally invisible.

## Detection

Quick check:

```bash
tmux capture-pane -t doable:2 -p | tail -5
# should show live @doable/ws:dev output, not a bare prompt
```

Consider adding this to a `./scripts/check-dev-env.sh` that operators run before starting an audit.
