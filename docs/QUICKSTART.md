# Doable — Quickstart

## Just want to play with it? (60 seconds, no domain required)

```bash
git clone https://github.com/doable-me/doable.git
cd doable
./deployment/docker/setup.sh
```

Open http://localhost:3000 in your browser. Sign up — the first account becomes platform owner automatically. The setup wizard walks you through AI keys and integrations. No SSH, no SQL, no .env editing.

To use AI features locally: drop your Anthropic or OpenAI key into the wizard (Step 2). Or connect GitHub Copilot if you have a subscription.

---

## Full VPS Setup (24 minutes from zero to deployed)

This guide takes you from an empty Hetzner box to a working Doable instance with HTTPS, AI features, sandboxed previews, and per-tenant DNS. Real timings, real values, real failure modes.

> Tested end-to-end on **2026-05-15** by reinstalling `testingserver.<your-bare-dns>` (Hetzner dedicated, 2x 477GB NVMe, 64GB RAM).
> Wall-clock breakdown of one verified run: installimage ~5 min, reboot ~30 s, setup-server.sh ~15 min (first pass) + ~3 min re-run after the Step-10 grep bug, smoke tests ~30 s. Total ≈ 24 min.
> All 13 setup steps completed, 113 DB migrations applied, web/api/ws all 200/200/101 via Cloudflare Tunnel.

---

## What you'll get

> **OSS note:** Doable is not hardcoded to any domain. The examples below use `doable.me` because that is the maintainer's zone; substitute your own domain (e.g. `example.com`) everywhere you see `doable.me`. `setup-server.sh` defaults to `localhost` when no domain is provided and prompts for the value otherwise — nothing in the script touches the maintainer's Cloudflare account.

After this guide:

| URL | Purpose |
|---|---|
| `https://<env>.<your-domain>` | Web app (Next.js) |
| `https://<env>-api.<your-domain>` | API (Hono) |
| `wss://<env>-ws.<your-domain>` | WebSocket (Yjs CRDT) |
| `https://<env>-<slug>.<your-domain>` | Per-user published sites |
| `ssh root@<env>.<your-bare-dns>` | Admin shell |

`<env>` is the short name you pick (e.g. `testingserver`, `dev`, `staging`). For prod, web sits on `<your-domain>` itself and the prefix becomes empty (`api.<your-domain>`, `ws.<your-domain>`).

The naming convention is **single-level under the zone** — `<env>-api.doable.me`, NOT `api.<env>.doable.me`. Free Cloudflare Universal SSL only covers `<zone>` + `*.<zone>`; two-level subdomains fail with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` unless you pay for Advanced Certificate Manager.

---

## Prerequisites

### What you need to host doable publicly

**A domain you own, routed through Cloudflare** is required for any public deployment. This is not negotiable — the security model (every service bound to 127.0.0.1, Cloudflare Tunnel as the only public ingress, Caddy serving wildcard published sites) depends on having a zone you control. The good news: a domain costs ~$9/yr from Cloudflare Registrar, the Cloudflare account itself is free, and once it's done the script handles the OAuth flow automatically.

Concretely, you need:

1. **A server** — Ubuntu 22.04 or 24.04 (Debian 12 also works), root SSH access, public IPv4, at least 4 GB RAM and 20 GB disk. Hetzner, Vultr, DigitalOcean, Linode, Scaleway all work; bare-metal or VM.
2. **A domain registered anywhere** (Namecheap, Cloudflare Registrar, etc.) — anything with a TLD you can point nameservers from.
3. **The domain added to Cloudflare as a zone** — free plan is fine. Free Universal SSL covers `<zone>` + `*.<zone>` (one level only). Two-level wildcards like `*.staging.example.com` need Cloudflare Advanced Certificate Manager (paid) — for that reason doable uses dashed single-level hostnames (`<env>-api.example.com`) for non-prod environments. See [Naming convention](#naming-convention-cloudflare-compatible) below.
4. **A browser logged into that Cloudflare account** — used once during setup for the OAuth approval that authorizes `cloudflared` to manage your zone. Doesn't need to be on the server; your laptop is fine.
5. **(Optional) Provider credentials for the features you want.** The base stack works without these; they each unlock a specific surface:
   - Google OAuth — "Sign in with Google" + Gmail / Drive / Calendar integrations
   - GitHub OAuth — "Sign in with GitHub" + repo import
   - Anthropic API key — Claude AI features
   - OpenAI API key — GPT AI features
   - Stripe — paid billing tiers

The script prints exactly which keys are missing and where to register each app at the end of the run, so you don't need them upfront.

### No domain yet?

If you don't want to buy a domain today, your only supported option is **`DOMAIN=localhost` mode**: `setup-server.sh` runs with no public access at all, everything stays on 127.0.0.1, and you reach the app at `http://localhost:3000` on the server itself (or via an SSH tunnel from your laptop). Caveats: Google/GitHub OAuth login won't work (their callback validators reject localhost-with-path), no published-site subdomains, no WebSocket-over-TLS — it's a local-experimentation mode, not a deployment. Useful for kicking the tires on a laptop before committing to a domain.

