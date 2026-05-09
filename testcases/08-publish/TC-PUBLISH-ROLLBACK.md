# TC-PUBLISH-ROLLBACK — Rollback to previous deployment, deployment history

Covers the deployment-history view, the "Rollback" action, and integrity guarantees during rollback.

---

## TC-PUBLISH-ROLLBACK-001
**Title:** Deployment history lists last N versions
**Pre:** Project published 3 times (v1, v2, v3)
**Steps:**
1. Open Deployments tab
**Expected:** Lists v3 (live), v2, v1 with timestamps, build duration, byte size, published_by, status.
**Severity:** High

## TC-PUBLISH-ROLLBACK-002
**Title:** Rollback to previous version (v2)
**Pre:** Currently live = v3
**Steps:**
1. Click Rollback on v2 row
2. Confirm
**Expected:** `live` symlink swapped to v2 atomically; deployment row v2 marked `rolled_back_to_live`; v3 marked `superseded`. URL serves v2 content immediately.
**Severity:** Critical

## TC-PUBLISH-ROLLBACK-003
**Title:** Rollback creates audit entry
**Pre:** Rollback performed
**Steps:**
1. Inspect audit log
**Expected:** Entry `deployment_rolled_back` with `from=v3, to=v2, actor=user, ts=now`.
**Severity:** Medium

## TC-PUBLISH-ROLLBACK-004
**Title:** Rollback preserves v3 artifacts (not deleted)
**Pre:** Above
**Steps:**
1. Inspect versions/
**Expected:** v3 directory still on disk; can roll forward again.
**Severity:** High

## TC-PUBLISH-ROLLBACK-005
**Title:** Roll forward (rollback to v3 after rolling back to v2)
**Pre:** Live = v2 (rolled back)
**Steps:**
1. Click "Restore" on v3 row
**Expected:** Live → v3 again. New deployment row not created; existing v3 reused.
**Severity:** High

## TC-PUBLISH-ROLLBACK-006
**Title:** Rollback to errored deployment refused
**Pre:** v2 is `error` (no live artifacts)
**Steps:**
1. Click Rollback on v2
**Expected:** Button disabled or 400 "Cannot rollback to a failed deployment".
**Severity:** Medium

## TC-PUBLISH-ROLLBACK-007
**Title:** Rollback when artifacts pruned (>5 versions ago)
**Pre:** v1 artifact purged due to retention
**Steps:**
1. Click Rollback on v1
**Expected:** 410 Gone "Artifact for this version has been purged. Restore by republishing the source."
**Severity:** Medium

## TC-PUBLISH-ROLLBACK-008
**Title:** Rollback locks during in-flight publish
**Pre:** v4 publish currently building
**Steps:**
1. Try to rollback to v2
**Expected:** 409 "A publish is in progress; cancel or wait before rolling back".
**Severity:** High

## TC-PUBLISH-ROLLBACK-009
**Title:** Rollback while custom domains attached
**Pre:** Custom domain `www.example.com` active on project
**Steps:**
1. Rollback to v2
**Expected:** Custom domain remains active and now serves v2 content. No DNS changes.
**Severity:** Medium

## TC-PUBLISH-ROLLBACK-010
**Title:** Rollback persists across server reboot
**Pre:** Rolled back to v2; server rebooted
**Steps:**
1. After reboot, check live symlink and URL
**Expected:** Symlink survives; URL still serves v2.
**Severity:** High

## TC-PUBLISH-ROLLBACK-011
**Title:** Permission: only owner/editor can rollback
**Pre:** Viewer role
**Steps:**
1. Attempt rollback
**Expected:** 403; UI button disabled with tooltip.
**Severity:** Critical

## TC-PUBLISH-ROLLBACK-012
**Title:** Deployment history pagination
**Pre:** 100 deployments
**Steps:**
1. Open history
**Expected:** Loads 25/page; "Load more" button. Backend supports cursor pagination.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-013
**Title:** Deployment history filters by status
**Pre:** Mixed status history
**Steps:**
1. Filter to `error`
**Expected:** Only error deployments shown.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-014
**Title:** Rollback target visible diff vs current
**Pre:** Two versions exist
**Steps:**
1. Click "Compare" between v2 and v3
**Expected:** Shows source diff (line counts at minimum). Optional: full file diff modal.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-015
**Title:** Rollback symlink swap is atomic — no 5xx during swap
**Pre:** Live load test running (ab -c 50)
**Steps:**
1. Rollback during load
**Expected:** No 5xx returned mid-swap; some requests serve v3, rest serve v2; transition clean.
**Severity:** High

