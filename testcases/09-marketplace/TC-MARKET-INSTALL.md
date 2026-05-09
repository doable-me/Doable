# TC-MARKET-INSTALL — Install marketplace listing into a project

Covers the install flow: copy bundle artifacts to a new project (remix), attribution, install counts, project_remixes table.

> **Path note (2026-05-09 corpus run):** install endpoints:
> - `POST /marketplace/listings/:id/install` body `{workspaceId}` — creates remix; returns 404 on unknown listing.
> - `DELETE /marketplace/listings/:id/install?workspaceId=...` — uninstall; returns `404 "Not installed"` if not installed.
> - `GET /workspaces/:wid/marketplace/installs` — list installs.
> - `GET /marketplace/my-listings` requires auth → 401 anon.
> Source: `services/api/src/routes/marketplace.ts:207–320`.

---

## TC-MARKET-INSTALL-001
**Title:** Logged-in user installs listing → new project created
**Pre:** Listing "Todo Pro" exists
**Steps:**
1. Click Install
2. Confirm "Create as new project"
**Expected:** New project appears in dashboard; bundle artifact copied; user redirected to /editor/<newId>.
**Severity:** Critical

## TC-MARKET-INSTALL-002
**Title:** Anonymous user prompted to log in
**Pre:** Logged out
**Steps:**
1. Click Install
**Expected:** Modal "Sign in to install"; after login, install proceeds.
**Severity:** High

## TC-MARKET-INSTALL-003
**Title:** Install increments install_count atomically
**Pre:** Count = 100
**Steps:**
1. Three users install concurrently
**Expected:** Count = 103 (transactional UPDATE; no race losing increments).
**Severity:** High

## TC-MARKET-INSTALL-004
**Title:** Install attribution recorded in project_remixes
**Pre:** N/A
**Steps:**
1. Install
2. Inspect project_remixes
**Expected:** Row {project_id: new, source_listing_id, source_version, installed_by, installed_at}.
**Severity:** Critical

## TC-MARKET-INSTALL-005
**Title:** Install records in marketplace_installs
**Pre:** N/A
**Steps:**
1. Install
**Expected:** Row {id, listing_id, listing_version, user_id, project_id, installed_at}.
**Severity:** High

## TC-MARKET-INSTALL-006
**Title:** Install of paid listing requires purchase first
**Pre:** Paid listing not yet purchased
**Steps:**
1. Click Install
**Expected:** Redirected to checkout; on success, install proceeds.
**Severity:** High

## TC-MARKET-INSTALL-007
**Title:** Already-purchased listing installs without re-payment
**Pre:** User purchased before
**Steps:**
1. Install
**Expected:** Skip payment; create project.
**Severity:** Medium

## TC-MARKET-INSTALL-008
**Title:** Install specific older version
**Pre:** Versions v1, v2, v3
**Steps:**
1. Click Install on v2
**Expected:** v2 bundle copied; row tracks listing_version=2.
**Severity:** Medium

## TC-MARKET-INSTALL-009
**Title:** Install latest (default) when no version specified
**Pre:** Latest = v3
**Steps:**
1. POST /marketplace/<id>/install (no version)
**Expected:** v3 used.
**Severity:** Medium

## TC-MARKET-INSTALL-010
**Title:** Bundle artifact storage path
**Pre:** Listing has marketplace_bundle_artifacts row
**Steps:**
1. After install, inspect new project files
**Expected:** Files match bundle; integrity SHA-256 verified.
**Severity:** High

## TC-MARKET-INSTALL-011
**Title:** Bundle missing → install fails gracefully
**Pre:** marketplace_bundle_artifacts row missing for version
**Steps:**
1. Install
**Expected:** 500 with "Bundle artifact missing for version v3; please report". No partial project created.
**Severity:** High

## TC-MARKET-INSTALL-012
**Title:** Install transaction atomicity (rollback on partial failure)
**Pre:** Force file copy failure (mock)
**Steps:**
1. Install
**Expected:** No project row left over; install_count not incremented; user sees clear error.
**Severity:** High

## TC-MARKET-INSTALL-013
**Title:** Plan limit on number of projects enforced at install
**Pre:** Free plan, 5/5 projects used
**Steps:**
1. Install
**Expected:** 402 "Project limit reached"; upgrade prompt.
**Severity:** High

## TC-MARKET-INSTALL-014
**Title:** Install creates project owned by installer (not author)
**Pre:** Author A; installer B
**Steps:**
1. Installer installs
**Expected:** project.owner_id = B; remix row links B's project to A's listing.
**Severity:** Critical

## TC-MARKET-INSTALL-015
**Title:** Install copies environment variable templates (not values)
**Pre:** Listing exports `.env.example`
**Steps:**
1. Install
**Expected:** New project has `.env.example` with placeholder keys; no real secrets from author included.
**Severity:** Critical

## TC-MARKET-INSTALL-016
**Title:** Install includes README and license file
**Pre:** Listing has README, LICENSE
**Steps:**
1. Install
**Expected:** Files copied to project root.
**Severity:** Medium