The following won't work as substitutes for a real domain:

- `*.pages.dev` — Cloudflare Pages is for static hosting; you don't own the zone, can't create CNAMEs, can't route a Tunnel there.
- `*.trycloudflare.com` (Quick Tunnels) — random hostname on every restart, one URL per tunnel, no subdomain control. Doable needs three stable hostnames (web/api/ws) with fixed URLs in `NEXT_PUBLIC_*` and OAuth callbacks.
- `<uuid>.cfargotunnel.com` (named tunnel without DNS) — only gives one hostname, and doable's CORS/auth design assumes web ≠ api ≠ ws origins.

### On the box you're driving from

- An SSH private key authorized on the target server
- `git` (and optionally `gh` CLI if cloning a private fork)
- A browser for the Cloudflare OAuth approval

### Naming convention (Cloudflare-compatible)

By convention doable separates two DNS purposes per environment:

- `<env>.<your-bare-dns>` — bare A record, **not** Cloudflare-proxied, used only for SSH. Can be a separate cheap domain or just the server IP.
- `<env>.<your-domain>` — Cloudflare-proxied, what users see.

Never SSH to the Cloudflare-proxied name — port 22 doesn't traverse the orange-cloud.

---

## Step 1 — Boot Hetzner rescue + verify SSH (~2 min)

In the Hetzner Robot console, activate the **Rescue** system for the server with your SSH key authorized, then trigger a reset. The box reboots into a Debian-based ramdisk image.

```bash
# Clear any stale host key from previous incarnations of this IP
ssh-keygen -R <env>.<your-bare-dns>
ssh-keygen -R <server-ip>

# Confirm rescue is up
ssh -i <your-ssh-key> root@<env>.<your-bare-dns> "hostname; uname -a; lsblk -d -o NAME,SIZE,MODEL,TYPE"
# Expected: hostname=rescue, two NVMe disks visible
```

If `hostname` is anything other than `rescue`, you're not in rescue mode yet — wait 30s and retry.

---

## Step 2 — Install Ubuntu 24.04 with RAID1 (~5 min)

Hetzner's `installimage` writes a fresh OS to disk. Software RAID1 across both NVMes gives you a live mirror — one disk can die without downtime.

```bash
# Push the autosetup config (drives, RAID level, hostname, partitions, image)
ssh -i <your-ssh-key> root@<env>.<your-bare-dns> "cat > /root/autosetup <<'EOF'
DRIVE1 /dev/nvme0n1
DRIVE2 /dev/nvme1n1
SWRAID 1
SWRAIDLEVEL 1
BOOTLOADER grub
HOSTNAME <env>
PART /boot ext3 1024M
PART swap swap 8G
PART / ext4 all
IMAGE /root/images/Ubuntu-2404-noble-amd64-base.tar.gz
EOF"

# Run installimage in detached background so SSH disconnect doesn't kill it
ssh -i <your-ssh-key> root@<env>.<your-bare-dns> \
  "nohup /root/.oldroot/nfs/install/installimage -a -c /root/autosetup > /root/installimage.log 2>&1 &"

# Poll until you see "INSTALLATION COMPLETE" (5-10 min)
ssh -i <your-ssh-key> root@<env>.<your-bare-dns> "tail /root/installimage.log"
```

