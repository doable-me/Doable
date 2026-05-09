# TC-MCP-BUILTIN — Built-in connectors (Supabase, GitHub)

Specific tests for shipped built-in MCP connectors.

## TC-MCP-BUILTIN-001 — Supabase connector starts (smoke)
- **Severity:** smoke

## TC-MCP-BUILTIN-002 — Supabase listTables tool present
- **Severity:** smoke

## TC-MCP-BUILTIN-003 — Supabase queryRow returns row
- **Severity:** smoke

## TC-MCP-BUILTIN-004 — Supabase upsertRow respects RLS
- **Severity:** high

## TC-MCP-BUILTIN-005 — Supabase DDL not exposed by default (PostgREST limitation)
- **Severity:** high

## TC-MCP-BUILTIN-006 — Supabase connector requires user-supplied URL+key
- **Severity:** high

## TC-MCP-BUILTIN-007 — Supabase invalid url shows clear error
- **Severity:** medium

## TC-MCP-BUILTIN-008 — Supabase service role key handling secured
- **Severity:** critical

## TC-MCP-BUILTIN-009 — GitHub connector starts (smoke)
- **Severity:** smoke

## TC-MCP-BUILTIN-010 — GitHub listIssues tool
- **Severity:** smoke

## TC-MCP-BUILTIN-011 — GitHub createIssue tool
- **Severity:** high

## TC-MCP-BUILTIN-012 — GitHub commentIssue tool
- **Severity:** medium

## TC-MCP-BUILTIN-013 — GitHub OAuth flow per environment OAuth app
- **Severity:** high

## TC-MCP-BUILTIN-014 — GitHub repo whitelist restricts access
- **Severity:** high

## TC-MCP-BUILTIN-015 — GitHub clones repo into project sandbox
- **Severity:** medium

## TC-MCP-BUILTIN-016 — GitHub fork+PR workflow
- **Severity:** medium

## TC-MCP-BUILTIN-017 — GitHub rate limit surfaced gracefully
- **Severity:** medium

## TC-MCP-BUILTIN-018 — GitHub revoke leaves clone in workspace; further actions disabled
- **Severity:** medium

## TC-MCP-BUILTIN-019 — Supabase connector debug logs visible to admin
- **Severity:** medium

## TC-MCP-BUILTIN-020 — GitHub connector debug logs visible to admin
- **Severity:** medium

## TC-MCP-BUILTIN-021 — Built-in connectors not deletable, only disablable
- **Severity:** medium

## TC-MCP-BUILTIN-022 — Built-in connectors auto-update on app version bump
- **Severity:** low

## TC-MCP-BUILTIN-023 — Built-in connector version visible in /mcp/connectors
- **Severity:** low

## TC-MCP-BUILTIN-024 — Built-in connectors honor workspace tool overrides
- **Severity:** medium

## TC-MCP-BUILTIN-025 — Disable Supabase removes its tools from chat registry
- **Severity:** high

## TC-MCP-BUILTIN-026 — Disable GitHub removes its tools from chat registry
- **Severity:** high

## TC-MCP-BUILTIN-027 — Re-enable rebuilds tools without re-OAuth (when tokens valid)
- **Severity:** medium

## TC-MCP-BUILTIN-028 — Built-in connector schema upgrades back-compat
- **Severity:** medium

## TC-MCP-BUILTIN-029 — Supabase MCP error: invalid query handled
- **Severity:** medium

## TC-MCP-BUILTIN-030 — GitHub MCP error: 404 repo handled
- **Severity:** medium
