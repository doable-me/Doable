# TC-AI-CHAT-MODES — Chat session modes (agent / plan / chat)

Covers mode behaviors: tool access, system prompts, mode switching, and per-mode UX guarantees.

## TC-AI-CHAT-MODES-001 — Agent mode allows tool calls (smoke)
- **Pre:** agent session; project has files
- **Steps:** prompt "list files in src"
- **Expected:** SSE emits `tool_start` for filesystem tool; tool_end with result; assistant cites files
- **Severity:** smoke

## TC-AI-CHAT-MODES-002 — Plan mode emits structured plan only
- **Steps:** prompt "implement login"
- **Expected:** assistant returns numbered plan; no `tool_start` events; metadata.kind="plan"
- **Severity:** smoke

## TC-AI-CHAT-MODES-003 — Chat mode does not access project files
- **Steps:** ask "what's in package.json"
- **Expected:** assistant explains it has no file access in chat mode; no tool events
- **Severity:** high

## TC-AI-CHAT-MODES-004 — Switch session mode via PATCH
- **Steps:** PATCH /chat/sessions/:id `{mode:"plan"}`
- **Expected:** 200; subsequent messages use plan mode
- **Severity:** high

## TC-AI-CHAT-MODES-005 — Mode switch mid-session preserves history
- **Pre:** 5 messages in agent mode
- **Steps:** switch to plan; send message
- **Expected:** prior history retained; new turn behaves in plan mode
- **Severity:** medium

## TC-AI-CHAT-MODES-006 — Per-message mode override
- **Steps:** session is agent; POST `{mode:"chat"}` for one message
- **Expected:** that message handled as chat; session default unchanged
- **Severity:** medium

## TC-AI-CHAT-MODES-007 — Plan mode blocks file write tools
- **Steps:** prompt "create file foo.ts"
- **Expected:** assistant outputs plan; no write tool call attempted
- **Severity:** high

## TC-AI-CHAT-MODES-008 — Plan-to-execute handoff creates agent run
- **Steps:** click "Run plan" button after plan mode message
- **Expected:** new agent message created referencing plan id; tools execute
- **Severity:** high

## TC-AI-CHAT-MODES-009 — Agent mode honors workspace AI settings
- **Pre:** workspace setting `disable_writes=true`
- **Steps:** agent prompt "write file"
- **Expected:** write tools filtered from registry; assistant explains restriction
- **Severity:** high

## TC-AI-CHAT-MODES-010 — Chat mode allows web search (if integration enabled)
- **Pre:** web_search MCP connector enabled
- **Steps:** ask current event question
- **Expected:** assistant uses web_search tool; renders citations
- **Severity:** medium

## TC-AI-CHAT-MODES-011 — Mode persisted across reload
- **Steps:** set mode plan; reload editor
- **Expected:** UI reflects plan mode; new messages still plan
- **Severity:** medium

## TC-AI-CHAT-MODES-012 — Invalid mode in PATCH rejected
- **Steps:** PATCH `{mode:"chaos"}`
- **Expected:** HTTP 400 enum error
- **Severity:** low

## TC-AI-CHAT-MODES-013 — Mode-specific system prompt loaded
- **Steps:** inspect debug logs
- **Expected:** system prompt for agent contains tool list; for plan contains plan template; for chat contains conversation guidance
- **Severity:** medium

## TC-AI-CHAT-MODES-014 — Switching mode while stream in flight
- **Steps:** POST agent message; immediately PATCH mode
- **Expected:** in-flight completes in original mode; switch effective for next turn
- **Severity:** medium

## TC-AI-CHAT-MODES-015 — Plan mode caps token output
- **Steps:** prompt requiring long output
- **Expected:** plan truncated to configured maxTokens; user prompted to expand
- **Severity:** low

## TC-AI-CHAT-MODES-016 — Agent mode iterative tool loop bounded
- **Pre:** prompt that would chain 50 tool calls
- **Expected:** loop bounded by configured maxIterations; final message states truncation reason
- **Severity:** high

## TC-AI-CHAT-MODES-017 — Mode in URL query overrides session default
- **Steps:** POST `?mode=chat` with session in agent
- **Expected:** message handled in chat mode
- **Severity:** low

## TC-AI-CHAT-MODES-018 — Read-only viewer cannot switch mode
- **Pre:** user role = viewer
- **Steps:** PATCH mode
- **Expected:** HTTP 403
- **Severity:** high

## TC-AI-CHAT-MODES-019 — Mode-specific credit cost honored
- **Pre:** plan mode costs 1, agent costs 2 (config)
- **Steps:** send in each mode
- **Expected:** credits deducted per config
- **Severity:** medium

