# TC-API-PROJECTS-WORKSPACE-ROUTING — POST /projects honors supplied workspaceId

Regression test for **BUG-PWA-002-WORKSPACE-IGNORED** (filed in
`testcases/99-runlog/env1/app-pwa.md`).

**Symptom (pre-fix):** `POST /projects` with body `{"workspace_id": "<owned-shared-ws>", ...}`
silently routed the new project into the caller's *personal* workspace because the create
schema only accepted camelCase `workspaceId`. Zod stripped the unknown snake_case key, and
`getUserWorkspaceIdWithMinRole(userId, "member", undefined)` fell through to
`workspacesQ.listByUser(userId)[0]` (the user's first / personal workspace).

**Fix:** `services/api/src/routes/projects/list-routes.ts` now normalises `workspace_id`,
`template_id`, `folder_id`, and `framework_id` snake_case aliases into their camelCase
counterparts *before* zod parsing. The membership/role check on the supplied workspace is
unchanged (`getUserWorkspaceIdWithMinRole` returns `null` if the user is not a member of
the explicit workspace, which surfaces as `403 Access denied — requires member role or higher`).

---

## Setup

```bash
# These should be exported in the runner env. Adjust per environment.
: "${API_BASE:?set to e.g. https://zantaz-api.doable.me or http://127.0.0.1:8080}"
: "${TOKEN:?qa-owner JWT (member of both their personal ws and the shared QA ws)}"
: "${SHARED_WS_ID:?UUID of a non-personal workspace the caller IS a member of}"
: "${PERSONAL_WS_ID:?UUID of caller's personal workspace — used only for the negative assertion}"
: "${OUTSIDER_WS_ID:?UUID of a workspace the caller is NOT a member of}"
```

## TC-API-PROJECTS-WORKSPACE-ROUTING-001 — snake_case `workspace_id` is honored

```bash
RESP=$(curl -sS -X POST "$API_BASE/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ws-routing-snake-$(date +%s)\",\"workspace_id\":\"$SHARED_WS_ID\"}")
echo "$RESP" | jq .

CREATED_WS=$(echo "$RESP" | jq -r '.data.workspaceId // .data.workspace_id')
test "$CREATED_WS" = "$SHARED_WS_ID" \
  || { echo "FAIL: project created in $CREATED_WS, expected $SHARED_WS_ID"; exit 1; }
echo "PASS: snake_case workspace_id honored"
```

**Expected:** 200/201, `data.workspaceId == $SHARED_WS_ID`.
**Severity:** critical (data-misrouting; multi-tenant isolation regression).

## TC-API-PROJECTS-WORKSPACE-ROUTING-002 — camelCase `workspaceId` still works

```bash
RESP=$(curl -sS -X POST "$API_BASE/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ws-routing-camel-$(date +%s)\",\"workspaceId\":\"$SHARED_WS_ID\"}")
CREATED_WS=$(echo "$RESP" | jq -r '.data.workspaceId // .data.workspace_id')
test "$CREATED_WS" = "$SHARED_WS_ID" \
  || { echo "FAIL: project created in $CREATED_WS, expected $SHARED_WS_ID"; exit 1; }
echo "PASS: camelCase workspaceId honored"
```

**Expected:** 200/201, `data.workspaceId == $SHARED_WS_ID`.
**Severity:** smoke.

## TC-API-PROJECTS-WORKSPACE-ROUTING-003 — non-member workspace is rejected (403)

```bash
STATUS=$(curl -sS -o /tmp/ws-routing-403.json -w "%{http_code}" -X POST "$API_BASE/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ws-routing-deny-$(date +%s)\",\"workspace_id\":\"$OUTSIDER_WS_ID\"}")
test "$STATUS" = "403" \
  || { echo "FAIL: expected 403 for non-member workspace, got $STATUS"; cat /tmp/ws-routing-403.json; exit 1; }
echo "PASS: non-member workspace rejected with 403"
```

**Expected:** `403 {"error":"Access denied — requires member role or higher"}`. Project must NOT be silently routed to caller's personal workspace.
**Severity:** critical (auth bypass would let any user enumerate workspace IDs).

## TC-API-PROJECTS-WORKSPACE-ROUTING-004 — omitted workspaceId still falls back to user's first workspace

```bash
RESP=$(curl -sS -X POST "$API_BASE/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ws-routing-default-$(date +%s)\"}")
CREATED_WS=$(echo "$RESP" | jq -r '.data.workspaceId // .data.workspace_id')
test -n "$CREATED_WS" -a "$CREATED_WS" != "null" \
  || { echo "FAIL: no workspace assigned"; echo "$RESP"; exit 1; }
echo "PASS: default fallback workspace = $CREATED_WS"
```

**Expected:** 200/201, project lands in `listByUser[0]` (typically the personal workspace). Backward-compat preserved.
**Severity:** smoke.
