# BUG-CORPUS-CTX-001 — `/workspaces/:wid/context` lacks workspace-membership guard

**Severity:** medium (cross-tenant info disclosure / RBAC gap)
**Filed:** 2026-05-10 (env1 / zantaz, CORPUS FULL-2 run)
**Status:** OPEN

## Symptom

`GET /workspaces/:wid/context` returns **200** with the workspace's context
file list to **any authenticated user**, regardless of workspace membership.
There is no membership/role check before the lookup.

## Repro (env1, against qa-owner's workspace)

```
WID=<qa-owner workspace id>
TOK_BOB=...   # qa-bob — NOT a member of qa-owner's workspace
TOK_ADMIN=... # qa-admin — NOT a member either (separate ws owner)
TOK_VIEWER=...; TOK_MEMBER=...

for T in $TOK_BOB $TOK_ADMIN $TOK_VIEWER $TOK_MEMBER; do
  curl -sS -o /tmp/x -w "%{http_code}\n" \
    -H "Authorization: Bearer $T" "$API/workspaces/$WID/context"
done
# → 200 each, body {"data":{"files":[],"stats":{...}}}
```

Expected: **403** `{"error":"Not a member of this workspace"}` (matching the
behaviour of every other `/workspaces/:wid/...` endpoint, see
`TC-WS-CRUD-*` corpus passes).

## Why it matters

- Today the body is mostly empty for free-tier workspaces, but the endpoint
  returns the full file list (`filename`, `length`, `updatedAt`) once any
  context is set. That's strategy / spec / playbook content for a workspace
  the caller has no read right to.
- Same handler also serves `GET /workspaces/:wid/context/:filename`. Without
  the membership guard, the per-file endpoint returns full content (also
  unguarded — the same `workspaceContextRoutes.use("*", authMiddleware)` is
  the only middleware applied).
- Inconsistent with the rest of the workspace surface, which uses
  `requireWorkspaceMember` / similar before the read.

## Source

`services/api/src/routes/context.ts:159-180`

```ts
export const workspaceContextRoutes = new Hono<AuthEnv>();
workspaceContextRoutes.use("*", authMiddleware);   // ← only auth, no member check

workspaceContextRoutes.get("/", async (c) => {
  const workspaceId = c.req.param("wid");
  const files = await ctx.getWorkspaceContext(workspaceId!);   // no auth scope
  ...
});
```

## Fix sketch

Add `requireWorkspaceMember` (or equivalent) middleware on
`workspaceContextRoutes`, mirroring `/workspaces/:wid/members`,
`/workspaces/:wid/usage`, etc. Apply BEFORE the `getWorkspaceContext` call.

```ts
import { requireWorkspaceMember } from "../middleware/workspace-rbac.js";
workspaceContextRoutes.use("*", authMiddleware);
workspaceContextRoutes.use("*", requireWorkspaceMember); // ← add
```

Also audit:
- `GET /workspaces/:wid/context/:filename` — same handler chain, same gap.
- `PUT /workspaces/:wid/context/:filename` (currently writes; admin-only check?).
- `DELETE /workspaces/:wid/context/:filename` (currently deletes; admin-only check?).
- `GET /workspaces/:wid/context/user/list` — uses `userId` from token but still
  takes `wid` from URL with no scope check; verify same membership rule.

## Evidence

- `testcases/evidence/env1/TC-AI-CHAT-CONTEXT-CT.body` (qa-bob)
- `testcases/evidence/env1/TC-WS-CONTEXT-CT-AGAIN.body` (qa-admin)
- `testcases/evidence/env1/TC-WS-CONTEXT-CT-VIEWER.body` (qa-viewer)
- `testcases/evidence/env1/TC-WS-CONTEXT-CT-MEMBER.body` (qa-member)

All four return `{"data":{"files":[],"stats":{...}}}` HTTP 200, none of them
member of the target workspace.

## Notes

- Found during CORPUS FULL-2 run (Task #10) on 2026-05-10.
- No commit. Run log: `testcases/99-runlog/env1/CORPUS-FULL-2.md`.
