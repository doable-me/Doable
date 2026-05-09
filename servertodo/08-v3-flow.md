# Server Setup v3 — Flow & Operator Reference

Forward-looking record of how `setup-server-v3.sh` is structured and how an operator should drive it. Compiled 2026-05-09 alongside the v3 work in `setup-v3/`. Supersedes v2 (`setup-server.sh` at repo root) for new environments. v2 is not deleted; existing v2-installed servers keep working.

---

## Why v3

v2 (the current `setup-server.sh`) is a single ~860-line script that runs as root, drops the app into `/root/doable`, runs all three services in one tmux session under `User=root`, and is hard to re-run idempotently. The staging audit on 2026-05-09 (`servertodo/01-05`) flagged that as the root cause for findings #01–#03. v3 fixes those at install time:

- **Per-service systemd units** (`doable-api.service`, `doable-web.service`, `doable-ws.service`) wired under a single `doable.target`, instead of one tmux-wrapping `doable.service`. Each service can be restarted, journalled, and hardened independently.
- **Env-var driven, idempotent.** v3 reads everything (domain, ports, admin user, optional admin SSH key, optional Stripe keys, tunnel UUID) from environment variables or a `--env-file`. Re-running never duplicates state; it converges.
- **Optional dedicated admin user.** `ADMIN_USER` defaults to `douser`. v3 creates the system user, installs the app at `/opt/doable`, and runs services under `User=doable` from the first boot — no retrofit.
- **Opt-in tmux.** v3 still lets ops pop a tmux UI for live debugging via `doable attach`, but tmux is no longer load-bearing — services don't depend on it. If the box reboots while no one is logged in, all three units come back via systemd, not via a tmux race.
- **Rust TUI installer** (`doable-installer`, separate workspace) drives the whole flow from the operator's laptop: SSH key check, fresh-server bootstrap, env collection, `setup-server-v3.sh` invocation over SSH, post-install verification — all from a single binary.

---

## Operator flow (laptop -> server)

The expected end-to-end path for a new environment:

1. **Laptop:** operator runs `doable-installer` (Rust TUI binary built from the v3 workspace).
   - TUI prompts for SSH host, env name (e.g. `myorg`, `dev`, `staging`, `prod`), domain, GitHub OAuth app credentials, optional Stripe keys, and the Cloudflare tunnel UUID for that env.
   - TUI generates an `.env.v3` artifact locally and previews the systemd unit files it will install.
