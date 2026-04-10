# AI Settings — Dual-Source Persistence Fix

**Date:** 2026-04-08
**Branch worked on:** `feature/integration-bridge` → merged into `main`
**Final commit:** `49d88c6` (feat) + `a54a09e` (merge)
**Status:** Deployed to dev (`a54a09e` running on `dev.doable.me`); migration 042 applied; final visual UAT on dev still pending user sign-in.

---

## Session goal

User reported: "In AI settings, the selected tab — copilot or custom model — is not stored. If I select copilot, save, and reload, it shows custom model again. Both settings are set but the one which is selected isn't considered as active."

That single bug report turned out to expose a deeper architectural problem in how AI settings were persisted, which is why this session ended up much larger than a one-line fix.

---

## What I found

### Bug 1 — tab selection silently reverted on save+reload

**Location:** `packages/db/src/queries/ai-settings.ts:277-283` (`upsertSettings`)

The SQL upsert used a `COALESCE(new, old)` pattern in `ON CONFLICT DO UPDATE`:

```sql
default_provider_id = COALESCE(${data.defaultProviderId ?? null}, workspace_ai_settings.default_provider_id)
```

`COALESCE(NEW, OLD)` means: if the new value is NULL, keep the old value. So when the frontend correctly tried to clear `default_provider_id` (because the user switched from Custom to Copilot), the backend silently kept the old value. The DB row ended up with **both** `default_copilot_account_id` AND `default_provider_id` set.

Then on reload, `deriveSource` in `model-config-tab.tsx:225` did `providerId ? "custom" : "copilot"` — saw the still-set provider id and reverted to Custom. The user's tab selection looked like it was being ignored.

### Bug 2 — model dropdown didn't refresh when changing copilot account

**Location:** `services/api/src/routes/chat.ts:2304` and `services/api/src/ai/providers/copilot-manager.ts:60`

The `/ai/models` route used the literal string `"models"` as the engine pool key:

```typescript
const engine = await manager.getEngine("models", githubToken);
```

`CopilotEngineManager.getEngine` caches engines by that key and **never compares** the new `githubToken` to the cached entry's token. So the very first call to `/ai/models` (with whatever account or token happened to be passed first) memoized an engine under `"models"` forever. Every subsequent call returned the same cached engine, regardless of which account the frontend asked for. The frontend's `useCopilotModels` hook was firing fresh requests correctly — the backend was just lying.

This also meant **different users on the same server were unintentionally sharing one cached engine for `/ai/models`**.

### The architectural issue (raised by user as a clarification)

Mid-fix, the user clarified: "Custom models and copilot can be both set. Don't expect one of them to be null. Both can be set for workspace, suggestions and even personal override but which one is currently being used depends on the tab selected and saved."

This was a much bigger statement than the original bug report. The whole stack — frontend `deriveSource`, frontend `handleSave`, backend resolver in `chat.ts:125-156` — inferred "is copilot or custom active?" from "is `provider_id` non-null?" There was no concept of an active source. Every save destroyed one side or the other to enforce the implicit invariant.

My SQL fix to Bug 1 was **necessary but not sufficient**: the frontend was still actively writing nulls to wipe the inactive side. Even with the SQL respecting nulls, the resolver and the UI inference were both still wrong.

So I proposed (and the user approved) a real schema redesign.

---

## What I built

### Migration 042 — `services/api/src/db/migrations/042_ai_settings_source.sql`

Adds:

| Table | Columns added |
|---|---|
| `workspace_ai_settings` | `default_source` (`'copilot'\|'custom'`), `suggestion_source`, `default_copilot_model`, `default_provider_model`, `suggestion_copilot_model`, `suggestion_provider_model` |
| `user_ai_preferences` | `source`, `copilot_model`, `provider_model`, `suggestion_source`, `suggestion_copilot_account_id`, `suggestion_provider_id`, `suggestion_copilot_model`, `suggestion_provider_model` |

Both tables get a CHECK constraint on the source columns. Existing rows are backfilled by inferring the source from "which id was previously set" and copying the legacy `*_model` field into whichever per-source slot matches. Legacy `default_model` / `suggestion_model` / `model` columns are kept (marked `@deprecated`) so anything I haven't yet touched keeps working — a follow-up cleanup migration can drop them later.

### Query layer — `packages/db/src/queries/ai-settings.ts`

