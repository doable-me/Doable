# TC-ADMIN-TRACE — OpenTelemetry Trace Search & Drill

Scope: `/admin/trace` (search), `/admin/trace/:traceId` (waterfall + spans + logs). Tables: `traces`, `spans`, `trace_logs`. Ingestion: `/api/otlp/*`.

---

## TC-ADMIN-TRACE-001
- Pre: Admin; OTLP ingestion enabled; recent traces present.
- Steps: GET `/admin/trace`.
- Expected: Search panel with filters: trace_id, service, operation, status, duration range, time window. Default last 1h.
- Severity: P0

## TC-ADMIN-TRACE-002
- Pre: Non-admin.
- Steps: GET `/admin/trace`.
- Expected: 403.
- Severity: P0

## TC-ADMIN-TRACE-003
- Pre: Admin.
- Steps: POST OTLP trace to `/api/otlp/v1/traces`.
- Expected: 200; trace appears in `/admin/trace` within 5s; spans table populated.
- Severity: P0

## TC-ADMIN-TRACE-004
- Pre: Admin; OTLP request missing `Content-Type: application/x-protobuf`.
- Steps: Send malformed.
- Expected: 415 or 400; traces table not corrupted.
- Severity: P1

## TC-ADMIN-TRACE-005
- Pre: Admin.
- Steps: Search by trace_id (exact 32-hex).
- Expected: Direct hit to `/admin/trace/:id` if 1 result.
- Severity: P0

## TC-ADMIN-TRACE-006
- Pre: Admin.
- Steps: Search by service="api".
- Expected: All traces from api service shown; counts visible.
- Severity: P0

## TC-ADMIN-TRACE-007
- Pre: Admin.
- Steps: Filter status=error.
- Expected: Only traces containing at least one span with status_code=ERROR.
- Severity: P0

## TC-ADMIN-TRACE-008
- Pre: Admin.
- Steps: Duration filter >2s.
- Expected: Only traces whose root span duration >2000ms.
- Severity: P1

## TC-ADMIN-TRACE-009
- Pre: Admin.
- Steps: Time window: last 15m / 1h / 24h / 7d / custom.
- Expected: Each window narrows result set; custom uses two date pickers.
- Severity: P1

## TC-ADMIN-TRACE-010
- Pre: Admin clicks a trace.
- Steps: Navigate to `/admin/trace/:traceId`.
- Expected: Waterfall renders spans in chronological order; duration bars proportional; nested children indented.
- Severity: P0

## TC-ADMIN-TRACE-011
- Pre: Admin in trace detail.
- Steps: Click a span.
- Expected: Side panel shows attributes (key/value), events, links, status, duration_ns.
- Severity: P0

## TC-ADMIN-TRACE-012
- Pre: Admin.
- Steps: Verify expected attributes (e.g., `http.method`, `http.url`, `db.system`, `user.id`, `project.id`).
- Expected: Attributes present where applicable; PII (e.g., raw email) NOT included unless explicitly allowlisted.
- Severity: P0

## TC-ADMIN-TRACE-013
- Pre: Admin.
- Steps: Filter by attribute `user.id=<uuid>`.
- Expected: Returns traces tagged with that user; supports indexed attribute lookup.
- Severity: P1

## TC-ADMIN-TRACE-014
- Pre: Admin.
- Steps: Filter `project.id=<uuid>`.
- Expected: Project-scoped traces.
- Severity: P1

## TC-ADMIN-TRACE-015
- Pre: Admin in trace detail with 500 spans.
- Steps: Open detail.
- Expected: Virtualized waterfall; first 100 visible; lazy-load on scroll; no UI freeze.
- Severity: P1

## TC-ADMIN-TRACE-016
- Pre: Admin.
- Steps: Toggle "Tracing" feature flag off via admin.
- Expected: New traces stop ingesting; existing traces still queryable; flag persists across reload.
- Severity: P0

## TC-ADMIN-TRACE-017
- Pre: Admin; tracing flag persisted=true.
- Steps: Reload server; reload `/admin/trace`.
- Expected: Flag still on after reload (stored in platform_config).
- Severity: P0

