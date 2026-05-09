# TC-DEPLOY-ARTIFACTS — deployment_artifacts Table & Storage

Scope: Artifact retention, storage layout, integrity (sha256), pruning, size accounting.

---

## TC-DEPLOY-ARTIFACTS-001
- Pre: Successful deploy.
- Expected: deployment_artifacts row written with: id, deployment_id, project_id, path, size_bytes, sha256, mime_type, created_at.
- Severity: P0

## TC-DEPLOY-ARTIFACTS-002
- Pre: Artifact stored at deterministic path.
- Expected: Path includes project_id and artifact_id; not user-controllable to prevent traversal.
- Severity: P0

## TC-DEPLOY-ARTIFACTS-003
- Pre: Artifact integrity check.
- Steps: Compare on-disk sha256 vs stored sha256.
- Expected: Match; mismatch raises security_finding.
- Severity: P0

## TC-DEPLOY-ARTIFACTS-004
- Pre: Default retention=10.
- Steps: Make 11 deploys.
- Expected: Oldest pruned; both row deleted and file removed.
- Severity: P1

## TC-DEPLOY-ARTIFACTS-005
- Pre: Retention configurable per plan.
- Expected: Pro plan retains 30; free retains 5.
- Severity: P1

## TC-DEPLOY-ARTIFACTS-006
- Pre: Artifact referenced by active rollback target.
- Expected: NOT pruned even if older than retention; protected.
- Severity: P0

## TC-DEPLOY-ARTIFACTS-007
- Pre: Project deletion (soft).
- Expected: Artifacts kept until hard delete; status=archived.
- Severity: P1

## TC-DEPLOY-ARTIFACTS-008
- Pre: Project hard-deleted.
- Expected: All artifacts removed from disk and DB; storage usage decremented.
- Severity: P0

## TC-DEPLOY-ARTIFACTS-009
- Pre: Disk full during artifact write.
- Expected: Build fails; partial file cleaned up; DB row not committed; user error message.
- Severity: P1

## TC-DEPLOY-ARTIFACTS-010
- Pre: Artifact size exceeds plan storage cap.
- Expected: Build fails; artifact rolled back; clear error.
- Severity: P1

## TC-DEPLOY-ARTIFACTS-011
- Pre: User downloads artifact via /api/deploy/:id/download.
- Expected: 200 stream; filename includes version; auth gated.
- Severity: P2

## TC-DEPLOY-ARTIFACTS-012
- Pre: Non-member tries to download.
- Expected: 403.
- Severity: P0

## TC-DEPLOY-ARTIFACTS-013
- Pre: Verify artifact tarball does not embed `.env` or secrets.
- Expected: Build excludes secret files.
- Severity: P0

## TC-DEPLOY-ARTIFACTS-014
- Pre: Verify mime_type populated correctly.
- Expected: tar.gz, zip etc. correctly recorded.
- Severity: P3

## TC-DEPLOY-ARTIFACTS-015
- Pre: Artifact created_at vs deployment.created_at.
- Expected: artifact created later but within reasonable window.
- Severity: P3

## TC-DEPLOY-ARTIFACTS-016
- Pre: Artifact list pagination.
- Expected: 20 per page; sorted DESC by created_at.
- Severity: P2

## TC-DEPLOY-ARTIFACTS-017
- Pre: Storage usage view in /admin/projects/:id.
- Expected: Sum of artifact sizes shown; matches df check.
- Severity: P2

## TC-DEPLOY-ARTIFACTS-018
- Pre: Concurrent artifact writes to same path race.
- Expected: Atomic rename; no half-written files served.
- Severity: P0

## TC-DEPLOY-ARTIFACTS-019
- Pre: Verify caddy reads from artifact path symlink.
- Expected: Symlink atomically swapped on activate; no downtime.
- Severity: P0

## TC-DEPLOY-ARTIFACTS-020
- Pre: Stale artifacts on disk without DB rows (orphans).
- Expected: Periodic GC removes; admin can run /admin/runtime/gc-artifacts.
- Severity: P2

## TC-DEPLOY-ARTIFACTS-021
- Pre: GC dry-run.
- Expected: Lists candidates without deleting.
- Severity: P3

## TC-DEPLOY-ARTIFACTS-022
- Pre: Verify artifact path permissions.
- Expected: Files mode 0644; dir 0755; owned by doable user.
- Severity: P1

## TC-DEPLOY-ARTIFACTS-023
- Pre: Artifact JSON manifest.
- Expected: Each artifact has manifest with build env, node version, framework, dependencies snapshot.
- Severity: P2

## TC-DEPLOY-ARTIFACTS-024
- Pre: Artifact compression rate.
- Expected: Use gzip/zstd; ratio logged; if uncompressed exceeds limit, refuses build.
- Severity: P2

## TC-DEPLOY-ARTIFACTS-025
- Pre: Restore from backup test.
- Steps: Restore deployment_artifacts table.
- Expected: Files still on disk match restored DB rows; integrity check passes.
- Severity: P1
