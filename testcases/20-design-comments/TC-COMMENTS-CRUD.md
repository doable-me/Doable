# TC-COMMENTS-CRUD — Design Comments Create/Read/Update/Delete

Scope: design_comments table; create thread, reply, edit, delete; access control; XSS safety.

---

## TC-COMMENTS-CRUD-001
- Pre: User is project member.
- Steps: POST /api/design-comments { project_id, body, anchor: { file, line, position } }.
- Expected: 201; row created with author_id=user, status=open, created_at.
- Severity: P0

## TC-COMMENTS-CRUD-002
- Pre: Non-member.
- Steps: POST.
- Expected: 403.
- Severity: P0

## TC-COMMENTS-CRUD-003
- Pre: Anonymous.
- Expected: 401.
- Severity: P0

## TC-COMMENTS-CRUD-004
- Pre: Member creates thread.
- Steps: POST reply with parent_id.
- Expected: 201; thread relation; same project_id required.
- Severity: P0

## TC-COMMENTS-CRUD-005
- Pre: User creates reply on another project's comment.
- Expected: 403 / 400 (project mismatch).
- Severity: P0

## TC-COMMENTS-CRUD-006
- Pre: Comment body empty.
- Expected: 400 "body required" unless attachments only.
- Severity: P1

## TC-COMMENTS-CRUD-007
- Pre: Comment body >10KB.
- Expected: 400 "too long" or truncate per policy.
- Severity: P1

## TC-COMMENTS-CRUD-008
- Pre: Comment body contains `<script>alert(1)</script>`.
- Expected: Stored as text; rendered safely escaped.
- Severity: P0

## TC-COMMENTS-CRUD-009
- Pre: Markdown rendering (if supported).
- Expected: Limited subset (bold, italic, code, links); no raw HTML.
- Severity: P0

## TC-COMMENTS-CRUD-010
- Pre: Comment with link to external site.
- Expected: rel="noopener noreferrer"; target="_blank" optional.
- Severity: P1

## TC-COMMENTS-CRUD-011
- Pre: List comments for project.
- Steps: GET /api/design-comments?project_id=X.
- Expected: Returns threaded list ordered by created_at; counts of replies.
- Severity: P0

## TC-COMMENTS-CRUD-012
- Pre: List by anchor.
- Steps: GET /api/design-comments?project_id=X&file=Y.
- Expected: Filters by file path; returns only matching.
- Severity: P1

## TC-COMMENTS-CRUD-013
- Pre: Edit own comment.
- Steps: PATCH /api/design-comments/:id { body: ... }.
- Expected: 200; updated_at set; edited_flag true; original optionally retained for audit.
- Severity: P1

## TC-COMMENTS-CRUD-014
- Pre: Edit another user's comment.
- Expected: 403.
- Severity: P0

## TC-COMMENTS-CRUD-015
- Pre: Edit window (e.g., 15 min).
- Expected: After window, edits disallowed; 423 or 403.
- Severity: P2

## TC-COMMENTS-CRUD-016
- Pre: Workspace admin edits any.
- Expected: Allowed but flagged "edited by admin"; audit row.
- Severity: P1

## TC-COMMENTS-CRUD-017
- Pre: Delete own comment.
- Expected: Soft delete; deleted_at set; body replaced with "[deleted]"; replies preserved.
- Severity: P1

## TC-COMMENTS-CRUD-018
- Pre: Delete another's comment.
- Expected: 403 unless workspace admin.
- Severity: P0

## TC-COMMENTS-CRUD-019
- Pre: Workspace admin deletes a comment.
- Expected: Allowed; audit row records actor and reason.
- Severity: P0

## TC-COMMENTS-CRUD-020
- Pre: Hard delete only via admin tool.
- Expected: Soft delete first; hard delete behind 30d retention.
- Severity: P1

## TC-COMMENTS-CRUD-021
- Pre: Restore deleted comment.
- Expected: Workspace admin can restore within retention; audit row.
- Severity: P2

## TC-COMMENTS-CRUD-022
- Pre: Comment count per project displayed.
- Expected: Excludes deleted; updates real-time.
- Severity: P2

## TC-COMMENTS-CRUD-023
- Pre: Comment with attachment (image).
- Expected: Uploaded to project assets; URL stored in metadata; max size enforced.
- Severity: P2

## TC-COMMENTS-CRUD-024
- Pre: Attachment with malicious mime.
- Expected: Validated; only safe types allowed.
- Severity: P0

## TC-COMMENTS-CRUD-025
- Pre: Comment with mention @user.
- Expected: Stored in metadata.mentions[]; notification triggered.
- Severity: P0

## TC-COMMENTS-CRUD-026
- Pre: Comment with @user not in workspace.
- Expected: Either invitation flow or rejection; clear UX.
- Severity: P1

## TC-COMMENTS-CRUD-027
- Pre: Comment list pagination.
- Expected: 50 per page; cursor-based; reach old comments.
- Severity: P1

## TC-COMMENTS-CRUD-028
- Pre: Comment list sorted DESC default.
- Expected: Newest top; admin can change order.
- Severity: P3

## TC-COMMENTS-CRUD-029
- Pre: Comment search by text.
- Expected: Full-text search; results scoped to user's projects.
- Severity: P2

## TC-COMMENTS-CRUD-030
- Pre: Verify all CRUD operations write activity_events.
- Expected: comment_create, comment_edit, comment_delete events.
- Severity: P1

## TC-COMMENTS-CRUD-031
- Pre: Verify trace_id captured per operation.
- Expected: Linked to OTel trace.
- Severity: P2

## TC-COMMENTS-CRUD-032
- Pre: Verify rate limit on comment creation.
- Expected: 30/min per user; 429 beyond.
- Severity: P1

## TC-COMMENTS-CRUD-033
- Pre: Comment with emoji (Unicode 4-byte).
- Expected: Stored correctly; UTF-8 mb4.
- Severity: P2

## TC-COMMENTS-CRUD-034
- Pre: Comment with RTL text (Arabic).
- Expected: Stored and rendered correctly.
- Severity: P3

## TC-COMMENTS-CRUD-035
- Pre: User on free plan exceeds comment quota.
- Expected: Either no quota or clear error.
- Severity: P3
