# TC-ADMIN-IMPERSONATION — Admin Acting As User

Scope: Impersonation flow if exposed. Token issuance, banner, audit trail, scope of permissions.

---

## TC-ADMIN-IMP-001
- Pre: Admin.
- Steps: Open user detail; click "Impersonate".
- Expected: Confirm modal warning permanent audit; on confirm, session swaps to user; banner pinned at top.
- Severity: P0

## TC-ADMIN-IMP-002
- Pre: Non-admin attempts impersonation API.
- Expected: 403; security_finding created.
- Severity: P0

## TC-ADMIN-IMP-003
- Pre: Admin impersonates self.
- Expected: Rejected; "cannot impersonate yourself".
- Severity: P2

## TC-ADMIN-IMP-004
- Pre: Admin impersonates another platform admin.
- Expected: Rejected without 2-admin approval, OR allowed with red-flag audit + notification to target.
- Severity: P0

## TC-ADMIN-IMP-005
- Pre: Admin impersonating user A.
- Steps: Browse projects.
- Expected: Sees only A's projects; same as A would see.
- Severity: P0

## TC-ADMIN-IMP-006
- Pre: Admin impersonating; tries to access /admin.
- Expected: 403 (cannot pierce admin while impersonating); banner reminds to stop impersonation.
- Severity: P0

## TC-ADMIN-IMP-007
- Pre: Admin impersonating; takes destructive action (delete project).
- Expected: Action allowed but every action stamped both impersonator_id and acting_user_id in activity_events.
- Severity: P0

## TC-ADMIN-IMP-008
- Pre: Admin clicks "Stop impersonating".
- Expected: Returns to admin self; banner removed; audit `impersonation_end`.
- Severity: P0

## TC-ADMIN-IMP-009
- Pre: Admin impersonation token TTL.
- Expected: Token expires after configured duration (e.g., 30 min); auto-stops.
- Severity: P1

## TC-ADMIN-IMP-010
- Pre: Admin impersonates user that gets deleted while session active.
- Expected: Session terminates with error; banner cleared.
- Severity: P1

## TC-ADMIN-IMP-011
- Pre: Admin impersonating tries to change target user password.
- Expected: Blocked; only target user can do password change.
- Severity: P0

## TC-ADMIN-IMP-012
- Pre: Admin impersonating tries to issue API tokens for user.
- Expected: Blocked; cannot create persistent credentials as target.
- Severity: P0

## TC-ADMIN-IMP-013
- Pre: Admin impersonating tries to change billing.
- Expected: Blocked; protected paths require user-direct auth.
- Severity: P0

## TC-ADMIN-IMP-014
- Pre: Admin impersonating in incognito window.
- Expected: Works; cookies isolated.
- Severity: P2

## TC-ADMIN-IMP-015
- Pre: Two admins impersonating different users simultaneously.
- Expected: Independent sessions; no cross-contamination.
- Severity: P1

## TC-ADMIN-IMP-016
- Pre: Admin impersonating views their own admin email.
- Expected: UI shows acting-as user, but admin email visible in banner only.
- Severity: P2

## TC-ADMIN-IMP-017
- Pre: Admin impersonating receives notification meant for target user.
- Expected: Notifications scoped to target during session; admin sees target's notifications.
- Severity: P2

## TC-ADMIN-IMP-018
- Pre: Admin impersonating triggers AI chat.
- Expected: ai_sessions row attributes to acting_user_id; admin_id captured separately; cost charged to target's plan or to platform per policy.
- Severity: P1

## TC-ADMIN-IMP-019
- Pre: Admin closes browser without stopping impersonation.
- Expected: Backend session expires per TTL; next login starts fresh as admin.
- Severity: P1

## TC-ADMIN-IMP-020
- Pre: Admin impersonating; user logs in concurrently.
- Expected: Both sessions allowed; user sees own session normally; admin's impersonation continues.
- Severity: P2

## TC-ADMIN-IMP-021
- Pre: Admin impersonating tries to view another user's data via direct ID.
- Expected: Blocked per normal RLS for target user.
- Severity: P0

## TC-ADMIN-IMP-022
- Pre: Audit of impersonation_start.
- Expected: Includes admin_id, target_user_id, reason, IP, UA.
- Severity: P0

## TC-ADMIN-IMP-023
- Pre: Mandatory reason field.
- Expected: Cannot start impersonation without text reason >=10 chars.
- Severity: P1

## TC-ADMIN-IMP-024
- Pre: Target user has account locked.
- Expected: Refuse impersonation with informative error.
- Severity: P1

## TC-ADMIN-IMP-025
- Pre: Admin impersonation count quota.
- Expected: Configurable max impersonations per admin per day; throttled with audit.
- Severity: P2
