# TC-WS-RECONNECT — Reconnect, multi-tab, ghost cleanup

These tests focus on resilience: dropped connections, network blips, multiple tabs, and ghost cursor cleanup.

---

## TC-WS-RECONN-001 — Server graceful close (1000) — client reconnects automatically
- **Steps:** server initiates close; client side reconnects.
- **Expected:** new WS open with same JWT; new `connected` event.
- **Severity:** smoke

## TC-WS-RECONN-002 — Network drop (kill local interface) → client retries with backoff
- **Severity:** high

## TC-WS-RECONN-003 — Server restart while client connected — client reconnects after 1-3s
- **Severity:** high

## TC-WS-RECONN-004 — Client reconnects, re-joins same room
- **Severity:** smoke

## TC-WS-RECONN-005 — Reconnect within 1s — Yjs sync delta minimal
- **Severity:** medium

## TC-WS-RECONN-006 — Reconnect after 60s — sync-request returns full state
- **Severity:** medium

## TC-WS-RECONN-007 — Reconnect re-establishes presence (others see user re-join)
- **Severity:** smoke

## TC-WS-RECONN-008 — Stale presence purged after disconnect grace (~30-60s)
- **Severity:** high

## TC-WS-RECONN-009 — Ghost cursor disappears within 60s of disconnect
- **Severity:** high

## TC-WS-RECONN-010 — Multiple ghost cursors all clean up correctly
- **Severity:** medium

## TC-WS-RECONN-011 — Reconnect doesn't lose pending Yjs updates queued client-side
- **Severity:** high

## TC-WS-RECONN-012 — Reconnect with different JWT (token rotated) — server accepts new connection (new userId or same)
- **Severity:** medium

## TC-WS-RECONN-013 — Backoff sequence: 1s, 2s, 4s, 8s, max 30s
- **Severity:** medium

## TC-WS-RECONN-014 — Network captive portal returns HTTP — client treats as failure and retries
- **Severity:** low

## TC-WS-RECONN-015 — Cloudflare tunnel restart — clients reconnect within 10s
- **Severity:** high

## TC-WS-RECONN-016 — Multi-tab same user: tab1 disconnects; tab2 still connected — tab2 unaffected
- **Severity:** high

## TC-WS-RECONN-017 — Multi-tab same user: editing in tab1 syncs to tab2 via Yjs
- **Severity:** high

## TC-WS-RECONN-018 — Multi-tab same user: presence members shows count 1 (deduped) or 2 (per-tab)
- **Notes:** verify and document spec.
- **Severity:** medium

## TC-WS-RECONN-019 — Multi-tab same user: cursor:move broadcast filtered (sender excluded by userId — both tabs miss)
- **Severity:** high

## TC-WS-RECONN-020 — Multi-tab same user: chat:send echoed to both tabs (broadcast includes sender)
- **Severity:** medium

## TC-WS-RECONN-021 — Two browsers same user — same as multi-tab semantics
- **Severity:** medium

## TC-WS-RECONN-022 — Three+ tabs same user — server stable
- **Severity:** medium

## TC-WS-RECONN-023 — Mobile network switch (wifi → cellular) — reconnect <5s
- **Severity:** medium

## TC-WS-RECONN-024 — Long-idle (>30 min) → does heartbeat keep alive or get reaped?
- **Severity:** high

## TC-WS-RECONN-025 — TCP RST detected by ws → close handler fires → cleanup
- **Severity:** medium

## TC-WS-RECONN-026 — Server overload (1000 concurrent connections) — graceful degrade
- **Severity:** medium

## TC-WS-RECONN-027 — Connection count visible in /health
- **Severity:** smoke

## TC-WS-RECONN-028 — Concurrency stress: 200 sockets joining 200 rooms — no deadlock
- **Severity:** medium

## TC-WS-RECONN-029 — Reconnection storm (server restart releases 500 clients) — handled within 30s
- **Severity:** medium

## TC-WS-RECONN-030 — `resumeToken` field is empty in `connected` message (current code sends "")
- **Notes:** spec may evolve to support resumable sessions. Document.
- **Severity:** low

## TC-WS-RECONN-031 — Disconnect during yjs:sync-request — async resolver gracefully ends span
- **Severity:** medium

## TC-WS-RECONN-032 — Disconnect during chat:send before persistence — message still broadcasts but persistence may fail (logged)
- **Severity:** low

## TC-WS-RECONN-033 — Browser tab freeze (background, throttled timers) — heartbeats may pause; reaped on resume
- **Severity:** medium

## TC-WS-RECONN-034 — Closing browser without sending room:leave still cleans up (close handler)
- **Severity:** smoke

## TC-WS-RECONN-035 — Force-quit browser process — TCP RST → close handler
- **Severity:** medium

## TC-WS-RECONN-036 — Sleep/wake laptop → reconnect on wake
- **Severity:** medium

## TC-WS-RECONN-037 — Reconnect after JWT expires mid-session → 4002 close, no auto-refresh
- **Severity:** high

## TC-WS-RECONN-038 — Pre-emptive token refresh before expiry
- **Severity:** medium

## TC-WS-RECONN-039 — Room state preserved when single-user disconnects briefly (Y.Doc still in memory)
- **Severity:** medium

## TC-WS-RECONN-040 — Room state lost if all users disconnect and onEmpty GC fires before reconnect
- **Notes:** verify whether persistence (`project_files.yjs_update`) saves to DB before GC.
- **Severity:** high
