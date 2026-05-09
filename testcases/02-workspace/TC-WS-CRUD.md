# TC-WS-CRUD — Workspace create / read / update / delete / transfer

API base: `https://staging-api.doable.me/workspaces`. All require `Authorization: Bearer <accessToken>`.
Source: `services/api/src/routes/workspaces.ts`.
Slug regex `/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/`, length 3-48.

## Membership-check-before-lookup note (added 2026-05-10 from env1 run)
For all `/workspaces/:id/*` reads:
- Bogus-but-syntactically-valid UUID → HTTP 403 `Not a member of this workspace` (NOT 404).
- Non-UUID id → HTTP 400 `Invalid workspace id`.
The 403-on-bogus is the membership middleware short-circuiting before existence check (prevents
enumeration). Tests that previously expected 404 for a non-existent UUID should accept 403 as
the semantic equivalent (per AUTHOR-GUIDE — regex pitfall correction, not a bug).

## TC-WS-CRUD-001 — GET /workspaces lists user's workspaces (happy)
- **Pre:** Login as `qa-owner@doable.test`. User has at least 1 ws.
- **Steps:** GET /workspaces.
- **Expected:** 200 `{data:[{id,name,slug,plan,userRole:"owner",memberCount,credits:{...}}]}`.
- **Severity:** smoke

## TC-WS-CRUD-002 — GET /workspaces returns empty `[]` for fresh user with no ws
- **Pre:** A test user with no workspaces.
- **Steps:** GET.
- **Expected:** 200 `{data:[]}`. (Note: /auth/me auto-creates one — this case requires direct DB cleanup.)
- **Severity:** medium

## TC-WS-CRUD-003 — GET /workspaces no Bearer token → 401
- **Steps:** GET without Authorization.
- **Expected:** 401.
- **Severity:** smoke

## TC-WS-CRUD-004 — POST /workspaces happy path
- **Steps:** POST `{"name":"Test WS","slug":"test-ws-001"}`.
- **Expected:** 201 `{data:{id,name:"Test WS",slug:"test-ws-001",owner_id:<userId>,plan:"free"}}`. Built-in connectors provisioned.
- **Severity:** smoke

## TC-WS-CRUD-005 — POST /workspaces with description
- **Steps:** POST `{name:"X",slug:"x-ws",description:"Hello"}`.
- **Expected:** 201; description stored.
- **Severity:** medium

## TC-WS-CRUD-006 — POST missing name → 400
- **Steps:** POST `{"slug":"x-ws"}`.
- **Expected:** 400 `{error:"Validation failed", details:{name:["..."]}}`.
- **Severity:** high

## TC-WS-CRUD-007 — POST missing slug → 400
- **Steps:** POST `{"name":"X"}`.
- **Expected:** 400.
- **Severity:** high

## TC-WS-CRUD-008 — POST name length 100 (max) accepted
- **Steps:** POST name = "a"*100.
- **Expected:** 201.
- **Severity:** low

## TC-WS-CRUD-009 — POST name length 101 → 400
- **Steps:** Name = "a"*101.
- **Expected:** 400.
- **Severity:** low

## TC-WS-CRUD-010 — POST name empty → 400
- **Steps:** POST `{"name":"","slug":"abc"}`.
- **Expected:** 400.
- **Severity:** high

## TC-WS-CRUD-011 — POST slug length 2 → 400 (below SLUG_MIN_LENGTH)
- **Steps:** Slug `ab`.
- **Expected:** 400.
- **Severity:** high

## TC-WS-CRUD-012 — POST slug length 3 (boundary) accepted
- **Steps:** Slug `abc`.
- **Expected:** 201.
- **Severity:** medium

## TC-WS-CRUD-013 — POST slug length 48 (max) accepted
- **Steps:** Slug 48 chars all `a`.
- **Expected:** 201.
- **Severity:** medium

## TC-WS-CRUD-014 — POST slug length 49 → 400
- **Steps:** 49 chars.
- **Expected:** 400.
- **Severity:** medium

## TC-WS-CRUD-015 — POST slug uppercase → 400 (regex disallows)
- **Steps:** Slug `MixedCase`.
- **Expected:** 400.
- **Severity:** high

## TC-WS-CRUD-016 — POST slug starts with hyphen → 400
- **Steps:** Slug `-foo`.
- **Expected:** 400.
- **Severity:** medium

## TC-WS-CRUD-017 — POST slug ends with hyphen → 400
- **Steps:** Slug `foo-`.
- **Expected:** 400.
- **Severity:** medium

## TC-WS-CRUD-018 — POST slug double hyphen `foo--bar` accepted
- **Steps:** Slug `foo--bar`.
- **Expected:** 201 (regex permits).
- **Severity:** edge

## TC-WS-CRUD-019 — POST slug with underscore → 400
- **Steps:** Slug `foo_bar`.
- **Expected:** 400.
- **Severity:** medium

