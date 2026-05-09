# doable-installer

A Rust TUI app that operators run on their laptop to provision a fresh Doable
server. It SSHes into the target host, streams `setup-server-v3.sh`, and
shows a live, color-coded view of every phase.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Doable Installer │ host: 203.0.113.10   user: ubuntu  env: myorg    │
│                  │ elapsed: 03:21                                    │
├────────────────────┬─────────────────────────────────────────────────┤
│ Phases (4/15)      │ Setup output                                    │
│  ✅  1 Preflight    │ ════════ Phase 4/15 — PostgreSQL 16 + ext.     │
│  ✅  2 System pkgs  │   apt-get update                                │
│  ✅  3 Node 22+pnpm │   installing postgresql-16 …                    │
│  🔄  4 PostgreSQL   │   creating role doable …                        │
│  ⏳  5 Caddy …      │   running migrations …                          │
│  ⏳  6 Puppeteer …  │                                                  │
│  ⏳  7 Repo clone   │                                                  │
│  ⏳ … 15            │                                                  │
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
- `phases.rs` — the 15 phases mirroring `setup-server-v3.sh`.
- `events.rs` — `AppEvent` enum for the central channel.
- `tui.rs` — ratatui state + draw routines (title / sidebar / log / status / end-screen).
- `runner.rs` — `tokio::process::Command` invokes the system `ssh`, streams
  stdout+stderr, and parses `Phase N/15 …` markers to drive the sidebar.
  Also exposes a `run_demo` replay for `--demo`.
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

This installer uploads `setup-server-v3.sh`, which binds **all** services to
`127.0.0.1` and exposes them only via Cloudflare Tunnel. See `CLAUDE.md` for
the platform-wide network policy.
