# TC-WS-INVITES — Workspace invites (email + shareable link)

API:
- POST `/workspaces/:id/members/invite` — admin+
- GET `/workspaces/:id/invites` — admin+
- DELETE `/workspaces/:id/invites/:inviteId` — admin+
- POST `/workspaces/:id/invite-link` — admin+
- POST `/workspaces/invite/accept` — authenticated user

Source: `services/api/src/routes/workspaces.ts:128-364`.

## TC-WS-INV-001 — Admin invites by email
- **Pre:** Admin role; ws.plan ≥ pro (free has maxMembers=1).
- **Steps:** POST /:id/members/invite `{"email":"new@doable.test","role":"member"}`.
- **Expected:** 201 with invite object containing `token`, `email`, `role`, `expires_at`.
- **Severity:** smoke

## TC-WS-INV-002 — Owner invites by email
- **Severity:** smoke

## TC-WS-INV-003 — Member tries to invite → 403
- **Severity:** smoke

## TC-WS-INV-004 — Viewer tries to invite → 403
- **Severity:** smoke

## TC-WS-INV-005 — Invite missing email → 400
- **Severity:** high

## TC-WS-INV-006 — Invite invalid email → 400
- **Severity:** high

## TC-WS-INV-007 — Invite with role missing → 400
- **Severity:** medium

## TC-WS-INV-008 — Invite with role=owner → 400 (enum only admin/member/viewer)
- **Severity:** high

## TC-WS-INV-009 — Invite existing member's email → 409
- **Pre:** target email is already a member.
- **Steps:** POST.
- **Expected:** 409 `User is already a member of this workspace`.
- **Severity:** high

## TC-WS-INV-010 — Invite hits plan member limit
- **Pre:** ws.plan="free" (maxMembers=1) and 1 member already.
- **Steps:** POST invite.
- **Expected:** 403 `Member limit reached (1 for free plan). Upgrade to invite more.`
- **Severity:** smoke

## TC-WS-INV-011 — Invite hits pro plan limit
- **Pre:** ws.plan="pro" (maxMembers=5) at 5 members.
- **Steps:** POST.
- **Expected:** 403 with limit 5 message.
- **Severity:** medium

## TC-WS-INV-012 — Invite hits business plan limit (25)
- **Severity:** low

## TC-WS-INV-013 — Enterprise plan never hits limit
- **Steps:** POST 100 invites.
- **Expected:** All 201 (Infinity).
- **Severity:** medium

## TC-WS-INV-014 — Invite to email with multiple `+` plus tags
- **Steps:** Email `qa+invite@doable.test`.
- **Expected:** 201.
- **Severity:** low

## TC-WS-INV-015 — Invite with HTML in email field
- **Steps:** `<b>x</b>@doable.test`.
- **Expected:** 400 (zod email).
- **Severity:** medium

## TC-WS-INV-016 — Invite token in DB is unique per call
- **Steps:** Two invites to same email.
- **Expected:** Two distinct token rows.
- **Severity:** medium

## TC-WS-INV-017 — Invite email queued (non-blocking)
- **Steps:** Inspect email queue.
- **Expected:** Templated `invite` with `acceptUrl` containing token.
- **Severity:** smoke

## TC-WS-INV-018 — Invite email sender failure does not break API
- **Severity:** medium

## TC-WS-INV-019 — Invite creates one row per call
- **Steps:** POST.
- **Expected:** Exactly one row in workspace_invites.
- **Severity:** medium

## TC-WS-INV-020 — Invite token cryptographically random
- **Steps:** Inspect tokens generated 5x.
- **Expected:** Length ≥ 32 chars; not a counter.
- **Severity:** medium

## TC-WS-INV-021 — GET /:id/invites lists pending invites (admin+)
- **Severity:** smoke

## TC-WS-INV-022 — GET /:id/invites from member → 403
- **Severity:** smoke

