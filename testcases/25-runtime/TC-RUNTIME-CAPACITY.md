# TC-RUNTIME-CAPACITY — Concurrency, Eviction, and Capacity Planning

Scope: MAX_CONCURRENT_ENGINES enforcement, LRU eviction, queueing, fairness across users.

---

## TC-RUNTIME-CAPACITY-001
- Pre: MAX_CONCURRENT_ENGINES=5; 5 servers running.
- Steps: 6th preview request.
- Expected: Either rejected or LRU evict; behavior documented in UI.
- Severity: P0

## TC-RUNTIME-CAPACITY-002
- Pre: 5 servers; oldest idle 4 minutes.
- Steps: 6th request.
- Expected: LRU evicts oldest; new server starts.
- Severity: P0

## TC-RUNTIME-CAPACITY-003
- Pre: All 5 servers active (recent activity).
- Steps: 6th request.
- Expected: Queued or rejected with "capacity reached"; user can retry.
- Severity: P1

## TC-RUNTIME-CAPACITY-004
- Pre: Queue holds requests during cap.
- Expected: FIFO; user sees "waiting" state.
- Severity: P1

## TC-RUNTIME-CAPACITY-005
- Pre: Queue position visible to user.
- Expected: "You are #2 in line" message.
- Severity: P2

## TC-RUNTIME-CAPACITY-006
- Pre: Per-user concurrency cap (e.g., 2 per user).
- Expected: User cannot monopolize global cap.
- Severity: P0

## TC-RUNTIME-CAPACITY-007
- Pre: Premium plan increases per-user cap.
- Expected: Pro user can run more concurrently.
- Severity: P1

## TC-RUNTIME-CAPACITY-008
- Pre: Eviction order LRU.
- Expected: Servers with oldest last_active_at evicted first.
- Severity: P0

## TC-RUNTIME-CAPACITY-009
- Pre: Eviction respects active sessions.
- Expected: Server with active WS connections preferred to keep; evict idle servers first.
- Severity: P0

## TC-RUNTIME-CAPACITY-010
- Pre: Force-evict via admin.
- Expected: Admin override evicts even if active; user sees disconnect with explanation.
- Severity: P1

## TC-RUNTIME-CAPACITY-011
- Pre: Capacity metrics emitted.
- Expected: OTel gauge `runtime.engines.active` and `runtime.engines.max`; alert at 90%.
- Severity: P1

## TC-RUNTIME-CAPACITY-012
- Pre: Capacity reached repeatedly.
- Expected: Admin email alert; suggestion to scale.
- Severity: P2

## TC-RUNTIME-CAPACITY-013
- Pre: Adjust MAX_CONCURRENT_ENGINES at runtime via platform_config.
- Expected: Effective immediately; existing servers preserved; new spawns honor new cap.
- Severity: P1

## TC-RUNTIME-CAPACITY-014
- Pre: Lower cap below current count.
- Expected: Existing servers continue; no auto-evict to fit cap.
- Severity: P1

## TC-RUNTIME-CAPACITY-015
- Pre: Memory pressure causes spawn failure.
- Expected: User sees clear "system busy" error; admin alerted.
- Severity: P1

## TC-RUNTIME-CAPACITY-016
- Pre: Verify fairness: round-robin across users.
- Expected: When eviction needed, evict heaviest user first.
- Severity: P2

## TC-RUNTIME-CAPACITY-017
- Pre: Eviction generates activity_events.
- Expected: One event per eviction with reason (idle | capacity | admin | crash).
- Severity: P1

## TC-RUNTIME-CAPACITY-018
- Pre: Burst traffic test.
- Steps: 50 simultaneous preview requests.
- Expected: Queue drains gracefully; no crashes; tail latency reported.
- Severity: P2

## TC-RUNTIME-CAPACITY-019
- Pre: Server restart during eviction.
- Expected: Eviction completes or rolls back; no orphan processes.
- Severity: P1

## TC-RUNTIME-CAPACITY-020
- Pre: GC cycle for stale registry entries.
- Expected: Periodic check reconciles registry vs systemd; orphans cleaned.
- Severity: P2

## TC-RUNTIME-CAPACITY-021
- Pre: User awakens project after long idle.
- Expected: Spawn rate-limited per user (avoid abuse).
- Severity: P2

## TC-RUNTIME-CAPACITY-022
- Pre: Verify port range exhaustion.
- Expected: When all ports allocated, spawn fails clearly; admin alerted.
- Severity: P2

## TC-RUNTIME-CAPACITY-023
- Pre: Server crashed and lingering port held.
- Expected: GC reclaims port within configured TTL.
- Severity: P1

## TC-RUNTIME-CAPACITY-024
- Pre: Vite jail enforces dovault.spawn.
- Expected: All spawn paths go through central API; no bypass for "preview" path.
- Severity: P0

## TC-RUNTIME-CAPACITY-025
- Pre: Verify cap respected across multiple API workers.
- Expected: Distributed coordination via DB row lock or KV; no double-spawn.
- Severity: P0
