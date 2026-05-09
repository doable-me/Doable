# TC-SEC-RLS — Row-level security & cross-tenant isolation

Tests verify that user A's JWT cannot read or write user B's data.
DB has Postgres RLS via `doable_current_user_id()` function on users table; application-level checks via `requireRole` and `getMemberRole` complete the picture.

Test users (per testcases/test-accounts.md):
- A = `qa-alice@doable.test` (id `798d2ac4-bd16-49ac-99c1-af545d1a0993`)
- B = `qa-bob@doable.test` (id `6f65e62b-e225-4132-8fb9-759c81bd5ca4`)
- O = `qa-owner@doable.test` (platform admin)

Each test issues login as A then attacks B's resources unless noted.

## TC-SEC-RLS-001 — A cannot GET B's workspace
- **Pre:** A logged in. B owns workspace `<wsB>`.
- **Steps:** GET /workspaces/<wsB>.
- **Expected:** 403 `Not a member of this workspace`. Body MUST NOT include workspace name/slug.
- **Severity:** smoke

## TC-SEC-RLS-002 — A cannot list B's members
- **Steps:** GET /workspaces/<wsB>/members.
- **Expected:** 403.
- **Severity:** smoke

## TC-SEC-RLS-003 — A cannot list B's invites
- **Steps:** GET /workspaces/<wsB>/invites.
- **Expected:** 403.
- **Severity:** high

## TC-SEC-RLS-004 — A cannot PATCH B's workspace
- **Steps:** PATCH /workspaces/<wsB> `{"name":"hacked"}`.
- **Expected:** 403; row unchanged.
- **Severity:** smoke

## TC-SEC-RLS-005 — A cannot DELETE B's workspace
- **Severity:** smoke

## TC-SEC-RLS-006 — A cannot invite to B's workspace
- **Severity:** smoke

## TC-SEC-RLS-007 — A cannot revoke B's invite
- **Severity:** high

## TC-SEC-RLS-008 — A cannot remove a member from B's workspace
- **Severity:** smoke

## TC-SEC-RLS-009 — A cannot transfer B's workspace ownership
- **Severity:** smoke

## TC-SEC-RLS-010 — A cannot read B's projects via /projects?workspaceId=<wsB>
- **Steps:** GET /projects?workspaceId=<wsB>.
- **Expected:** 403 / empty list.
- **Severity:** smoke

## TC-SEC-RLS-011 — A cannot read B's project via /projects/<projB>
- **Severity:** smoke

## TC-SEC-RLS-012 — A cannot read B's project files
- **Severity:** high

## TC-SEC-RLS-013 — A cannot read B's chat messages
- **Steps:** GET /chat/<projectId> in B's project.
- **Expected:** 403.
- **Severity:** smoke

## TC-SEC-RLS-014 — A cannot send chat to B's project
- **Severity:** smoke

## TC-SEC-RLS-015 — A cannot read B's design comments
- **Severity:** high

## TC-SEC-RLS-016 — A cannot enumerate B's user data via /users (if endpoint exists)
- **Severity:** smoke

## TC-SEC-RLS-017 — A cannot read B's credit balance
- **Severity:** medium

## TC-SEC-RLS-018 — A cannot read B's subscription details
- **Severity:** high

## TC-SEC-RLS-019 — A cannot read B's integrations connections
- **Severity:** smoke

## TC-SEC-RLS-020 — A cannot read B's API tokens
- **Severity:** smoke

## TC-SEC-RLS-021 — A cannot read B's GitHub tokens
- **Severity:** smoke

## TC-SEC-RLS-022 — A cannot read B's environment variables
- **Severity:** smoke

## TC-SEC-RLS-023 — A cannot read B's deploy artifacts
- **Severity:** medium

## TC-SEC-RLS-024 — A cannot read B's analytics
- **Severity:** medium

## TC-SEC-RLS-025 — A cannot read B's notifications
- **Severity:** medium

## TC-SEC-RLS-026 — A cannot read B's marketplace drafts
- **Severity:** medium

## TC-SEC-RLS-027 — A cannot read B's templates
- **Severity:** medium

## TC-SEC-RLS-028 — A cannot read B's folders
- **Severity:** medium

## TC-SEC-RLS-029 — A cannot delete B's project
- **Severity:** smoke

## TC-SEC-RLS-030 — A cannot rename B's project
- **Severity:** smoke

## TC-SEC-RLS-031 — A cannot fork B's project (if forking respects ACL)
- **Severity:** medium

## TC-SEC-RLS-032 — A cannot publish B's project
- **Severity:** smoke

## TC-SEC-RLS-033 — A cannot connect a custom domain to B's project
- **Severity:** smoke

