# TC-MCP-TOOL — MCP tool invocation

Covers tool invocation through chat or direct /mcp/connectors/:id/tools/:name/invoke, schema validation, error mapping, timeout, audit, override, debug.

## TC-MCP-TOOL-001 — Invoke tool via direct API (smoke)
- **Steps:** POST /mcp/connectors/:id/tools/getRow/invoke {args:{...}}
- **Expected:** 200 with output payload
- **Severity:** smoke

## TC-MCP-TOOL-002 — Invoke tool from chat triggers tool_start/end
- **Severity:** smoke

## TC-MCP-TOOL-003 — Invalid args fail schema validation
- **Severity:** high

## TC-MCP-TOOL-004 — Required arg missing returns 400
- **Severity:** high

## TC-MCP-TOOL-005 — Extra arg rejected (additionalProperties:false)
- **Severity:** medium

## TC-MCP-TOOL-006 — Tool not found 404
- **Severity:** medium

## TC-MCP-TOOL-007 — Connector inactive returns 503
- **Severity:** high

## TC-MCP-TOOL-008 — Tool result returned exactly as MCP server emits
- **Severity:** high

## TC-MCP-TOOL-009 — Tool error returns structured error
- **Severity:** high

## TC-MCP-TOOL-010 — Tool error wrapped to LLM as tool_result with isError
- **Severity:** medium

## TC-MCP-TOOL-011 — Tool timeout configurable per connector
- **Severity:** medium

## TC-MCP-TOOL-012 — Tool timeout returns 504
- **Severity:** high

## TC-MCP-TOOL-013 — Concurrent tool calls multiplexed via JSON-RPC ids
- **Severity:** medium

## TC-MCP-TOOL-014 — Tool call audit row written
- **Severity:** medium

## TC-MCP-TOOL-015 — Tool denylist excludes tool from registry
- **Severity:** high

## TC-MCP-TOOL-016 — Tool override (rename) reflected at invoke
- **Severity:** medium

## TC-MCP-TOOL-017 — Tool input/output schemas exposed at GET /mcp/tools/:id
- **Severity:** low

## TC-MCP-TOOL-018 — Tool result with binary content base64-encoded
- **Severity:** medium

## TC-MCP-TOOL-019 — Tool result with multiple content blocks
- **Severity:** medium

## TC-MCP-TOOL-020 — Tool result token cost estimated and logged
- **Severity:** medium

## TC-MCP-TOOL-021 — Tool with role-based permission denies guest role
- **Severity:** high

## TC-MCP-TOOL-022 — Tool with role-based permission allows admin role
- **Severity:** medium

## TC-MCP-TOOL-023 — Tool list refresh on connector update
- **Severity:** medium

## TC-MCP-TOOL-024 — Tool not exposed when transitive integration revoked
- **Severity:** high

## TC-MCP-TOOL-025 — Tool with secret env var redacted in logs
- **Severity:** critical

## TC-MCP-TOOL-026 — Debug logs include args + result for admin
- **Severity:** medium

## TC-MCP-TOOL-027 — Debug logs hide args for non-admin
- **Severity:** high

## TC-MCP-TOOL-028 — Tool result decompresses gzip if connector supports
- **Severity:** low

## TC-MCP-TOOL-029 — Streaming tool emits partial output as tool_progress events
- **Severity:** medium

## TC-MCP-TOOL-030 — Cancellation propagated to MCP server
- **Severity:** medium

## TC-MCP-TOOL-031 — Tool call rate-limited per connector
- **Severity:** medium

## TC-MCP-TOOL-032 — Tool call quota counted in ai_usage_log
- **Severity:** medium

## TC-MCP-TOOL-033 — Tool with cyclic schema references handled
- **Severity:** low

## TC-MCP-TOOL-034 — Tool with array args validated per item
- **Severity:** medium

## TC-MCP-TOOL-035 — Tool with date-time arg parsed in UTC
- **Severity:** low

## TC-MCP-TOOL-036 — Tool with boolean coercion strict (no string "true")
- **Severity:** low

## TC-MCP-TOOL-037 — Tool name case-sensitive
- **Severity:** low

## TC-MCP-TOOL-038 — Tool registered with description appears in chat advertised tools
- **Severity:** medium

## TC-MCP-TOOL-039 — Tool with no inputSchema treated as no-args
- **Severity:** medium

## TC-MCP-TOOL-040 — Tool result max size enforced (e.g. 1MB)
- **Severity:** medium

## TC-MCP-TOOL-041 — Tool result oversize truncated with flag
- **Severity:** medium

## TC-MCP-TOOL-042 — Tool result null is valid
- **Severity:** low

## TC-MCP-TOOL-043 — Tool execution preserves user context (workspace, user id)
- **Severity:** high

## TC-MCP-TOOL-044 — Tool execution does not leak across users
- **Severity:** critical

## TC-MCP-TOOL-045 — Tool spawning child process kills on done
- **Severity:** medium

## TC-MCP-TOOL-046 — Tool retry policy configurable
- **Severity:** low

## TC-MCP-TOOL-047 — Tool result observed in chat within 1s after MCP returns
- **Severity:** medium

## TC-MCP-TOOL-048 — Tool error with code surface to UI
- **Severity:** medium

## TC-MCP-TOOL-049 — Tool stress: 100 concurrent invocations
- **Severity:** medium

## TC-MCP-TOOL-050 — MCP server crash mid-invoke returns specific error
- **Severity:** high
