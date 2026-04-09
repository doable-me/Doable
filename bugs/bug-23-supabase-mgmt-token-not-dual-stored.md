# Bug 23 — Supabase enhanced-auth flow discards the Management API token; provisioner is permanently locked out

**Severity:** 🟠 High — blocks `provision_supabase` / "Create a Supabase database" for ALL users regardless of how they connected
**Area:** `services/api/src/routes/integrations.ts` — `/integrations/enhanced-auth/callback` + `/integrations/enhanced-auth/:id/complete` handlers; `services/api/src/routes/integrations/supabase/provision.ts` — `getMgmtAccessToken()`
**Discovered:** 2026-04-09 during round-2 end-to-end verification of bug-16
**Status:** ✅ Fixed 2026-04-09 — `storeMgmtTokenSibling()` helper writes a sibling row after the main credentialVault.store()

## Symptom

After completing the "Sign in with Supabase" OAuth flow and picking a Supabase project in the resource picker, the provision dialog still shows the `oauthRequired` warning and `/api/integrations/supabase/orgs?workspaceId=…` returns:

```
HTTP/1.1 412 Precondition Failed
{"error": "supabase_oauth_required"}
```

The user's DB state looks healthy — the `integration_connections` row for `integration_id="supabase"` contains the picked project's `url`, `service_role_key`, and `anon_key`, with `metadata.projectRef`, `metadata.region`, `metadata.connectedVia = "enhanced_auth"` — but there's **no** row for `integration_id="supabase-mgmt"`.

## Root cause

The enhanced-auth design anticipated two sibling credential rows:

1. `integration_id = "supabase"` — data-plane creds (URL + anon/service_role key) used by the AI's Supabase MCP/Activepieces tooling for reads/writes against a specific project.
2. `integration_id = "supabase-mgmt"` — a raw OAuth access_token for Supabase's Management API, used for org listing + project creation (`provision_supabase`).

`services/api/src/integrations/registry/developer-tools.ts:370` declares the pair:

```ts
enhancedAuth: {
  providerKey: "supabase",
  oauthIntegrationKey: "supabase-mgmt",
  // …
}
```

And `services/api/src/mcp/presets/supabase.ts:121-150` explicitly looks across both rows: the data row carries `projectRef` but not the access_token, the mgmt row is the reverse — so the preset scans `context.allConnections` to stitch them together.

But the enhanced-auth **complete** handler in `integrations.ts` only ever wrote ONE row — the data row — under `integration_id = integrationId` (where `integrationId` comes from the URL param `:id`, which is always `"supabase"` for this flow). The handler called `module.extractCredentials(accessToken, selectedResource)` which uses the raw OAuth token to pull the picked project's keys, then **discards** the raw token in favor of the project-specific creds. The `supabase-mgmt` row was never created.

Net effect:
- `credentialVault.get(userId, "supabase-mgmt", workspaceId)` in `provision.ts:76` always returns `null`
- `provision.ts:99-102` returns 412 `supabase_oauth_required`
- Dialog renders the oauthRequired branch
- User clicks "Sign in with Supabase" → gets redirected to the integrations panel → re-runs the OAuth flow → lands back in the same 412 state → loop

## Fix shipped

### `storeMgmtTokenSibling()` helper (new)

Added to `services/api/src/routes/integrations.ts`. Takes the raw OAuth access_token from the current flow and writes a sibling row:

```ts
async function storeMgmtTokenSibling(
  mgmtIntegrationKey: string,
  params: {
    workspaceId: string;
    userId: string;
    scope: "workspace" | "project" | "user";
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    displayName: string;
  },
): Promise<void> {
  // Clean up any prior sibling row so repeated Sign-in-with-X flows don't
  // leave stale tokens in the DB.
  await sql`
    DELETE FROM integration_connections
    WHERE user_id = ${params.userId}
      AND integration_id = ${mgmtIntegrationKey}
      AND workspace_id = ${params.workspaceId}
  `;
  await credentialVault.store({
    workspaceId: params.workspaceId,
    userId: params.userId,
    integrationId: mgmtIntegrationKey,       // "supabase-mgmt"
    scope: params.scope,
    authType: "oauth2",
    credentials: {
      access_token: params.accessToken,
      ...(params.refreshToken ? { refresh_token: params.refreshToken } : {}),
      ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
    },
    displayName: params.displayName,
    metadata: { via: "enhanced_auth_sibling" },
  });
}
```