## TC-WS-CRUD-020 — POST slug with non-ASCII → 400
- **Steps:** Slug `café`.
- **Expected:** 400.
- **Severity:** medium

## TC-WS-CRUD-021 — POST slug with emoji → 400
- **Steps:** Slug `team🚀`.
- **Expected:** 400.
- **Severity:** edge

## TC-WS-CRUD-022 — POST duplicate slug → 409
- **Pre:** ws with slug `dup-001` exists.
- **Steps:** Another POST with same slug.
- **Expected:** 409 `{"error":"A workspace with this slug already exists"}`.
- **Severity:** high

## TC-WS-CRUD-023 — POST slug differs only by case from existing
- **Pre:** slug `dup-002` exists.
- **Steps:** POST slug `DUP-002` — but uppercase slugs already fail regex (TC-WS-CRUD-015). Confirm.
- **Severity:** medium

## TC-WS-CRUD-024 — POST description length 500 (max)
- **Steps:** description 500 chars.
- **Expected:** 201.
- **Severity:** low

## TC-WS-CRUD-025 — POST description length 501 → 400
- **Steps:** 501 chars.
- **Expected:** 400.
- **Severity:** low

## TC-WS-CRUD-026 — POST environmentId clones environment
- **Pre:** Existing env with id E1.
- **Steps:** POST with environmentId=E1.
- **Expected:** 201; cloned env applied to ws (best-effort, non-fatal on failure).
- **Severity:** medium

## TC-WS-CRUD-027 — POST environmentId invalid uuid → 400
- **Steps:** environmentId `not-a-uuid`.
- **Expected:** 400.
- **Severity:** medium

## TC-WS-CRUD-028 — POST environmentId pointing to another user's env
- **Steps:** Use env id owned by different user.
- **Expected:** Should refuse access (RLS-ish). Document — currently best-effort clone may silently fail.
- **Severity:** high

## TC-WS-CRUD-029 — GET /:id returns workspace (viewer+)
- **Pre:** User is at least viewer.
- **Steps:** GET /workspaces/<id>.
- **Expected:** 200 `{data:{...}}`.
- **Severity:** smoke

## TC-WS-CRUD-030 — GET /:id non-member → 403
- **Pre:** Login as user not in ws.
- **Steps:** GET.
- **Expected:** 403 `{"error":"Not a member of this workspace"}`.
- **Severity:** smoke

## TC-WS-CRUD-031 — GET /:id with non-existent UUID → 404 OR 403
- **Steps:** Random UUID.
- **Expected:** 403 (because role lookup fails first), record actual.
- **Severity:** medium

## TC-WS-CRUD-032 — GET /:id with malformed UUID
- **Steps:** id `not-a-uuid`.
- **Expected:** 404 / 400 / 500. Should not crash.
- **Severity:** medium

## TC-WS-CRUD-033 — PATCH /:id name (admin+)
- **Pre:** User admin.
- **Steps:** PATCH `{name:"New Name"}`.
- **Expected:** 200; row updated.
- **Severity:** smoke

## TC-WS-CRUD-034 — PATCH /:id name from member → 403
- **Pre:** Login as member.
- **Steps:** PATCH name.
- **Expected:** 403 `Requires admin role or higher`.
- **Severity:** smoke

## TC-WS-CRUD-035 — PATCH /:id name from viewer → 403
- **Severity:** smoke

## TC-WS-CRUD-036 — PATCH /:id description
- **Steps:** PATCH `{description:"new"}`.
- **Expected:** 200.
- **Severity:** medium

## TC-WS-CRUD-037 — PATCH /:id avatarUrl invalid URL → 400
- **Steps:** PATCH avatarUrl `not-a-url`.
- **Expected:** 400.
- **Severity:** medium

## TC-WS-CRUD-038 — PATCH /:id with no fields → 200 no-op
- **Steps:** PATCH `{}`.
- **Expected:** 200; row unchanged.
- **Severity:** low

## TC-WS-CRUD-039 — PATCH /:id with `slug` field is rejected silently (not in schema)
- **Steps:** PATCH `{slug:"new-slug"}`.
- **Expected:** 200 with no slug change. Confirms zod strips unknown fields.
- **Severity:** high

## TC-WS-CRUD-040 — PATCH /:id with `owner_id` field rejected silently
- **Steps:** PATCH `{owner_id:"<otherUserId>"}`.
- **Expected:** 200 no-op.
- **Severity:** high

## TC-WS-CRUD-041 — PATCH /:id non-member → 403
- **Severity:** high

## TC-WS-CRUD-042 — DELETE /:id from owner
- **Pre:** Owner.
- **Steps:** DELETE.
- **Expected:** 200 `{data:{id,deleted:true}}`. Cascade — projects, members, invites, etc., per FK rules.
- **Severity:** smoke

## TC-WS-CRUD-043 — DELETE /:id from admin → 403
- **Steps:** Admin attempts.
- **Expected:** 403.
- **Severity:** smoke

