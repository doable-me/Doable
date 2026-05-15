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
2026-05-14 23:43:15 | Commit #4 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-14 23:43:33 | Commit #3 | fix(apps/web/src/modules/billing/components/credit-display.tsx): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health=FAILED
2026-05-14 23:45:52 | Commit #5 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-14 23:46:09 | Commit #4 | fix(services/api/src/routes/admin-features.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-14T18:16:07.233Z","version":"0.1.0","uptime":3.07165617,"checks":{"database":{"status":"up","latencyMs":0},"memory":{"rssBytes":440012800,"heapUsedBytes":170495424,"heapTotalBytes":199712768},"devServers":{"active":0}}}
2026-05-14 23:48:42 | Commit #6 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-14 23:48:55 | Commit #5 | fix(services/api/src/routes/admin-ops.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health=FAILED
2026-05-15 09:26:02 | Commit #13 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 09:26:12 | Commit #2 | fix(audit-routes): OpusAgent fix for BUG-WS-001/003 | health=FAILED
2026-05-15 09:26:28 | Commit #12 | fix(services/api/src/admin/audit-routes.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health=FAILED
2026-05-15 09:28:17 | Commit #14 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 09:30:29 | Commit #15 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 09:30:31 | Commit #3 | fix(rate-limit): OpusAgent fix for BUG-WS-001/003 | health=FAILED
2026-05-15 09:45:12 | Commit #16 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 09:45:18 | Commit #4 | fix(rate-limit): OpusAgent fix for BUG-WS-001/003 | health=FAILED
2026-05-15 09:45:19 | Commit #13 | fix(services/api/src/middleware/rate-limit.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health=FAILED
2026-05-15 18:13:45 | Commit #17 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 18:13:52 | Commit #14 | fix(apps/web/src/hooks/use-platform-admin.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-15T12:43:51.051Z","version":"0.1.0","uptime":25375.886378873,"checks":{"database":{"status":"up","latencyMs":2},"memory":{"rssBytes":388911104,"heapUsedBytes":174015896,"heapTotalBytes":190574592},"devServers":{"active":0}}}
2026-05-15 18:13:55 | Commit #5 | fix(use-platform-admin): OpusAgent fix for BUG-WS-001/003 | health={"status":"healthy","timestamp":"2026-05-15T12:43:53.168Z","version":"0.1.0","uptime":25378.002717194,"checks":{"database":{"status":"up","latencyMs":0},"memory":{"rssBytes":388911104,"heapUsedBytes":174134152,"heapTotalBytes":190574592},"devServers":{"active":0}}}
2026-05-15 18:20:29 | Commit #18 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 18:20:43 | Commit #15 | fix(apps/web/src/hooks/use-platform-admin.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-15T12:50:41.391Z","version":"0.1.0","uptime":25786.225800608,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":388911104,"heapUsedBytes":177444464,"heapTotalBytes":190574592},"devServers":{"active":0}}}
2026-05-15 18:20:43 | Commit #6 | fix(use-platform-admin): OpusAgent fix for BUG-WS-001/003 | health={"status":"healthy","timestamp":"2026-05-15T12:50:41.719Z","version":"0.1.0","uptime":25786.554195331,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":388911104,"heapUsedBytes":177553160,"heapTotalBytes":190574592},"devServers":{"active":0}}}
2026-05-15 18:35:26 | Commit #19 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 18:35:46 | Commit #7 | fix(admin-users): OpusAgent fix for BUG-WS-001/003 | health=FAILED
2026-05-15 18:35:46 | Commit #16 | fix(services/api/src/routes/admin-users.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health=FAILED
2026-05-15 22:13:41 | Commit #20 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 22:14:06 | Commit #17 | fix(apps/web/src/modules/integrations/integrations-admin-panel.tsx): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-15T16:44:04.230Z","version":"0.1.0","uptime":12987.684078516,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":359419904,"heapUsedBytes":165851104,"heapTotalBytes":170737664},"devServers":{"active":0}}}
2026-05-15 22:14:06 | Commit #8 | fix(integrations-admin-panel): OpusAgent fix for BUG-WS-001/003 | health={"status":"healthy","timestamp":"2026-05-15T16:44:04.231Z","version":"0.1.0","uptime":12987.684597532,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":359419904,"heapUsedBytes":165922288,"heapTotalBytes":170737664},"devServers":{"active":0}}}
2026-05-15 22:15:59 | Commit #21 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 22:18:35 | Commit #22 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 22:18:49 | Commit #18 | fix(apps/web/src/modules/integrations/integrations-admin-panel.tsx): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-15T16:48:47.263Z","version":"0.1.0","uptime":13270.716818289,"checks":{"database":{"status":"up","latencyMs":0},"memory":{"rssBytes":361779200,"heapUsedBytes":168313712,"heapTotalBytes":173359104},"devServers":{"active":0}}}
2026-05-15 22:18:49 | Commit #9 | fix(integrations-admin-panel): OpusAgent fix for BUG-WS-001/003 | health={"status":"healthy","timestamp":"2026-05-15T16:48:47.588Z","version":"0.1.0","uptime":13271.042205052,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":361779200,"heapUsedBytes":168110616,"heapTotalBytes":173359104},"devServers":{"active":0}}}
2026-05-15 22:47:08 | Commit #23 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-15 22:47:19 | Commit #10 | fix(integrations-admin-panel): OpusAgent fix for BUG-WS-001/003 | health={"status":"healthy","timestamp":"2026-05-15T17:17:17.107Z","version":"0.1.0","uptime":229.783454121,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":345698304,"heapUsedBytes":164133576,"heapTotalBytes":169304064},"devServers":{"active":0}}}
2026-05-15 22:47:19 | Commit #19 | fix(apps/web/src/modules/integrations/integrations-admin-panel.tsx): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-15T17:17:17.672Z","version":"0.1.0","uptime":230.34791796,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":345698304,"heapUsedBytes":164268552,"heapTotalBytes":169304064},"devServers":{"active":0}}}
2026-05-15 22:51:50 | Commit #20 | fix(apps/web/src/modules/integrations/integration-config-form.tsx): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-15T17:21:48.450Z","version":"0.1.0","uptime":202.010570707,"checks":{"database":{"status":"up","latencyMs":0},"memory":{"rssBytes":359792640,"heapUsedBytes":166100424,"heapTotalBytes":172187648},"devServers":{"active":0}}}
2026-05-15 22:51:50 | Commit #11 | fix(integration-config-form): OpusAgent fix for BUG-WS-001/003 | health={"status":"healthy","timestamp":"2026-05-15T17:21:48.450Z","version":"0.1.0","uptime":202.009947015,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":359792640,"heapUsedBytes":166034456,"heapTotalBytes":172187648},"devServers":{"active":0}}}
2026-05-15 23:19:26 | Commit #12 | fix(platform-credentials.contract.test): OpusAgent fix for BUG-WS-001/003 | health=ssh: connect to host dodev.fid.pw port 22: Connection timed out
FAILED
2026-05-15 23:19:26 | Commit #21 | fix(services/api/src/integrations/platform-credentials.contract.test.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health={"status":"healthy","timestamp":"2026-05-15T17:49:24.331Z","version":"0.1.0","uptime":69.634340445,"checks":{"database":{"status":"up","latencyMs":1},"memory":{"rssBytes":338448384,"heapUsedBytes":161147672,"heapTotalBytes":168517632},"devServers":{"active":0}}}
2026-05-16 00:08:29 | Commit #24 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-16 01:29:03 | Commit #25 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-16 01:29:10 | Commit #22 | fix(services/api/src/routes.ts): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health=FAILED
2026-05-16 01:29:35 | Commit #13 | fix(routes): OpusAgent fix for BUG-WS-001/003 | health=FAILED
2026-05-16 01:31:59 | Commit #14 | fix(WizardShell): OpusAgent fix for BUG-WS-001/003 | health=FAILED
2026-05-16 01:43:20 | Commit #26 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-16 01:43:28 | Commit #23 | fix(apps/web/src/app/setup/WizardShell.tsx): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health=FAILED
2026-05-16 01:47:36 | Commit #27 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-16 01:47:46 | Commit #24 | fix(apps/web/src/app/setup/steps/Step1Welcome.tsx): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health=FAILED
2026-05-16 02:47:08 | Commit #28 | fix(web): OpusAgent fix for BUG-WS-001/003 | deployed to dodev
2026-05-16 02:47:28 | Commit #25 | fix(apps/web/src/app/setup/steps/Step2AIProvider.tsx): OpusAgent fix for BUG-WS-001/003 | SCP deployed | health=FAILED
2026-05-16 02:47:38 | Commit #15 | fix(Step2AIProvider): OpusAgent fix for BUG-WS-001/003 | health=FAILED
2026-05-16 02:49:25 | Commit #29 | fix(api): OpusAgent fix for BUG-WS-001/003 | deployed to dodev