- `upsertSettings` and `upsertUserPreferences` now distinguish "field undefined → preserve existing column" from "field null → write NULL". I do this by inlining a SQL fragment per column instead of `COALESCE`. This is load-bearing for the admin caller in `services/api/src/routes/admin.ts:472`, which only sends a subset of fields and expects untouched columns to stay untouched.
- `getEffectiveAiConfig` returns all the new columns (including the per-user suggestion override).
- `listAllUserPreferences` (used by the user-allocations admin tab) surfaces the new fields too.

### Resolver — `services/api/src/routes/chat.ts:127-176` and the suggestion-config branch at `:2417`

This is the most important runtime change. Both resolvers now branch on `*_source` and pick exactly the active side. The inactive side is **ignored even if populated**. Per-source models are read instead of the legacy single-model field. With this, both copilot and custom can coexist in the DB, and the resolver always picks one based on the explicit source flag.

### Frontend — `apps/web/src/modules/ai-settings/components/model-config-tab.tsx`

- `ModelSectionState` now has `copilotModel` + `providerModel` (independent — switching tabs preserves both).
- `deriveSource` reads `defaults.default_source` directly. No more inference.
- Source-toggle buttons in `InlineConfigFields` no longer wipe the inactive side. They just flip `state.source`.
- `handleSave` and `handleUserPrefSave` send **all** fields (both sides + the source flag). No more null wipes.
- The user **suggestion override** is wired up end-to-end. Previously, the comment at line 645 literally said *"the API doesn't store these yet"* — that's now fixed.

### Frontend — other files

- `apps/web/src/lib/api.ts` — mirror types: `ApiAiSource`, expanded `ApiWorkspaceAiDefaults`, `ApiUserAiPreferences`, `ApiEffectiveAiConfig`, `ApiUserAiAllocation`. Updated payload types for all the update functions.
- `apps/web/src/modules/ai-settings/hooks/use-ai-settings.ts` — hook update signatures pass through the new fields.
- `apps/web/src/modules/ai-settings/components/user-allocations-tab.tsx` — admin user-allocations edit form preloads both sides; source toggle no longer wipes; saves both sides + source. Row rendering uses helpers (`rowHasAllocation`, `rowActiveModel`, `rowActiveSide`) that honor `source`.
- `apps/web/src/app/(dashboard)/admin/page.tsx` — same overhaul for the platform admin user table.
- `apps/web/src/app/editor/[projectId]/page.tsx` — the editor's "apply effective config" effect picks the active side via `user_source` / `default_source` and reads the matching `*_copilot_model` / `*_provider_model`.

### API routes — `services/api/src/routes/ai-settings.ts` and `admin.ts`

Schemas (`updateDefaultsSchema`, `updateUserPreferencesSchema`, `updateUserAllocationSchema`, `adminAllocateSchema`) all carry the new fields. Handlers pass them through to the query layer. The `copy-my-settings` route (both workspace + admin variants) now copies BOTH sides + source so the target user inherits the full setup.

The `allocateAiToUser` helper in `admin.ts` was rewritten to take an `alloc` object containing both copilot and custom configs plus the active source.

### Bug 2 fix — `services/api/src/routes/chat.ts:2304`

Changed the engine pool key from the literal `"models"` to `models:${copilotAccountId ?? "default"}`. This gives each account its own cached engine, fixing both the dropdown bug and the multi-user cross-pollination issue.

I deliberately did **not** touch `CopilotEngineManager.getEngine` itself — broader "evict on token change" is a real concern but out of scope for this dropdown bug.

---

## Issues I hit along the way

### 1. The first SQL fix had a TypeScript narrowing bug

I tried to use a helper variable (`const keepDefaultSource = data.defaultSource === undefined`) and reference it in the conditional fragment. TypeScript couldn't narrow `data.defaultSource` through the helper variable, so the SQL fragment got `AiSource | undefined` and `postgres` complained. Fixed by inlining the check directly into the conditional fragment expression.

### 2. The migration directory confusion

The repo has **two** migration directories: `services/api/src/db/migrations/` and `packages/db/migrations/`. They're not duplicates — they're disjoint sets with overlapping numbers. I was about to add 042 and panicked that there might be a collision; turned out 042 was free in both. The `setup-server.sh` script runs both directories in lex order on a fresh server.

