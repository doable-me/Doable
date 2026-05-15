# GitHub & Versions verify — dev.doable.me — 2026-05-15

## Scope

12-agent parallel sweep. This agent verified **GitHub & Versions** as filed
under tester K (`testcases/bugs/2026-05-14-github-*.md`,
`testcases/bugs/2026-05-14-versions-*.md`,
`testcases/bugs/BUG-CORPUS-GH-*.md`,
`testcases/bugs/BUG-CORPUS-VERSIONS-*.md`,
`testcases/bugs/BUG-R11-VERSIONS-EACCES-500-*.md`).

Auth: `qa-owner@doable.test` / `TestPass123!` (note: `.test` not `.me`).
Test project: `12c6f088-fa18-4f5d-b2d6-53a0b28d9089` (scaffolded + git
initialised, has 1 initial commit).

Evidence: `testcases/evidence/dev/verify-2026-05-15/github-versions/`.

## Bug Status Matrix

| Bug ID | Title | Pre-Verify (dev as of 2026-05-15 baseline) | Fix in this PR | Post-Fix Expected |
|---|---|---|---|---|
| BUG-R11-VERSIONS-EACCES-500-001 | POST versions w/ body.projectPath="/" → 500 EACCES `/boot/lost+found` | FIXED previously (path derived server-side, evil path ignored) | n/a | 201; no path leak (TC-VER-PATH-001..004 pass) |
| BUG-CORPUS-VERSIONS-001 | POST versions w/ createdBy="qa-owner" → 500 UUID parse | OPEN (500 `invalid input syntax for type uuid`) | createdBy now derived from JWT `userId`; body ignored | 201 |
| BUG-VER-001 | GET `/projects/:id/versions/auto` → 500 UUID parse | OPEN (500 `invalid input syntax for type uuid: "auto"`) | Reserved-segment + UUID/SHA regex guard returns 404 early | 404 |
| BUG-VER-002 | POST restore w/ bad SHA → 500 "reference is not a tree" | OPEN (500 with raw git stderr) | Map "reference is not a tree" / "unknown revision" / "bad revision" / "ambiguous argument" to 404 | 404 |
| BUG-GH-001 | `/auth/github/repo/start` → 500 (both anon + authed) | PARTIALLY FIXED on dev (now 401), but no auth-gated 302 handler | New oauthRoutes handler: 401 if no token, else 302 to GitHub w/ scope=repo | 401 (anon) / 302 (auth) |
| BUG-GH-002 | Editor "Connect GitHub" button → /usage | **NOT REPRODUCED**: editor button `onConnect` opens the connect dialog, never `/usage`. Likely tester misclick on the "Usage" link in the sidebar. | n/a (no fix needed) | n/a |
| BUG-GH-003 | `/projects/:id/github/*` returns 404 | OPEN (mount was `/:id/github/*` not `/projects/:id/github/*`) | Added `app.route("/projects", githubProjectRoutes)` in addition to legacy bare-prefix mount | 200 |
| BUG-CORPUS-GH-001 | Cross-tenant read of `/:id/github/status` & `/commits` | FIXED previously (requireProjectAccess middleware in github/project-routes.ts) | n/a | 404 for non-member |

## Pre-Fix Repro Evidence (dev baseline, before this PR)

```
GET  /auth/github                              → 302 (PASS)
GET  /github/connect                           → 302 (PASS)
POST /github/webhook                           → 202 (PASS)
GET  /github/status (Bearer)                   → 200 (PASS)
GET  /<PID>/github/status (Bearer)             → 200 (PASS)
GET  /<PID>/github/commits (Bearer)            → 200 (PASS)
GET  /projects/<PID>/github/commits (Bearer)   → 404  ← BUG-GH-003
GET  /auth/github/repo/start                   → 401  ← BUG-GH-001 partial (route missing entirely)
POST /projects/<PID>/versions {createdBy:"qa-owner"} → 500 invalid input syntax for type uuid: "qa-owner"  ← BUG-CORPUS-VERSIONS-001
POST /projects/<PID>/versions {createdBy:"qa-owner",projectPath:"/"} → 500 same
GET  /projects/<PID>/versions/auto             → 500 invalid input syntax for type uuid: "auto"  ← BUG-VER-001
POST /projects/<PID>/versions/<bad-sha>/restore → 500 git checkout failed: fatal: reference is not a tree  ← BUG-VER-002
GET  /projects/<PID>/versions                  → 200 (PASS)
```

