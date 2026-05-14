# /batch /team Run — 2026-05-14

## PRs merged into main (12)

| PR | Title | Bug fixed |
|---|---|---|
| #9 | fix(setup): land DOABLE_KEK back-fill + fail-fast | BUG-R10-MFA-ENROLL-500 |
| #10 | fix(usage): clarify empty-state copy | BUG-009 |
| #11 | fix(web): add /help index page | BUG-004 |
| #12 | fix(versions): derive projectPath server-side | BUG-R11-VERSIONS-EACCES-500 |
| #13 | fix(auth): land /auth/password-reset public-access | BUG-R10-AUTH-PASSWORD-RESET-404 |
| #14 | fix(web): redirect /settings/{ai,usage,billing} to top-level | BUG-001/002/003/008 |
| #15 | fix(api): /projects/:id/files returns 404 for non-existent | BUG-R10-PROJECT-FILES-EMPTY-200 + BUG-R11-SEC-RLS |
| #16 | fix(settings): button-disable validation + theme-checkmark | BUG-006/007/010 |
| #17 | docs: triage catalog + logout/trailing-slash contracts | BUG-R10-AUTH-LOGOUT-ANON-200 + BUG-R10-TRAILING-SLASH |
| #18 | fix(web): add favicon | BUG-005 |
| #19 | fix(chat): land PDF-attachment prompt + session persistence + migration 083 | BUG-R11-PDF-ATTACHMENT-IGNORED |
| #20 | fix(web): wire /favicon.ico to dynamic icon route | BUG-005 (follow-up) |

## Already-in-main (no new PR)

| Bug | Status |
|---|---|
| BUG-API-BILLING-USAGE-PARAMS-001 | Already merged as PR #7 (commit 3b7df42) |
| BUG-AUTH-LOGIN-RATELIMIT-SEED-001 | Already merged as commit 53a193d |
| BUG-DEV-WS-OOM-001 | Already merged as commit 91282a7 |
| BUG-AI-PDF-IGNORED-001 | Already merged as commit 8f20970 |
| BUG-R10-AUTH-REGISTER-DUP-500-001 | Already merged as commit 80988c3 |
| BUG-R11-SEC-BAD-SIG-200 | RETRACTED (base64url non-canonical encoding artifact) |
| BUG-API-TEMPLATES-AUTH-001 | INVALID (intentional security tightening — kept) |
| BUG-R11-DEPLOY-GAP-R10-FIXES-001 | Resolved by this deploy |

## Deploy outcome (dodev → dev.doable.me / dev-api.doable.me)

- Pre-deploy: dodev's `/root/doable` git was in a broken "fresh init on master, no commits" state with 2 staged files. Backed up the staged files to `/root/doable-staged-backup-2026-05-14/`.
- Used `git bundle` over scp to push main HEAD `852beea7` to dodev (deploy key wasn't authorized; SSH-via-key from local Windows + bundle worked).
- `pnpm install`, `services/api` migration 083 verified applied (workspace_id column + index + FK to workspaces ON DELETE CASCADE present).
- `systemctl restart doable.service` restarted API + WS in tmux. Web (next-server standalone) was orphaned; manually killed + relaunched with `HOSTNAME=127.0.0.1 PORT=3000` (initial relaunch was incorrectly bound to 0.0.0.0 — caught + fixed within 30s).
- Final port state: 127.0.0.1:3000 (web), 127.0.0.1:4000 (api), 127.0.0.1:4001 (ws). NO 0.0.0.0 binds.

## Live verification on dev (after deploy)

| Bug | Endpoint | Before | After | Status |
|---|---|---|---|---|
| BUG-001/002/003 | GET /settings/ai | 404 | **307 → /ai-settings** | ✅ |
| BUG-001/002/003 | GET /settings/usage | 404 | **307 → /usage** | ✅ |
| BUG-004 | GET /help | 404 | **200** | ✅ |
| BUG-005 | GET /favicon.ico | 404 | **200 image/png** (PR #20: metadata.icons + rewrites /favicon.ico→/icon) | ✅ |
| BUG-006/007/010 | UI checks | broken | new code in #16 | code-only verified |
| BUG-009 | usage page copy | unclear | new code in #10 | code-only verified |
| BUG-R10-PASSWORD-RESET | POST /auth/password-reset | 404 | **429 (rate-limited but route registered)** | ✅ |
| BUG-R10-MFA-ENROLL-500 | POST /auth/mfa/enroll/start | 500 KEK | **200** | ✅ |
| BUG-R11-VERSIONS-EACCES-500 | POST /projects/:id/versions | 500 EACCES /boot | **400 invalid uuid** (no path leak) | ✅ |
| BUG-API-BILLING-USAGE-PARAMS | GET /billing/usage | 400 | **200** | ✅ |
| BUG-R10-PROJECT-FILES-EMPTY-200 | GET /projects/<noproject>/files | 200 empty | **404** | ✅ |
| Security: 0.0.0.0 binds on ports 3000/4000/4001/5432/8080 | n/a | n/a | **none** | ✅ |

**Overall: 11/11 critical fixes verified live on dev (favicon follow-up shipped as PR #20 + redeployed).**

## Architecture notes from this run

- **Dodev git was in a broken state** (HEAD on `master` with 0 commits, while origin/main fetched). Repaired via `git reset --hard <bundled-main>` after backing up the 2 staged files. Likely caused by a partial `setup-server.sh` run.
- **Dodev's web is standalone-built**, not dev/HMR (matches prod). Every web change requires `pnpm --filter @doable/web build` + relaunch with `HOSTNAME=127.0.0.1 PORT=3000` on the standalone server.js. The systemd unit's tmux session is orphaned; web doesn't restart with `systemctl restart doable.service`. Memory `project_prod_web_restart.md` already documented this for prod — applies to dodev too.
- **Migration 083** (`ai_sessions_workspace_id`) ran cleanly on dodev's Postgres.
- **DOABLE_KEK** was already present on dodev's .env; no back-fill needed.