Also: the `db:migrate` script in `services/api/package.json:11` references `src/db/migrate.ts` which **doesn't exist and never has** in git history. It's dead. Real deploys go through `setup-server.sh`. Worth cleaning up someday.

I documented the situation back to the user to calm their (justified) worry. We agreed to leave it alone for this session.

### 3. The Bug 1 fix is "academic but load-bearing" after the redesign

Once the frontend stops sending nulls for the inactive side (which it does after the redesign), the `COALESCE`-vs-explicit-null distinction becomes academic for the AI Settings UI flow. **But** it's still load-bearing for the admin caller in `admin.ts:472`, which only sends `default_*` fields and expects `suggestion_*` to be preserved. So the fix stays.

### 4. Test data + cleanup discipline

To exercise dual-side persistence in the UI, I needed to insert a synthetic provider into godwin's workspace via SQL (he had no real custom provider). Easy to insert — but cleanup was a moment to be careful: the user said "delete the test provider, don't accidentally delete anything else." I used a defensive WHERE clause (`WHERE id = '<exact-uuid>' AND user_id = ...`) and ran it inside a transaction with a verification SELECT. Safe.

### 5. Stale `.next` build cache on dev

When I rebuilt apps/web on the dev server, the first `pnpm --filter web build` failed with `Cannot find module '../chunks/ssr/[turbopack]_runtime.js'` — stale turbopack artifacts in `.next/`. Fixed by `rm -rf apps/web/.next && pnpm --filter web build`. Build then succeeded after ~2 minutes.

### 6. Next.js dev mode vs production mode mismatch

CLAUDE.md says *"Web uses Next.js with Turbopack HMR in dev mode"*, but the dev server is actually running `next start` (production mode) on port 3000. So the web has **no HMR** — every code change requires a rebuild + restart. The API has tsx watch and DID auto-reload (uptime confirmed it restarted ~2 minutes after my git pull), but the web needed manual intervention.

Worth raising in a future session: should the dev server actually run `next dev` to match the docs, or should the docs be updated to match reality? Both options have tradeoffs (HMR vs stability).

### 7. Final UAT on dev is blocked on auth

After deploying, I navigated my Chrome tab to `https://dev.doable.me/ai-settings` and got bounced to `/login`. My Chrome session is only authenticated for localhost. Mechanically the deploy is complete; the final visual smoke test on dev is pending the user signing in.

---

## What I verified locally (all green)

| # | Test | Result |
|---|---|---|
| 1 | **Bug 1 fix** — switch Custom → save → reload → tab stays Custom; switch Copilot → save → reload → tab stays Copilot | ✅ Both directions verified in Chrome with screenshots |
| 2 | **Bug 2 fix** — `/ai/models` returns distinct responses for different `copilotAccountId` query params | ✅ Verified order-independence: server-default returns auth error (no token), with-account returns 15 real models. Same in both call orders. |
| 3 | **Dual persistence** — populate copilot side with `claude-opus-4.6`, populate custom side with `Test OpenAI / gpt-4o-mini-test`, save, reload, both come back independently when toggling tabs | ✅ Verified in DB and UI |
| 4 | **User suggestion override** — set `gpt-5-mini` on the Suggestion Model sub-tab, save, reload, value persists | ✅ Verified (was previously a no-op) |
| 5 | **Resolver picks active source** — `getEffectiveAiConfig` returns all new fields; flipping `user_source` via SQL changes which side the resolver would pick (verified at the data layer; logic traced through `chat.ts:127-176`) | ✅ |

Migration 042 was applied to local DB cleanly; backfill correctly migrated 5 workspace rows + 2 user-pref rows.

All 5 packages typecheck via `turbo run type-check` (api, db, shared, web, ws).

---

## Deployment record

**Local commit / push**

```
49d88c6  feat(ai-settings): persist both copilot and custom configs with active source flag
         12 files changed, 918 insertions(+), 225 deletions(-)
         + new migration 042_ai_settings_source.sql
```

Pushed to `origin/feature/integration-bridge`.

**Merge to main**

The user asked to merge `feature/integration-bridge` → `main`. I flagged that the branch was 20 commits ahead of main (not just my one commit — also the entire integration-bridge feature: vault-bridge, MCP credential encryption, Supabase provisioner, request_integration tool, OAuth fixes, etc.). The user confirmed they wanted the full merge. Result:

