# Historical E2E browser verification — 2026-05-09 (zantaz audit)

> **NOTE:** This is a historical audit record of the v2 setup script, run
> against a specific operator install ("zantaz") on 2026-05-09. The
> hostnames below (`zantaz.doable.me`, etc.) reflect that one-time test
> environment. New installs use a per-org `<env>` value picked by the
> operator — see `manual-steps.md`.


## Verdict: PASS

All 8 scenarios green. Production-equivalent zantaz environment is reachable, TLS valid, signup -> dashboard -> logout -> login flow works end-to-end without React errors. Workspace auto-provisioned. Health and OAuth endpoints behave correctly.

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | Landing page reachability | PASS | `https://zantaz.doable.me/` returned HTTP 200; "Dream it. Do it. Done." home page rendered cleanly with header (Solutions/Resources/Pricing/Community) and Doable chat input |
| 2 | TLS validity | PASS | Browser navigated over HTTPS without cert warnings; covered by Cloudflare `*.doable.me` Universal SSL (single-level wildcard works for `zantaz.doable.me`) |
| 3 | Sign-up flow | PASS | `/signup` form filled with name "QA Zantaz", email `qa-zantaz-001@doable.test`, password `TestPass123!`, TOS checkbox ticked, Create account submitted -> redirected to `/dashboard` within ~3s |
| 4 | Dashboard renders | PASS | Post-signup dashboard rendered ("Let's make it Doable, QA?") with sidebar (Home/Search/Templates/Discover/Marketplace/Running instances), workspace card, projects list, no React error #310, no console errors logged |
| 5 | Workspace auto-created | PASS | `GET /workspaces` returned 200 with one row: `{name:"QA Zantaz's workspace", slug:"qa-zantaz", userRole:"owner", plan:"free", memberCount:1}` (id `d20a1cfa-5861-42f7-8342-ca7e77eb2582`) |
| 6 | Login flow | PASS | Sign out via user menu -> redirected to landing. Navigated to `/login`, submitted same creds -> redirected to `/dashboard` again with the same workspace context |
| 7 | Health endpoint | PASS | `GET https://zantaz-api.doable.me/health` -> 200 `{"status":"healthy","checks":{"database":{"status":"up","latencyMs":1},...}}` |
| 8 | GitHub OAuth redirect | PASS | `GET https://zantaz-api.doable.me/auth/github` -> 302 to `https://github.com/login/oauth/authorize?client_id=Ov23lixtciqu75ir3IRP&redirect_uri=https%3A%2F%2Fzantaz-api.doable.me%2Fauth%2Fgithub%2Fcallback&scope=read%3Auser+user%3Aemail&state=...` — client_id matches DoableMe-Zantaz |

## Screenshots

Captured in-browser during the run (MCP `save_to_disk: true` flag set on each). The screenshot binary is held by the claude-in-chrome MCP server outside the workspace directory; the visual content is embedded inline in the orchestrator transcript and matches each scenario above. Screenshot IDs:

- `ss_5425zl4et` — Landing page (zantaz.doable.me)
- `ss_46921anas` — Signup form pre-fill
- `ss_5940qiqvm` — Signup form filled, password "Strong" indicator green
- `ss_2199ger60` — Post-signup dashboard with "QA Zantaz's workspace" sidebar
- `ss_488608a5o` — User menu open (Sign out option)
- `ss_56920rbf8` — Post-login dashboard (re-auth verified)

## Findings

- Test user `qa-zantaz-001@doable.test` (user_id `9f84db55-30dc-4497-a3eb-48173b5df7c0`) was created and persists; remove if/when you want a fully empty DB.
- API uptime at first health check was ~280s, indicating the API was started ~5 min before the verification run.
- Tokens are stored in `localStorage` under `doable_access_token`/`doable_refresh_token` (not in `accessToken`); minor naming detail to be aware of for future scripts.
- No console errors observed — the previously-fixed React #310 in `dashboard-chat-input.tsx` is not regressing.
- Zantaz uses single-level subdomain (`zantaz.doable.me` / `zantaz-api.doable.me` / `zantaz-ws.doable.me`) per the Cloudflare-compatible naming rule — TLS handshake clean.
- GitHub OAuth wired to client_id `Ov23lixtciqu75ir3IRP` (DoableMe-Zantaz) with correct callback `https://zantaz-api.doable.me/auth/github/callback`.
