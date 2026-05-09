# TC-NOTIF-TYPES — Notification Type Coverage

Scope: Each notification type's trigger, payload, target, and side effects.

---

## TC-NOTIF-TYPES-001 (mention)
- Pre: User A mentions user B in a comment.
- Expected: type=mention, target_id=comment_id, source=user A; B notified in-app + WS push + email (per setting).
- Severity: P0

## TC-NOTIF-TYPES-002 (mention without permission)
- Pre: User A mentions B in private project where B isn't a member.
- Expected: B not added; either no notification or restricted (see "request invite") flow.
- Severity: P1

## TC-NOTIF-TYPES-003 (build_complete)
- Pre: Deploy succeeds.
- Expected: Project owner notified; type=build_complete, link to deployment.
- Severity: P0

## TC-NOTIF-TYPES-004 (build_failed)
- Pre: Deploy fails.
- Expected: Owner notified; severity=high; link to logs.
- Severity: P0

## TC-NOTIF-TYPES-005 (member_invite)
- Pre: Workspace owner invites email X.
- Expected: If X has account, in-app notification; always email; magic link.
- Severity: P0

## TC-NOTIF-TYPES-006 (member_joined)
- Pre: Invited user accepts.
- Expected: Workspace owner + admins notified; member_joined type.
- Severity: P1

## TC-NOTIF-TYPES-007 (member_role_changed)
- Pre: Owner changes member role.
- Expected: Affected member notified; type=member_role_changed; old → new role.
- Severity: P1

## TC-NOTIF-TYPES-008 (member_removed)
- Pre: Owner removes member.
- Expected: Removed user notified (politely); access immediately revoked.
- Severity: P1

## TC-NOTIF-TYPES-009 (plan_change)
- Pre: Workspace plan upgraded.
- Expected: All members notified; cap update reflected.
- Severity: P1

## TC-NOTIF-TYPES-010 (plan_downgrade)
- Pre: Workspace plan downgraded.
- Expected: All members notified; warning if usage >new cap.
- Severity: P0

## TC-NOTIF-TYPES-011 (billing_failed)
- Pre: Stripe webhook indicates failed invoice.
- Expected: Workspace owner notified; severity=high; link to billing.
- Severity: P0

## TC-NOTIF-TYPES-012 (billing_card_expiring)
- Pre: 14d before card expiry.
- Expected: Owner notified.
- Severity: P1

## TC-NOTIF-TYPES-013 (comment_reply)
- Pre: User replies on a thread.
- Expected: Original commenter + thread participants notified except actor.
- Severity: P1

## TC-NOTIF-TYPES-014 (comment_resolve)
- Pre: Comment resolved.
- Expected: Participants notified.
- Severity: P2

## TC-NOTIF-TYPES-015 (comment_delete)
- Pre: Comment deleted.
- Expected: Participants optional notification; audit trail kept.
- Severity: P2

## TC-NOTIF-TYPES-016 (integration_revoked)
- Pre: OAuth integration revoked.
- Expected: User notified explaining impact.
- Severity: P1

## TC-NOTIF-TYPES-017 (integration_expired)
- Pre: OAuth token expired.
- Expected: Reconnect notification with link.
- Severity: P1

## TC-NOTIF-TYPES-018 (security_alert)
- Pre: Security finding for user (e.g., login from new country).
- Expected: User notified high severity.
- Severity: P0

## TC-NOTIF-TYPES-019 (project_shared)
- Pre: Owner shares project.
- Expected: Recipient notified.
- Severity: P2

## TC-NOTIF-TYPES-020 (project_archived)
- Pre: Project archived.
- Expected: Project members notified.
- Severity: P2

## TC-NOTIF-TYPES-021 (project_deleted)
- Pre: Project deleted.
- Expected: Members notified; data retention period stated.
- Severity: P1

## TC-NOTIF-TYPES-022 (workspace_archive)
- Pre: Workspace archived.
- Expected: Owner + admins notified.
- Severity: P2

## TC-NOTIF-TYPES-023 (mention in chat)
- Pre: AI chat surface mentions another user (rare).
- Expected: Treat as mention type.
- Severity: P3

## TC-NOTIF-TYPES-024 (publish_blocked)
- Pre: Publish blocked by moderation.
- Expected: Owner notified with reason.
- Severity: P1

## TC-NOTIF-TYPES-025 (takedown)
- Pre: Marketplace item taken down.
- Expected: Owner notified high severity.
- Severity: P0

## TC-NOTIF-TYPES-026 (account_locked)
- Pre: Account locked due to security.
- Expected: User receives email AND in-app once unlocked.
- Severity: P0

## TC-NOTIF-TYPES-027 (mfa_enabled)
- Pre: User enables MFA.
- Expected: Confirmation notification; recovery codes link.
- Severity: P1

## TC-NOTIF-TYPES-028 (mfa_disabled)
- Pre: MFA disabled.
- Expected: Notification + email + audit row.
- Severity: P0

## TC-NOTIF-TYPES-029 (api_token_created)
- Pre: User creates API token.
- Expected: Notification with truncated token id; email.
- Severity: P1

## TC-NOTIF-TYPES-030 (api_token_revoked)
- Pre: Token revoked.
- Expected: Notification.
- Severity: P1

## TC-NOTIF-TYPES-031 (deploy_rolled_back)
- Pre: Project rolled back.
- Expected: Members notified with from→to versions.
- Severity: P1

## TC-NOTIF-TYPES-032 (preview_evicted)
- Pre: Dev server evicted while user actively using.
- Expected: In-app toast + notification "Preview was suspended due to inactivity".
- Severity: P2

## TC-NOTIF-TYPES-033 (notification settings respected)
- Pre: User disables type=mention email.
- Expected: In-app still arrives; email skipped.
- Severity: P1

## TC-NOTIF-TYPES-034 (notification i18n)
- Pre: User locale=fr.
- Expected: title/body localized where translation exists.
- Severity: P3

## TC-NOTIF-TYPES-035 (notification trace_id)
- Pre: Each notification has originating trace_id when applicable.
- Expected: Admin can drill from notification to OTel trace.
- Severity: P2
