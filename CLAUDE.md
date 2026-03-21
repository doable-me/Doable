# Doable — Project Rules

## CRITICAL: Network Security

**ALL services MUST bind to 127.0.0.1 ONLY. NEVER bind to 0.0.0.0 or any public interface.**

- Next.js dev: `--hostname 127.0.0.1` (already in package.json dev script)
- API server: `host: "127.0.0.1"` in listen config
- WS server: `host: "127.0.0.1"` in listen config
- All external access goes through Cloudflare Tunnel — no port should be publicly reachable
- Before any deployment or server restart, verify with `ss -tlnp` that nothing listens on `0.0.0.0`
- This rule applies to ALL environments: dev, staging, production

## Deployment

- Server: `do.fid.pw` (SSH key: `~/Documents/itdept`)
- App directory: `/root/doable`
- Services run in tmux session `doable` (windows: api, web, ws)
- Services use `tsx watch` (no build step needed — just restart)