Verify the log ends with `INSTALLATION COMPLETE`. Then reboot:

```bash
ssh -i <your-ssh-key> root@<env>.<your-bare-dns> "nohup reboot &" || true
ssh-keygen -R <env>.<your-bare-dns>   # rescue host key won't match the new install
```

Wait ~60s, then poll for the new Ubuntu to come up:

```bash
until ssh -i <your-ssh-key> -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 \
  -o BatchMode=yes root@<env>.<your-bare-dns> "cat /etc/os-release | head -1"; do
  sleep 5
done
# Expected: PRETTY_NAME="Ubuntu 24.04.3 LTS"
```

---

## Step 3 — Pre-stage Cloudflare cert + clone repo (~1 min)

Two things need to land on the new box before `setup-server.sh` runs:

**(a) Cloudflare account cert** — `/root/.cloudflared/cert.pem` is what authorizes `cloudflared` on this box to create tunnels and DNS records under *your* CF account. It is a per-account OAuth credential issued by `cloudflared tunnel login` — anyone holding it can manage tunnels and the granted zone.

**For first-time users, the default flow is the interactive browser login.** Skip this step entirely — `setup-server.sh` at Step 10 will run `cloudflared tunnel login`, print a URL, and you paste it into a browser logged into *your* Cloudflare account, then pick *your* zone. CF then writes a `cert.pem` scoped to your account only.

**For maintainers running a second/third server under the same CF account** (the only legitimate reuse case), you can pre-stage the cert from a sibling box to skip the browser step:

```bash
# ⚠️  ONLY if both servers belong to the same CF account and zone you control.
#     Never copy someone else's cert.pem — it gives full control of their tunnels + DNS.
scp -i <your-ssh-key> <path-to-sibling-cert.pem> \
  root@<env>.<your-bare-dns>:/tmp/cf-cert.pem

ssh -i <your-ssh-key> root@<env>.<your-bare-dns> \
  "mkdir -p /root/.cloudflared && mv /tmp/cf-cert.pem /root/.cloudflared/cert.pem && chmod 600 /root/.cloudflared/cert.pem"
```

If you go the interactive route, `cloudflared tunnel login` writes the cert to `/root/.cloudflared/cert.pem` automatically — nothing else for you to copy.

**(b) Repo at `/root/doable`** — clone with a GitHub token so the script can skip `gh auth login`:

```bash
TOKEN=$(gh auth token)   # local gh CLI, must have repo scope
ssh -i <your-ssh-key> root@<env>.<your-bare-dns> \
  "git clone https://x-access-token:$TOKEN@github.com/doable-me/doable.git /root/doable && \
   cd /root/doable && git log -1 --oneline"
```

---

## Step 4 — Run setup-server.sh (~15-20 min)

This is the heavy lift: 13 numbered steps that install Node 22, pnpm 9, PostgreSQL 16 (with pgvector + pg_trgm + pgcrypto), Caddy, cloudflared, bubblewrap, fail2ban, AppArmor profiles, the `doable` system user, systemd services, the Cloudflare Tunnel, and a built Next.js production bundle.

Pre-set the hostnames and DB password as env vars so the script runs without prompts:

```bash
DB_PASS=$(openssl rand -hex 16)
echo "Save this somewhere safe: DB_PASS=$DB_PASS"

ssh -i <your-ssh-key> root@<env>.<your-bare-dns> "cat > /root/run-setup.sh <<EOF
#!/bin/bash
export DOMAIN=<env>.doable.me
export API_DOMAIN=<env>-api.doable.me
export WS_DOMAIN=<env>-ws.doable.me
export API_SUB=<env>-api
export WS_SUB=<env>-ws
export PUBLISH_PREFIX=<env>-
export REPO=doable-me/doable
export DB_PASS='$DB_PASS'
export NON_INTERACTIVE=1
export DOABLE_NO_TMUX=1
export INSTALL_DIR=/root/doable
cd /root/doable
exec bash /root/doable/setup-server.sh
EOF
chmod +x /root/run-setup.sh
setsid bash -c 'nohup /root/run-setup.sh > /root/setup.log 2>&1' < /dev/null &
disown"
```