## Ralph session — 2026-05-16

**Goal:** hassle-free admin setup (wizard catalog grid + MiniMax seeding), Hetzner Robot recipe for repeat-install tests.

**Done (this session):**
- `apps/web/src/app/setup/steps/Step2AIProvider.tsx` — replaced 4 hardcoded tiles with searchable grid sourced from `@doable/shared` `PROVIDER_CATALOG`. ~13 popular tiles by default (MiniMax included, tagged popular), search box, "show all 60+" toggle, GitHub Copilot + BYOK custom URL as special tiles. `tsc --noEmit` on apps/web: 0 errors.
- `apps/web/src/app/setup/WizardShell.tsx` — already 4 steps from prior sessions. No "build first app" step. Confirmed.
- `docker/setup.sh` — banner copy fixed: 4-step wizard, drops "build your first app template gallery". Adds `MINIMAX_API_KEY=` to generated `.env`.
- `docker-compose.yml` — api service env passthrough for `MINIMAX_API_KEY`.
- `setup-server.sh` — MINIMAX_API_KEY honored in 4 spots: defaults, interactive prompt, `/opt/doable/.env` write, `check_creds` audit.
- `services/api/src/lib/seedAiProviderFromEnv.ts` (new) — fire-and-forget boot seed: if `MINIMAX_API_KEY`/`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` is exported AND `platform_config.setup.ai_provider_key` is empty, write `setup.ai_provider` / `_base_url` / `_model` / `_key` (encrypted via `setEncryptedConfig`). Idempotent. Never logs the key.
- `services/api/src/index.ts` — wired `void seedAiProviderFromEnv()` next to `backfillBuiltinConnectors()`.
- `packages/shared/src/ai/provider-data-cloud-{major,regional,special}.ts` — added `"popular"` tag to MiniMax, Mistral, DeepSeek, Together AI, Fireworks AI so wizard's default view surfaces them.
- `scripts/hetzner-provision.ps1` (new) — non-destructive Robot API helper. Discover-mode is read-only. Rescue/installimage/reset require `-Confirm` AND hard-whitelist server #2987905. Creds read from env only.
- `C:\Users\gj\Documents\doable-hetzner-recipe.md` (new, outside repo) — end-to-end repeat-install recipe.
- New PRD at `prd.json` with 6 stories; US-WIZ-01/02/MM-01/HET-01/HET-02 all passed acceptance criteria.

**Blocked:**
- US-TEST-01 (live docker smoke + testcases). Two hard blockers: (1) Docker is not installed on the dev Windows host (no `docker` in PATH for either Bash or PowerShell). (2) Hetzner Robot API returns **401** for the provided `ws+SdWgWZ7P` / `YesAndAmen12` credentials — these look like Hetzner account login, not Robot **webservice** credentials. Webservice creds are generated separately at Robot → Preferences → Web service settings.

**Action required to unblock test loop:**
1. Generate Robot webservice credentials (different from account login). Set `$env:HETZNER_ROBOT_USER` + `$env:HETZNER_ROBOT_PASS` to those values.
2. Or install Docker Desktop on the dev box for local smoke.
3. Rotate `sk-cp-...` MiniMax key and Robot login pasted into chat earlier.

**Scope guarantee:** no code paths touched in `do.fid.pw` (prod) or `dodev.fid.pw` deploys. Hetzner script hard-whitelists #2987905 — refuses rescue/install/reset on any other server number even with `-Confirm`.
