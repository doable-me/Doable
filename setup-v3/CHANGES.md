# Doable server setup — v3 changes manifest

Catalogues every change relative to v2 (`setup-server.sh` at repo root, ~860 lines, in-place since 2026-04). v3 lives in `setup-v3/` and is **additive**: v2 is not deleted, and existing v2-installed servers keep working until they're cut over individually.

## Change table

Type legend: `add` = new, `change` = modify behaviour, `replace` = drop-in for a v2 mechanism, `doc` = documentation, `keep` = unchanged from v2 (called out for clarity).

| Type     | File                                              | What changed                                                                                  | Why                                                                                       |
|----------|---------------------------------------------------|-----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| add      | `setup-v3/setup-server-v3.sh`              | Env-var driven setup script with phases A–G; per-service systemd; non-root `doable` user      | Fix findings #01, #02 from `servertodo/00-README.md` at install time                      |
| add      | `setup-v3/doable-cli.sh`                   | Operator CLI: `status`, `logs`, `restart`, `attach`, `tail`, `health`, `env`, `install`, `help` | Single ergonomic entry-point for day-2 ops; replaces `tmux a -t doable` muscle memory     |
| add      | `setup-v3/doable-installer/` (Rust)        | Laptop-side TUI that drives setup over SSH                                                    | Operator UX; ensures `.env.v3` and tunnel UUID are collected before SSH                   |
| add      | `servertodo/08-v3-flow.md`                        | New servertodo entry documenting v3 flow + comparison vs v1/v2 + migration path               | Operator reference; severity-matrix index entry                                           |
| change   | `servertodo/00-README.md` severity matrix          | New row #08 pointing at `08-v3-flow.md`                                                       | Discoverability — keep matrix authoritative                                               |
| add      | `setup-v3/CHANGES.md` (this file)          | This manifest                                                                                 | Reviewer can see scope at a glance                                                        |
| replace  | systemd unit layout                                | 3× per-service unit (`doable-{api,web,ws}.service`) under `doable.target` instead of one tmux-wrapping `doable.service` | Per-service restart, structured journald per unit, no tmux race after reboot              |
| replace  | App user / dir                                     | `User=doable`, `WorkingDirectory=/opt/doable`, `.env` mode `600`                              | Findings #01 and #02                                                                      |
| replace  | Operator entry-point                               | `doable <subcmd>` CLI replaces `tmux a -t doable` + ad-hoc `systemctl status doable`          | One predictable command surface                                                           |
| change   | systemd hardening                                  | `ProtectSystem=strict`, `ProtectHome=true`, `NoNewPrivileges=true`, `PrivateTmp=true` per unit | Defense-in-depth; matches `servertodo/07` Phase 1                                         |
| change   | Cloudflare tunnel install                          | Mandatory `cloudflared tunnel ingress validate` before reload                                  | Avoid the "tunnel down because validate failed silently" failure mode from staging        |
| change   | Egress jail wiring                                 | nft skuid rules + Squid 127.0.0.1:3128 enabled by default for sandbox UIDs and the `doable` user | Finding #04 — staging declared, never enabled                                             |
| keep     | `--hostname 127.0.0.1` / `WS_HOST=127.0.0.1`       | Same binding rules as v2 (per `CLAUDE.md`)                                                     | Network-security rule unchanged                                                           |
| keep     | Cloudflare naming convention                       | `<env>-api.doable.me`, `<env>-ws.doable.me` (single-level subdomains)                          | Free Universal SSL only covers one wildcard level                                         |
| keep     | tmux                                               | Available via `doable attach`, but optional — services don't depend on it                     | Backwards-friendly; muscle memory still works                                             |
| keep     | `setup-server.sh` (v2) at repo root                | NOT deleted; remains the script run on existing v2 hosts until cutover                        | Backwards-compat; no forced migration                                                     |

## Commits expected on origin/main when this lands

- **teammate-a:** "feat(setup): add setup-server-v3.sh with per-service systemd + non-root user"
- **teammate-b:** "feat(installer): add doable-installer Rust TUI driving v3 setup over SSH"
- **teammate-c:** "feat(ops): add doable operator CLI + servertodo/08 v3 flow doc" (this work)

These three should land in a single PR titled `feat: server setup v3 (per-service systemd, non-root user, operator CLI)`. Each commit is self-contained; revert order if needed is teammate-c -> teammate-b -> teammate-a (most additive first).

## Test plan for v3 (without breaking existing v2 hosts)

v3 runs only on **fresh** Ubuntu 22.04/24.04 hosts. Validation order:

1. **Local — bash syntax.** `bash -n setup-v3/doable-cli.sh` and `bash -n setup-v3/setup-server-v3.sh`. Already passing for the CLI.
2. **Local — shellcheck.** `shellcheck setup-v3/doable-cli.sh` (warnings allowed for `printf '%b' "${ICON_OK@P}"` parameter-transform usage; document any waivers inline).
3. **Local — Rust TUI build.** `cargo build --release` from `setup-v3/doable-installer/`.
4. **Disposable VM.** Spin a clean Ubuntu 24.04 droplet (NOT any production-equivalent host). Run the installer end-to-end. Validation gate:
   - `doable status` reports 3 active services + active postgres + active cloudflared.
   - `ss -tlnp` shows only 127.0.0.1 + sshd:22.
   - `stat -c '%a %U:%G' /opt/doable/.env` -> `600 doable:doable`.
   - `ps -eo user,pid,cmd | grep -E "next-server|tsx|node.*ws"` -> all `doable`, no `root`.
   - `curl https://<env>.doable.me/login` -> 200.
   - `doable restart api` cycles api in <5s; `doable status` returns to all-green.
   - Sign-up + login + project create + Deploy -> Live works end-to-end.
5. **Destroy disposable VM.** Don't keep it around — v3 is exercised on each new env from scratch.
6. **Do NOT run setup-server-v3.sh against any existing v2 host (staging, dodev, prod, etc.).** It detects an existing v2 install and aborts (Phase A first action) but the safer rule is: don't run it.

## Backwards-compat notes

- v2's `setup-server.sh` is unchanged; no risk to existing staging/dodev/prod hosts.
- `doable` CLI refuses to run on v2 hosts (no `doable.target` -> `require_installed` errors out cleanly). Operators on v2 keep using `tmux a -t doable`.
- The Rust TUI installer is a separate binary; no daemon, no auto-update.
- Migration of an existing v2 host to v3 layout is described in `servertodo/08-v3-flow.md` "Migration path" — done per-host, opt-in, with a maintenance window.
- The new `servertodo/08-v3-flow.md` is purely documentation; it doesn't change `setup-server.sh` or any runtime behaviour by itself.
- `servertodo/00-README.md` matrix gains row #08 only — existing rows untouched.
