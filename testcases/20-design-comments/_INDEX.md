# 20-design-comments — Test Case Index

Comment threads on projects: CRUD, resolve/reopen, anchor positions, mentions/reactions, real-time WS broadcast.

| File | Focus | Cases |
|---|---|---|
| TC-COMMENTS-CRUD.md | create/list/edit/delete + access | 35 |
| TC-COMMENTS-RESOLVE.md | resolve/reopen, default-view filters | 25 |
| TC-COMMENTS-ANCHOR.md | position-based anchoring + drift | 25 |
| TC-COMMENTS-MENTIONS.md | @mentions, reactions, allowlist | 25 |
| TC-COMMENTS-REALTIME.md | WS broadcast, ordering, reconnect | 30 |

Cross-cutting:
- All comment ops require project membership; cross-project access 403.
- Body XSS-safe (limited markdown, no raw HTML).
- Mentions write notifications; never bypass per-type settings.
- Anchors stored as jsonb with file/line/range or canvas coords; drift handled via context hash.
- WS broadcast complementary to REST; reconnect backfills via sequence cursor.
- All ops audited via activity_events with trace_id link.
