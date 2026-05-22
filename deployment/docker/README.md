# Docker Deployment

Self-host Doable with a single command — **two installers, same Caddy-in-docker
stack on every OS**:

- `deployment/docker/setup.sh` — Linux, macOS, Windows via WSL2 / Git Bash
- `deployment/docker/setup.ps1` — native Windows (PowerShell 5.1+, no WSL)

Both scripts generate the same `.env`, drive the same docker-compose, and
install the same mkcert-issued local CA. Pick whichever matches your shell.
TLS, cert trust, and reverse proxy all happen inside the docker stack;
nothing host-side except docker itself.

## TL;DR per scenario

| Scenario | bash (Linux / macOS / WSL) | PowerShell (native Windows) | What happens |
|---|---|---|---|
| **Local self-host** | `./deployment/docker/setup.sh` (press Enter at prompt) | `.\deployment\docker\setup.ps1` | mkcert issues a trusted cert and installs the local CA into your OS+browser trust stores. Browser opens `https://localhost` with no warning. |
| **Public VPS, direct ingress** | `DOMAIN=app.example.com EMAIL=you@example.com ./deployment/docker/setup.sh` | `.\deployment\docker\setup.ps1 -Domain app.example.com -Email you@example.com` | Caddy auto-fetches a Let's Encrypt cert. Public 0.0.0.0 bind on :80/:443. |
| **Behind Cloudflare Tunnel / ngrok / reverse proxy** | `DOMAIN=app.example.com ./deployment/docker/setup.sh --skip-ssl` | `.\deployment\docker\setup.ps1 -Domain app.example.com -SkipSsl` | Caddy binds **127.0.0.1 only** (tunnel is the sole ingress) and uses internal self-signed for the origin↔tunnel hop. |
| **Private LAN / IP-only install** | `HOST=192.168.1.50 ./deployment/docker/setup.sh` | `.\deployment\docker\setup.ps1 -DoableHost 192.168.1.50 -InstallTrust` | Self-signed cert for the LAN IP. Add `--install-trust` / `-InstallTrust` only when the server is also the browser machine. (`-DoableHost` instead of `-Host` because `$Host` is a reserved PowerShell variable.) |
| **Pre-built ghcr.io images** (≈30s install) | Add `--prebuilt` to any of the above | Add `-Prebuilt` to any of the above | Pulls `ghcr.io/doable-me/doable-{api,ws,web,migrate}:latest`. Falls back to source build if the pull is denied. |

### Flag / env-var translation

| bash | PowerShell | Behaviour |
|---|---|---|
| `DOMAIN=foo` | `-Domain foo` or `$env:DOMAIN='foo'` | Public-domain mode, Let's Encrypt via Caddy ACME |
| `HOST=192.168.1.50` | `-DoableHost 192.168.1.50` or `$env:HOST='192.168.1.50'` | Private-network / LAN-IP mode |
| `EMAIL=you@example.com` | `-Email you@example.com` | LE ACME registration address |
| `--skip-ssl` | `-SkipSsl` | Bind 127.0.0.1 only + internal self-signed (behind tunnel/proxy) |
| `--prebuilt` | `-Prebuilt` | Pull from ghcr.io instead of building from source |
| `--install-trust` | `-InstallTrust` | HOST mode only — force-install mkcert CA into the host trust store |
| `DOABLE_PREBUILT=true` | `$env:DOABLE_PREBUILT='true'` | Same as `--prebuilt` / `-Prebuilt` |
| `DOABLE_BEHIND_PROXY=1` | `$env:DOABLE_BEHIND_PROXY='1'` | Same as `--skip-ssl` / `-SkipSsl` |
| `DOABLE_IMAGE_TAG=v1.2.3` | `$env:DOABLE_IMAGE_TAG='v1.2.3'` | Pin a specific ghcr.io image tag |
| `DOABLE_SKIP_DISK_CHECK=1` | `$env:DOABLE_SKIP_DISK_CHECK='1'` | Skip the pre-build disk-space check |

## Architecture — in-stack TLS via Caddy

All TLS termination + reverse proxying happens inside the docker stack
in a `caddy:2-alpine` container, declared in `docker-compose.yml`. No
host-side `nginx`, `certbot`, `systemctl`, `apt-get install`, or
`brew install` — `docker compose up` is everything.

