# TC-DEPLOY-ROLLBACK — Rollback to Previous Artifact

Scope: Rollback to N-1, N-2, etc. via deployment_artifacts. UI surface, SSE feedback, atomicity, audit.

---

## TC-DEPLOY-ROLLBACK-001
- Pre: Project has 3 successful deployments.
- Steps: Open Deployments tab → click "Rollback" on N-1.
- Expected: Confirm modal naming target version; on accept, current artifact swapped to N-1; deployment row marked active; audit entry.
- Severity: P0

## TC-DEPLOY-ROLLBACK-002
- Pre: Only 1 deployment exists.
- Steps: Try rollback.
- Expected: UI disables button; message "No previous version available".
- Severity: P1

## TC-DEPLOY-ROLLBACK-003
- Pre: Project with N-3.
- Steps: Rollback to N-3 directly.
- Expected: Active deployment now N-3; N-2 and N-1 retained as artifacts.
- Severity: P0

## TC-DEPLOY-ROLLBACK-004
- Pre: Rollback to artifact whose file was pruned.
- Expected: Rollback fails with "Artifact unavailable"; offers next available.
- Severity: P1

## TC-DEPLOY-ROLLBACK-005
- Pre: Rollback in progress.
- Steps: Another publish initiated.
- Expected: Publish queued until rollback completes.
- Severity: P0

## TC-DEPLOY-ROLLBACK-006
- Pre: Rollback succeeds.
- Steps: Verify Caddy serves old bundle.
- Expected: Subdomain returns N-1 content.
- Severity: P0

## TC-DEPLOY-ROLLBACK-007
- Pre: Rollback success.
- Expected: Thumbnail regenerated for rolled-back version.
- Severity: P1

## TC-DEPLOY-ROLLBACK-008
- Pre: Non-owner user tries rollback.
- Expected: 403 unless workspace role permits deploy.
- Severity: P0

## TC-DEPLOY-ROLLBACK-009
- Pre: Admin force-rollback via /admin/projects/:id.
- Expected: Allowed; admin_audit_log captured.
- Severity: P1

## TC-DEPLOY-ROLLBACK-010
- Pre: Rollback while build in progress.
- Expected: Either queues or rejects with reason; never two parallel writes to live link.
- Severity: P0

## TC-DEPLOY-ROLLBACK-011
- Pre: Rollback emits SSE.
- Expected: Events: `rollback_starting`, `swapping`, `live`, `done`.
- Severity: P1

## TC-DEPLOY-ROLLBACK-012
- Pre: Rollback failure mid-swap.
- Expected: Atomic — either fully N-1 or stays at N; never half-state.
- Severity: P0

## TC-DEPLOY-ROLLBACK-013
- Pre: Rollback generates new deployment row pointing to old artifact.
- Expected: Pattern: new row with parent_artifact_id = N-1's artifact; is_rollback=true.
- Severity: P1

## TC-DEPLOY-ROLLBACK-014
- Pre: User can roll forward after rollback.
- Steps: Rollback to N-1, then trigger publish.
- Expected: New deployment N+1 created from current source; rollback artifact retained.
- Severity: P0

## TC-DEPLOY-ROLLBACK-015
- Pre: Rollback cap.
- Expected: Cannot roll back more than retention N; UI disables older.
- Severity: P1

## TC-DEPLOY-ROLLBACK-016
- Pre: Rollback shows what will change (diff summary).
- Expected: UI shows file count and size delta vs current; user confirms.
- Severity: P2

## TC-DEPLOY-ROLLBACK-017
- Pre: Rollback to deployment that had warnings.
- Expected: Carries forward warnings; warnings visible.
- Severity: P3

## TC-DEPLOY-ROLLBACK-018
- Pre: Rollback to artifact built on different node version.
- Expected: Honored without rebuild; runtime serves static artifact.
- Severity: P2

## TC-DEPLOY-ROLLBACK-019
- Pre: Rollback over custom domain.
- Expected: Custom domain still serves correctly; SSL retained.
- Severity: P1

## TC-DEPLOY-ROLLBACK-020
- Pre: Rollback notifications.
- Expected: notifications row created for project members ("v3 → v2 rolled back by Alice").
- Severity: P1

## TC-DEPLOY-ROLLBACK-021
- Pre: Concurrent rollback requests for same project.
- Expected: Second rejected with 409 conflict.
- Severity: P0

## TC-DEPLOY-ROLLBACK-022
- Pre: Rollback after unpublish.
- Expected: Re-activates and rolls back in single op; subdomain restored.
- Severity: P1

## TC-DEPLOY-ROLLBACK-023
- Pre: Rollback record audit row contains from_version and to_version.
- Expected: Both fields populated; immutable.
- Severity: P0

## TC-DEPLOY-ROLLBACK-024
- Pre: Rollback fails because Caddy reload fails.
- Expected: State reverted; error surfaced to user; admin alerted.
- Severity: P0

## TC-DEPLOY-ROLLBACK-025
- Pre: Verify UI list shows current=highlighted; rollbacks marked with arrow icon.
- Expected: Visual hierarchy clear.
- Severity: P3
