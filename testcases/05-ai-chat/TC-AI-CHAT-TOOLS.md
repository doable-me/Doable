# TC-AI-CHAT-TOOLS — Tool call execution & rendering

Covers SDK tool dispatch, MCP tool invocation, tool result formatting (`textResultForLlm`), error paths (timeout, crash, denial), and UI rendering of tool cards.

## TC-AI-CHAT-TOOLS-001 — Built-in fs.read tool runs (smoke)
- **Pre:** project has README.md
- **Steps:** prompt "show README"
- **Expected:** tool_start `fs.read`; tool_end with file contents; assistant cites
- **Severity:** smoke

## TC-AI-CHAT-TOOLS-002 — Built-in fs.write creates file
- **Steps:** prompt "create hello.txt with 'hi'"
- **Expected:** file appears in editor tree; tool_end success; Yjs broadcast emitted
- **Severity:** smoke

## TC-AI-CHAT-TOOLS-003 — fs.write to forbidden path rejected
- **Steps:** prompt to write `/etc/passwd`
- **Expected:** tool_end error path-out-of-sandbox; no FS modification
- **Severity:** critical

## TC-AI-CHAT-TOOLS-004 — fs.read of binary returns base64 OR refusal
- **Steps:** prompt to read .png
- **Expected:** result truncated/base64 OR refusal with reason
- **Severity:** medium

## TC-AI-CHAT-TOOLS-005 — Shell tool runs allowed cmd
- **Pre:** sandbox enabled
- **Steps:** prompt "run npm --version"
- **Expected:** tool runs; stdout returned; exit=0
- **Severity:** high

## TC-AI-CHAT-TOOLS-006 — Shell tool blocks blacklisted cmd
- **Steps:** prompt "rm -rf /"
- **Expected:** policy denial; nothing executed
- **Severity:** critical

## TC-AI-CHAT-TOOLS-007 — Shell timeout caps long-running cmd
- **Pre:** maxToolTimeout=30s
- **Steps:** prompt "sleep 60"
- **Expected:** tool killed at 30s; tool_end error timeout
- **Severity:** high

## TC-AI-CHAT-TOOLS-008 — Tool result schema validated
- **Steps:** capture tool_end payload
- **Expected:** matches `{toolCallId, name, status, output, error?}` schema
- **Severity:** medium

## TC-AI-CHAT-TOOLS-009 — Tool result wrapped via textResultForLlm
- **Steps:** debug log internal LLM input
- **Expected:** wrapper string format `<tool_result name="..."> ... </tool_result>` matches expected
- **Severity:** medium

## TC-AI-CHAT-TOOLS-010 — Tool error surfaces as result, not stream error
- **Pre:** tool throws
- **Expected:** SSE `tool_end` with status="error"; LLM sees error text and may retry
- **Severity:** high

## TC-AI-CHAT-TOOLS-011 — Tool retry by LLM bounded
- **Pre:** tool always errors
- **Expected:** LLM retries ≤ 3 times then gives up gracefully; assistant explains
- **Severity:** medium

## TC-AI-CHAT-TOOLS-012 — UI renders tool card with name + duration
- **Steps:** observe rendered chat
- **Expected:** card shows tool name, args summary, duration ms, status badge
- **Severity:** smoke

## TC-AI-CHAT-TOOLS-013 — Tool card collapses long output
- **Pre:** tool output 200KB
- **Expected:** UI shows collapsed snippet with "expand" button; performance ok
- **Severity:** medium

## TC-AI-CHAT-TOOLS-014 — Tool card shows error stacktrace when error
- **Expected:** error formatted with mono font; copy button works
- **Severity:** low

## TC-AI-CHAT-TOOLS-015 — MCP tool registered into chat
- **Pre:** mcp connector with tool `getRow`
- **Steps:** prompt "fetch row 5"
- **Expected:** tool_start with mcp_connector_id; result rendered
- **Severity:** smoke