```
Browser
  │
  ▼
Caddy container (127.0.0.1:443 or 0.0.0.0:443)
  │  TLS terminated. Cert from mkcert (local CA) or Let's Encrypt.
  ├── /                → web container (Next.js)
  ├── /api/otlp/*      → web container (Next.js OTLP proxy route)
  ├── /api/*           → api container (Hono, strips /api/ prefix)
  ├── /auth/*          → api container
  ├── /preview/*       → api container (vite preview proxy for AI-built apps)
  └── /ws              → ws container (Yjs CRDT)
                              │
                              ▼
                         PostgreSQL container
                         (postgres + pgvector + pg_trgm + pgcrypto)
```

Caddy's TLS source is controlled by three env vars that `setup.sh`
writes into `deployment/docker/.env`:

| Env var | Set by setup.sh to | Meaning |
|---|---|---|
| `DOABLE_SITE` | The host the browser will hit (e.g. `localhost`, `192.168.1.50`, `app.example.com`) | Caddy's site address |
| `DOABLE_TLS` | `/certs/cert.pem /certs/key.pem` (local), `you@example.com` (LE), or `internal` (self-signed) | Caddy's `tls` directive |
| `DOABLE_BIND_ADDR` | `127.0.0.1` (local + behind-proxy) or `0.0.0.0` (direct public) | Which host interface Caddy's ports bind to |

The committed `Caddyfile` reads these via env-var substitution, so a
single static config covers every install scenario.

## Cross-platform cert trust (local installs)