## TC-AI-CHAT-MODES-020 — UI shows mode indicator chip
- **Steps:** open editor; observe header
- **Expected:** chip displays current mode; clickable dropdown
- **Severity:** smoke

## TC-AI-CHAT-MODES-021 — Mode dropdown lists only enabled modes
- **Pre:** workspace disables `plan`
- **Steps:** open mode picker
- **Expected:** dropdown excludes plan
- **Severity:** medium

## TC-AI-CHAT-MODES-022 — Default mode for new session
- **Steps:** create new session via API without mode
- **Expected:** mode defaults to `agent`
- **Severity:** medium

## TC-AI-CHAT-MODES-023 — Plan mode message export includes plan markdown
- **Steps:** export session JSON
- **Expected:** plan messages contain raw markdown plan + parsed steps
- **Severity:** low

## TC-AI-CHAT-MODES-024 — Mode change emits realtime event
- **Steps:** PATCH mode while WS connected
- **Expected:** WS broadcasts `session.mode_changed` to subscribers
- **Severity:** low

## TC-AI-CHAT-MODES-025 — Multiple browsers see same mode
- **Steps:** change mode in tab A; tab B observes
- **Expected:** tab B updates within 2s via WS
- **Severity:** medium

## TC-AI-CHAT-MODES-026 — Plan mode disables when no project
- **Pre:** workspace-level chat session (no project)
- **Steps:** open mode dropdown
- **Expected:** plan disabled with tooltip explaining project required
- **Severity:** low

## TC-AI-CHAT-MODES-027 — Chat mode supports system prompt override
- **Steps:** POST with `systemPromptOverride:"act as pirate"`
- **Expected:** assistant adopts persona for that turn; override stored on message
- **Severity:** medium

## TC-AI-CHAT-MODES-028 — Mode switch logged to audit
- **Steps:** PATCH mode and inspect audit
- **Expected:** audit row records who/when/from→to
- **Severity:** low

## TC-AI-CHAT-MODES-029 — Plan mode does not invoke MCP write tools
- **Pre:** mcp tool with category=write
- **Steps:** plan prompt
- **Expected:** write tools omitted from prompt; assistant doesn't call them
- **Severity:** high

## TC-AI-CHAT-MODES-030 — Agent mode honors per-tool allowlist
- **Pre:** workspace allows only `fs.read`,`fs.write`
- **Steps:** prompt "search github"
- **Expected:** github tool absent; assistant explains capability gap
- **Severity:** high

## TC-AI-CHAT-MODES-031 — Mode persists when duplicating session
- **Steps:** POST /chat/sessions/:id/duplicate
- **Expected:** new session inherits mode
- **Severity:** low

## TC-AI-CHAT-MODES-032 — Mode toggle disabled when stream active
- **Steps:** UI: stream running; click mode dropdown
- **Expected:** disabled with spinner tooltip
- **Severity:** low

## TC-AI-CHAT-MODES-033 — Plan mode renders steps as checkboxes
- **Steps:** observe plan render
- **Expected:** numbered list with checkbox UI; click to mark step done
- **Severity:** medium

## TC-AI-CHAT-MODES-034 — Agent mode shows tool spinner
- **Steps:** trigger tool
- **Expected:** UI shows tool name + spinner during tool_start→tool_end
- **Severity:** smoke

## TC-AI-CHAT-MODES-035 — Chat mode disables file picker UI
- **Steps:** open attachment picker in chat mode
- **Expected:** picker still works for documents (csv/pdf etc.) but project file references hidden
- **Severity:** low

## TC-AI-CHAT-MODES-036 — Mode list available via GET /chat/modes
- **Steps:** GET endpoint
- **Expected:** returns array `[{id,label,description,enabled}]`
- **Severity:** medium

## TC-AI-CHAT-MODES-037 — Mode-specific token limits enforced
- **Pre:** plan max=4k, agent max=16k
- **Steps:** prompt large output in each
- **Expected:** caps applied; metadata records truncation
- **Severity:** medium

## TC-AI-CHAT-MODES-038 — Switch from chat to agent unlocks tools
- **Steps:** chat mode message then switch to agent and ask file question
- **Expected:** subsequent prompt successfully invokes tools
- **Severity:** medium

## TC-AI-CHAT-MODES-039 — Plan mode prompt template includes recent history summary
- **Steps:** session with 10 prior messages → plan
- **Expected:** plan synthesis references prior context in summary block
- **Severity:** low

## TC-AI-CHAT-MODES-040 — Default mode configurable per workspace
- **Pre:** admin sets `defaultChatMode=plan`
- **Steps:** new session
- **Expected:** session created with mode=plan
- **Severity:** medium
