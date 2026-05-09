# TC-AI-CHAT-CONTEXT — Context injection (project files, env vars, integrations)

Covers what context the API injects into prompts: open files, project metadata, env var summary, available integrations and their action descriptors, system prompts, memory.

## TC-AI-CHAT-CONTEXT-001 — Open file content included (smoke)
- **Pre:** README.md open in editor; session linked to project
- **Steps:** prompt "summarize what's open"
- **Expected:** assistant references README contents accurately
- **Severity:** smoke

## TC-AI-CHAT-CONTEXT-002 — Multiple open tabs all included
- **Pre:** 3 files open
- **Steps:** prompt about all
- **Expected:** assistant references each tab; debug log shows all 3 in prompt
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-003 — Active selection prioritized
- **Pre:** highlight 20 lines in file
- **Steps:** prompt "explain selection"
- **Expected:** assistant focuses on selection range
- **Severity:** high

## TC-AI-CHAT-CONTEXT-004 — Context excludes binary files
- **Pre:** project has .png
- **Expected:** images not stuffed into prompt as text
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-005 — Context truncated to model token budget
- **Pre:** project too large
- **Expected:** server truncates oldest first; metadata logs `contextTruncated:true`
- **Severity:** high

## TC-AI-CHAT-CONTEXT-006 — Project metadata (name, description) injected
- **Steps:** debug prompt
- **Expected:** prompt contains project.name and short description
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-007 — Workspace name + role injected
- **Expected:** prompt mentions workspace name and user role for permission awareness
- **Severity:** low

## TC-AI-CHAT-CONTEXT-008 — Env vars summary included (keys only, not values)
- **Pre:** project has secrets DB_URL, API_KEY
- **Expected:** prompt lists keys only, never values
- **Severity:** critical

## TC-AI-CHAT-CONTEXT-009 — Env var values never leak via tool output
- **Steps:** prompt "echo $API_KEY"
- **Expected:** tool result redacted or refused
- **Severity:** critical

## TC-AI-CHAT-CONTEXT-010 — Available integrations advertised
- **Pre:** github + supabase connected
- **Expected:** prompt enumerates connectors and key actions
- **Severity:** high

## TC-AI-CHAT-CONTEXT-011 — Disabled integrations excluded
- **Pre:** github disabled
- **Expected:** github actions absent from prompt
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-012 — System prompt loaded by mode
- **Steps:** debug log
- **Expected:** mode-specific system prompt prepended
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-013 — Workspace AI settings (style, persona) included
- **Pre:** style="concise"; persona="senior engineer"
- **Expected:** style/persona text in system block
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-014 — Long file in context split with anchor labels
- **Steps:** debug
- **Expected:** sections labeled `<file path="x" range="0-200">`
- **Severity:** low

## TC-AI-CHAT-CONTEXT-015 — Recent error logs (last build) injected if available
- **Pre:** build failed in last 10 min
- **Expected:** error excerpt in context
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-016 — Memory items injected
- **Pre:** memory.append "user prefers TypeScript"
- **Expected:** memory line in system prompt
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-017 — Memory size capped (oldest pruned)
- **Pre:** 1000 memory items
- **Expected:** prompt only includes top N (e.g. 50); audit logs which were dropped
- **Severity:** low

## TC-AI-CHAT-CONTEXT-018 — Multi-turn context retains earlier user messages
- **Pre:** 5 prior turns
- **Expected:** each subsequent turn sees rolling window of prior messages
- **Severity:** smoke

## TC-AI-CHAT-CONTEXT-019 — Context window slides as turns grow
- **Pre:** 50 turns
- **Expected:** early turns summarized; recent verbatim
- **Severity:** high

## TC-AI-CHAT-CONTEXT-020 — Conversation summary regenerated periodically
- **Pre:** every N turns
- **Expected:** summary message synthesized; stored in session.metadata
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-021 — Tool results included in subsequent turns
- **Steps:** turn 1 reads file; turn 2 references content
- **Expected:** turn 2 has tool result in context
- **Severity:** smoke

## TC-AI-CHAT-CONTEXT-022 — Context excludes hidden files (.git, node_modules)
- **Expected:** prompt enumerates files but excludes ignored
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-023 — gitignore patterns honored
- **Pre:** .gitignore excludes /dist
- **Expected:** dist files not auto-included
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-024 — Custom .doableignore honored
- **Pre:** .doableignore excludes /private
- **Expected:** files not in context
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-025 — Force-include via @-mention overrides ignore
- **Steps:** prompt "@/private/x.ts please review"
- **Expected:** included with explicit user override note
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-026 — @-mention file expands inline
- **Steps:** prompt with `@README.md`
- **Expected:** README content embedded in prompt; UI shows chip
- **Severity:** smoke

## TC-AI-CHAT-CONTEXT-027 — @-mention non-existent file warns
- **Steps:** `@nofile.md`
- **Expected:** UI shows red chip; assistant told file missing
- **Severity:** low

## TC-AI-CHAT-CONTEXT-028 — Context refresh on file save
- **Pre:** edit file; save
- **Steps:** send next message
- **Expected:** new content used, not stale
- **Severity:** high

## TC-AI-CHAT-CONTEXT-029 — Context refresh on Yjs remote update
- **Pre:** collaborator edits file
- **Steps:** send message
- **Expected:** latest Yjs state used
- **Severity:** high

## TC-AI-CHAT-CONTEXT-030 — Context excludes very recently created throwaway files
- **Pre:** unsaved buffer
- **Expected:** unsaved buffer included only if explicitly @-mentioned
- **Severity:** low

## TC-AI-CHAT-CONTEXT-031 — Workspace-level memory (RAG) included
- **Pre:** vector store has workspace docs
- **Steps:** prompt question covered by RAG
- **Expected:** RAG retrieved chunks injected with citations
- **Severity:** high

## TC-AI-CHAT-CONTEXT-032 — RAG query logged
- **Steps:** inspect ai_usage_log
- **Expected:** entry includes rag_query and chunk_ids
- **Severity:** low

## TC-AI-CHAT-CONTEXT-033 — RAG returns 0 docs gracefully
- **Pre:** empty vector store
- **Expected:** assistant proceeds without RAG; no error
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-034 — Context size visible to user (debug panel)
- **Steps:** open debug panel
- **Expected:** shows tokens in/out, files included, mode
- **Severity:** low

## TC-AI-CHAT-CONTEXT-035 — Date/time injected for time-sensitive Q
- **Steps:** ask "what date?"
- **Expected:** prompt has currentDate; assistant answers correctly
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-036 — User locale injected
- **Pre:** locale=fr-FR
- **Expected:** assistant replies in French (per system prompt instruction)
- **Severity:** low

## TC-AI-CHAT-CONTEXT-037 — Project framework hint injected
- **Pre:** detected Next.js
- **Expected:** prompt contains framework hint; assistant tailors advice
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-038 — Open issues from connected GitHub injected
- **Pre:** github connector connected
- **Steps:** prompt "what are open issues"
- **Expected:** lists from connector via tool, not stale context
- **Severity:** medium

## TC-AI-CHAT-CONTEXT-039 — Stale context after integration revoked
- **Pre:** revoke github mid-session
- **Steps:** next prompt
- **Expected:** github actions removed from context; assistant explains
- **Severity:** high

## TC-AI-CHAT-CONTEXT-040 — Cross-session contamination prevented
- **Steps:** sessionA, sessionB; ensure separate
- **Expected:** sessionB sees no sessionA history
- **Severity:** critical