## TC-PUBLISH-ROLLBACK-016
**Title:** Rollback caches busted in CDN
**Pre:** CF caching enabled
**Steps:**
1. Rollback
**Expected:** Server purges CF cache for hostname (or relies on short HTML cache TTL). New requests within ~30s see v2.
**Severity:** Medium

## TC-PUBLISH-ROLLBACK-017
**Title:** Rollback shows confirmation modal with target version preview
**Pre:** History UI
**Steps:**
1. Click Rollback
**Expected:** Modal: "Roll back to v2 published 2 days ago by Alice? This will replace v3." Cancel/Confirm.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-018
**Title:** Rollback failure: corrupted artifact
**Pre:** v2 directory has missing index.html
**Steps:**
1. Rollback to v2
**Expected:** Pre-flight check detects missing required files; fails with clear error; live remains v3.
**Severity:** High

## TC-PUBLISH-ROLLBACK-019
**Title:** Rollback notification — email/in-app
**Pre:** Notifications enabled
**Steps:**
1. Rollback by user A; user B is collaborator
**Expected:** User B sees in-app toast/notification "Alice rolled back <project> to v2".
**Severity:** Low

## TC-PUBLISH-ROLLBACK-020
**Title:** Rollback to specific version via deep link
**Pre:** Authenticated
**Steps:**
1. POST /deploy/<deployment_id>/rollback
**Expected:** Same effect as UI; returns 200 + new live state.
**Severity:** Medium

## TC-PUBLISH-ROLLBACK-021
**Title:** Concurrent rollback attempts
**Pre:** Two collaborators click Rollback within 1s
**Steps:**
1. Both submit
**Expected:** First succeeds; second receives 409 or no-op (since live already at target). DB transactional.
**Severity:** Medium

## TC-PUBLISH-ROLLBACK-022
**Title:** Rollback updates `current_deployment_id` on project
**Pre:** Project.current_deployment_id = v3
**Steps:**
1. Rollback to v2
**Expected:** project.current_deployment_id = v2.
**Severity:** Medium

## TC-PUBLISH-ROLLBACK-023
**Title:** Build_stream not opened on rollback (instant action)
**Pre:** N/A
**Steps:**
1. Rollback
**Expected:** No SSE; UI shows "Rolled back" instantly. Only on republish do we re-build.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-024
**Title:** Rollback retains build logs of newer version
**Pre:** v3 build log saved
**Steps:**
1. Rollback to v2
**Expected:** v3 logs still accessible from history; not deleted.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-025
**Title:** Rollback includes sub-resources (custom 404, robots.txt)
**Pre:** v2 had custom 404, v3 didn't
**Steps:**
1. Rollback to v2; visit /missing
**Expected:** v2's custom 404 served.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-026
**Title:** Project soft-deleted: rollback unavailable
**Pre:** Project trashed
**Steps:**
1. Try rollback
**Expected:** 410 Gone or 404; UI hides controls.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-027
**Title:** Rollback respects unpublish state
**Pre:** Project currently unpublished
**Steps:**
1. Click Rollback to v2
**Expected:** Re-publishes v2 artifacts (Caddy reattached); status active. Audit logs the chain.
**Severity:** Medium

## TC-PUBLISH-ROLLBACK-028
**Title:** Deployment row shows artifact byte size
**Pre:** History
**Steps:**
1. Inspect rows
**Expected:** Each shows `size_bytes`; helps identify largest deployments.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-029
**Title:** Deployment history exported as CSV
**Pre:** Many rows
**Steps:**
1. Click Export
**Expected:** CSV with id, status, version, ts, by, size, duration. Download served as attachment.
**Severity:** Low

## TC-PUBLISH-ROLLBACK-030
**Title:** Rollback respects plan storage quota
**Pre:** Plan changed; storage now over quota
**Steps:**
1. Try rollback to older version
**Expected:** Allowed (no new storage cost); but UI nudges user to upgrade if total exceeded.
**Severity:** Low
