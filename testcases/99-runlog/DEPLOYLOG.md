# Deploy Log — 2026-05-14

## Monitoring Started
- Time: 2026-05-14 (monitoring loop active)
- Branch: main
- Initial status: Clean (testcases/ changes ignored)
- Watching: apps/ and services/ directories only

## Deployment History
(Entries added as commits occur)
=== Deploy Monitor Started at 2026-05-14 23:23:16 ===
Watching: /c/Users/gj/Documents/workspace/doable
Poll interval: 2 minutes

2026-05-14 23:28:08 | Commit #1 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-14 23:27:19 | Commit #1 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
[2026-05-14 23:29:57] === Deploy Monitor Started (SCP mode) ===
[2026-05-14 23:29:57] Watching: /c/Users/gj/Documents/workspace/doable

## Deploy #1 — 2026-05-14 23:30 IST

**Commits deployed:** d6ebc568, 89f085af (2 commits ahead of d27172e7)
**Fixes:** BUG-WS-001 (invite email-match guard), BUG-WS-003 (shared-projects DISTINCT crash → 502)
**Files changed:**
- packages/db/src/queries/share-tracking.ts (CTE dedup replaces SELECT DISTINCT)
- services/api/src/routes/projects/list-routes.ts (try/catch 500 handler)
- services/api/src/routes/workspaces.ts (email match check on invite accept)
- services/api/src/routes/connectors.ts (additional fix)
**Deploy method:** git bundle → scp → git fetch + merge → systemctl restart doable.service
**Verification:** https://dev-api.doable.me/health → 200 ✅
2026-05-14 23:35:18 | Commit #1 | fix(services/api/src/routes/folders.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-14T18:05:15.111Z","version":"0.1.0","uptime":3.63106903,"checks":{"database":{"status":"up","latencyMs":0},"memory":{"rssBytes":438206464,"heapUsedBytes":170827216,"heapTotalBytes":200237056},"devServers":{"active":0}}}
2026-05-14 23:35:33 | Commit #2 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-14 23:40:30 | Commit #2 | fix(apps/web/next.config.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-14T18:10:28.287Z","version":"0.1.0","uptime":316.806190164,"checks":{"database":{"status":"up","latencyMs":0},"memory":{"rssBytes":363429888,"heapUsedBytes":163830848,"heapTotalBytes":168902656},"devServers":{"active":1}}}
2026-05-14 23:40:35 | Commit #3 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