## TC-AI-CHAT-TOOLS-016 — MCP tool not registered when connector disabled
- **Pre:** disable connector
- **Expected:** tool absent from registry; assistant explains capability gap
- **Severity:** high

## TC-AI-CHAT-TOOLS-017 — MCP server crash mid-tool
- **Pre:** stdio MCP server killed mid-call
- **Steps:** trigger tool
- **Expected:** SSE `tool_end` error connector_unavailable; ConnectorManager attempts respawn
- **Severity:** high

## TC-AI-CHAT-TOOLS-018 — MCP HTTP transport tool invocation
- **Pre:** http MCP connector configured
- **Steps:** invoke
- **Expected:** outbound request signed JWT; tool result returned
- **Severity:** high

## TC-AI-CHAT-TOOLS-019 — MCP tool list_tools refreshed on connector update
- **Steps:** PATCH connector config; observe registry
- **Expected:** tools reloaded; new tools appear in next session
- **Severity:** medium

## TC-AI-CHAT-TOOLS-020 — Tool call denied by workspace policy
- **Pre:** policy disallows fs.write
- **Steps:** prompt to write
- **Expected:** tool not exposed to LLM; if LLM still attempts (hallucination), policy gate returns denial
- **Severity:** critical

## TC-AI-CHAT-TOOLS-021 — Concurrent tool calls within one assistant turn
- **Pre:** prompt requiring 3 parallel reads
- **Expected:** SDK dispatches concurrently; all results aggregated; no interleaving in event order
- **Severity:** medium

## TC-AI-CHAT-TOOLS-022 — Tool call args truncated if oversize
- **Pre:** args 5MB
- **Expected:** truncated or rejected with clear error; not pushed to LLM as-is
- **Severity:** medium

## TC-AI-CHAT-TOOLS-023 — Tool result with PII redacted in logs (if enabled)
- **Pre:** redaction enabled
- **Expected:** logs show `<redacted email>`; UI sees full
- **Severity:** medium

## TC-AI-CHAT-TOOLS-024 — Tool call audit log row written
- **Steps:** inspect audit/connector_audit
- **Expected:** row per tool call with userId, sessionId, toolName, durationMs, status
- **Severity:** medium

## TC-AI-CHAT-TOOLS-025 — Tool spinner removed when tool_end received
- **Steps:** UI behavior on tool_end
- **Expected:** spinner replaced with status icon; collapsed by default
- **Severity:** smoke

## TC-AI-CHAT-TOOLS-026 — Tool call cancelled when user aborts
- **Steps:** abort during tool_start
- **Expected:** server signals cancel to tool; tool releases resources; SSE done with status=aborted
- **Severity:** high

## TC-AI-CHAT-TOOLS-027 — Tool call resumed not supported (idempotency)
- **Steps:** retry after abort with idempotency-key
- **Expected:** new tool call (no resume); server documents behavior
- **Severity:** low

## TC-AI-CHAT-TOOLS-028 — Tool registry includes integration tools (Activepieces)
- **Pre:** integration connected (e.g. github)
- **Steps:** list tools
- **Expected:** github.listIssues etc. appear
- **Severity:** high

## TC-AI-CHAT-TOOLS-029 — Integration tool routes via /__doable/connector-proxy
- **Steps:** observe network logs
- **Expected:** outbound goes via connector proxy with signed JWT; not direct
- **Severity:** high

## TC-AI-CHAT-TOOLS-030 — Tool result token cost included in usage
- **Steps:** inspect usage_log
- **Expected:** prompt_tokens includes tool result text; reflected in totals
- **Severity:** medium

## TC-AI-CHAT-TOOLS-031 — Tool with large result triggers context truncation
- **Pre:** 100k token output
- **Expected:** server truncates per policy (e.g. last 32k); flagged in metadata
- **Severity:** medium

## TC-AI-CHAT-TOOLS-032 — Tool call name appears in chat history export
- **Steps:** export session
- **Expected:** export includes tool calls with name + status
- **Severity:** low