Poll progress (the script prints 13 numbered steps):

```bash
ssh -i <your-ssh-key> root@<env>.<your-bare-dns> "tail -30 /root/setup.log"
```

Wait for the closing banner:

```
╔══════════════════════════════════════════════════════════╗
║                  Setup Complete!                         ║
╚══════════════════════════════════════════════════════════╝
```

### Known issue: `[ERROR] Tunnel credentials file not found`

On a **first** run, Step 10 may exit with this error. Root cause: `cloudflared tunnel create` prints the new tunnel UUID on two output lines (once in "Tunnel credentials written to ..." and once in "Created tunnel ... with id ..."), and the script's `grep -oP` captures both — `TUNNEL_ID` ends up with an embedded newline that breaks the subsequent `find` for the JSON credentials file.

The tunnel itself **is created successfully** (you can confirm with `cloudflared tunnel list` — `doable-<env>-doable-me` will be there). Just re-run the launcher:

```bash
ssh -i <your-ssh-key> root@<env>.<your-bare-dns> "
  mv /root/setup.log /root/setup.log.first-run
  setsid bash -c 'nohup /root/run-setup.sh > /root/setup.log 2>&1' < /dev/null &
  disown
"
```

The re-run hits the `EXISTING_TUNNEL` branch (which uses `python3 -c` to parse JSON cleanly), so `TUNNEL_ID` is a single UUID and the rest of the script proceeds through Steps 11-13.

### What the script does, in order

| Step | What |
|---|---|
| 1 | apt: Node 22, pnpm, PostgreSQL 16, pgvector, Caddy, cloudflared, bubblewrap, fail2ban, tmux, Puppeteer/Chrome deps, Squid, nftables |
| 2 | UFW firewall: deny incoming except SSH (no app ports exposed — Cloudflare Tunnel handles ingress) |
| 3 | PostgreSQL listens on `localhost` only; fail2ban sshd jail with systemd backend |
| 4 | 1-2GB swapfile |
| 5 | Postgres `doable` user/DB (CREATEDB) |
| 6 | GitHub CLI auth (skipped — repo pre-staged at Step 3) |
| 7 | Repo clone (skipped — already cloned) |
| 8 | Writes `.env` with generated `JWT_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_SECRET`, `DOABLE_KEK`; per-app `apps/web/.env.local` |
| 9 | `pnpm install`, runs all SQL migrations from `services/api/src/db/migrations/` and `packages/db/migrations/`, `next build` for production |
| 10 | Cloudflare Tunnel: creates `doable-<env>-doable-me` tunnel, routes DNS for `<env>.doable.me`, `<env>-api.doable.me`, `<env>-ws.doable.me` |
| 11 | Caddy on `127.0.0.1:8080` for `*.doable.me` published sites; sites dir at `/root/doable/sites/` |
| 11.5 | `doable` system user (uid 5000); chown install dir |
| 12 | systemd: `doable.service` (tmux-wrapped), `doable-watchdog.timer` (every 2 min), `cloudflared.service`, `doable-app@.service` template |
| 12.5 | Squid build-time HTTP proxy (egress firewall for builds) |
| 12.6 | AppArmor profiles, sandbox-spawn + sandbox-mount helpers, polkit rule, sudoers grant |
| 13 | Start everything, smoke test |

---

## Step 5 — Verify (~2 min)

```bash
ssh -i <your-ssh-key> root@<env>.<your-bare-dns> "
  systemctl is-active doable.service cloudflared
  ss -tlnp | grep -E ':(3000|4000|4001|5432|8080)'
  curl -sI http://127.0.0.1:3000/ | head -1
"
# Expected:
#   active / active
#   all listeners on 127.0.0.1 (never 0.0.0.0)
#   HTTP/1.1 200 OK
```

