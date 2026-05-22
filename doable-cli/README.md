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

## Network safety

This installer uploads `deployment/server-setup.sh`, which binds **all** services to
`127.0.0.1` and exposes them only via Cloudflare Tunnel. See `CLAUDE.md` for
the platform-wide network policy.