## TC-WS-INV-023 — DELETE /:id/invites/:inviteId revokes
- **Pre:** invite exists.
- **Steps:** DELETE.
- **Expected:** 200 `{inviteId,revoked:true}`. Subsequent accept fails.
- **Severity:** smoke

## TC-WS-INV-024 — DELETE non-existent invite → 404
- **Severity:** medium

## TC-WS-INV-025 — DELETE invite from another workspace via wrong wsId → 404 / 403
- **Steps:** Use inviteId belonging to ws2 but path /workspaces/<ws1>/invites/<inviteId>.
- **Expected:** 404 (revokeInvite scopes by ws id).
- **Severity:** high

## TC-WS-INV-026 — DELETE invite with member role → 403
- **Severity:** smoke

## TC-WS-INV-027 — Accept invite (happy)
- **Pre:** Invite token issued; user signed up with the invited email.
- **Steps:** POST /workspaces/invite/accept `{"token":"<t>"}`.
- **Expected:** 200 with workspace data; user added to workspace_members with the invited role.
- **Severity:** smoke

## TC-WS-INV-028 — Accept invite with wrong email user
- **Pre:** Invite for `a@x.com`; logged in as `b@x.com`.
- **Steps:** POST accept.
- **Expected:** Behaviour: `acceptInvite(token, userId)` may not check email match. Document — file finding if any user can accept.
- **Severity:** high

## TC-WS-INV-029 — Accept already-accepted invite → 400
- **Steps:** Accept twice.
- **Expected:** Second call 400 `Invalid, expired, or already accepted invite`.
- **Severity:** smoke

## TC-WS-INV-030 — Accept revoked invite → 400
- **Steps:** Revoke then accept.
- **Expected:** 400.
- **Severity:** high

## TC-WS-INV-031 — Accept expired invite → 400
- **Pre:** invites.expires_at < now (manually set).
- **Steps:** Accept.
- **Expected:** 400.
- **Severity:** high

## TC-WS-INV-032 — Accept malformed token → 400
- **Severity:** high

## TC-WS-INV-033 — Accept missing token → 400
- **Severity:** medium

## TC-WS-INV-034 — Accept token with whitespace
- **Steps:** Token with leading space.
- **Expected:** 400 (no trim).
- **Severity:** low

## TC-WS-INV-035 — Accept token with SQL injection payload `'; DROP TABLE--`
- **Expected:** 400; no SQL impact (parameterised).
- **Severity:** smoke

## TC-WS-INV-036 — Accept while not authenticated → 401
- **Severity:** smoke

## TC-WS-INV-037 — Shareable invite link create (admin+)
- **Steps:** POST /:id/invite-link `{role:"member"}`.
- **Expected:** 201 with token + role + ws id.
- **Severity:** smoke

## TC-WS-INV-038 — Shareable invite link from member → 403
- **Severity:** smoke

## TC-WS-INV-039 — Shareable invite link with role=owner → 400
- **Severity:** high

## TC-WS-INV-040 — Shareable invite link reusable (multiple users accept)
- **Steps:** Two users accept the same link.
- **Expected:** Both join. Document — link is multi-use unlike email invite.
- **Severity:** high

## TC-WS-INV-041 — Shareable invite link revocable
- **Steps:** Revoke via DELETE /:id/invites/<id>.
- **Expected:** 200; subsequent accept fails.
- **Severity:** high

## TC-WS-INV-042 — Invite token brute force resistance
- **Steps:** Submit 1000 random tokens to /workspaces/invite/accept.
- **Expected:** All 400. No timing oracle revealing valid prefixes.
- **Severity:** high

## TC-WS-INV-043 — Invite acceptance does NOT auto-create workspace for accepting user
- **Steps:** New user accepts; check workspaces table.
- **Expected:** They become member of inviting ws but no separate ws auto-created during accept (auto-create happens on /auth/me).
- **Severity:** medium

## TC-WS-INV-044 — Invite with email containing trailing dot
- **Severity:** edge

## TC-WS-INV-045 — Invite same email twice creates two pending invites
- **Severity:** medium