```
a54a09e  Merge branch 'feature/integration-bridge' into main
         55 files changed, 4444 insertions(+), 276 deletions(-)
```

Pushed to `origin/main`.

**Dev server (`root@143.110.188.13`, `/root/doable`)**

1. `git fetch origin` — picked up `f9f9f00..a54a09e` on main
2. `git checkout main && git pull --ff-only origin main` — switched from `feature/integration-bridge@cbd238a` to `main@a54a09e`. The dirty `tsbuildinfo` and untracked `.env.bak.*` files were preserved untouched.
3. **Migration applied:** `psql -f services/api/src/db/migrations/042_ai_settings_source.sql` — `ALTER TABLE` x2, `UPDATE 6` workspace rows, `UPDATE 1` user-pref row. One workspace had a real custom provider (`nvidia/nemotron-4-340b-instruct`) which was correctly migrated to `default_source='custom'` + `default_provider_model`.
4. **API auto-reloaded** via tsx watch (uptime 128s after pull, healthcheck returned `up`)
5. **Web rebuilt** — cleared `apps/web/.next/`, ran `pnpm --filter web build` (succeeded after the stale-cache false start)
6. **Web restarted** — `pnpm --filter web start` in tmux window 0, new PID 195106
7. **Network bindings verified:** all three services on `127.0.0.1` only (per CLAUDE.md security rule)

---

## What's left

### Blocking
- **Visual UAT on `dev.doable.me`** — pending user sign-in. Once signed in, I'll re-run the same 4-test smoke suite I ran locally.

### Non-blocking follow-ups
- **Drop the legacy `default_model` / `suggestion_model` / `model` columns** in a future cleanup migration (currently kept and `@deprecated`). Safe to drop once we confirm nothing reads them.
- **Clean up `model-defaults-tab.tsx`** — dead code, never imported anywhere. Still references the old shape but typechecks because the deprecated fields remain.
- **Fix the broken `db:migrate` npm script** in `services/api/package.json:11` — references a `migrate.ts` that doesn't exist.
- **Reconcile CLAUDE.md vs reality** on the web dev server: docs say HMR/dev mode, server runs `next start`. Either update docs or switch the server.
- **Decide whether to merge / cherry-pick to prod** — main now has the full integration-bridge feature plus this fix. Prod (per memory) had env vars pre-provisioned but never received the integration-bridge code. That's a separate, larger conversation.

### Cleanup left on dev DB
- The synthetic `Test OpenAI (delete me)` provider was a **local** test artifact — already cleaned up locally with a defensive transaction. Dev DB is untouched by my testing.
- One **real** thing changed on dev: every existing workspace_ai_settings row got `default_source='copilot'` (or `'custom'` for the one workspace with a custom provider). No user-visible change because the resolver behavior is preserved by the backfill.

---

## Lessons / things worth remembering

1. **A single bug report can hide an architectural problem.** "Tab doesn't persist" sounded trivial. The first fix made the SQL respect explicit nulls. But the *real* fix was redesigning the schema so both sides could coexist with an explicit active flag. I should listen carefully when a user pushes back with phrases like "hope you don't expect one of them to be null" — that's a design statement, not a confirmation.

2. **Don't delegate understanding of "active" to "non-null".** Inferring state from "which field has data" is fragile. Anywhere I see code doing `if (foo) ... else if (bar) ...` to pick a mode, I should ask: is there a missing source-of-truth flag?

3. **`COALESCE(new, old)` is not a partial-update primitive.** It can't distinguish "not provided" from "explicit clear". Use undefined-vs-null at the call site and a conditional SQL fragment in the upsert.

4. **Verify deploys at the right layer.** API uptime + healthcheck told me tsx watch had reloaded. Web required manual rebuild because `next start` (production mode) doesn't have HMR. Don't assume "tsx watch" applies to everything just because CLAUDE.md says so for some services.

5. **Defensive WHERE clauses on cleanup queries.** When the user says "delete X, don't accidentally delete anything else," wrap the delete in a transaction, add a sanity-check SELECT before, and use the most specific WHERE clause possible. Even then, run a verification SELECT after.

6. **The two-migration-directory situation is messy but not broken.** It's worth understanding before adding migrations, but not worth refactoring unless asked. Document the situation back to the user when in doubt — they may not remember the historical reason.