## TC-WS-CRUD-044 — DELETE /:id from member → 403
- **Severity:** smoke

## TC-WS-CRUD-045 — DELETE /:id non-existent → 404 (after role passes for owner)
- **Note:** Practically requires being owner of nonexistent ws → role lookup fails → 403.
- **Steps:** DELETE random UUID.
- **Expected:** 403.
- **Severity:** medium

## TC-WS-CRUD-046 — DELETE /:id idempotent
- **Steps:** DELETE same id twice.
- **Expected:** First 200, second 403 (no longer member).
- **Severity:** medium

## TC-WS-CRUD-047 — POST /:id/transfer happy path
- **Pre:** newOwner is admin/member of ws.
- **Steps:** POST `/workspaces/<id>/transfer` `{newOwnerId:"<uuid>"}`.
- **Expected:** 200; `workspaces.owner_id` updated; new owner's role becomes `owner`; old owner becomes `admin`.
- **Severity:** smoke

## TC-WS-CRUD-048 — Transfer to non-member → 400
- **Steps:** newOwnerId is not in workspace.
- **Expected:** 400 `{"error":"User is not a member of this workspace"}`.
- **Severity:** high

## TC-WS-CRUD-049 — Transfer when caller is not owner → 403
- **Pre:** Admin.
- **Steps:** POST transfer.
- **Expected:** 403.
- **Severity:** smoke

## TC-WS-CRUD-050 — Transfer with non-uuid newOwnerId → 400
- **Steps:** newOwnerId = "abc".
- **Expected:** 400.
- **Severity:** medium

## TC-WS-CRUD-051 — Transfer self → 400 / 200
- **Steps:** newOwnerId equals caller.
- **Expected:** Caller is owner; getMemberRole returns "owner"; SQL still runs and demotes them to admin then sets owner — likely ends with caller as owner+admin (last write wins). Document.
- **Severity:** high

## TC-WS-CRUD-052 — Transfer to user that doesn't exist
- **Steps:** newOwnerId is random UUID with no row in users.
- **Expected:** 400 (not member).
- **Severity:** medium

## TC-WS-CRUD-053 — Transfer + then old owner cannot delete
- **Pre:** Transfer done.
- **Steps:** Old owner attempts DELETE /:id.
- **Expected:** 403 (now admin, not owner).
- **Severity:** smoke

## TC-WS-CRUD-054 — Transfer + new owner can delete
- **Steps:** New owner DELETE.
- **Expected:** 200.
- **Severity:** smoke

## TC-WS-CRUD-055 — Workspace listing carries `userRole` for caller
- **Steps:** Member calls GET /workspaces.
- **Expected:** Each ws has `userRole: "member"`.
- **Severity:** medium

## TC-WS-CRUD-056 — Workspace listing carries `memberCount`
- **Steps:** Verify number matches members table.
- **Severity:** medium

## TC-WS-CRUD-057 — Workspace listing credits null when no balance row
- **Steps:** ws with no credit_balances row.
- **Expected:** `credits: null`.
- **Severity:** low

## TC-WS-CRUD-058 — Workspace listing credits populated when row exists
- **Pre:** credits row.
- **Steps:** GET.
- **Expected:** `credits:{dailyRemaining,dailyTotal,monthlyRemaining,rolloverCredits}` numeric.
- **Severity:** smoke

## TC-WS-CRUD-059 — Plan info display: free plan shows correct limits
- **Pre:** ws.plan = "free".
- **Steps:** GET /plan/<wsId> (if exposed) or check `plan` field.
- **Expected:** plan = "free"; UI applies PLAN_LIMITS.free (max 3 projects, 1 member, 5 daily credits).
- **Severity:** medium

## TC-WS-CRUD-060 — Plan info: pro plan shows pro limits
- **Pre:** ws.plan = "pro".
- **Steps:** GET.
- **Expected:** plan = "pro".
- **Severity:** medium

## TC-WS-CRUD-061 — POST /workspaces auto-bootstraps built-in connectors
- **Pre:** Any new ws.
- **Steps:** Verify mcp_connector rows for default connectors.
- **Expected:** Rows present.
- **Severity:** medium

## TC-WS-CRUD-062 — Slug containing reserved word `admin` allowed?
- **Steps:** POST slug `admin`.
- **Expected:** 201 (no reserved-word block currently). File enhancement.
- **Severity:** low

## TC-WS-CRUD-063 — Slug `www` accepted
- **Severity:** low

## TC-WS-CRUD-064 — Slug `api` accepted (could collide with subdomains)
- **Steps:** POST slug `api`.
- **Expected:** 201; if subdomain routing later relies on slug, file finding.
- **Severity:** medium

## TC-WS-CRUD-065 — Two parallel POST /workspaces with same slug
- **Steps:** Race.
- **Expected:** Exactly one 201, one 409.
- **Severity:** high

## TC-WS-CRUD-066 — DELETE workspace cleans up refresh tokens? No (independent table)
- **Severity:** low (just verify)
