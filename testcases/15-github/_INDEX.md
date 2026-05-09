# 15-github — Test Case Index

Tests for GitHub integration: OAuth, repo connect, push/pull, conflict resolution, import, webhooks, commits log.

## Files

| File | Cases | Coverage |
|---|---|---|
| TC-GH-OAUTH.md | 30 | OAuth flow, state validation, token storage/encryption, disconnect, scope, audit |
| TC-GH-CONNECT-REPO.md | 25 | Repo selection, branch picker, permission errors, create new repo, disconnect |
| TC-GH-PUSH.md | 35 | Push, force-push refusal, branch protection, large files, secret scanning, github_commits, ACL |
| TC-GH-PULL.md | 30 | Pull, fast-forward, merge, conflict resolution UX, dirty-tree handling |
| TC-GH-IMPORT.md | 30 | Import existing repo, framework detection, size caps, sandboxing, progress UI |
| TC-GH-WEBHOOK.md | 20 | Webhook registration, signature verification, push events, retries, dedup |
| TC-GH-COMMITS-LOG.md | 20 | github_commits log, paging, filter, ACL, retention |

**Total: 190 cases**

## Endpoints Touched
- `GET /auth/github/repo/start`
- `GET /auth/github/repo/callback`
- `POST /github/disconnect`
- `GET /github/repos`
- `POST /github/connect`
- `POST /github/disconnect-repo`
- `POST /github/push`
- `POST /github/pull`
- `POST /github/import`
- `POST /github/webhook` (inbound from GitHub)
- `GET /github/commits?project_id=...`

## Key Tables
- `github_user_tokens` (per-user OAuth token, encrypted)
- `project_github_links` (project ↔ repo, branch, webhook id, secret)
- `github_commits` (project, sha, message, author, direction in/out, files_changed)
- `github_webhook_events` (audit/dedup)

## Notes
- Per-user repo token (not per-project)
- Token stored encrypted at rest
- Force-push refused by default; PR creation suggested for protected branches
- Webhook signature HMAC SHA-256 verified; dedup by X-GitHub-Delivery
- Import excludes .git history; imports tree only