For `localhost` / `HOST=` modes, `setup.sh` uses
[**mkcert**](https://github.com/FiloSottile/mkcert) to issue a cert
signed by a local CA, then installs that CA into the host's trust
stores. **One-time per machine** — every future Doable install on
the same box reuses the same trusted CA.

| Platform | What mkcert installs into | Result |
|---|---|---|
| **macOS** | System keychain via `security add-trusted-cert` | Safari + Chrome trust the cert (OS keychain) |
| **Linux Debian/Ubuntu** | `/usr/local/share/ca-certificates/` + `update-ca-certificates` + NSS `certutil` | Chrome/Firefox via NSS, system-wide trust |
| **Linux Fedora/RHEL** | `/etc/pki/ca-trust/source/anchors/` + `update-ca-trust` + NSS | Same path |
| **Windows via WSL2** | `powershell.exe` interop installs CA into Windows `CurrentUser\Root` + sets the Chrome policy that makes Chrome 105+ consult Windows root store | Chrome/Edge/Firefox on Windows trust the cert after one Chrome restart |

If `mkcert` can't run (sandbox, no network, unsupported arch),
`setup.sh` falls back to an openssl self-signed cert — browser shows
the standard one-time warning, but everything still works.

### Remote installs (`HOST=IP`, server ≠ browser)

In `HOST=` mode the auto-trust install is **skipped by default**
because the server you're SSH'd into is usually a different machine
than the laptop you'll browse from. Installing the cert on the server
doesn't help the laptop.

Two options:

1. **Copy + install on the browser laptop manually.** `setup.sh`
   writes `cert-install-instructions.md` next to the cert with
   per-OS copy-paste commands.
2. **Re-run with `--install-trust`** (or `DOABLE_INSTALL_TRUST=1`)
   for the rare case where the server IS the browser machine.

## One-liner installs

### Source path (from a git clone)

**Linux / macOS / WSL2 / Git Bash:**

```bash
git clone https://github.com/doable-me/doable.git
cd doable

# Local desktop self-host
./deployment/docker/setup.sh   # press Enter at prompt

# Public VPS with Let's Encrypt
DOMAIN=app.example.com EMAIL=you@example.com ./deployment/docker/setup.sh

# VPS behind Cloudflare Tunnel (binds 127.0.0.1 only)
DOMAIN=app.example.com ./deployment/docker/setup.sh --skip-ssl

# Private LAN with self-signed (browser warning unless --install-trust)
HOST=192.168.1.50 ./deployment/docker/setup.sh
```

**Native Windows (PowerShell):**

```powershell
git clone https://github.com/doable-me/doable.git
cd doable

# Local desktop self-host
.\deployment\docker\setup.ps1            # press Enter at prompt

# Public VPS with Let's Encrypt
.\deployment\docker\setup.ps1 -Domain app.example.com -Email you@example.com

# VPS behind Cloudflare Tunnel (binds 127.0.0.1 only)
.\deployment\docker\setup.ps1 -Domain app.example.com -SkipSsl

# Private LAN with self-signed (browser warning unless -InstallTrust)
.\deployment\docker\setup.ps1 -DoableHost 192.168.1.50 -InstallTrust
```

### Pre-built path (≈30s pull instead of 5–10min build)

**Linux / macOS:**

```bash
mkdir doable && cd doable
curl -O https://raw.githubusercontent.com/doable-me/doable/main/deployment/docker/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/doable-me/doable/main/deployment/docker/setup.sh
curl -O https://raw.githubusercontent.com/doable-me/doable/main/deployment/docker/init.sql
curl -O https://raw.githubusercontent.com/doable-me/doable/main/deployment/docker/02-roles.sh
curl -O https://raw.githubusercontent.com/doable-me/doable/main/deployment/docker/Caddyfile
chmod +x setup.sh

DOMAIN=app.example.com EMAIL=you@example.com ./setup.sh --prebuilt
```

**Native Windows (PowerShell):**

```powershell
mkdir doable ; cd doable
$base = 'https://raw.githubusercontent.com/doable-me/doable/main/deployment/docker'
foreach ($f in 'docker-compose.prod.yml','setup.ps1','init.sql','02-roles.sh','Caddyfile') {
    Invoke-WebRequest -Uri "$base/$f" -OutFile $f -UseBasicParsing
}

.\setup.ps1 -Domain app.example.com -Email you@example.com -Prebuilt
```

`--prebuilt` (or `DOABLE_PREBUILT=true ./setup.sh` / `$env:DOABLE_PREBUILT='true'`) pulls
`ghcr.io/doable-me/doable-{api,ws,web,migrate}:latest`. Pin a specific
release with `DOABLE_IMAGE_TAG=v1.2.3`. If the ghcr.io images are not
publicly accessible, both scripts fall back to source build with a
warning in the log.

## What `setup.sh` / `setup.ps1` do

1. Detects OS family — bash version covers linux-debian / linux-rhel / linux-wsl / macos / windows-bash; PowerShell version covers native Windows. Both point users to Docker Desktop if docker is missing.
2. Generates `deployment/docker/.env` with random secrets (JWT, encryption keys, postgres password, etc.)
3. For local/HOST modes: downloads mkcert if missing, installs the local CA into host trust stores (Linux ca-certs + NSS / macOS keychain / Windows root via `mkcert -install`), issues a cert into `deployment/docker/certs/`
4. For DOMAIN+LE mode: configures Caddy env vars so the container auto-fetches Let's Encrypt
5. For DOMAIN+--skip-ssl/-SkipSsl mode: configures Caddy for internal self-signed + 127.0.0.1 bind (tunnel-safe)
6. (`setup.sh` only) Stops any legacy host-side `nginx`/`caddy`/`apache2`/`lighttpd` from older installs (frees :80/:443 for the in-stack Caddy). On Windows, no host-side proxy exists in the old install path so this is a no-op.
7. `docker compose up -d` (or `pull` + `up` with `--prebuilt`/`-Prebuilt`)
8. Waits for the migrate container to exit 0 (surfaces password-mismatch / stale-volume issues with a clear recovery command)

## Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Services: postgres, migrate, api, ws, web, caddy. Source-build path. |
| `docker-compose.prod.yml` | Same services with `image:` instead of `build:` — pulls from ghcr.io |
| `docker-compose.sandbox.yml` | Opt-in overlay enabling the bubblewrap AI sandbox (multi-tenant operators) |
| `Dockerfile` | Multi-stage source build (base → deps → build → api/ws/web/migrate targets) |
| `setup.sh` | Universal setup for bash hosts (Linux / macOS / WSL / Git Bash) — secrets, certs, Caddy env, build/pull, up |
| `setup.ps1` | Native-Windows sibling of `setup.sh` (PowerShell 5.1+, no WSL needed) — same flags, same stack |
| `Caddyfile` | Caddy TLS terminator + reverse-proxy config (env-var driven) |
| `init.sql` | Postgres extensions (pgvector, pgcrypto, pg_trgm) |
| `02-roles.sh` | Postgres init script — creates non-superuser `doable_app` role for api+ws runtime |
| `seccomp-bwrap.json` | Custom seccomp profile for the multi-tenant AI sandbox overlay |
| `certs/` | mkcert-issued certs (gitignored — never committed) |
| `tmux-entrypoint.sh` | Container entrypoint for tmux session management |

## Configuration

### Required secrets

These are generated by `setup.sh`. If you bypass it, you must set them
yourself in `deployment/docker/.env` — docker compose refuses to start
without them:

| Variable | How to generate | Used by |
|---|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` | api signs/verifies access + refresh tokens |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` | api row-level encryption |
| `INTERNAL_SECRET` | `openssl rand -hex 32` | api↔ws shared-secret auth + OTLP forwarding |
| `DOABLE_KEK` | `openssl rand -base64 32` | envelope key for BYOK provider keys + OAuth client secrets at rest |
| `POSTGRES_PASSWORD` | `openssl rand -hex 16` | postgres owner (used only by `migrate` for DDL) |
| `DOABLE_APP_PASSWORD` | `openssl rand -hex 16` | postgres runtime role (api+ws — CRUD only, no DDL) |
| `CORS_ORIGINS` | The public origin of the install (e.g. `https://app.example.com`) | api allow-list |

### CLI flags / env vars

| Flag | Env var equivalent | Effect |
|---|---|---|
| `--prebuilt` | `DOABLE_PREBUILT=true` | Pull from ghcr.io instead of source build |
| `--skip-ssl` | `DOABLE_BEHIND_PROXY=1` | Behind CF Tunnel / reverse proxy. Caddy uses internal self-signed AND binds 127.0.0.1 |
| `--install-trust` | `DOABLE_INSTALL_TRUST=1` | In HOST mode, force the cert auto-trust install (default: skipped because server ≠ browser) |
| n/a | `DOMAIN=app.example.com` | Public domain mode. Let's Encrypt cert via Caddy. Requires :80 publicly reachable. |
| n/a | `EMAIL=you@example.com` | Contact email for the Let's Encrypt ACME account (renewal notifications) |
| n/a | `HOST=192.168.1.50` | Private LAN IP. Self-signed cert. |
| n/a | `DOABLE_IMAGE_TAG=v1.2.3` | Pin a specific tag instead of `latest` (`--prebuilt` mode) |
| n/a | `DOABLE_SKIP_DISK_CHECK=1` | Skip the pre-build disk-space check (source builds peak ~22GB) |

## Common operations

> Cross-platform: every `docker compose` command below works verbatim in
> bash, zsh, and PowerShell — `docker compose` itself takes forward-slash
> paths on Windows Docker Desktop, so no quoting changes are needed.

```bash
# View logs (all services)
docker compose -f deployment/docker/docker-compose.yml logs -f

# Specific service
docker compose -f deployment/docker/docker-compose.yml logs -f api
docker compose -f deployment/docker/docker-compose.yml logs -f caddy

# Restart one service
docker compose -f deployment/docker/docker-compose.yml restart api

# Stop everything (keeps volumes)
docker compose -f deployment/docker/docker-compose.yml down

# Nuke everything (drops postgres data, project files, thumbnails)
docker compose -f deployment/docker/docker-compose.yml down -v

# Re-run migrations
docker compose -f deployment/docker/docker-compose.yml run --rm migrate

# Rebuild api+web after a source change
docker compose -f deployment/docker/docker-compose.yml up -d --build api web
```

## Security

- **In-stack TLS** — Caddy terminates TLS; no plaintext on the wire between browser and the docker stack
- **Loopback-only by default** — `DOABLE_BIND_ADDR=127.0.0.1` for local installs; only DOMAIN mode with direct public ingress sets `0.0.0.0`
- **Capability stripping** — every service runs with `cap_drop: [ALL]` and `no-new-privileges:true`. Postgres re-adds only the 5 caps gosu needs for first-volume init; Caddy re-adds only `NET_BIND_SERVICE` for port 80/443
- **Database role separation** — runtime api+ws connect as `doable_app` (CRUD-only, no DDL); the owner `doable` role is used only by the one-shot `migrate` service
- **Read-only init scripts** — `init.sql` and `02-roles.sh` mount `:ro`
- **Secrets file** — `deployment/docker/.env` chmod 600
- **Firewall** — handled by the operator (UFW on Linux, OS firewall on Mac/Win). With CF Tunnel mode (`--skip-ssl`) the host doesn't need any public ports open at all.

### Multi-tenant AI sandbox (opt-in)

The default stack assumes one trusted operator. For multi-tenant
installs (hosting Doable for arbitrary signups) layer the sandbox
overlay to confine AI-spawned subprocesses inside a per-project
bubblewrap jail:

```bash
docker compose \
  -f deployment/docker/docker-compose.yml \
  -f deployment/docker/docker-compose.sandbox.yml \
  up -d --force-recreate api
```

What it changes:
- `DOABLE_HARDENING=full` + `DOABLE_HARDENING_LEVEL=prod` + `DOABLE_SANDBOX_INSTALL=1`
- `cap_add: [SYS_ADMIN]` on the api container (everything else still dropped)
- Custom seccomp profile `seccomp-bwrap.json` that adds exactly 4 syscalls to Docker's default (`mount`, `umount2`, `pivot_root`, `keyctl`) — NOT `seccomp=unconfined`

### Verifying role separation

After `docker compose up -d`, confirm api+ws connect as the limited
role and DDL is gated behind the owner:

```bash
# Who's connected as which role
docker compose -f deployment/docker/docker-compose.yml exec -T postgres \
  psql -U doable -At -c "SELECT usename, COUNT(*) FROM pg_stat_activity WHERE datname='doable' GROUP BY 1"
# Expect: doable_app | 5  (postgres.js api+ws pools)

# doable_app cannot DROP a table
docker compose -f deployment/docker/docker-compose.yml exec -T postgres \
  psql -U doable_app -d doable -At -c "DROP TABLE users CASCADE" 2>&1 \
  | grep -iE "permission denied|must be owner"

# doable_app CAN do normal CRUD
docker compose -f deployment/docker/docker-compose.yml exec -T postgres \
  psql -U doable_app -d doable -At -c "SELECT current_user, count(*) FROM users"
```

## Troubleshooting

### Migrate container exited non-zero

The most common cause is a stale postgres data volume from a previous
install with a different `.env`. Postgres skipped reinitialization
because the data dir wasn't empty, so the new `POSTGRES_PASSWORD`
never reached pg_authid. `setup.sh` surfaces this with a clear
recovery command — copy-paste:

```bash
docker compose -f deployment/docker/docker-compose.yml --env-file deployment/docker/.env down -v
docker compose -f deployment/docker/docker-compose.yml --env-file deployment/docker/.env up -d
```

### Browser shows "your connection is not private" on https://localhost

mkcert's CA isn't trusted by the browser yet. Common causes:

- **Chrome 105+ on Windows + WSL2 install**: restart Chrome once. setup.sh sets the `ChromeRootStoreEnabled=0` policy that takes effect on the next launch.
- **Firefox after a fresh install**: Firefox has its own NSS DB. Re-run `mkcert -install` once (after Firefox is installed), or `Settings → Privacy & Security → View Certificates → Authorities → Import` and pick `deployment/docker/certs/cert.pem`.
- **Cert was rotated**: re-run `./deployment/docker/setup.sh` to regenerate + re-install.

### Cloudflare Tunnel can't reach the origin

Check that `DOABLE_BIND_ADDR=127.0.0.1` is set in `.env` (it should
be, automatically, when you used `--skip-ssl`). The tunnel daemon
runs on the host and connects to `127.0.0.1:443` — your tunnel's
ingress rule should point at `https://localhost:443` (HTTPS with
"No TLS Verify" enabled, because Caddy serves internal self-signed
on the origin side).

### Caddy can't fetch Let's Encrypt cert

LE needs port 80 reachable from the internet for the HTTP-01
challenge. Confirm:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://app.example.com/.well-known/acme-challenge/test
# Expect: 200 (Caddy responds with a placeholder for unknown challenges)
```

If you can't open port 80 publicly (corporate firewall, ISP block),
either use a DNS-01 challenge (requires API credentials for your DNS
provider — not configured by default) or run behind Cloudflare Tunnel
with `--skip-ssl`.

### Port 80 or 443 already in use

A leftover process is bound to one of Caddy's ports. Most commonly an
old host-side nginx from an earlier setup.sh version. setup.sh's
`stop legacy host-side $svc` block handles this on Linux, but you
may need to manually stop it on Mac/Windows:

```bash
# Linux
sudo systemctl stop nginx caddy apache2 lighttpd 2>/dev/null

# macOS (homebrew)
brew services stop nginx 2>/dev/null
sudo lsof -nP -iTCP:443 | grep LISTEN   # what else is on :443?

# Windows
netstat -ano | findstr ":443"            # find the PID
```

### Rebuild from absolute scratch

```bash
docker compose -f deployment/docker/docker-compose.yml down -v
docker system prune -af
rm -f deployment/docker/.env
rm -rf deployment/docker/certs/*.pem
./deployment/docker/setup.sh
```
