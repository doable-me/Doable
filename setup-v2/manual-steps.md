# Manual steps for a per-org environment

Things `setup-server.sh` cannot do automatically. Run these on the new
VPS (or in a browser where noted) in order. After step 4 the setup
script can finish unattended.

Throughout this doc, `<env>` is the org/environment name an operator
chose for `DOABLE_ENV_NAME` (e.g. `myorg`, `qa`, `prod`). Replace it
inline as you go.

---

## 1. Create the Cloudflare Tunnel `<env>`

> **Why manual:** the staging API token in env var
> `CLOUDFLARE_API_TOKEN` lacks `Account.Cloudflare Tunnel:Edit` scope.
> Probe on 2026-05-09 returned `code:10000 Authentication error` from
> `/accounts/<id>/cfd_tunnel`. Either widen the token's scope in the CF
> dashboard (Profile → API Tokens → edit → add Cloudflare Tunnel:Edit)
> OR follow the interactive flow below — interactive is faster.

```bash
# On the per-env VPS as root:
apt-get update && apt-get install -y cloudflared    # if setup script hasn't yet
cloudflared tunnel login                             # opens a URL — paste in browser, pick zone doable.me
cloudflared tunnel create <env>                      # prints UUID + writes /root/.cloudflared/<UUID>.json
```

Capture the UUID printed by the `create` command. Then:

1. Paste the UUID into `/root/doable/.env` as `CLOUDFLARED_TUNNEL_ID=...`.
2. Paste the same UUID into both `<PASTE_TUNNEL_UUID_HERE>` slots in
   `/etc/cloudflared/config.yml` (template in this folder).
3. Create the three DNS records via the tunnel CLI (auto-creates
   proxied CNAMEs):

   ```bash
   cloudflared tunnel route dns <env> <env>.doable.me
   cloudflared tunnel route dns <env> <env>-api.doable.me
   cloudflared tunnel route dns <env> <env>-ws.doable.me
   ```

4. Install and start the systemd service:

   ```bash
   cloudflared service install
   systemctl restart cloudflared
   systemctl status cloudflared --no-pager
   ```

---

## 2. Create the GitHub OAuth app `DoableMe-<Env>`

> **Why manual:** GitHub allows only ONE callback URL per OAuth app, and
> there is no usable API for OAuth-app creation under a personal
> account. Per `reference_oauth_apps.md` we run one app per environment.

1. Go to https://github.com/settings/applications/new (or under your
   org's settings if you want org ownership).
2. Fill in:
   - **Application name:** `DoableMe-<Env>`
   - **Homepage URL:** `https://<env>.doable.me`
   - **Authorization callback URL:** `https://<env>-api.doable.me/auth/github/`
     **(trailing slash matters — prefix-matching covers
     `/callback`, `/copilot/callback`, `/repo/callback`).**
3. Click **Register application**.
4. On the resulting page click **Generate a new client secret** and copy
   both the **Client ID** and the **Client Secret**.
5. Paste them into `/root/doable/.env`:
   - `GITHUB_CLIENT_ID=<paste>`
   - `GITHUB_CLIENT_SECRET=<paste>`
6. Add the new app's metadata to your credentials backup so it's
   tracked alongside any other GitHub OAuth apps.

---

## 3. Add the new env's callback to the shared Supabase Management OAuth app

> **Why manual:** Supabase OAuth dashboard requires a logged-in browser
> session.

1. Open the Supabase org dashboard for your account.
2. Open the existing single Supabase Management OAuth app (one shared
   client across all envs).
3. In **Redirect URIs**, add:
   `https://<env>-api.doable.me/integrations/enhanced-auth/callback`
4. Save. The existing localhost / dev / prod URIs stay — Supabase
   supports multiple redirect URIs per app.
5. No env-var change needed —
   `OAUTH_SUPABASE_MGMT_CLIENT_ID` /  `_SECRET` are already in
   `env-template.md` as literals.

---

## 4. (Optional) Google OAuth + Resend domain

Only if this env needs Google sign-in or transactional email:

- **Google:** create a new OAuth client in
  https://console.cloud.google.com/apis/credentials with redirect
  `https://<env>-api.doable.me/auth/google/callback`. Paste into
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Resend:** verify `doable.me` as a sending domain (likely already
  done — should be reusable). If a separate API key is desired, mint
  one at https://resend.com/api-keys and put in `RESEND_API_KEY`.

---

## 5. Anthropic / OpenAI API keys

Workspace-scoped — paste current production keys (or env-specific
keys if you want to silo billing) into:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY` (optional fallback)

---

## 6. After the script finishes

1. `systemctl status doable cloudflared` — both green.
2. Open https://<env>.doable.me — should serve the Next.js app.
3. Open https://<env>-api.doable.me/health — should `200 OK`.
4. Sign up as the first user — that user automatically becomes the
   platform admin (per existing setup convention).
5. As platform admin, connect a GitHub Copilot account through the UI
   (this populates the encrypted `github_copilot_accounts` row — no env
   var work needed).
6. **Back up `ENCRYPTION_KEY`** from `/root/doable/.env` to your secrets
   vault. Without it every encrypted row is unrecoverable.
7. Verify on the VPS that nothing is bound to a public interface:

   ```bash
   ss -tlnp | grep -vE '127\.0\.0\.1|::1'
   ```

   Expected: only `:22` (sshd). Anything else is a CLAUDE.md violation
   and must be fixed before going live.

---

## Summary of human-only blockers

| # | Blocker                                                       | Owner    | Time |
|---|---------------------------------------------------------------|----------|------|
| 1 | Create `<env>` Cloudflare tunnel + DNS routes                 | Operator | 5 min |
| 2 | Create `DoableMe-<Env>` GitHub OAuth app                      | Operator | 3 min |
| 3 | Add `<env>` callback to Supabase Mgmt OAuth app               | Operator | 1 min |
| 4 | Paste `CLOUDFLARED_TUNNEL_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ANTHROPIC_API_KEY` into `/root/doable/.env` | Operator | 2 min |
| 5 | Back up `ENCRYPTION_KEY` to secrets vault after first boot    | Operator | 1 min |
