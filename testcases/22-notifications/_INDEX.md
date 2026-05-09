# 22-notifications — Test Case Index

In-app notifications, real-time WS push, type coverage.

| File | Focus | Cases |
|---|---|---|
| TC-NOTIF-LIST.md | list, mark read, delete, filter | 35 |
| TC-NOTIF-PUSH.md | WS broadcast, reconnect, ordering | 30 |
| TC-NOTIF-TYPES.md | each notification type's trigger | 35 |

Cross-cutting:
- All notifications scoped per user via RLS.
- WS push complements REST list; reconnect backfills.
- Notification settings respect per-type and per-channel (in-app, email).
- WS bound 127.0.0.1 only.