2. **Laptop -> server:** TUI opens an SSH session to the fresh Ubuntu 22.04/24.04 box (root or sudo user) and uploads `setup-server-v3.sh` + the generated env file.
3. **Server:** TUI invokes `bash setup-server-v3.sh --env-file /tmp/.env.v3` over SSH. Phases:
   - Phase A — system packages (Node 22, pnpm, PostgreSQL 16, Caddy, cloudflared, tmux, fail2ban, htop, jq).
   - Phase B — create `doable` system user + `/opt/doable` app dir; clone repo; `pnpm install`.
   - Phase C — write `/opt/doable/.env` mode `600`, owned by `doable`. Verify with `stat`.
   - Phase D — install `doable-api.service`, `doable-web.service`, `doable-ws.service`, `doable.target`. `User=doable`, hardened (`ProtectSystem=strict`, `NoNewPrivileges=true`, `PrivateTmp=true`).
   - Phase E — install `doable` operator CLI (this repo's `setup-v3/doable-cli.sh`) at `/usr/local/bin/doable`.
   - Phase F — Caddy + cloudflared config; `cloudflared tunnel ingress validate` before reload.
   - Phase G — `systemctl enable --now doable.target`. Verify each service is active.
4. **Verify (laptop or server):** TUI runs `doable status` over SSH and shows the result. Operator confirms: 3 services active, postgres up, cloudflared up, no `0.0.0.0` listeners.
5. **Done.** Operator hands off the URL. Day-2 ops uses `doable status / logs / restart / attach / health`.

---

## Post-install ops CLI

Installed at `/usr/local/bin/doable`. Source: `setup-v3/doable-cli.sh`.

| Subcommand           | What it does                                                                |
|----------------------|------------------------------------------------------------------------------|
| `doable status`      | One-page check: 3 services, postgres, cloudflared, listener audit            |
| `doable logs api`    | `journalctl -u doable-api.service -f`                                        |
| `doable logs web`    | Same for web                                                                 |
| `doable logs ws`     | Same for ws                                                                  |
| `doable logs all`    | Multiplexed via `journalctl --unit-pattern='doable-*.service'`               |
| `doable restart api` | `systemctl restart doable-api.service`                                       |
| `doable restart web` | Same for web                                                                 |
| `doable restart ws`  | Same for ws                                                                  |
| `doable restart all` | `systemctl restart doable.target` (orderly stop+start of all three)          |
| `doable attach`      | tmux session `doable-debug`: 3 panes journal-tailing each, 4th pane `htop`   |
| `doable tail`        | Follow journals across api/web/ws + cloudflared in one stream                |
| `doable health`      | `curl /health` on all three services, prints HTTP status codes               |
| `doable env`         | Print non-secret env vars (domain, hostnames, ports, tunnel UUID)            |
| `doable install`     | Self-installer mode — copies the script to `/usr/local/bin/doable` mode 755  |
| `doable help`        | Subcommand reference                                                         |

The CLI refuses to run unless `/etc/systemd/system/doable.target` exists, so it can't be misused on a v2 box. `install` and `help` bypass this guard so first-run is possible.

---

## v1 vs v2 vs v3 — comparison

| Aspect                            | v1 (legacy)          | v2 (current `setup-server.sh`)        | v3 (this PRD)                                            |
|-----------------------------------|----------------------|----------------------------------------|----------------------------------------------------------|
| Service supervision               | tmux only            | `doable.service` wraps tmux            | 3 systemd units under `doable.target`, no tmux required  |
| App user                          | root                 | root                                   | `doable` (system user, `/opt/doable`, mode 600 `.env`)   |
| App directory                     | `/root/doable`       | `/root/doable`                         | `/opt/doable`                                            |
| Re-run safety                     | partial              | mostly idempotent, root-locked         | env-driven, fully idempotent, root-optional              |
| Operator UX                       | manual ssh + tmux    | `tmux a -t doable`, manual systemctl   | `doable status / logs / restart / attach / health / env` |
| Installer                         | shell only           | shell only                             | Rust TUI on laptop + shell on server                     |
| Egress jail (Squid/nft)           | absent               | declared, often inactive               | enabled by default for sandbox UIDs + `doable` user      |
| Per-service restart               | restart whole tmux   | restart whole `doable.service`         | per-unit restart possible without touching the others    |
| Logs                              | tmux scrollback      | tmux scrollback + `journalctl -u doable` | full journald per unit, structured, persisted           |
| Hardening flags on units          | n/a                  | minimal                                | `ProtectSystem=strict`, `NoNewPrivileges=true`, `PrivateTmp=true` |
| Tunnel ingress validation         | manual               | manual                                 | `cloudflared tunnel ingress validate` mandatory in Phase F |

---

## Migration path: v2 -> v3 for existing servers

Existing v2 servers (any host installed with the v2 script) **keep working** — v3 is additive at the `setup-server-v3.sh` level. To backport a subset of v3 wins to a v2 host without a full reinstall, follow this order:

1. **Lowest risk: install the operator CLI.** Copy `doable-cli.sh` to the v2 box and run `doable install`. The CLI's `require_installed` guard refuses to run because `doable.target` is missing — that's expected. To make `status / logs` work on v2, override the guard with a small shim file `/etc/systemd/system/doable.target` (Type=oneshot stub) OR keep using v2's `tmux a -t doable` until you do a real v3 cutover. Recommended: skip the CLI on v2 boxes.
2. **`.env` permissions.** `chmod 600 /opt/doable/.env` (or `/root/doable/.env` on v2) and set ownership. Pure file-perm change, no restart needed. Maps to finding #01.
3. **Move services off root.** Create `doable` system user, `chown -R doable:doable /root/doable`, swap `User=root` -> `User=doable` in `doable.service`, `systemctl daemon-reload && systemctl restart doable`. If any per-project sandbox spawn needs uid=0, add a tightly-scoped sudo rule for that exact path. Maps to finding #02.
4. **Egress jail.** Land the `nft` skuid rules and bring Squid online per `04-egress-jail.md`. Independent of v3.
5. **Per-service split.** This is the actual "go to v3" step and requires:
   - Stop `doable.service`, kill the tmux session.
   - Drop the three new unit files + `doable.target`, `systemctl enable --now`.
   - Verify `doable status` shows three actives.
   - Remove the old wrapper `doable.service`.
   - Update any docs/scripts that referenced `tmux a -t doable`.
   Best done during a maintenance window; the per-service split changes `journalctl -u` paths.
6. **Optional: relocate to `/opt/doable`.** Not required — v3 supports `DOABLE_HOME=/root/doable` for migration boxes.

---

## Update to severity matrix

`servertodo/00-README.md` should be updated to add this entry:

```
| 08 | 08-v3-flow.md                          | TODO     | v3 setup flow + operator CLI              |
```

(See the "v1 vs v2 vs v3" table above for what v3 fixes from #01–#05 at install time vs. what still requires explicit retrofit on existing boxes.)

---

## Quick links

- `setup-v3/doable-cli.sh` — the operator CLI installed as `/usr/local/bin/doable`
- `setup-v3/CHANGES.md` — change manifest vs v2 with test plan
- `setup-v3/setup-server-v3.sh` — the actual v3 setup script (teammate A)
- `setup-v3/doable-installer/` — Rust TUI installer (teammate B)
- `servertodo/07-next-server-setup-checklist.md` — the manual checklist v3 codifies
- `CLAUDE.md` (repo root) — service binding rules + Cloudflare-naming rule