## TC-SEC-RLS-034 — A cannot trigger AI chat on B's project (impersonation)
- **Severity:** smoke

## TC-SEC-RLS-035 — A cannot read B's WebSocket Y-doc
- **Steps:** Connect WS with A's token to B's project doc id.
- **Expected:** Disconnect / 4401 close code.
- **Severity:** smoke

## TC-SEC-RLS-036 — A cannot read B's preview-proxy stream
- **Severity:** high

## TC-SEC-RLS-037 — A cannot fetch B's runtime build artifacts
- **Severity:** high

## TC-SEC-RLS-038 — A cannot read B's published site analytics
- **Severity:** medium

## TC-SEC-RLS-039 — A cannot read B's thumbnail blobs
- **Severity:** medium

## TC-SEC-RLS-040 — A cannot read B's project version history
- **Severity:** high

## TC-SEC-RLS-041 — A cannot enumerate workspace IDs by trying sequential IDs
- **Steps:** Iterate 100 random UUIDs of GET /workspaces/<id>.
- **Expected:** All 403; no oracle from response timing or body that distinguishes "exists" vs "no row".
- **Severity:** high

## TC-SEC-RLS-042 — A's GET /workspaces returns ONLY A's workspaces
- **Steps:** GET /workspaces as A.
- **Expected:** Response data does not include any ws where A is not a member.
- **Severity:** smoke

## TC-SEC-RLS-043 — Member of ws cannot bypass RLS by setting `workspaceId` query
- **Steps:** Member of ws1 calls /projects?workspaceId=<ws2>.
- **Expected:** 403 / empty.
- **Severity:** smoke

## TC-SEC-RLS-044 — A's PATCH on B's project file path traversal `../`
- **Steps:** PATCH /projects/<projB>/files with body containing `../<projA>/file.ts`.
- **Expected:** 403 (no project access). And path normalised so it doesn't write into A's project.
- **Severity:** smoke

## TC-SEC-RLS-045 — Direct DB-via-SQL injection that bypasses RLS
- **Steps:** Submit slug containing `';SELECT 1; --` via POST /workspaces.
- **Expected:** 400 (slug regex) before SQL ever runs.
- **Severity:** smoke

## TC-SEC-RLS-046 — Postgres RLS context set per request
- **Pre:** Inspect tracing/xray for a typical request.
- **Steps:** Verify SQL session sets `SET LOCAL doable.current_user_id`.
- **Expected:** Context set. If absent, file finding.
- **Severity:** medium

## TC-SEC-RLS-047 — RLS prevents cross-user reads even when application logic is bypassed
- **Pre:** Direct SQL via privileged connection should not be possible from API. As app-side, ensure application uses RLS-aware connection.
- **Severity:** medium

## TC-SEC-RLS-048 — A cannot read B's audit log (admin-only)
- **Severity:** high

## TC-SEC-RLS-049 — Soft-deleted B project not returned to A
- **Severity:** medium

## TC-SEC-RLS-050 — A cannot read B's password reset tokens via any endpoint
- **Severity:** smoke

## TC-SEC-RLS-051 — A cannot read B's refresh tokens via any endpoint
- **Severity:** smoke

## TC-SEC-RLS-052 — Cross-workspace project move requires both-side membership
- **Severity:** high

## TC-SEC-RLS-053 — Pagination cursor leakage cross-tenant
- **Steps:** A GETs cursor for own listing; replays cursor against B's data.
- **Expected:** No leakage; cursor is opaque or scoped.
- **Severity:** medium

## TC-SEC-RLS-054 — IDOR via numeric IDs (n/a — UUIDs used)
- **Note:** Doable uses UUIDs; document confirmation.
- **Severity:** smoke

## TC-SEC-RLS-055 — Race condition: A invited to B during GET /workspaces
- **Steps:** B invites A; A accepts; ensure A subsequently sees ws — and not before.
- **Severity:** medium

## TC-SEC-RLS-056 — User removed from ws loses access immediately
- **Steps:** A is member; B-admin removes A; A's next request to that ws is 403.
- **Expected:** 403 even within token lifetime.
- **Severity:** smoke

## TC-SEC-RLS-057 — Workspace deleted: A's prior access tokens cannot read
- **Severity:** medium

## TC-SEC-RLS-058 — Stale JWT after role demote: viewer cannot PATCH
- **Steps:** Admin demoted to viewer; old token still time-valid.
- **Expected:** 403 (role lookup happens fresh per request).
- **Severity:** smoke

## TC-SEC-RLS-059 — Cache-poisoning: response not cacheable so other users won't see it
- **Severity:** medium

## TC-SEC-RLS-060 — Logs do not contain other users' data when A accesses A's data
- **Severity:** medium
