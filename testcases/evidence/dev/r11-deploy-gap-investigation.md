# R11 Deploy-Gap Investigation — dev.doable.me
Date: 2026-05-14

## 1. Live Probe Results

### 1a. `/auth/password-reset` (fix/password-reset-public-access — commit 6e09ec5)
```
POST https://dev-api.doable.me/auth/password-reset
HTTP 404  {"error":"Not Found","path":"/auth/password-reset"}
```
**GAP CONFIRMED.** Route does not exist on the running API process.

### 1b. `/auth/mfa/enroll/start` (fix/setup-server-doable-kek — commit 6e019a8)
```
POST https://dev-api.doable.me/auth/mfa/enroll/start
HTTP 500  {"error":"Internal Server Error","message":"[envelope-crypto] DOABLE_KEK is not set. Provide a base64-encoded 32-byte key in the API process env."}
```
**GAP CONFIRMED.** `DOABLE_KEK` env var is absent from the running API process on dev.

---

## 2. Branch Existence on origin

Both fix branches exist on `origin`:

| Branch | Tip commit | Summary |
|--------|-----------|---------|
| `origin/fix/password-reset-public-access` | `6e09ec5` | fix(auth): make /auth/password-reset public + alias forgot-password |
| `origin/fix/setup-server-doable-kek` | `6e019a8` | fix(setup): back-fill DOABLE_KEK on idempotent re-runs + fail-fast at API boot |

Both branches have NOT been merged into `origin/main`. A search of the 30 most-recent main commits found no mention of "password-reset" or "DOABLE_KEK" (only the older `fix(security): encrypt platform_settings.cf_api_token at rest with KEK` at `911a540`, which is a different feature).

---

## 3. SSH Access to dodev.fid.pw

- **Default key attempt:** `Permission denied (publickey,password)` — EXIT 255
- **`~/.ssh/doable_dev` attempt:** Key file does not exist on this machine
- **Available keys in `~/.ssh/`:** `itdept_staging`, `wsl_id_ed25519` — neither appears to be the dev-server key
- **`~/.ssh/config`:** Empty / no entries

**Conclusion: No working SSH path from this machine to dodev.fid.pw.** The user must SSH manually or locate the correct private key.

---

## 4. doable-admin TUI

Path `C:/Users/gj/Documents/workspace/doablechore/tools/admin-cli` **exists** and is a Rust project (`Cargo.toml`, `src/` with `app.rs`, `db.rs`, `main.rs`, `server_config.rs`, `ui.rs`). This is a local TUI — it connects directly to the DB and does not appear to have a remote-deploy command (it is not a deploy webhook client).

---

## 5. CI/CD Deploy Path

`.github/workflows/ci.yml` runs only `pnpm install`, `type-check`, and `lint` on push to `main` and on PRs. **There is no automated deploy step.** Deployment to dev is entirely manual (SSH + git pull + service restart).

---

## 6. Root Cause Summary

| Issue | Root cause |
|-------|-----------|
| `404 /auth/password-reset` | `fix/password-reset-public-access` (6e09ec5) never merged/pulled to dev server |
| `500 DOABLE_KEK not set` | `fix/setup-server-doable-kek` (6e019a8) never merged/pulled; even if pulled, setup-server.sh must be re-run to back-fill the env var into `/root/doable/.env` |

---

## 7. Recommended Next Steps (user must run manually)

### Step A — SSH into dev server
```sh
ssh root@dodev.fid.pw
```
(Locate the correct private key first — it is not present on this Windows machine.)

### Step B — Pull both fix branches and merge into the running code
```sh
cd /root/doable
git fetch origin

# Merge both fixes onto whatever branch dev is tracking (likely main or a deploy branch)
git merge origin/fix/password-reset-public-access
git merge origin/fix/setup-server-doable-kek
```
If dev tracks `main` and you want to keep main clean, cherry-pick instead:
```sh
git cherry-pick 6e09ec5   # password-reset route
git cherry-pick 6e019a8   # DOABLE_KEK back-fill
```

### Step C — Back-fill DOABLE_KEK
The `fix/setup-server-doable-kek` commit makes `setup-server.sh` auto-generate and write `DOABLE_KEK` on idempotent re-runs. Run it:
```sh
./setup-server.sh
```
Or manually add the var if you prefer not to re-run the full script:
```sh
grep DOABLE_KEK /root/doable/.env || \
  echo "DOABLE_KEK=$(openssl rand -base64 32)" >> /root/doable/.env
```

### Step D — Restart API process to pick up new code + env
```sh
tmux send-keys -t doable:api C-c Enter
tmux send-keys -t doable:api 'cd /root/doable && pnpm --filter api start' Enter
```
(Or use the systemd approach: `systemctl restart doable` if the unit restarts individual tmux windows.)

### Step E — Re-run probes to confirm
```sh
curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"email":"qa-owner@doable.test"}' \
  https://dev-api.doable.me/auth/password-reset
# Expect: 200 or 202, not 404

curl -sS -X POST \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://dev-api.doable.me/auth/mfa/enroll/start
# Expect: 200 with TOTP secret, not 500
```

---

## 8. Optional: Merge to main first
If the intent is to keep dev in sync with main, merge both fix branches into main locally, push, then pull on dev:
```sh
# Local:
git checkout main
git merge origin/fix/password-reset-public-access
git merge origin/fix/setup-server-doable-kek
git push origin main

# On dev server:
cd /root/doable && git pull origin main
# then Step C + D above
```
