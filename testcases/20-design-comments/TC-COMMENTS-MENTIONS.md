# TC-COMMENTS-MENTIONS — @mentions and Reactions

Scope: @mention parsing, notifications, reactions (emoji), per-user permission.

---

## TC-COMMENTS-MENTIONS-001
- Pre: Comment body "Hey @alice, please review.".
- Expected: alice's user_id parsed; notification type=mention; metadata.mentions=[alice_id].
- Severity: P0

## TC-COMMENTS-MENTIONS-002
- Pre: Mention non-existent username.
- Expected: Treated as plain text; no notification; UI shows red squiggle on mention.
- Severity: P1

## TC-COMMENTS-MENTIONS-003
- Pre: Mention user not in workspace.
- Expected: Notification suppressed OR invitation flow triggered (per design).
- Severity: P1

## TC-COMMENTS-MENTIONS-004
- Pre: Mention multiple users.
- Expected: All notified; metadata.mentions has all ids; dedup if mentioned twice.
- Severity: P0

## TC-COMMENTS-MENTIONS-005
- Pre: Self-mention.
- Expected: No notification to self; mention still rendered.
- Severity: P1

## TC-COMMENTS-MENTIONS-006
- Pre: Mention with email format @user@example.com.
- Expected: Either supported (admin-curated) or rejected.
- Severity: P2

## TC-COMMENTS-MENTIONS-007
- Pre: Edit comment to add mention.
- Expected: New mention notified once; previous mentions not re-notified.
- Severity: P1

## TC-COMMENTS-MENTIONS-008
- Pre: Edit comment removing mention.
- Expected: Notification not retracted; mention list updates in metadata.
- Severity: P2

## TC-COMMENTS-MENTIONS-009
- Pre: Mention parsing avoids matching inside code blocks.
- Expected: ` ```@user``` ` not parsed as mention.
- Severity: P1

## TC-COMMENTS-MENTIONS-010
- Pre: Comment author opted out of mention notifications.
- Expected: Author preferences honored.
- Severity: P1

## TC-COMMENTS-MENTIONS-011
- Pre: Reaction add (emoji 👍).
- Steps: POST /api/design-comments/:id/reactions { emoji: "👍" }.
- Expected: 201; reaction stored with user_id, emoji.
- Severity: P1

## TC-COMMENTS-MENTIONS-012
- Pre: Reaction same emoji twice from same user.
- Expected: Idempotent; one row.
- Severity: P2

## TC-COMMENTS-MENTIONS-013
- Pre: Remove reaction.
- Expected: DELETE /api/design-comments/:id/reactions/:emoji removes.
- Severity: P2

## TC-COMMENTS-MENTIONS-014
- Pre: List reactions for comment.
- Expected: Returns aggregated counts per emoji; expand to see who reacted.
- Severity: P2

## TC-COMMENTS-MENTIONS-015
- Pre: Reaction emoji constrained set.
- Expected: Allowlist (👍 ❤️ 😂 🎉 😢 🚀 👀) enforced; arbitrary emoji rejected.
- Severity: P2

## TC-COMMENTS-MENTIONS-016
- Pre: Reaction by non-member.
- Expected: 403.
- Severity: P0

## TC-COMMENTS-MENTIONS-017
- Pre: Reaction count >1k.
- Expected: Aggregated efficiently; UI shows "1.2k 👍".
- Severity: P3

## TC-COMMENTS-MENTIONS-018
- Pre: Reaction notification.
- Expected: Optionally notifies comment author "Alice reacted 👍"; respects per-type setting.
- Severity: P3

## TC-COMMENTS-MENTIONS-019
- Pre: Reaction broadcast WS.
- Expected: All members see live update.
- Severity: P1

## TC-COMMENTS-MENTIONS-020
- Pre: Reactions exported with comment.
- Expected: Included in JSON export.
- Severity: P3

## TC-COMMENTS-MENTIONS-021
- Pre: Reaction rate limit.
- Expected: 60/min/user.
- Severity: P2

## TC-COMMENTS-MENTIONS-022
- Pre: Reaction on deleted comment.
- Expected: 410 / not allowed.
- Severity: P2

## TC-COMMENTS-MENTIONS-023
- Pre: Mention triggers WS event in addition to notification.
- Expected: Mentioned user gets push if connected.
- Severity: P1

## TC-COMMENTS-MENTIONS-024
- Pre: Mention in reply threads notifies thread participants?
- Expected: Mention notifies only mentioned user; participants notified only if their notification setting opts in.
- Severity: P2

## TC-COMMENTS-MENTIONS-025
- Pre: Mention auto-completion in editor.
- Expected: Typeahead for workspace members; XSS-safe rendering.
- Severity: P2