From your laptop, after Cloudflare DNS propagates (10-60s):

```bash
curl -sI https://<env>.doable.me/ | head -1            # 200 OK
curl -sI https://<env>-api.doable.me/health | head -1  # 200 OK
```

If you see `Error 1033` from Cloudflare, the tunnel isn't connected — `systemctl status cloudflared` on the server, then `journalctl -u cloudflared -n 50`.

If you see `SSL_VERSION_OR_CIPHER_MISMATCH` for `<env>-something.doable.me`, the DNS record is missing or proxied incorrectly. Re-run `cloudflared tunnel route dns doable-<env>-doable-me <hostname>` for each one.

---

## Step 6 — Create your first admin user

**This step is no longer required.** As of 2026-05, the first user to sign up on a fresh install is automatically promoted to platform owner. Just visit `https://<env>.<your-domain>/signup` after install completes.

---

## Step 7 — Configure integrations (optional)

The in-app setup wizard at `https://<env>.<your-domain>/setup` is the easiest way to configure integrations and AI providers. The wizard guides you through each step and surfaces copy-paste OAuth callback URLs for each provider.

Alternatively, edit `/root/doable/.env` to add:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google login + Drive/Calendar/Gmail integrations)
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (GitHub login + repo import)
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (AI features — Claude / GPT)
- `STRIPE_SECRET_KEY` (paid tiers)

After editing, `systemctl restart doable.service`.

OAuth callbacks must be set in each provider's dashboard:

- Google: `https://<env>-api.<your-domain>/auth/google/callback`
- GitHub login: `https://<env>-api.<your-domain>/auth/github/callback`
- GitHub repo: `https://<env>-api.<your-domain>/auth/github/repo/callback`

---

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `Connection refused` on SSH right after `installimage` | Server still booting | Wait 60s and retry |
| `Connection refused` from rescue → installed Ubuntu | Stale host key in `~/.ssh/known_hosts` | `ssh-keygen -R <env>.<your-bare-dns>` |
| `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` in browser | Two-level subdomain on free Universal SSL | Use `<env>-api.doable.me`, not `api.<env>.doable.me` |
| `Error 1033` from Cloudflare | Tunnel not running | `systemctl status cloudflared` |
| Setup hangs at "Cloudflare authentication" | No pre-staged cert.pem and no TTY | scp cert.pem from a sibling server (see Step 3a) |
| `next build` crashes with `Cannot read properties of null (reading 'useContext')` | Stale `.next` from a prior failed build | `rm -rf /root/doable/apps/web/{.next,.turbo}` and rerun |
| Migrations leave columns missing | One of two migration dirs skipped | Run both: `services/api/src/db/migrations/` and `packages/db/migrations/` |
| Web returns 502 after restart | tmux session orphaned by `User=` flip | `systemctl restart doable` — watchdog re-creates the session |

---

## Useful commands on the server

```bash
tmux attach -t doable            # See live API/web/ws logs
systemctl restart doable         # Restart the app
systemctl restart cloudflared    # Restart the tunnel
tail -f /var/log/doable/watchdog.log
ufw status                       # Firewall rules
ss -tlnp                         # Verify all binds are 127.0.0.1
sudo -u postgres psql -d doable  # Direct DB access
```

---

## Where the bits live

```
/root/doable/                   # Repo (cloned by Step 3)
/root/doable/.env               # All secrets, mode 600, owned by doable:doable
/root/doable/apps/web/.env.local
/root/doable/sites/<slug>/      # Published static sites (served by Caddy)
/root/.cloudflared/cert.pem     # CF account auth (per-account, reusable)
/root/.cloudflared/<tunnel-id>.json    # Per-tunnel credentials
/root/.cloudflared/config.yml   # Ingress map: hostnames → 127.0.0.1:ports
/etc/systemd/system/doable.service
/etc/caddy/Caddyfile            # Wildcard *.doable.me serving
/var/log/doable/                # Watchdog + app logs
/data/projects/<id>/            # Per-app sandbox roots (DynamicUser=yes)
```
