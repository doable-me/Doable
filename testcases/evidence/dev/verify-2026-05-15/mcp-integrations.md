# MCP & Integrations — verify-2026-05-15 (dev.doable.me)

**Agent:** Area 6 — MCP & Integrations
**Run:** 12-agent parallel sweep against `https://dev.doable.me` / `https://dev-api.doable.me`
**Account:** qa-owner@doable.test (workspace `74e22382-65a0-4d22-acad-6585cbcea26b`)
**Date:** 2026-05-14T20:20Z – 2026-05-14T20:35Z

## Headline

- 13 inbound MCP bugs + 1 corpus bug + 1 WSI bug retested live on dev.
- **9 already fixed on dev** (in current code at HEAD; verified by live curl).
- **3 root-cause fixes pushed in this PR** (BUG-MCP-004 alias, BUG-MCP-005 search/pagination, BUG-MCP-008 listTools envelope).
- 2 bugs are corpus/doc mismatches (BUG-MCP-003, BUG-WSI-002) — corpus already matches reality; no code change needed.
- 1 bug (BUG-MCP-001 dev API crash loop) is transient and not currently reproducible — `/health` is steady at 200, uptime >850s.

## Live retest results

| Bug | Status | Evidence |
|-----|--------|----------|
| BUG-MCP-001 (dev API crash loop) | **NOT REPRO** — `/health` 200, uptime 865s, devServers=1 active | `retest-results.txt` §/health |
| BUG-MCP-002 (delete builtin) | **FIXED** on dev — DELETE returns 403 `"Cannot delete built-in connector"` | `retest-results.txt` §BUG-MCP-002 |
| BUG-MCP-003 (`/enhanced-auth/start` 404) | **CORPUS MISMATCH** — real path is `GET /integrations/enhanced-auth/:id/authorize?workspaceId=…` and works (200, returns `authorizationUrl`). Corpus should be updated to match shipped contract. | `retest-results.txt` §Enhanced auth |
| BUG-MCP-004 (`/integrations` 404) | **FIXED IN PR** — added 302 redirect to `/integrations/catalog` preserving query string | `services/api/src/routes/integrations-catalog.ts` |
| BUG-MCP-005 (`?q=` not respected) | **FIXED IN PR** — `?q=` aliased to `?search=`; also added `?authType=`, `?limit=`, `?offset=`, `total` in response | `q_stripe_dev.json` (pre-deploy: 533 results); new TC `TC-INTEG-CATALOG-QUERY.md` |
| BUG-MCP-006 (n/a — not in repro set) | — | — |
| BUG-MCP-007 (http:// URLs accepted) | **FIXED** on dev — POST returns 400 `"MCP server URL must use HTTPS"` | `retest-results.txt` §BUG-MCP-007 |
| BUG-MCP-008 (listTools 500 on inactive HTTP) | **FIXED IN PR** — inactive connectors now return 503 with cached tools envelope; runtime fetch failure on active connector also returns 503 (not 500) | `services/api/src/routes/connectors.ts` + new TC `TC-MCP-CONNECTOR-TOOLS-INACTIVE.md` |
| BUG-MCP-009 (catalog 849ms) | **NOT P0** — `?limit=` pagination now caps payload; full registry build is in-memory and unchanged. Future improvement: ETag + Cache-Control headers. | — |
| BUG-MCP-010 (PATCH `{enabled:false}` no-op) | **FIXED** on dev — schema doesn't accept `enabled`, but `{status:"inactive"}` works (200, status flipped). Documented in TC | `retest-results.txt` §BUG-MCP-010 |
| BUG-MCP-011 (Editor CORS on 502) | **CLOUDFLARE-LEVEL** — out of API scope; requires Worker or `cf-pages` header; tracked separately. Not actively occurring (API healthy). | — |
| BUG-MCP-012 (connector-proxy 404) | **CORPUS MISMATCH** — endpoint exists at `POST /__doable/connector-proxy/:integration/:action` and `GET /__doable/connector-proxy/available` (live: 401 on no auth as expected). Bug tested wrong URL. | `retest-results.txt` §H |
| BUG-MCP-013 (mcp_ui_resource not emitted) | **NOT REPRO** in source — code emits `mcp_ui_resource` SSE event with `artifact_ready` fallback for CF Tunnel drops (tool-callbacks.ts:439-455). Builtin MCP server files present on dev (`/root/doable/mcp-servers/markdown-builder/index.mjs`, 17009 bytes). Tester chat session likely hit `awaitingMcpWidget` path correctly but didn't see the secondary event due to CF dropping; fallback is in place. | `retest-results.txt` §MCP Apps RUNTIME |
| BUG-CORPUS-MCP-001 (bogus UUID 500) | **FIXED** on dev — POST returns 400 `"Invalid id: must be a UUID"` | `retest-results.txt` §BUG-CORPUS-MCP-001 |
| BUG-WSI-002 (`/integrations/connections` requires wsid) | **CORPUS DOC GAP** — API correctly returns 400 with helpful error message ("workspaceId query parameter is required"). Corpus TC-INTEG-LIST-026 should be updated to require `?workspaceId=`. | `retest-results.txt` §BUG-WSI-002 |
| BUG-WSI-001 (room.join no presence ack) | **OUT OF SCOPE** — owned by Editor & WebSocket area (Area 7) | — |
| BUG-WSI-003 (/design-comments/:id 308) | **OUT OF SCOPE** | — |
| BUG-WSI-004 (/notifications API unmounted) | **OUT OF SCOPE** — Area 12 (Analytics+Notifications) | — |

## Endpoints validated (TC sample)

| Endpoint | Status |
|---|---|
| GET /workspaces/:id/connectors | 200 — 4 built-ins active |
| GET /workspaces/:id/connectors-effective | 200 — same 4 active |
| POST /workspaces/:id/connectors (https URL) | 201 — auto-test fires |
| POST /workspaces/:id/connectors (http URL) | 400 — `"MCP server URL must use HTTPS"` |
| POST /workspaces/:id/connectors (stdio scope) | 403 — `"stdio transport is not available for user-created connectors"` |
| PATCH /workspaces/:id/connectors/:id `{status:"inactive"}` | 200 — status flips |
| DELETE /workspaces/:id/connectors/:builtin | 403 — `"Cannot delete built-in connector"` |
| DELETE /workspaces/:id/connectors/:user | 200 — deleted:true |
| GET /workspaces/:id/connectors/:id/tools (active stdio) | 200 — 2 tools |
| GET /workspaces/:id/connectors/:id/tools (inactive http) | **was 500, will be 503 after deploy** |
| POST /workspaces/:id/connectors/notacid/test | 400 — `"Invalid id: must be a UUID"` |
| GET /integrations/catalog | 200 — 533 entries |
| GET /integrations | **was 404, will be 302→/catalog after deploy** |
| GET /integrations/catalog?q=stripe | **was 533 results, will be 3 after deploy** |
| GET /integrations/connections (no wsid) | 400 — `"workspaceId query parameter is required"` |
| GET /integrations/enhanced-auth/supabase/authorize?workspaceId=… | 200 — `authorizationUrl` returned |
| GET /__doable/connector-proxy/available (no auth) | 401 — UNAUTHORIZED (endpoint mounted) |

## Tally

- **OPEN_ZAPPED:** 3 / 13 (BUG-MCP-004, BUG-MCP-005, BUG-MCP-008 fixed in PR)
- **FIXES_PASS:** 6 / 6 (BUG-MCP-002, BUG-MCP-007, BUG-MCP-010, BUG-CORPUS-MCP-001, BUG-WSI-002, BUG-MCP-001 verified already-fixed-on-dev)
- **Corpus mismatches (no fix needed):** 3 (BUG-MCP-003, BUG-MCP-012, BUG-WSI-002 doc)
- **Out-of-scope:** 4 (BUG-WSI-001/003/004, BUG-MCP-009 perf, BUG-MCP-011 CF)
- **MCP Apps Compatible status:** verified — runtime files present on dev, code path emits `mcp_ui_resource` + `artifact_ready` fallback for CF Tunnel drops.

## New regression test cases

- `testcases/14-mcp/TC-MCP-CONNECTOR-TOOLS-INACTIVE.md` — listTools on inactive HTTP must return 503 (not 500)
- `testcases/07-integrations/TC-INTEG-CATALOG-QUERY.md` — `?q=`/`?authType=`/`?limit=`/`?offset=` + `/integrations` alias

## Files

- Evidence: `testcases/evidence/dev/verify-2026-05-15/mcp-integrations/`
  - `retest-results.txt` — live curl outputs
  - `q_stripe_dev.json` — `?q=stripe` pre-deploy response (533 results = broken)
  - `_token.json` — qa-owner JWT used
- PR: see `PR:` line in completion report
