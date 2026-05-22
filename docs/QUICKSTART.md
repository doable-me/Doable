# Doable — Quickstart

## Just want to play with it? (60 seconds, no domain required)

### Linux / macOS / Windows-via-WSL2 / Git Bash

```bash
git clone https://github.com/doable-me/doable.git
cd doable
./deployment/docker/setup.sh
```

### Native Windows (PowerShell, no WSL, no Git Bash)

```powershell
git clone https://github.com/doable-me/doable.git
cd doable
./deployment/docker/setup.ps1
```

Pure PowerShell — uses .NET RNG instead of openssl, `Get-PSDrive` instead
of `df`, and downloads `mkcert.exe` automatically to install a local CA
into the Windows root store. Requires Docker Desktop for Windows.
PowerShell 5.1 (built into Windows 10/11) is enough; no pwsh 7+ needed.

---

Open `https://localhost` in your browser. Sign up — the first account
becomes platform owner automatically. The setup wizard walks you
through AI keys and integrations. No SSH, no SQL, no .env editing.

The cert at `https://localhost` is auto-trusted on Linux, macOS,
Windows-via-WSL2, and native Windows — both `setup.sh` and `setup.ps1`
use [mkcert](https://github.com/FiloSottile/mkcert) to install a local
CA into your OS+browser trust stores. See the docker
[README](../deployment/docker/README.md) for the full cross-platform
cert-trust matrix.

To use AI features locally: drop your Anthropic or OpenAI key into the
wizard (Step 2). Or connect GitHub Copilot if you have a subscription.

---

## Full VPS Setup

This guide takes you from a fresh Linux VPS to a working public
Doable instance with HTTPS, AI features, sandboxed previews, and
per-tenant DNS for published sites.

There are **two supported deployment shapes** for VPS installs:

| Shape | When to pick | Public ingress |
|---|---|---|
| **A. Docker stack with Caddy + Let's Encrypt** | Easiest path. Single command, one container per service, Caddy auto-fetches the LE cert. | Port :80 + :443 must be reachable from the internet for the ACME HTTP-01 challenge. |
| **B. Docker stack behind Cloudflare Tunnel** | Recommended for production. Zero public ports on the box, all ingress flows through Cloudflare's edge with its own DDoS + WAF. | Only outbound :443 to Cloudflare needed. Cleanest setup, but requires a Cloudflare account + a domain on their DNS. |

Both shapes use the same `./deployment/docker/setup.sh`. The only
difference is which env vars / flags you pass.

---

## What you'll get

> Doable is not hardcoded to any domain. Substitute `<your-domain>`
> with your actual zone (e.g. `example.com`) everywhere below.
> `setup.sh` defaults to `localhost` when no domain is provided.

After this guide:

| URL | Purpose |
|---|---|
| `https://app.<your-domain>` | Web app (Next.js) |
| `https://app.<your-domain>/api/*` | API (Hono) — same origin, behind Caddy |
| `wss://app.<your-domain>/ws` | WebSocket (Yjs CRDT) — same origin |
| `https://*.<your-domain>` | Per-user published sites (one wildcard subdomain pattern) |

Use any subdomain you like instead of `app.` — the convention is just
"one hostname for the platform, one wildcard pattern for published
sites underneath it". TLS, routing, OAuth callbacks all work out of
the box with this layout.

---

## Prerequisites

### What you need to host doable publicly

1. **A VPS** — Ubuntu 22.04 / 24.04 or Debian 12, root SSH access, at
   least 4 GB RAM and 20 GB disk. Any cloud or bare-metal host works.
2. **A domain you own** registered at any registrar (Namecheap,
   Porkbun, Cloudflare Registrar, etc.). For Shape B (Cloudflare
   Tunnel) the domain's nameservers must point at Cloudflare.
3. **DNS pointing at the server** — an A record for the hostname you
   picked (e.g. `app.example.com → <server-ip>`). For Shape B the
   record is created automatically by `cloudflared` during setup.
4. **(Shape B only) A browser logged into Cloudflare** — used once
   during setup for the OAuth approval that authorizes `cloudflared`
   to manage your zone. Doesn't need to be on the server; your laptop
   is fine.
5. **(Optional) Provider credentials** for features you want — the
   stack works without these:
   - **Anthropic / OpenAI / any of 60+ supported providers** — AI
     features (the in-app wizard handles BYOK)
   - **Google OAuth** — "Sign in with Google" + Gmail / Drive / Calendar
   - **GitHub OAuth** — "Sign in with GitHub" + repo import
   - **Stripe** — paid billing tiers

The setup wizard surfaces missing keys + the OAuth callback URLs you
need to register, so you don't need them upfront.

### No domain yet?

If you don't want to buy a domain today, use **localhost mode**:
`./deployment/docker/setup.sh` with no `DOMAIN=`. Everything stays on
127.0.0.1, mkcert installs a trusted cert into your browser, and you
reach the app at `https://localhost` on the server itself (or via SSH
tunnel from your laptop). Caveats: provider OAuth login won't work
(callback validators reject localhost-with-path), no published-site
subdomains. Useful for kicking the tires before committing to a
domain.

---

## Shape A — Docker + Let's Encrypt (direct public ingress)

On a fresh VPS with Docker installed (or any Linux / macOS / Windows
box where Docker Desktop is running):

**Linux / macOS / WSL2:**

```bash
git clone https://github.com/doable-me/doable.git
cd doable

DOMAIN=app.example.com \
EMAIL=you@example.com \
./deployment/docker/setup.sh
```

**Native Windows (PowerShell — self-hosting on a Windows machine):**

```powershell
git clone https://github.com/doable-me/doable.git
cd doable

.\deployment\docker\setup.ps1 -Domain app.example.com -Email you@example.com
```

> **Note:** Shape B (Cloudflare Tunnel) below assumes a Linux host
> because `cloudflared` integrates with `systemd`. For a Windows host
> behind Cloudflare, install `cloudflared.exe` as a Windows service per
> Cloudflare's docs and run `setup.ps1 -Domain ... -SkipSsl`.

What happens (~10 min on a 2-vCPU VPS):

1. `setup.sh` detects Linux + docker, writes `deployment/docker/.env`
   with random secrets
2. Caddy env vars set: `DOABLE_SITE=app.example.com`, `DOABLE_TLS=you@example.com`,
   `DOABLE_BIND_ADDR=0.0.0.0`
3. `docker compose build` (5–10 min on first install) + `up -d`
4. The Caddy container binds 0.0.0.0:80 + 0.0.0.0:443 and **auto-fetches
   a Let's Encrypt cert via the HTTP-01 challenge** — no certbot, no
   cert manager, no DNS plugin. It also renews automatically.
5. Migrate container runs once + exits clean
6. All 5 services healthy

DNS: point `app.example.com` (A record) at the server's public IPv4
before running setup, so Caddy's ACME challenge succeeds on first
boot. If you skip this, Caddy keeps retrying every few minutes until
DNS catches up.

Verify:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://app.example.com/
# Expect: 200

curl -sS https://app.example.com/api/health
# Expect: {"status":"healthy",...}

echo | openssl s_client -connect app.example.com:443 -servername app.example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer
# Expect: Issuer: C = US, O = Let's Encrypt, CN = E*
```

---

## Shape B — Docker + Cloudflare Tunnel (recommended for production)

In this mode the server has **zero public ports** — Cloudflare's
network is the only ingress. The tunnel daemon (`cloudflared`)
maintains an outbound connection to Cloudflare's edge and forwards
matching requests back to Caddy on `127.0.0.1`.

### Prerequisites for Shape B

- Domain added to Cloudflare as a zone (free plan works). Free
  Universal SSL covers `<zone>` + `*.<zone>` (one level only).
  Two-level wildcards like `*.staging.example.com` need Cloudflare
  Advanced Certificate Manager (paid).
- Cloudflare account with permission to create tunnels + DNS records
  in that zone.

### Steps

```bash
# 1. Install cloudflared on the server (Debian/Ubuntu):
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# 2. Authenticate cloudflared against your CF account (opens a browser):
cloudflared tunnel login
# Pick your zone in the browser, click "Authorize"

# 3. Create a named tunnel:
cloudflared tunnel create doable
# Note the UUID printed — you'll need it in step 5

# 4. Run setup.sh in behind-proxy mode:
git clone https://github.com/doable-me/doable.git
cd doable
DOMAIN=app.example.com ./deployment/docker/setup.sh --skip-ssl
# --skip-ssl (or DOABLE_BEHIND_PROXY=1) tells Caddy:
#   - Bind 127.0.0.1 only (no public 0.0.0.0 — the tunnel is the only ingress)
#   - Use internal self-signed for the origin↔tunnel hop
#     (Cloudflare Tunnel doesn't verify the origin cert)

# 5. Configure cloudflared to forward to Caddy:
sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: <tunnel-uuid-from-step-3>
credentials-file: /root/.cloudflared/<tunnel-uuid-from-step-3>.json

ingress:
  - hostname: app.example.com
    service: https://localhost:443
    originRequest:
      noTLSVerify: true     # Caddy's internal self-signed isn't a real CA
      httpHostHeader: app.example.com
  - hostname: "*.example.com"
    service: https://localhost:443
    originRequest:
      noTLSVerify: true
      httpHostHeader: app.example.com
  - service: http_status:404
EOF

# 6. Route DNS for each public hostname:
cloudflared tunnel route dns doable app.example.com
cloudflared tunnel route dns doable "*.example.com"    # wildcard for published sites

# 7. Install cloudflared as a systemd service so it survives reboots:
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Verify (from your laptop, after Cloudflare DNS propagates — 10-60s):

```bash
curl -sI https://app.example.com/         # 200 OK
curl -sI https://app.example.com/api/health  # 200 OK
```

If you see `Error 1033` from Cloudflare, the tunnel isn't connected
yet — `systemctl status cloudflared` on the server, then
`journalctl -u cloudflared -n 50`.

---

## Publish layout: prefix vs infix

When users publish their AI-built sites, the platform mints a hostname like
`portfolio-x7k2m.<somewhere>`. `setup-server.sh` asks which **layout** to use,
and the choice maps to Cloudflare's TLS coverage:

| Layout   | URL shape                          | Cloudflare TLS                     | When to pick |
|----------|------------------------------------|-------------------------------------|--------------|
| `prefix` | `<env-prefix><slug>.<zone>`        | Free Universal SSL (`*.<zone>`)     | Default. One zone shared across envs (e.g. `dev-foo.example.com` + `prod-foo.example.com` both ride `*.example.com`). |
| `infix`  | `<slug>.<env>.<zone>`              | Cloudflare ACM (`*.<env>.<zone>`)   | You have ACM and want clean per-env wildcards (e.g. `foo.dev.example.com` under `*.dev.example.com`). |

### Prefix layout (default — free Universal SSL)

```bash
DOMAIN=dev.example.com \
PUBLISH_LAYOUT=prefix \
PUBLISH_PREFIX=dev- \
./deployment/server-setup.sh
```

Published-site URLs: `https://dev-portfolio-x7k2m.example.com`
(rides the zone's free `*.example.com` wildcard cert).

### Infix layout (requires Cloudflare ACM)

```bash
DOMAIN=dev.example.com \
PUBLISH_LAYOUT=infix \
WILDCARD_HOSTNAME='*.dev.example.com' \
./deployment/server-setup.sh
```

Published-site URLs: `https://portfolio-x7k2m.dev.example.com`
(needs ACM on the zone — free Universal SSL only covers one wildcard level).

The setup script auto-creates the `*.dev.example.com` CNAME via the Cloudflare
API token extracted from `cloudflared tunnel login` (so the OAuth login you
already did is enough — no separate CF API token needed). It also persists
`dns_mode=wildcard` + `dns_wildcard_hostname=*.dev.example.com` in
`platform_settings` so the `/admin` DNS panel reflects the choice.

If `cloudflared tunnel login` hasn't been run or the token can't be extracted,
the wildcard step is skipped with a warning — you can finish it post-install
at `https://<your-domain>/admin` → DNS settings → "Auto-configure wildcard".

### Switching layouts on an existing install

```bash
# Move dev.example.com from prefix → infix:
./deployment/reconfigure-domain.sh \
  --domain dev.example.com \
  --layout infix \
  --wildcard-hostname '*.dev.example.com'

# Or the reverse:
./deployment/reconfigure-domain.sh --domain dev.example.com --layout prefix
```

`reconfigure-domain.sh` rewrites `.env`, rebuilds `apps/web` (NEXT_PUBLIC_*
are baked at build time), and restarts the doable service.

---

## After setup (both shapes)

### First user = platform owner

Visit `https://app.<your-domain>/signup` (or `https://localhost/signup`
for localhost installs). The first account to sign up is automatically
promoted to platform owner. No SSH, no SQL.

### Setup wizard

After signup you're redirected to `/setup`. Five short steps:

1. **Welcome** — set your workspace name
2. **AI provider** — pick from 60+ providers (OpenAI, Anthropic,
   Google AI Studio, OpenRouter, Together, Groq, MiniMax, Ollama for
   local models, etc.), paste your API key
3. **Sign-in providers** — optional Google / GitHub OAuth setup with
   copy-paste callback URLs
4. **Cloudflare** — optional, for per-project custom domain features
5. **Plans & billing** — optional Stripe wiring

Each step is skippable from the wizard and revisitable from `/admin`.

### Where the bits live

```
<repo>/deployment/docker/.env          # All secrets, chmod 600
<repo>/deployment/docker/certs/        # mkcert-issued cert (local installs only)
<repo>/deployment/docker/docker-compose.yml
<repo>/deployment/docker/Caddyfile     # TLS terminator + reverse proxy config
```

For the Cloudflare Tunnel shape, additionally:

```
/etc/cloudflared/config.yml            # Tunnel ingress map
/root/.cloudflared/cert.pem            # CF account auth
/root/.cloudflared/<tunnel-uuid>.json  # Per-tunnel credentials
```

### Useful commands

```bash
# View all logs
docker compose -f deployment/docker/docker-compose.yml logs -f

# Specific service
docker compose -f deployment/docker/docker-compose.yml logs -f api
docker compose -f deployment/docker/docker-compose.yml logs -f caddy

# Restart the app
docker compose -f deployment/docker/docker-compose.yml restart api ws web

# Full nuke + rebuild (drops postgres data)
docker compose -f deployment/docker/docker-compose.yml down -v
./deployment/docker/setup.sh

# Cloudflare Tunnel
sudo systemctl restart cloudflared
sudo journalctl -u cloudflared -f
```

---

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl: (35) error reading server hello` on `https://app.example.com` | DNS hasn't propagated to the cert issuer yet | Wait 60s + retry. Caddy's ACME has its own retry loop. |
| Caddy keeps logging `obtaining certificate ... error` | Port :80 not reachable from the internet (Shape A) | Open port 80 in your VPS firewall + verify `curl http://app.example.com` returns 200 from outside |
| `Error 1033` from Cloudflare (Shape B) | Tunnel daemon not running or not authorized | `systemctl status cloudflared` + `journalctl -u cloudflared -n 50` |
| Browser shows "your connection is not private" on `https://localhost` | mkcert CA not trusted by the browser yet | Restart Chrome (Windows policy applies on next launch). For Firefox, re-run `mkcert -install` after Firefox is installed. |
| Migrate container exited non-zero | Stale postgres data volume from a prior install with different `.env` | `docker compose down -v && ./setup.sh` (drops + rebuilds postgres) |
| `next build` crashes with `Cannot read properties of null (reading 'useContext')` | Stale `.next` from a prior failed build | `rm -rf apps/web/{.next,.turbo}` + `docker compose build --no-cache web` |
| Web returns 502 right after restart | Caddy started before api/ws were healthy | `docker compose restart caddy` — Caddy has `depends_on: service_healthy` but bursty cold starts can still race |

---

## OAuth callback URLs to register

When you reach the setup wizard's Sign-in providers step, the wizard
shows the exact URLs to paste into each provider's dashboard. For
reference, the pattern is:

| Provider | Callback URL |
|---|---|
| Google | `https://app.<your-domain>/api/auth/google/callback` |
| GitHub (one OAuth App) | `https://app.<your-domain>/api/oauth/github/` ← register the parent; GitHub's subdir-match covers `login`, `copilot`, and `repo` sub-paths |
| Stripe webhooks | `https://app.<your-domain>/api/billing/stripe/webhook` |

All API routes live under `/api/*` on the same hostname as the web
app — Caddy in the docker stack handles the routing.

---

## Where to go next

- [Docker README](../deployment/docker/README.md) — deep dive on the
  docker stack, security model, multi-tenant sandbox overlay,
  troubleshooting
- [Provider docs](./PROVIDERS.md) — full list of supported AI
  providers + per-provider configuration notes
- The in-app wizard at `/setup` — keeps you in the UI for everything
  the docs above describe