The **delete-then-insert** pattern avoids accumulating stale tokens on repeated sign-ins. `credentialVault.store()` does not upsert — every call inserts a new row — so without the cleanup, each sign-in would leave a trail.

### Call sites

Both branches of the enhanced-auth completion flow now write the sibling:

- **`/integrations/enhanced-auth/callback`** — no-resource-selection branch (line ~680). Called for providers where the OAuth token alone is the connection. Writes the sibling right after the main `credentialVault.store()`.
- **`/integrations/enhanced-auth/:id/complete`** — resource-selection branch (line ~810). Called after the user picks a resource in the server-rendered picker. Writes the sibling using `session.accessToken` (which was stashed in the session during the callback step).

Both branches only write the sibling when `def.enhancedAuth.oauthIntegrationKey` is set — i.e. only when the integration registry explicitly declares a management-API sibling. Today that's Supabase; future providers (GitHub Enterprise, Vercel) can opt in by adding the field.

### Inline Sign-in button in the dialog

`apps/web/src/modules/integrations/supabase-provision-dialog.tsx` previously told users to "open the integrations panel, find Supabase, and pick Sign in with Supabase" — dead-end UX that made them hunt a sub-page. Replaced with an inline **Sign in with Supabase** button that:

1. Fetches the authorize URL from `/integrations/enhanced-auth/supabase/authorize?workspaceId=…&scope=user`
2. Opens it in a 540×720 popup
3. Listens for the `doable:enhanced-auth-complete` postMessage the callback page fires
4. Re-fetches orgs via the refactored `fetchOrgs()` callback — on success, `setOauthRequired(false)` hides the sign-in branch and the real form renders with the org dropdown populated

Also handles popup-blocked browsers, cross-origin `popup.closed` quirks (COOP strips the opener reference), and a 2-minute timeout so the button doesn't hang forever. `signingIn` state drives the button's loading spinner; `signInError` surfaces errors inline.

## Acceptance

1. Send a chat prompt that calls `provision_supabase` on a fresh user (no existing Supabase connection).
2. Dialog opens → `Sign in with Supabase` button is visible and enabled.
3. Click the button → Supabase OAuth popup opens.
4. Complete the OAuth flow + pick a project in the resource picker.
5. Popup closes automatically.
6. Dialog's `oauthRequired` branch disappears and the org picker appears with orgs populated.
7. Queries against Postgres confirm **two** rows now exist under the user: `integration_id="supabase"` (project keys) AND `integration_id="supabase-mgmt"` (raw OAuth access_token).
8. `GET /api/integrations/supabase/orgs?workspaceId=…` returns 200 with an orgs array.
9. Subsequent `provision_supabase` calls successfully create a new project via the Management API.

## Why "both auth paths work either way"

- **Manual entry** (user pastes URL + service_role key) → stores `integration_id="supabase"` with `auth_type="custom_auth"`. AI's Activepieces-backed native Supabase tools (`createAllTools` path) resolve their credentials from this row → **works for all data-plane operations** (read/write/upsert/delete/upload/custom_api_call).
- **Enhanced-auth OAuth** (user clicks Sign in with Supabase, picks a project) → stores `integration_id="supabase"` (same shape as manual, populated via `extractCredentials`) **PLUS** the new `integration_id="supabase-mgmt"` sibling row. Data-plane operations work identically; Management-API operations (create new project) now also work.
- **Neither path** can create new Supabase projects without the OAuth sibling, because Supabase's Management API strictly requires an org-scoped OAuth token — there's no service_role equivalent. That's a Supabase platform constraint, not a Doable limitation. The new inline Sign-in button in the dialog makes it trivial for a manual-entry user to upgrade to OAuth when they actually need provisioning.
