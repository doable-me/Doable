# Next-Server Setup Checklist

Forward-looking checklist for the **next** Doable server we provision (not retrofitting an existing one). Compiled 2026-05-09 after the staging.doable.me audit. Treats every finding from `01-05-*.md` as a "do not repeat" item, plus the new things we hit on staging.

**Goal:** stand up a new environment that doesn't need a security retrofit later. Aim for "no service runs as root from day one."

---

## Phase 0 — Decisions before you SSH in

Before running `setup-server.sh` on a fresh box, decide:

- [ ] **Hostname plan.** Does the new env land at `<env>.doable.me` (web) + `<env>-api.doable.me` (api) + `<env>-ws.doable.me` (ws) per the Cloudflare-naming rule in `CLAUDE.md`? **Per-environment GitHub OAuth app already created** in the org with that callback URL? (See `~/.claude/.../memory/reference_oauth_apps.md` — staging needed its own app; dev's keys did NOT work for staging.)
- [ ] **Cloudflare tunnel allocated** for this env (one tunnel per env). Tunnel UUID written to `CLOUDFLARED_TUNNEL_ID` in `.env`. Without this set, per-publish DNS auto-creation silently fails.
- [ ] **Cloudflare DNS records pre-staged** for the tunnel: `<env>.doable.me`, `<env>-api.doable.me`, `<env>-ws.doable.me` all CNAME to `<tunnel-uuid>.cfargotunnel.com`. (Per-publish records are auto-created by `cloudflared tunnel route dns` at deploy time.)
- [ ] **Will `*.doable.me` wildcard DNS conflict?** The apex `*.doable.me` already CNAMEs to the prod tunnel. Single-level publish URLs (`<env>-<slug>.doable.me`) only work because the per-publish CNAMEs are *more specific* and override the wildcard. Confirm prod's wildcard hasn't been changed to a non-wildcard pattern.
- [ ] **Stripe**: leave `STRIPE_SECRET_KEY` empty for staging-style envs. The billing routes degrade gracefully (`try/catch` wrap from commit 73cb06d). For production, set real keys + webhook secret.

---

## Phase 1 — Run setup-server.sh, but don't accept "User=root"

The script as it stands today writes `User=root` into `/etc/systemd/system/doable.service` and copies the app to `/root/doable`. That's the single biggest avoidable issue from `02-services-as-root.md` and the staging audit on 2026-05-09.

**Before running setup-server.sh, patch it** (or do these steps manually after):

- [ ] Create a dedicated system user: `useradd --system --shell /usr/sbin/nologin --home-dir /opt/doable --create-home doable`
- [ ] Install the app to `/opt/doable`, NOT `/root/doable`
- [ ] `chown -R doable:doable /opt/doable`
- [ ] In the systemd unit:
  - `User=doable`
  - `Group=doable`
  - `WorkingDirectory=/opt/doable`
  - `ExecStart=/opt/doable/start.sh`
  - Add `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `NoNewPrivileges=true` (compat-tested in dev first if any per-project sandbox spawns rely on uid=0)
- [ ] If `dovault systemd-run` requires root to spawn per-project units, give the `doable` user a tightly-scoped `sudo NOPASSWD:` rule for `systemd-run` only. Do NOT keep the parent at `User=root` just because the child needs it.

Verification after first start:

```bash
ps -eo user,pid,cmd | grep -E "next-server|tsx watch|node.*ws"
# All three should show "doable", NOT "root"
```

If they say `root`, the demo can still run, but check this off as the first follow-up.

---

## Phase 2 — Lock down the .env from the start (don't wait for retrofit)

Findings 01 and the staging audit:

- [ ] `.env` is `chmod 600` and `chown doable:doable` (or `root:root` if still root-owned) at first write. The setup script's heredoc tends to leave it 644 because of the parent dir's umask.
- [ ] Add a verification step at the end of setup-server.sh: `stat -c "%a %U:%G" /opt/doable/.env` should output `600 doable:doable` (or `600 root:root`). Fail loudly if not.
- [ ] Test with a non-root, non-doable user: `sudo -u nobody cat /opt/doable/.env` should return `Permission denied`. The dev audit caught this exact gap.

---

## Phase 3 — SSH posture

- [ ] During provisioning create a dedicated sudo user `douser` with the SSH key. `usermod -aG sudo douser`. (Setup script default — change `ADMIN_USER` if you want a different name.)
- [ ] In `/etc/ssh/sshd_config`:
  - `PermitRootLogin no` (currently `without-password` on staging — key-only but still root-capable)
  - `PasswordAuthentication no`
  - `PubkeyAuthentication yes`
- [ ] **Test the new user can SSH and `sudo` BEFORE disabling root.** Otherwise the host is locked out.
- [ ] `ufw allow OpenSSH && ufw default deny incoming && ufw default allow outgoing && ufw enable`
- [ ] `systemctl enable --now fail2ban unattended-upgrades`

---

## Phase 4 — Egress jail (don't skip — `04-egress-jail.md`)

- [ ] Squid actually started AND listening on `127.0.0.1:3128` (verified with `ss -tlnp`). On staging it WAS up; on dodev it was declared but inactive.
- [ ] `BUILD_HTTP_PROXY=http://127.0.0.1:3128` in `.env` so AI-built code's `npm install` goes through Squid.
- [ ] `nft` ruleset: deny outbound from `skuid` of every per-project sandbox UID (10001, 10016+) except to:
  - 127.0.0.1 (Squid)
  - DNS (53/udp)
  - GitHub HTTPS (api.github.com, github.com, codeload.github.com — for `git pull` from connected repos)
  - The configured AI provider hostname(s) (Copilot, OpenAI, Anthropic if BYOK)
- [ ] Repeat the same lockdown for the platform user (`doable`) once the platform is moved off root, scoped to its actual outbound needs (Cloudflare edge for tunnel, GitHub OAuth, AI providers, Stripe if paid).

---

## Phase 5 — Cloudflare tunnel ingress and Caddy regex

Lessons from the staging publish-URL fix on 2026-05-08:

- [ ] cloudflared `config.yml` ingress includes a wildcard `*.doable.me` route to `127.0.0.1:8080` so per-publish hostnames (`<env>-<slug>.doable.me`) reach Caddy. **Note:** cloudflared rejects multi-wildcard syntax like `<env>-*.doable.me` — must be plain `*.doable.me` or specific hostnames.
- [ ] Validate before reload: `cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate`. If it fails, cloudflared won't start and the tunnel goes down.
- [ ] Caddyfile regex matches `^([a-z0-9][-a-z0-9]*)\.${DOABLE_DOMAIN}$` and serves from `${SITES_DIR}/{re.subdomain.1}/live`. With the env-prefix design (`PUBLISH_SUBDOMAIN_PREFIX=<env>-`), `{re.subdomain.1}` becomes the full prefixed subdomain (e.g. `staging-myslug`), and `siteDir` in `doable-cloud.ts` must use the prefixed `siteSubdomain` — NOT the raw subdomain. Critical fix from commit applied 2026-05-08; verify it survived any subsequent merges.
- [ ] Each per-project deploy auto-creates DNS via `cloudflared tunnel route dns <tunnel-id> <hostname>`. Requires `CLOUDFLARED_TUNNEL_ID` set in `.env` (NOT the placeholder `PENDING_FROM_TUNNEL_SETUP`) and the `cloudflared` CLI authed on the host.

---

## Phase 6 — App-layer issues to fix at this server (not deferred)

From the API audit at `testcases/99-runlog/FINDINGS.md` (2026-05-08):

- [ ] **CORS reflection**: server reflects any `Origin` with `access-control-allow-credentials: true`. Configured `CORS_ORIGINS` env is ignored. Whoever fixes the CORS middleware should validate Origin against the env value.
- [ ] **`POST /projects/:id/files` lacks project access guard** (`services/api/src/routes/editor.ts:10` only attaches authMiddleware). Returns 201 for cross-tenant writes. Add `requireProjectAccess` middleware to the editor router.
- [ ] **Long path 500**: `/projects/<2000-char>` returns 500 instead of 400/414. Add path length validation.
- [ ] **Client-side admin gate missing**: `/admin` page renders for non-admins (server-side 403s correctly, but the UI shouldn't show the controls). Wrap in a `useAuth()` check that redirects.
- [ ] **Auth-provider stale identity**: doesn't re-read localStorage on route change. `AuthProvider` should subscribe to `storage` events.

These were observed on staging as of 2026-05-08 evening. If a new server is built off the same `main` branch, they'll be present.

---

## Phase 7 — Smoke test before declaring done

- [ ] All listening sockets bind 127.0.0.1 except sshd:22: `ss -tlnp | grep -v "127\.\|::1"`
- [ ] Process owners: `ps -eo user,pid,cmd | grep -E "next-server|tsx|node.*ws|caddy|cloudflared|postgres"` — only `caddy` and `postgres` (and ideally `doable`) shown; `root` should NOT own the doable services.
- [ ] `curl https://<env>.doable.me/login` → 200
- [ ] `curl https://<env>-api.doable.me/health` → 200
- [ ] Sign up a test user via `/auth/register`, promote via SQL to `is_platform_admin=true`, log in, hit `/admin` → 200
- [ ] Deploy a test project via the editor's Deploy → Live button. Verify the URL `<env>-<slug>.doable.me` opens in a browser with valid TLS (Universal SSL `*.doable.me` cert).
- [ ] Repeat with Deploy → Test, verify `<env>-p-<slug>.doable.me` opens.
- [ ] DNS check: `dig <env>-<slug>.doable.me CNAME` should return `<tunnel-uuid>.cfargotunnel.com` for THIS env's tunnel — not prod's.

---

## Quick links to existing detailed write-ups

- [01-env-secrets.md](01-env-secrets.md) — `.env` perms drift
- [02-services-as-root.md](02-services-as-root.md) — root processes (root cause for many other issues)
- [03-puppeteer-hardening.md](03-puppeteer-hardening.md) — `--no-sandbox` Chrome
- [04-egress-jail.md](04-egress-jail.md) — nft + Squid wiring
- [05-dovault-spawn-wiring.md](05-dovault-spawn-wiring.md) — uniform spawn enforcement
- [06-app-layer-findings-pointer.md](06-app-layer-findings-pointer.md) — app-layer audit pointer
- [`testcases/99-runlog/FINDINGS.md`](../testcases/99-runlog/FINDINGS.md) — staging E2E findings 2026-05-08
- `~/.claude/.../memory/reference_oauth_apps.md` — which GitHub OAuth app belongs to which env (4 separate apps)
- `~/.claude/.../memory/feedback_security.md` — never bind 0.0.0.0; 127.0.0.1 + Cloudflare Tunnel only
