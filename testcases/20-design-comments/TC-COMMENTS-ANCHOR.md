# TC-COMMENTS-ANCHOR — Position-based Anchoring

Scope: Anchor JSON (file, line, col, range, position percentages on canvas), drift handling on edits.

---

## TC-COMMENTS-ANCHOR-001
- Pre: Comment created with anchor { file: "App.tsx", line: 42, col: 10 }.
- Expected: Stored in anchor jsonb; renderer highlights line 42.
- Severity: P0

## TC-COMMENTS-ANCHOR-002
- Pre: Editor adds 5 lines above line 42.
- Expected: Anchor updates to line 47 OR drift handler tracks via context (line content) match.
- Severity: P0

## TC-COMMENTS-ANCHOR-003
- Pre: Editor deletes the anchored line.
- Expected: Anchor marked "stale" or "orphan"; UI shows "Comment context lost" with link.
- Severity: P1

## TC-COMMENTS-ANCHOR-004
- Pre: Anchor with line range (line: 42-50).
- Expected: Range stored; rendered as highlighted block.
- Severity: P1

## TC-COMMENTS-ANCHOR-005
- Pre: Canvas-based anchor { x_pct, y_pct }.
- Expected: Stored as fractions; renders pin at position; survives canvas resize.
- Severity: P1

## TC-COMMENTS-ANCHOR-006
- Pre: Anchor file renamed.
- Expected: Anchor updates new path via tracked move; or marked orphan.
- Severity: P1

## TC-COMMENTS-ANCHOR-007
- Pre: Anchor file deleted.
- Expected: Comment marked orphan but preserved; visible in "All comments".
- Severity: P1

## TC-COMMENTS-ANCHOR-008
- Pre: Multiple comments same line.
- Expected: Stack indicator; click expands list.
- Severity: P2

## TC-COMMENTS-ANCHOR-009
- Pre: Anchor with invalid file path.
- Expected: 400 on create.
- Severity: P1

## TC-COMMENTS-ANCHOR-010
- Pre: Anchor with negative line.
- Expected: 400.
- Severity: P1

## TC-COMMENTS-ANCHOR-011
- Pre: Anchor injected SQL or path traversal.
- Expected: Sanitized; rejected.
- Severity: P0

## TC-COMMENTS-ANCHOR-012
- Pre: Anchor with image area selection.
- Expected: anchor stores polygon points; renders overlay.
- Severity: P2

## TC-COMMENTS-ANCHOR-013
- Pre: Yjs CRDT updates underlying file.
- Expected: Anchor positions translated through CRDT; cursor decoration updates live.
- Severity: P0

## TC-COMMENTS-ANCHOR-014
- Pre: Concurrent edits change same anchor region.
- Expected: Anchor follows OT/CRDT transformations; lands at correct location.
- Severity: P1

## TC-COMMENTS-ANCHOR-015
- Pre: Long file (>10k lines).
- Expected: Anchor fetch fast; uses index on (file_hash, line).
- Severity: P2

## TC-COMMENTS-ANCHOR-016
- Pre: Anchor schema change.
- Expected: Backwards compatible read; migrations handle old rows.
- Severity: P2

## TC-COMMENTS-ANCHOR-017
- Pre: User clicks anchored comment in list.
- Expected: Editor scrolls to line; cursor positioned; comment popover opens.
- Severity: P1

## TC-COMMENTS-ANCHOR-018
- Pre: Deep link to comment via URL.
- Expected: /editor/:projectId?comment=:id opens with anchor highlighted.
- Severity: P2

## TC-COMMENTS-ANCHOR-019
- Pre: Anchor on collaborative cursor in real-time.
- Expected: Comment pin moves with content; multiple users see same position.
- Severity: P1

## TC-COMMENTS-ANCHOR-020
- Pre: Stale anchor cleanup.
- Expected: Periodic job marks anchors orphaned if context lost; user can re-attach.
- Severity: P2

## TC-COMMENTS-ANCHOR-021
- Pre: Anchor metadata size cap.
- Expected: <2KB; rejection beyond.
- Severity: P3

## TC-COMMENTS-ANCHOR-022
- Pre: Anchor preserves selection via context hash (e.g., 3-line context hash).
- Expected: On reload, finds new line by hash if shifted.
- Severity: P2

## TC-COMMENTS-ANCHOR-023
- Pre: Anchor on file with binary content (image upload).
- Expected: Pin position uses pixel coords; not line.
- Severity: P2

## TC-COMMENTS-ANCHOR-024
- Pre: Anchor visible in published preview overlay (if enabled).
- Expected: Toggle for owner only; never to public visitors.
- Severity: P1

## TC-COMMENTS-ANCHOR-025
- Pre: Anchor JSON malformed.
- Expected: Comment still loads; anchor marked invalid; admin alerted.
- Severity: P2