## TC-AI-CHAT-TOOLS-033 — Tool failure displayed inline in assistant message
- **Steps:** observe rendering
- **Expected:** failed tool shown red; suggestion to retry
- **Severity:** medium

## TC-AI-CHAT-TOOLS-034 — fs.delete tool requires confirmation in UI
- **Steps:** assistant proposes delete
- **Expected:** UI confirmation dialog before deletion executes
- **Severity:** high

## TC-AI-CHAT-TOOLS-035 — fs.delete on non-existent file
- **Steps:** invoke
- **Expected:** tool_end with idempotent success or notFound; consistent
- **Severity:** low

## TC-AI-CHAT-TOOLS-036 — Tool result includes `truncated:true` flag when needed
- **Expected:** flag visible in UI tooltip; export reflects flag
- **Severity:** low

## TC-AI-CHAT-TOOLS-037 — Multi-tool dependency: read then write
- **Steps:** prompt "edit README to add line"
- **Expected:** fs.read then fs.write; both succeed; file content updated
- **Severity:** smoke

## TC-AI-CHAT-TOOLS-038 — Yjs editor reflects fs.write within 5s
- **Pre:** editor open in tab; agent writes file
- **Expected:** Yjs propagates change within 5s; user sees update
- **Severity:** high

## TC-AI-CHAT-TOOLS-039 — Tool registry caches per session
- **Steps:** rapid second prompt
- **Expected:** registry rebuild not on every call; cached snapshot used
- **Severity:** low

## TC-AI-CHAT-TOOLS-040 — Tool definitions schema valid JSON Schema
- **Steps:** GET /chat/tools
- **Expected:** each tool has valid jsonSchema for inputSchema/outputSchema
- **Severity:** low

## TC-AI-CHAT-TOOLS-041 — Tool args validation rejects malformed JSON
- **Pre:** LLM emits invalid args
- **Expected:** tool not invoked; error returned to LLM for retry
- **Severity:** medium

## TC-AI-CHAT-TOOLS-042 — Required arg missing → validation error
- **Steps:** force LLM to call without required field
- **Expected:** validator fails; error to LLM; LLM retries with corrected args
- **Severity:** medium

## TC-AI-CHAT-TOOLS-043 — Tool name collision across connectors disambiguated
- **Pre:** two MCP connectors both expose `search`
- **Expected:** tools namespaced by connector id; no collision
- **Severity:** medium

## TC-AI-CHAT-TOOLS-044 — Tool denylist via env var honored
- **Pre:** TOOL_DENYLIST="shell.exec"
- **Expected:** tool absent from registry
- **Severity:** medium

## TC-AI-CHAT-TOOLS-045 — Tool allowlist mode strict
- **Pre:** TOOL_ALLOWLIST set
- **Expected:** only allowlisted tools exposed
- **Severity:** medium

## TC-AI-CHAT-TOOLS-046 — Tool result link to file opens in editor
- **Steps:** click tool card link
- **Expected:** editor jumps to file at line if range provided
- **Severity:** low

## TC-AI-CHAT-TOOLS-047 — Tool memory limit enforced
- **Pre:** RSS cap=500MB
- **Steps:** tool consumes 600MB
- **Expected:** killed; error reported
- **Severity:** medium

## TC-AI-CHAT-TOOLS-048 — Tool can't escape sandbox via symlink
- **Pre:** symlink in project to /etc
- **Steps:** fs.read via symlink
- **Expected:** rejected; resolves outside project root
- **Severity:** critical

## TC-AI-CHAT-TOOLS-049 — Tool result preserves UTF-8 multi-byte
- **Pre:** file with emoji + CJK
- **Expected:** result bytes preserved; no mojibake
- **Severity:** low

## TC-AI-CHAT-TOOLS-050 — Tool call streaming partial output (where supported)
- **Pre:** tool that streams stdout
- **Expected:** SSE emits intermediate `tool_progress` events; final tool_end
- **Severity:** medium
