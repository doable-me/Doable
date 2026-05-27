# doable-installer

A Rust TUI app that operators run on their laptop to provision a fresh Doable
server. It SSHes into the target host, streams `deployment/server-setup.sh`, and
shows a live, color-coded view of every phase.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Doable Installer │ host: 203.0.113.10   user: ubuntu  env: myorg    │
│                  │ elapsed: 03:21                                    │
├────────────────────┬─────────────────────────────────────────────────┤
│ Phases (3/13)      │ Setup output                                    │
│  ✅  1 System pkgs  │ ════════ Step 3/13 — Hardening services        │
│  ✅  2 Firewall     │   tuning postgresql.conf …                      │
│  🔄  3 Hardening    │   restarting fail2ban …                         │
│  ⏳  4 Swap …       │                                                  │
│  ⏳  5 PostgreSQL   │                                                  │
│  ⏳  6 GitHub auth  │                                                  │
│  ⏳  7 Clone repo   │                                                  │
│  ⏳ … 13            │                                                  │
├────────────────────┴─────────────────────────────────────────────────┤
│ q=quit  l=toggle log filter  r=retry phase  p=pause                  │
└──────────────────────────────────────────────────────────────────────┘
```

## Quick start

Interactive (recommended for first-time operators):

```bash
cargo run --release -- \
  --host 203.0.113.10 \
  --user ubuntu \
  --env-name myorg \
  --ssh-key $HOME/.ssh/id_ed25519
```

Unattended via env vars (CI / scripted provisioning):

```bash
DOABLE_HOST=203.0.113.10 \
DOABLE_USER=ubuntu \
DOABLE_ENV_NAME=myorg \
DOABLE_SSH_KEY=$HOME/.ssh/id_ed25519 \
DOABLE_NON_INTERACTIVE=1 \
  cargo run --release
```

Preview the TUI without provisioning anything:

```bash
cargo run -- \
  --host demo --user demo --env-name demo \
  --ssh-key /dev/null --demo
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     main (tokio::main)                        │
│                                                                │
│  ┌──────────────┐  AppEvent  ┌────────────────────────────┐  │
│  │ runner task  │ ─────────► │ mpsc::channel  (cap 1024)  │  │
│  │ (ssh stream) │            └────────────┬───────────────┘  │
│  └──────────────┘                         │                  │
│                                            ▼                  │
│  ┌──────────────┐  AppEvent  ┌────────────────────────────┐  │
│  │ input task   │ ─────────► │     tokio::select! loop    │  │
│  │ (crossterm   │            │   updates App  →  draws    │  │
│  │  EventStream)│            └────────────────────────────┘  │
│  └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

- `cli.rs` — clap derive struct.
- `phases.rs` — the 15 phases mirroring `deployment/server-setup.sh`.
- `events.rs` — `AppEvent` enum for the central channel.
- `tui.rs` — ratatui state + draw routines (title / sidebar / log / status / end-screen).
- `runner.rs` — `tokio::process::Command` invokes the system `ssh`, streams
  stdout+stderr, and parses `Phase N/M …` AND `Step N/M …` markers to drive
  the sidebar. Also exposes a `run_demo` replay for `--demo`.
- `main.rs` — wires it all together with a panic hook so raw mode is always
  restored on crash or Ctrl-C.

## Why we shell out to `ssh`

Pulling in a Rust SSH crate (`russh`, `thrussh`) means re-implementing key
discovery, agent forwarding, and `~/.ssh/config` semantics. Operators already
have a working `ssh` on PATH; we just stream from it. This keeps the binary
small and the trust surface tiny.

## Key bindings

| Key  | Action                                |
| ---- | ------------------------------------- |
| `q`  | quit (also Esc, Ctrl-C)               |
| `l`  | toggle log filter (errors-only)       |
| `r`  | flag the current phase for retry      |
| `p`  | pause auto-scroll                     |

## Non-interactive commands

Besides the `install` and `admin` TUIs, `doable` exposes scriptable subcommands
that print to stdout and exit with a status code — no terminal required. Every
one works **on the server** (run it there) or **over SSH** from your laptop
(`--remote user@host --ssh-key ~/.ssh/id_ed25519`), and `--env-file PATH`
overrides `.env` auto-detection (it probes `/opt/doable/.env`,
`$HOME/doable/.env`, `/root/doable/.env`, `./.env`, `./deployment/docker/.env`).
Runtime (systemd baremetal vs docker compose) is auto-detected.

| Command | What it does |
| ------- | ------------ |
| `doable doctor` | OOB-readiness + security audit: `.env` present & `0600`, all required secrets set, **no placeholder/insecure secrets** (`change-me*`, `doable-dev-key`, literal `doable` DB password), DB reachable, schema migrated, service running, ports up. Exits non-zero on any FAIL. |
| `doable status` | One-glance runtime / service / ports / DB summary. |
| `doable secrets [--reveal]` | List generated secrets (DB password, `JWT_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_SECRET`, `DOABLE_KEK`, …), masked unless `--reveal`. |
| `doable db:password` | Print just the postgres password (e.g. `psql "$(doable db:password)"`). |
| `doable restart` | Restart the app (systemd `doable.service` or `docker compose restart`). |
| `doable logs [-n N]` | Tail recent app logs (`journalctl` or `docker compose logs`). |
| `doable db:migrate` | Apply DB migrations (`pnpm db:migrate` or the docker `migrate` service). |
| `doable rotate-secrets <jwt\|internal\|encryption\|all> [--apply]` | Wrap `scripts/rotate-secrets.sh` (dry-run unless `--apply`). |
| `doable admin:reset-password --email E [--password P]` | Set a user's password (argon2id, matching the API). Prompts hidden if `--password` omitted. |
| `doable admin:create-owner --email E [--password P] [--name N]` | Create (or re-promote) a platform owner; workspace is auto-created on first sign-in. |

```bash
# On the server
doable doctor
doable db:password
doable admin:reset-password --email me@example.com

# From your laptop, over SSH
doable doctor --remote root@app.example.com --ssh-key ~/.ssh/id_ed25519
```

## Network safety

This installer uploads `deployment/server-setup.sh`, which binds **all** services to
`127.0.0.1` and exposes them only via Cloudflare Tunnel. See `CLAUDE.md` for
the platform-wide network policy.
