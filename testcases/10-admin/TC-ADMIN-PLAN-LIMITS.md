# TC-ADMIN-PLAN-LIMITS — Plan Limits Overrides Panel

Scope: `/admin/plan-limits-panel`. Reads/writes `platform_plan_limits` and `user_feature_overrides` for per-user limit overrides. Affects PLAN_LIMITS at runtime.

---

## TC-ADMIN-PLAN-LIMITS-001
- Pre: Admin.
- Steps: GET `/admin/plan-limits-panel`.
- Expected: Form shows current PLAN_LIMITS by plan (free/pro/team/enterprise). Editable fields: max_projects, max_workspaces, max_members, monthly_credits, max_file_size_mb, etc.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-002
- Pre: Non-admin.
- Steps: GET endpoint.
- Expected: 403.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-003
- Pre: Admin.
- Steps: Edit max_projects for free plan from 3 → 5.
- Expected: Save persists to platform_plan_limits; takes effect immediately for new project creations.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-004
- Pre: Admin saves negative number.
- Expected: Validation error "must be >= 0"; not persisted.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-005
- Pre: Admin saves non-integer.
- Expected: Form rejects; field marked invalid.
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-006
- Pre: Admin updates monthly_credits from 100 → 200.
- Expected: Existing free users see new limit; current consumed credits preserved; UI shows new ceiling.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-007
- Pre: Admin lowers limit below current usage of some users.
- Expected: Existing usage grandfathered (not retroactively blocked); new operations blocked once over.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-008
- Pre: Admin.
- Steps: Click "Reset to defaults" on a plan.
- Expected: Confirmation; values revert to code defaults; audit row.
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-009
- Pre: Admin sees override section per user.
- Steps: Add override max_projects=10 for user X.
- Expected: user_feature_overrides row written; user X bypasses plan limit; UI shows badge "overridden".
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-010
- Pre: Admin removes override.
- Expected: Falls back to plan default; UI badge cleared.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-011
- Pre: Admin sets per-user override with expiry date.
- Expected: Effective until expiry; after expiry auto-falls back; cron or check-on-read enforces.
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-012
- Pre: Admin saves.
- Expected: admin_audit_log entry with diff (old → new) per field changed.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-013
- Pre: Admin saves with optimistic concurrency.
- Steps: Two admins edit same plan simultaneously.
- Expected: Second save fails with 409; suggests refresh.
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-014
- Pre: Admin.
- Steps: View per-user override search.
- Expected: Search by email; partial match.
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-015
- Pre: Admin.
- Steps: Set override that would put user over hard cap.
- Expected: Confirmation modal; allowed but flagged as "above hard cap".
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-016
- Pre: Admin.
- Steps: Bulk import overrides via CSV.
- Expected: CSV format documented; rows validated; partial success reported.
- Severity: P2

## TC-ADMIN-PLAN-LIMITS-017
- Pre: Admin.
- Steps: Form pre-fills with current values.
- Expected: No empty/zero default that overwrites real limits.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-018
- Pre: Admin saves with no changes.
- Expected: No audit row written; toast "no changes".
- Severity: P3

## TC-ADMIN-PLAN-LIMITS-019
- Pre: Admin sees plan currently used by N users.
- Expected: Counter next to plan name "{N} users on this plan".
- Severity: P2

## TC-ADMIN-PLAN-LIMITS-020
- Pre: Admin under reload after save.
- Expected: Persisted values read from DB, not stale env.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-021
- Pre: Admin.
- Steps: Inspect UI when DB returns null for plan_limits row.
- Expected: Falls back to compiled-in defaults; banner notes "using built-in defaults".
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-022
- Pre: Admin sets max_concurrent_engines override per user.
- Expected: Reflected in runtime registry; user can spin more dev servers.
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-023
- Pre: Admin saves invalid JSON for complex override field.
- Expected: 400 with field path; no partial commit.
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-024
- Pre: Admin checks rate-limit override fields.
- Expected: tokens_per_minute, requests_per_minute editable; effective immediately.
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-025
- Pre: Admin sets override that conflicts with billing plan.
- Expected: Warning banner explains discrepancy with Stripe plan; admin still able to save with reason.
- Severity: P1

## TC-ADMIN-PLAN-LIMITS-026
- Pre: Admin views override list sorted by created_at DESC.
- Expected: Newest first; pagination beyond 50.
- Severity: P2

## TC-ADMIN-PLAN-LIMITS-027
- Pre: Admin edits an override for deleted user.
- Expected: UI grays row; cannot edit; option to delete row.
- Severity: P2

## TC-ADMIN-PLAN-LIMITS-028
- Pre: Admin.
- Steps: Cancel mid-edit.
- Expected: Discards changes; no save.
- Severity: P3

## TC-ADMIN-PLAN-LIMITS-029
- Pre: Admin.
- Steps: Verify only `is_platform_admin` can call `/api/admin/plan-limits` POST.
- Expected: Non-admin POST → 403; even valid CSRF.
- Severity: P0

## TC-ADMIN-PLAN-LIMITS-030
- Pre: Admin verifies cache invalidation.
- Expected: After save, in-memory PLAN_LIMITS cache busted across all API workers (broadcast or short TTL).
- Severity: P0
