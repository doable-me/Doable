# TC-PUBLISH-LIFECYCLE — End-to-end publish lifecycle integration

Multi-step user journeys covering the full lifecycle from first publish through unpublish, including edge cases.

---

## TC-PUBLISH-LIFECYCLE-001
**Title:** Brand-new project: never-published → first publish
**Pre:** Fresh project; never published
**Steps:**
1. UI shows "Publish" button (not "Update")
2. Click Publish; choose default slug
3. Confirm
**Expected:** All states transition cleanly; first deployment created with version=1; Caddy block appended; URL live.
**Severity:** Critical

## TC-PUBLISH-LIFECYCLE-002
**Title:** Update flow: published → modify → republish (UI says "Update")
**Pre:** Project published
**Steps:**
1. Edit a file
2. UI button now reads "Update site"
3. Click Update
**Expected:** New version=2 deployment; live URL shows new content within 1 min.
**Severity:** High

## TC-PUBLISH-LIFECYCLE-003
**Title:** Stale UI: another tab updated; current tab still shows old version
**Pre:** Two tabs open on same project
**Steps:**
1. Tab A republishes
2. Tab B clicks Update without refresh
**Expected:** Tab B's stale `last_known_version` triggers conflict warning "This project was updated by Alice 2 minutes ago. Refresh to see changes." Allow proceed or cancel.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-004
**Title:** Unpublish then republish under same slug retains slug ownership
**Pre:** Owner unpublished
**Steps:**
1. Within 1 hour, owner republishes
**Expected:** Same slug; no other user could have claimed it (owner cooldown different from public). Smooth.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-005
**Title:** Unpublish releases custom domain
**Pre:** Project has custom domain attached
**Steps:**
1. Unpublish
**Expected:** Custom domain status `paused` (not deleted). UI reminds user.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-006
**Title:** Delete project with active deployment
**Pre:** Project published
**Steps:**
1. Owner deletes project
**Expected:** Auto-unpublishes first; artifacts purged after retention; custom domains detached. Audit logs full chain.
**Severity:** High

## TC-PUBLISH-LIFECYCLE-007
**Title:** Restore soft-deleted project does NOT auto-republish
**Pre:** Recently soft-deleted then restored
**Steps:**
1. Restore
**Expected:** Project visible; status unpublished; user must explicitly republish.
**Severity:** Low

## TC-PUBLISH-LIFECYCLE-008
**Title:** Workspace transfer preserves deployment
**Pre:** Project published; transferred to new workspace
**Steps:**
1. Transfer
**Expected:** Deployment continues serving; ownership row updated. Custom domain follows.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-009
**Title:** Workspace deletion blocks if active publishes
**Pre:** Workspace has 3 published projects
**Steps:**
1. Owner tries to delete workspace
**Expected:** Confirmation requires unpublishing first or accepting "All sites will go offline".
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-010
**Title:** First-time publish onboarding tour
**Pre:** User publishing first time
**Steps:**
1. Click Publish
**Expected:** Brief inline tooltip walks through slug → publish → see-it-live; URL copy button highlighted.
**Severity:** Low

## TC-PUBLISH-LIFECYCLE-011
**Title:** Publish triggers project_remixes? (Not for first-party publish)
**Pre:** N/A
**Steps:**
1. Publish own project
**Expected:** No remix row created; that's only for marketplace install/fork.
**Severity:** Low

## TC-PUBLISH-LIFECYCLE-012
**Title:** Publish history exported per workspace
**Pre:** 30 deployments across 5 projects
**Steps:**
1. Workspace admin exports CSV
**Expected:** All deployments listed with project_name, slug, status, ts.
**Severity:** Low

## TC-PUBLISH-LIFECYCLE-013
**Title:** Publish notification on Slack/Discord webhook
**Pre:** Workspace has webhook configured
**Steps:**
1. Publish
**Expected:** Webhook posts JSON {project, url, version, by} to integration. Failure non-blocking.
**Severity:** Low

## TC-PUBLISH-LIFECYCLE-014
**Title:** Publish from API key (programmatic)
**Pre:** User has API key
**Steps:**
1. POST /deploy with `Authorization: Bearer <key>`
**Expected:** Allowed if key scope includes `deploy:write`; otherwise 403.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-015
**Title:** Publish from CI (GitHub Actions doable CLI)
**Pre:** doable CLI logged in
**Steps:**
1. `doable deploy --project <id>`
**Expected:** Same flow; SSE streamed to terminal.
**Severity:** Low

## TC-PUBLISH-LIFECYCLE-016
**Title:** Trial expiry: published sites pause
**Pre:** Trial ends
**Steps:**
1. Trial expiry hits
**Expected:** Sites paused (showing "Trial expired" splash from platform) until upgrade. Custom domains paused.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-017
**Title:** Plan downgrade enforces lower limits
**Pre:** Pro user with 5 published; downgrades to Free (1 publish)
**Steps:**
1. Downgrade
**Expected:** UI prompts which 4 to unpublish; or auto-pauses oldest 4. Clear messaging.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-018
**Title:** Reactivate paused publish on upgrade
**Pre:** Sites paused due to plan
**Steps:**
1. User upgrades
**Expected:** Sites un-pause automatically; Caddy reload.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-019
**Title:** Audit log entry per publish action
**Pre:** Publish performed
**Steps:**
1. Inspect audit table
**Expected:** Action `deployment_created` with deployment_id, project_id, actor, ip, ts, ua.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-020
**Title:** Publish concurrent with edit doesn't lose changes
**Pre:** User edits during build
**Steps:**
1. Trigger publish (snapshot @ click time)
2. Continue editing
**Expected:** Build uses snapshot at click time; subsequent edits unaffected. Next publish picks them up.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-021
**Title:** Publish snapshot includes uncommitted dovault state
**Pre:** Project files include uncommitted edits
**Steps:**
1. Publish
**Expected:** Snapshot uses current files; not dependent on git state.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-022
**Title:** Re-deploy from history (re-run a past version's build)
**Pre:** v1 succeeded; want to rebuild
**Steps:**
1. Click "Re-build" on v1 row
**Expected:** New version=N created reusing v1's source snapshot; current live updated when complete.
**Severity:** Low

## TC-PUBLISH-LIFECYCLE-023
**Title:** Project rename does NOT change subdomain
**Pre:** Project published with slug `acme`; renamed to "Different Name"
**Steps:**
1. Rename
**Expected:** Slug stays `acme` (slug is independent). User can rename slug separately.
**Severity:** Medium

## TC-PUBLISH-LIFECYCLE-024
**Title:** Publish-before-save prompt
**Pre:** Unsaved changes in editor
**Steps:**
1. Click Publish
**Expected:** Auto-saves first or warns "Save changes before publishing?". User flow uninterrupted.
**Severity:** Low

## TC-PUBLISH-LIFECYCLE-025
**Title:** Publish status badge in dashboard project list
**Pre:** Mixed projects
**Steps:**
1. View dashboard
**Expected:** Each card shows live URL chip if published, or "Not published".
**Severity:** Low