## TC-MARKET-INSTALL-017
**Title:** Install of own listing allowed (test loop)
**Pre:** Author installs own listing
**Steps:**
1. Install
**Expected:** Allowed; remix row created with same author/installer.
**Severity:** Low

## TC-MARKET-INSTALL-018
**Title:** Install with name conflict — auto-rename
**Pre:** User already has project named "Todo Pro"
**Steps:**
1. Install
**Expected:** New project named "Todo Pro (2)" or similar; no overwrite.
**Severity:** Medium

## TC-MARKET-INSTALL-019
**Title:** Install of moderated/removed listing fails
**Pre:** Listing taken down
**Steps:**
1. Direct API POST /marketplace/<id>/install
**Expected:** 410 Gone "Listing no longer available".
**Severity:** High

## TC-MARKET-INSTALL-020
**Title:** Install audit log entry
**Pre:** N/A
**Steps:**
1. Install
**Expected:** Audit log: `marketplace_install` with listing_id, installer, ts.
**Severity:** Medium

## TC-MARKET-INSTALL-021
**Title:** Install rate limit (anti-scrape)
**Pre:** Default 60 installs/hour/user
**Steps:**
1. Burst 200 installs
**Expected:** 429 after limit; legitimate user explained how to wait/upgrade.
**Severity:** Medium

## TC-MARKET-INSTALL-022
**Title:** Concurrent installs by same user
**Pre:** N/A
**Steps:**
1. Install same listing twice in quick succession
**Expected:** Two separate projects created (each unique). install_count incremented twice. No deadlock.
**Severity:** Low

## TC-MARKET-INSTALL-023
**Title:** Install button disabled if listing has no bundle
**Pre:** Listing draft without bundle artifact
**Steps:**
1. Detail page
**Expected:** Install disabled w/ tooltip "No installable bundle yet".
**Severity:** Low

## TC-MARKET-INSTALL-024
**Title:** Install increments author "total installs" stat
**Pre:** Author has install total = 100
**Steps:**
1. New install of any of their listings
**Expected:** Author profile shows 101 total installs.
**Severity:** Low

## TC-MARKET-INSTALL-025
**Title:** Install attribution preserved through project rename/transfer
**Pre:** Project installed; renamed; transferred to other workspace
**Steps:**
1. Inspect remix
**Expected:** project_remixes row still references original listing.
**Severity:** Medium

## TC-MARKET-INSTALL-026
**Title:** Uninstall (delete project) does not affect install_count
**Pre:** Installed project; user deletes
**Steps:**
1. Delete
**Expected:** install_count unchanged (history preserved). Optional: separate `uninstall_count` metric.
**Severity:** Low

## TC-MARKET-INSTALL-027
**Title:** Install of bundle pack installs all member listings
**Pre:** Bundle of 3 listings
**Steps:**
1. Click "Install bundle"
**Expected:** Three new projects created (or one combined depending on bundle type). Confirmation shows count.
**Severity:** Medium

## TC-MARKET-INSTALL-028
**Title:** Install bundle partial failure (one listing missing)
**Pre:** Bundle has 3, one bundle artifact missing
**Steps:**
1. Install bundle
**Expected:** Successful 2 created; 1 reported failed; transaction not blocking the others. UI shows summary.
**Severity:** Medium

## TC-MARKET-INSTALL-029
**Title:** Re-install (separate project) of already-installed listing
**Pre:** User installed before
**Steps:**
1. Install again
**Expected:** Second project created. No "already installed" block (allowed).
**Severity:** Low

## TC-MARKET-INSTALL-030
**Title:** Install attribution surfaces in installed project's UI
**Pre:** Installed project
**Steps:**
1. Open project; check info panel
**Expected:** Shows "Based on Todo Pro by Alice" with link back to listing.
**Severity:** Low

## TC-MARKET-INSTALL-031
**Title:** Install button accessible via keyboard
**Pre:** Detail page
**Steps:**
1. Tab to Install button; press Enter
**Expected:** Triggers install; aria-label clear.
**Severity:** Low

## TC-MARKET-INSTALL-032
**Title:** Install respects workspace policy (only certain listings allowed)
**Pre:** Workspace has allowlist
**Steps:**
1. Install non-allowlisted
**Expected:** 403 "Workspace policy blocks this listing".
**Severity:** Low

## TC-MARKET-INSTALL-033
**Title:** Install creates Yjs doc for collaborative editing
**Pre:** N/A
**Steps:**
1. Install
2. Open project; collaborate
**Expected:** Yjs doc initialized; second user can join.
**Severity:** Medium

## TC-MARKET-INSTALL-034
**Title:** Listing version v0 (initial alpha) installable but warned
**Pre:** Listing flagged alpha
**Steps:**
1. Install
**Expected:** Modal "This listing is in alpha; may break". Confirm to proceed.
**Severity:** Low

## TC-MARKET-INSTALL-035
**Title:** Install includes copilot/agent config (.doable/agents)
**Pre:** Listing exports an agent config
**Steps:**
1. Install
**Expected:** Config copied; agent visible in editor agents panel.
**Severity:** Medium