## TC-ADMIN-TRACE-018
- Pre: Admin.
- Steps: Check `trace_logs` are joined to spans.
- Expected: Span detail shows linked logs; click "View logs" jumps to filtered logs view.
- Severity: P1

## TC-ADMIN-TRACE-019
- Pre: Admin; trace with broken parent_span_id reference.
- Steps: Open trace.
- Expected: Orphan spans shown at root with "(orphan)" tag; no infinite recursion.
- Severity: P1

## TC-ADMIN-TRACE-020
- Pre: Admin OTLP rate limit test.
- Steps: Send 10k spans/sec for 30s.
- Expected: Server applies backpressure; 429 once threshold exceeded; no DB OOM.
- Severity: P1

## TC-ADMIN-TRACE-021
- Pre: Admin.
- Steps: Search free-text across attributes.
- Expected: Trigram or full-text on attribute values; results highlight matched substring.
- Severity: P2

## TC-ADMIN-TRACE-022
- Pre: Admin.
- Steps: Verify auth token check on `/api/otlp/*`.
- Expected: Either signed token or shared secret in header required; unauthenticated requests 401.
- Severity: P0

## TC-ADMIN-TRACE-023
- Pre: Admin.
- Steps: Send OTLP trace from external IP.
- Expected: If from public internet, blocked by tunnel routing; only allowed via internal network.
- Severity: P0

## TC-ADMIN-TRACE-024
- Pre: Admin in waterfall.
- Steps: Hover span.
- Expected: Tooltip shows duration, op name, status; non-clipped on edges.
- Severity: P3

## TC-ADMIN-TRACE-025
- Pre: Admin.
- Steps: Click "Copy trace_id".
- Expected: Hex id in clipboard; toast confirmation.
- Severity: P3

## TC-ADMIN-TRACE-026
- Pre: Admin.
- Steps: Visit `/admin/trace/INVALID`.
- Expected: 404 page; no 500.
- Severity: P2

## TC-ADMIN-TRACE-027
- Pre: Admin viewing trace with security_finding linked.
- Expected: Banner "This trace triggered finding #N"; cross-link.
- Severity: P1

## TC-ADMIN-TRACE-028
- Pre: Admin.
- Steps: Filter by error.message contains "ETIMEDOUT".
- Expected: Returns failed-network traces.
- Severity: P2

## TC-ADMIN-TRACE-029
- Pre: Admin.
- Steps: Toggle "follow live traces" mode.
- Expected: New incoming traces stream into top of search list; throttled.
- Severity: P3

## TC-ADMIN-TRACE-030
- Pre: Admin.
- Steps: Bookmark trace detail URL and revisit days later.
- Expected: Trace still loads if within retention; otherwise "Trace expired" with retention info.
- Severity: P2

## TC-ADMIN-TRACE-031
- Pre: Admin.
- Steps: Verify retention policy purge job ran.
- Expected: Spans/traces older than configured retention deleted; no dangling trace_logs.
- Severity: P1

## TC-ADMIN-TRACE-032
- Pre: Admin.
- Steps: Sort search results by duration DESC.
- Expected: Slowest traces top; helpful for perf debugging.
- Severity: P2

## TC-ADMIN-TRACE-033
- Pre: Admin.
- Steps: Filter by span attribute `http.status_code=500`.
- Expected: Returns matching traces; integer comparison works.
- Severity: P2

## TC-ADMIN-TRACE-034
- Pre: Admin.
- Steps: View trace whose root span has no children.
- Expected: Detail still renders; waterfall has 1 bar.
- Severity: P3

## TC-ADMIN-TRACE-035
- Pre: Admin.
- Steps: Verify OTLP-HTTP and OTLP-gRPC both supported (if applicable) or only HTTP.
- Expected: Documented; configured paths returning correct status codes.
- Severity: P2

## TC-ADMIN-TRACE-036
- Pre: Admin verifies CORS on `/api/otlp/*`.
- Expected: CORS NOT permissive — only same-origin or specific allowlist.
- Severity: P0
