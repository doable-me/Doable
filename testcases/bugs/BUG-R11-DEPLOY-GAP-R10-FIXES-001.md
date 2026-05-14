# BUG-R11-DEPLOY-GAP-R10-FIXES-001 — Two R10 fix branches shipped but not deployed to dev

- **Severity**: P1 (one-off — operational/deploy, not a code defect)
- **Env**: dev (dev-api.doable.me / dodev.fid.pw)
- **Filed**: 2026-05-14 (Ralph R11)
- **Status**: OPEN — requires user with SSH access to deploy

## What's deployed vs not (verified by live probes from R11)

| R10 fix | Commit | Status on dev | Evidence |
|---|---|---|---|
| `fix(auth): return 409 on duplicate-email register` | `80988c3` | **DEPLOYED** (part of current branch) | duplicate register probe — rate-limited so can't be re-verified, but commit IS in HEAD |
| `fix(auth): /auth/password-reset public-access route` | `6e09ec5` | **NOT DEPLOYED** | `POST /auth/password-reset` returns 404 (authed) — see `testcases/evidence/dev/matrix-r11-v2/r10-failures.json` |
| `fix(setup): DOABLE_KEK back-fill in setup-server.sh` | `6e019a8` | **NOT DEPLOYED** | `POST /auth/mfa/enroll/start` returns `500 {"error":"Internal Server Error","message":"[envelope-crypto] DOABLE_KEK is not set. Provide a base64-encoded 32-byte key in the API process env."}` |
| `fix(chat): extract PDF text via pdf-parse` | `8f20970` | **DEPLOYED** (part of current branch, prompt-tokens proves it) | r11 PDF probe: prompt_tokens=128595 — much larger than scaffold-only; PDF text inlined |

## SSH gap
SSH from QA host to `root@dodev.fid.pw` is **denied** (`publickey,password`). Available local keys (`itdept_staging`, `wsl_id_ed25519`) do not authenticate. No `~/.ssh/config` entry exists. Per memory `feedback_no_deploy_without_permission`, this should not be worked around — surfacing for the user.

## Deploy commands (run by user on dodev with SSH access)

### Option A — merge the two fix branches into main, then pull on dev
```sh
# On the dev host (dodev.fid.pw)
cd /root/doable
git fetch origin
git checkout main
git merge --no-ff origin/fix/password-reset-public-access
git merge --no-ff origin/fix/setup-server-doable-kek
git push origin main

# Then on dodev
git pull
# Back-fill the KEK if missing in .env (setup-server.sh would do this idempotently)
grep -q DOABLE_KEK .env || echo "DOABLE_KEK=$(openssl rand -base64 32)" >> .env
# Bounce the API window in the doable tmux session
tmux send-keys -t doable:api C-c
sleep 1
tmux send-keys -t doable:api 'cd /root/doable && pnpm --filter @doable/api exec tsx watch src/index.ts' Enter
```

### Option B — cherry-pick and re-run setup-server.sh
```sh
cd /root/doable
git fetch origin
git cherry-pick 6e09ec5 6e019a8
./setup-server.sh   # idempotent — back-fills DOABLE_KEK if missing
systemctl restart doable
```

## Verification probe (run from this QA host after deploy)
```bash
ACCESS=<uniquegodwin JWT>

curl -sS -w '\nHTTP=%{http_code}\n' -X POST -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-owner@doable.test"}' \
  https://dev-api.doable.me/auth/password-reset
# Expected: HTTP 200 (or 400/429), not 404

curl -sS -w '\nHTTP=%{http_code}\n' -X POST -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://dev-api.doable.me/auth/mfa/enroll/start
# Expected: HTTP 200 with enroll payload (or 409 if already enrolled), not 500
```

## Carryover from R10
The R10 round shipped these fixes on origin and pushed them, but the dev box was never re-pulled and re-started. Two months of R10/R11 probes have flagged the same 9-10 matrix failures (5x password-reset 404, 4-5x MFA enroll 500). They are not new defects — they are deploy-state drift.

## R11 fixes also awaiting deploy
- `fix/r11-versions-projectpath-server-derived` @ `76fe7b6` — fixes BUG-R11-VERSIONS-EACCES-500-001 (POST /projects/:id/versions 500 + /boot leak)
- `fix/r11-pdf-attachment-prompt-and-persist` @ `fecc8c1` — fixes BUG-R11-PDF-ATTACHMENT-IGNORED-001 (PDF content not used) + chat-history empty + session_id wipe. **Requires DB migration**: `pnpm --filter @doable/api exec tsx src/db/migrate.ts` on dev to land migration `083_ai_sessions_workspace_id.sql`.

## Full deploy sequence (run by user on dodev with SSH)
```sh
cd /root/doable
git fetch origin

# Merge all 5 fix branches into main (or cherry-pick individually if main has diverged)
git checkout main
for br in fix/password-reset-public-access fix/setup-server-doable-kek fix/r11-versions-projectpath-server-derived fix/r11-pdf-attachment-prompt-and-persist; do
  git merge --no-ff "origin/$br"
done
git push origin main

# On dodev
git pull
pnpm install   # in case dependencies changed
pnpm --filter @doable/api exec tsx src/db/migrate.ts   # runs migration 083
grep -q DOABLE_KEK .env || echo "DOABLE_KEK=$(openssl rand -base64 32)" >> .env
tmux send-keys -t doable:api C-c
sleep 1
tmux send-keys -t doable:api 'cd /root/doable && pnpm --filter @doable/api exec tsx watch src/index.ts' Enter
```

## Recommended next step
- User (uniquegodwin) runs the full deploy sequence on dodev. R11 final regression will re-run the matrix and confirm these 10 failures drop to 0 PLUS PDF probe yields `pdf_text_detected_in_prompt: true`.
- Update `testcases/evidence/dev/_summary.json` after redeploy.
