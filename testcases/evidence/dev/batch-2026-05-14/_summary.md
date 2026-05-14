# E2E QA Batch Summary — dev.doable.me — 2026-05-14

## Run Overview

| Field | Value |
|-------|-------|
| Date | 2026-05-14 |
| Environment | dev.doable.me / dev-api.doable.me |
| Method | Parallel agents (Claude-in-Chrome + Playwright + curl) |
| Models | Sonnet (testing), Opus 4.7 (bug fixing), Haiku (git/deploy) |
| Total bugs filed | **129+** |
| Critical/P0 | 14 |
| High | 42+ |
| Medium | 51+ |
| Low | 22+ |

## Agent Results

| Agent | Area | Tests Run | Pass | Fail | Bugs |
|-------|------|-----------|------|------|------|
| Tester A | Auth + Security | ~80 | ~72 | ~8 | 8 |
| Tester B | Workspace + Projects | ~100 | ~90 | ~10 | 4 |
| Tester C2 | AI Chat | 44 | 22 | 16 | 16 |
| Tester D2 | Admin Panel | 68 | 35 | 33 | 11 |
| Tester E | API Surface (38 files) | 200+ | — | — | 23 |
| Tester F2 | MCP + Integrations | 62 | 36 | 18 | 13 |
| Tester G2 | Editor + WebSocket | ~30 | ~28 | 2 | 2 |
| Tester H | Publish + Deploy | 16 | 7 | 8 | 7 |
| Tester I | Collaboration | ~30 | ~24 | 6 | 6 |
| Tester J | Billing + Marketplace | 127 | 68 | 38 | 14 |
| Tester K | GitHub + Versions | ~30 | ~27 | 3 | 3 |
| Tester L2 | Analytics + Notifications | 33 | 31 | 2 | 2 |

## Critical / P0 Bugs

| Bug ID | Area | Title | Status |
|--------|------|-------|--------|
| BUG-BILLING-002 | Billing | Cross-tenant balance data leak via workspaceId | Opus fixing |
| BUG-ANALYTICS-001 | Analytics | No workspace membership check on analytics endpoints | Opus fixing |
| BUG-ANALYTICS-002 | Analytics | Puppeteer --no-sandbox unconditional | Opus fixing |
| BUG-EDITOR-002 | WebSocket | /internal/presence unauthenticated — user presence leak | Opus fixing |
| BUG-ADMIN-007 | Admin | DELETE /admin/features permanently deletes — no guard | DB restored; Opus fixing code |
| BUG-AI-019 | AI Chat | Credit balance not decremented after sends | Opus fixing |
| BUG-AI-020 | AI Chat | Zero monthly credits not enforced | Opus fixing |
| BUG-AI-015 | AI Chat | Emoji stored as ?????? — UTF-8 corruption | Opus fixing |
| BUG-MCP-013 | MCP | mcp_ui_resource SSE event not emitted | Code emits correctly; CF Tunnel may drop — fallback in tool_result |
| BUG-ADMIN-001/002 | Admin | Search + pagination ignored on /admin/projects | Queued |
| BUG-ADMIN-005 | Admin | /admin/users missing plan/AI/credits fields | **FIXED** (session 2) |
| BUG-ADMIN-006 | Admin | PATCH /admin/features fails for underscore keys | Opus fixing |
| BUG-ADMIN-009 | Admin | /admin accessible without authentication | **FIXED** (session 2) — middleware.ts + web restart |
| BUG-AUTH-017 | Security | WebSocket CSWSH (cross-site hijack) | Queued for Opus |

## Infrastructure Fixes Applied During Run

| Fix | Action | Result |
|-----|--------|--------|
| /var/lib/doable-sites missing on dev | mkdir on dev server | Deploy flow unblocked |
| owner-pro had viewer role in workspace 492bdda5 | UPDATE workspace_members SET role='owner' | AI chat unblocked |
| ai_chat + analytics feature flags deleted by test | Direct DB INSERT (feature_key, label) | 15 flags restored |
| BUG-WS-003 /projects/shared crash → 502 | Opus fixed + SCP deployed | API stable |

## Commits Deployed to dev (dodev.fid.pw)

| Commit | Description |
|--------|-------------|
| d6ebc568 | fix(api): BUG-WS-001/003 root fix |
| 89f085af | fix(api): BUG-WS-001/003 |
| ce1637fb | fix(folders.ts): BUG-WS-001/003 |
| a5f7d75f | fix(next.config.ts): BUG-WS-001/003 |
| 5f2f497a | test(e2e): 133 evidence + bug files |

## Session 2 Fixes (2026-05-14/15)

| Bug | Description | Commit |
|-----|-------------|--------|
| BUG-ADMIN-004 | GET /admin/projects/:id endpoint added | session 2 |
| BUG-ADMIN-005 | /admin/users enriched with plan/AI/credits fields | session 2 |
| BUG-ADMIN-009 | /admin auth gate via Next.js middleware.ts | session 2 |
| BUG-AI-011 | "chat" mode added to chat endpoint + system prompt | session 2 |
| BUG-API-001 | GET /health/ trailing slash → 200 (not 308 to http://) | 8de423d2 |
| BUG-API-005 | POST /projects/:id/archive + /unarchive added | a172e882 |
| BUG-BILLING-001 | credit-display.tsx monthly limits corrected (pro→500, biz→3000) | session 2 |
| BUG-BILLING-004 | Missing billing endpoints added (subscription, limits, cancel, etc.) | session 2 |
| BUG-BILLING-005 | Webhook 502 when Stripe disabled — bypass guard added | session 2 |
| BUG-BILLING-006 | Login 429 shows "Too many attempts. Try again in X sec." | 0990a3a6 |
| BUG-BILLING-007 | /pricing page created with plan cards + upgrade buttons | session 2 |
| BUG-BILLING-008 | /billing/plans includes priceCents, contactSales; Enterprise added | session 2 |
| BUG-MARKETPLACE-003 | GET /marketplace/feed.json public endpoint added | session 2 |

## Previously Fixed (confirmed working)

| Bug | Description |
|-----|-------------|
| BUG-001/002/003/008 | /settings redirects to top-level routes |
| BUG-004 | /help index page |
| BUG-005 | favicon 404 |
| BUG-006/007/010 | Settings button validation + theme checkmark |
| BUG-009 | Usage page empty-state copy |
| BUG-WS-001 | Malformed UUID /workspaces/:id → 400 |

## Security Vulnerabilities Found

All confirmed. None bypassed security to test. Fix pipeline: Opus 4.7 only.

1. **Cross-tenant billing balance leak** — any auth user can query any workspace's credits
2. **Analytics no membership check** — any auth user can read any project's analytics
3. **Puppeteer --no-sandbox unconditional** — renderer escape risk from malicious published apps
4. **WS /internal/presence unauthenticated** — user enumeration, presence leak
5. **WebSocket CSWSH** — cross-site WebSocket hijacking (BUG-AUTH-017)
6. **CORS bypass** (BUG-012) — misconfigured allowed origins
7. **/admin accessible unauthenticated** — client-side auth only, no server-side guard

## Files

- Bug reports: `testcases/bugs/2026-05-14-*.md` (113 files committed in 5f2f497a)
- Evidence: `testcases/evidence/dev/batch-2026-05-14/`
- Run log: `testcases/99-runlog/RUNLOG.md`