Raw curl bodies + headers committed under
`testcases/evidence/dev/verify-2026-05-15/github-versions/`.

## Fixes

### 1. `services/api/src/routes/versions.ts`

- **GET `/:projectId/versions/:versionId`** — added reserved-segment +
  UUID-or-SHA regex guard so `"auto"`, `"undo"`, and any malformed id
  short-circuit to 404 before the DB query. Closes BUG-VER-001.
- **POST `/:projectId/versions/:versionId/restore`** — extended the error
  classifier to map git stderr fragments (`reference is not a tree`,
  `unknown revision`, `bad revision`, `ambiguous argument`) to 404 with
  `"Version not found"` envelope. Closes BUG-VER-002.
- **POST `/:projectId/versions`** — `createdBy` now derived from
  `c.get("userId")` (JWT subject), `body.createdBy` is logged + ignored.
  Closes BUG-CORPUS-VERSIONS-001 and removes a privilege-attribution
  vector (could attribute a snapshot to any other user).
- **POST `/:projectId/versions/auto`** — same `createdBy`-from-auth fix.

### 2. `services/api/src/routes/auth/oauth.ts`

- New `GET /auth/github/repo/start` handler. Manual Bearer/`?token=`
  parse (the link must work from a plain `<a href>` so we accept query
  too). 401 if absent/invalid; 302 to `getGitHubRepoAuthUrl(state)` with
  the user id embedded in state, mirroring the existing
  `/github/connect` flow. Closes BUG-GH-001.

### 3. `services/api/src/routes/github.ts` + `services/api/src/routes.ts`

- Re-exported `githubProjectRoutes` from `github.ts`.
- `routes.ts` now mounts the project sub-router under both `/` (legacy)
  and `/projects` (new), so `/projects/:id/github/*` resolves
  identically to `/:id/github/*`. OAuth + user-account routes stay on
  `/` only. Closes BUG-GH-003.

## Regression Tests Added

- `testcases/18-versions/TC-VERSIONS-AUTO-AND-BAD-SHA.md`
  - TC-VER-AUTO-001: GET versions/auto → 404
  - TC-VER-RESTORE-BAD-SHA-001: restore with bad SHA → 404
  - TC-VER-CREATED-BY-FROM-AUTH-001: createdBy derived from auth, body ignored
- `testcases/15-github/TC-GH-PROJECTS-PREFIX-AND-START.md`
  - TC-GH-REPO-START-001: anon → 401
  - TC-GH-REPO-START-002: authed → 302 to GitHub
  - TC-GH-PROJECTS-PREFIX-001/002: `/projects/:id/github/{status,commits}` → 200
  - TC-GH-PROJECTS-PREFIX-003: legacy bare prefix still 200

## OAuth Callback URL Note

Per `[[reference_oauth_apps]]`: dev uses the dev GitHub OAuth app whose
callback prefix-matches `https://dev-api.doable.me/auth/github/...` plus
`https://dev-api.doable.me/github/repo/callback`. Confirmed live:
`GET /github/connect` already 302s to
`...&redirect_uri=https%3A%2F%2Fdev-api.doable.me%2Fauth%2Fgithub%2Frepo%2Fcallback&scope=repo+read%3Auser`.

## Out-of-scope / Skipped

- Real GitHub OAuth completion (code exchange + push/pull/import to a
  real repo) — requires live GitHub credentials. Documented in
  `TC-GH-OAUTH-003` (SKIP).
- Webhook signature validation E2E — only smoke (`X-GitHub-Event: ping`
  → 202) verified.

## PR

Branch `fix/github-versions-2026-05-15`. PR pending after typecheck.
