# TC-18: AI Chat + Settings Integration — End-to-End Test Suite

> **Goal-oriented**: These tests verify that Environments, MCP Servers, and Knowledge settings
> ACTUALLY take effect during AI chat interactions — not just that the UI works.
> Every setting is meaningless unless proven to change AI behavior in real conversations.

## Critical Principle

**Settings without AI chat verification = untested.**  
Every UI configuration must be validated by its impact on actual AI response content,
tool usage, code generation, or behavior.

---

## 18.1 Full Stack Integration: Environment → AI Chat (P0)

### TC-18.1.1 — Custom environment with skill affects AI behavior
- **Steps**:
  1. Create workspace skill: "Always add aria labels to interactive elements"
  2. Create environment "Accessible React" → add the skill
  3. Assign environment to project
  4. Open project chat → send: "Create a button component"
- **Expected**: Generated button has `aria-label` attribute. Skill from environment reached AI context.

### TC-18.1.2 — Custom environment with rule affects AI behavior
- **Steps**:
  1. Create workspace rule: "Maximum 50 lines per function. Split larger functions."
  2. Create environment "Clean Code" → add the rule
  3. Assign to project → chat: "Build a complex form handler"
- **Expected**: AI splits logic into functions ≤50 lines each. Rule enforced.

### TC-18.1.3 — Custom environment with knowledge affects AI behavior
- **Steps**:
  1. Create environment "E-Commerce" → add knowledge file `products.md`:
     ```
     Our API returns products at GET /api/products
     Fields: id, name, price (in cents), category, image_url
     ```
  2. Assign to project → chat: "Show a product listing"
- **Expected**: AI fetches from `/api/products` (not a made-up URL). Displays price converted from cents. Uses correct field names.

### TC-18.1.4 — Custom environment with instruction affects AI behavior
- **Steps**:
  1. Create environment → add instruction "error-handling.md":
     ```
     All async operations MUST be wrapped in try/catch.
     Show user-friendly error messages via toast notifications.
     Log errors to console.error with error details.
     ```
  2. Assign to project → chat: "Add data fetching to the homepage"
- **Expected**: Generated code has try/catch around fetch. Toast notification on error. console.error with details.

### TC-18.1.5 — Custom environment with connector filter affects available tools
- **Steps**:
  1. Add 2 MCP connectors: "Server A" and "Server B"
  2. Create environment → reference ONLY "Server A"
  3. Assign to project → chat: "What MCP tools do you have?"
- **Expected**: Only Server A tools listed. Server B tools NOT available. Connector filtering works.

### TC-18.1.6 — Switch project environment mid-conversation
- **Steps**:
  1. Assign Env A (with "Use Vue.js" knowledge) → chat → get Vue code
  2. Switch to Env B (with "Use React" knowledge) via project settings
  3. Chat: "Refactor to use the project's framework"
- **Expected**: AI now generates React code (not Vue). Environment switch affected AI context.

---

## 18.2 Full Stack Integration: MCP Server → AI Chat (P0)

### TC-18.2.1 — End-to-end: Add server → Test → AI uses tool
- **Steps**:
  1. Navigate to `/workspace-settings?tab=mcp`
  2. Click "Add MCP Server"
  3. Fill: Name="Test MCP", Transport=stdio, Command=`npx`, Args=`-y, @modelcontextprotocol/server-everything`
  4. Submit → click "Test" on the new card
  5. Wait for status "active" and tool list to appear
  6. Open a project → chat: "Use the echo MCP tool to say 'integration test passed'"
- **Expected**: Full flow works. MCP echo tool called. Response: "integration test passed".

### TC-18.2.2 — End-to-end: Add server → AI does math
- **Steps**: With Everything server active → chat: "What is 256 + 512? Use the MCP add tool."
- **Expected**: AI calls `mcp_test_mcp_add` with `{a: 256, b: 512}`. Response confirms 768.

### TC-18.2.3 — End-to-end: Server down → graceful failure
- **Steps**:
  1. Add stdio server pointing to `nonexistent-command-xyz`
  2. Don't test it (or test fails)
  3. Chat: "Use the echo tool"
- **Expected**: AI either doesn't see the tools (inactive connector) OR reports graceful error. No crash.

### TC-18.2.4 — MCP tool call visible in chat timeline
- **Steps**: Trigger any MCP tool call via chat.
- **Expected**: Chat shows:
  1. User message
  2. AI thinking/reasoning
  3. Tool call block: `mcp_test_mcp_echo({message: "..."})` with result
  4. AI response incorporating tool result

### TC-18.2.5 — MCP tool alongside file creation
- **Steps**: Chat: "Use the echo MCP tool to say 'hello' and then create a file called greeting.txt with the echoed text"
- **Expected**: AI calls MCP echo tool, gets "hello", then calls create_file tool to create greeting.txt with "hello" content. Both tool calls shown.

---

## 18.3 Full Stack Integration: Knowledge → AI Chat (P0)

### TC-18.3.1 — End-to-end: Edit identity.md → AI changes personality
- **Steps**:
  1. Open project → Knowledge panel → edit identity.md:
     ```
     # Identity
     ## Name: PirateShip
     ## Personality: Talk like a pirate. Use nautical terms.
     ```
  2. Save → chat: "What project am I working on?"
- **Expected**: AI responds mentioning "PirateShip" with pirate-themed language ("Ahoy!", "ye be workin' on...").

### TC-18.3.2 — End-to-end: Edit soul.md → AI changes design output
- **Steps**:
  1. Edit soul.md: "Brutalist design. Raw HTML. No CSS frameworks. System fonts only."
  2. Save → chat: "Create a portfolio page"
- **Expected**: AI generates raw HTML with minimal/no CSS. System fonts. Brutalist aesthetic. No Tailwind or styled-components.

### TC-18.3.3 — End-to-end: Edit instructions.md → AI follows rules
- **Steps**:
  1. Edit instructions.md: "Every function must start with a comment explaining what it does. Use camelCase for all variables."
  2. Save → chat: "Create utility functions for string manipulation"
- **Expected**: Every generated function has a leading comment. All variables in camelCase.

### TC-18.3.4 — End-to-end: Empty all knowledge → AI responds generically
- **Steps**:
  1. Clear content from identity.md, soul.md, instructions.md, knowledge.md (save empty)
  2. Chat: "Build a login form"
- **Expected**: AI generates generic login form without any project-specific styling, naming, or constraints. Works but is generic.

### TC-18.3.5 — End-to-end: Knowledge about API endpoints → AI generates correct fetch code
- **Steps**:
  1. Edit knowledge.md:
     ```
     ## API Endpoints
     - GET /api/v2/users → Returns {users: [{id, name, email}]}
     - POST /api/v2/users → Body: {name, email} → Returns {user: {id, name, email}}
     - Auth: Bearer token in Authorization header
     ```
  2. Chat: "Build a user list that fetches from our API"
- **Expected**: AI uses exact endpoints `/api/v2/users`. Uses `{users: [{id, name, email}]}` response shape. Includes `Authorization: Bearer` header. Not generic `fetch('/users')`.

---

## 18.4 Combined Settings: Knowledge + Environment + MCP (P0)

### TC-18.4.1 — All three working together
- **Steps**:
  1. Set knowledge.md: "Backend is PostgreSQL. Schema: users(id, name, email)"
  2. Create environment "Backend Dev" with rule: "All SQL must use parameterized queries"
  3. Add MCP connector (e.g., database server or test server)
  4. Assign environment to project
  5. Chat: "Query all users from the database"
- **Expected**: AI uses parameterized query (from rule), references users table with correct columns (from knowledge), and may use MCP tools if available.

### TC-18.4.2 — Environment filter hides MCP tools, knowledge still works
- **Steps**:
  1. Add 2 MCP connectors
  2. Create environment that references 0 connectors (empty connectorRefs)
  3. Add knowledge and instructions to environment
  4. Assign to project → chat
- **Expected**: NO MCP tools available (connector filter = empty). Knowledge and instructions still injected and followed.

### TC-18.4.3 — Switch environment: different knowledge + different connectors
- **Steps**:
  1. Env A: knowledge="Use REST", connector=Server-A
  2. Env B: knowledge="Use GraphQL", connector=Server-B
  3. Assign Env A → chat → see REST + Server-A tools
  4. Switch to Env B → chat → see GraphQL + Server-B tools
- **Expected**: Complete context switch. AI follows new environment rules after switch.

---

## 18.5 Workspace vs Project Knowledge Override (P0)

### TC-18.5.1 — Workspace knowledge inherited by default
- **Steps**:
  1. Set workspace-level knowledge.md: "All projects use TypeScript 5.x."
  2. Create new project (no overrides) → chat: "What language should I use?"
- **Expected**: AI recommends TypeScript 5.x. Workspace knowledge inherited.

### TC-18.5.2 — Project knowledge overrides workspace (replace files)
- **Steps**:
  1. Workspace identity.md: "Part of AcmeCorp"
  2. Project identity.md: "Independent Project Alpha"
  3. Chat: "What project is this?"
- **Expected**: AI says "Project Alpha" (project replaces workspace identity).

### TC-18.5.3 — Project knowledge appends to workspace (append files)
- **Steps**:
  1. Workspace instructions.md: "Always use ESLint"
  2. Project instructions.md: "Use Prettier for formatting"
  3. Chat: "Set up code quality tools"
- **Expected**: AI sets up BOTH ESLint (workspace) AND Prettier (project). Append strategy.

---

## 18.6 Mode-Specific Behavior with Knowledge (P1)

### TC-18.6.1 — Agent mode: soul.md affects code generation
- **Steps**: Set soul.md to "Dark theme with purple accents". Chat in Agent mode: "Create a dashboard"
- **Expected**: Dashboard has dark theme with purple accents.

### TC-18.6.2 — Plan mode: soul.md NOT used
- **Steps**: Set distinctive soul.md. Switch to Plan mode. Chat: "Plan the dashboard"
- **Expected**: AI creates plan WITHOUT referencing visual details from soul.md. Plan focused on architecture.

### TC-18.6.3 — Chat mode: identity + instructions but not soul
- **Steps**: Set distinct identity and soul. Chat mode: "Tell me about this project"
- **Expected**: AI uses identity (project name/purpose). Does NOT reference soul visual details.

### TC-18.6.4 — Agent mode: full tool access
- **Steps**: Agent mode → ask to build something complex.
- **Expected**: AI uses create_file, edit_file, bash tools. Full autonomous capability.

### TC-18.6.5 — Plan mode: read-only tools only
- **Steps**: Plan mode → ask to "build" something.
- **Expected**: AI creates plan, does NOT execute. No create_file/edit_file calls. Uses report_intent or ask_clarification.

---

## 18.7 Environment Variables in AI-Generated Code (P1)

### TC-18.7.1 — AI references env var in generated code
- **Steps**:
  1. Add workspace env var: `SUPABASE_URL=https://xyz.supabase.co`
  2. Set knowledge.md noting this env var
  3. Chat: "Connect to Supabase"
- **Expected**: AI uses `import.meta.env.SUPABASE_URL` or `process.env.SUPABASE_URL` in generated code.

### TC-18.7.2 — Env var available in preview runtime
- **Steps**:
  1. Add env var `APP_TITLE=My App`
  2. Create code that reads `import.meta.env.APP_TITLE`
  3. Open preview
- **Expected**: Preview displays "My App". Env var injected into dev server.

### TC-18.7.3 — Secret env var NOT visible in code editor
- **Steps**: Add secret env var. Generated code references `import.meta.env.SECRET_KEY`.
- **Expected**: Code shows the env var reference but NOT the actual value. Value only at runtime.

---

## 18.8 Skills & Rules in AI Behavior (P1)

### TC-18.8.1 — Workspace skill: accessibility
- **Steps**:
  1. Create skill: "WCAG 2.1 AA Compliance. All images must have alt text. All forms must have labels. Color contrast ratio ≥ 4.5:1."
  2. Add to workspace/environment
  3. Chat: "Build a registration form"
- **Expected**: Form has `<label>` for every input. Color choices meet contrast ratio. All decorative images handled.

### TC-18.8.2 — Workspace skill: SEO
- **Steps**:
  1. Create skill: "Always add meta tags: title, description, og:title, og:image. Add structured data (JSON-LD)."
  2. Chat: "Create the homepage"
- **Expected**: HTML head includes meta tags and JSON-LD script.

### TC-18.8.3 — Rule: code review style
- **Steps**:
  1. Create rule: "Maximum function complexity: 10 (cyclomatic). Max file size: 200 lines. If a file exceeds these, refactor."
  2. Chat: "Build a complex data pipeline"
- **Expected**: AI splits logic across multiple files/functions. No single function has deeply nested if/else.

### TC-18.8.4 — Conflicting skills: verify priority
- **Steps**:
  1. Skill A (workspace): "Use Tailwind for styling"
  2. Skill B (project env): "Use CSS Modules for styling"
  3. Chat: "Style a card component"
- **Expected**: Verify which skill wins based on environment resolution. Document the behavior.

---

## 18.9 Error & Edge Cases in Integration (P1)

### TC-18.9.1 — AI chat works with no environment assigned
- **Steps**: Create project with no custom environment. No workspace default. Chat.
- **Expected**: AI works with all workspace-level items. No error about missing environment.

### TC-18.9.2 — AI chat works with no knowledge files
- **Steps**: Delete all knowledge file content (or new project with empty context). Chat.
- **Expected**: AI works generically. No error about empty context.

### TC-18.9.3 — AI chat works with no MCP servers
- **Steps**: Remove all MCP connectors. Chat.
- **Expected**: AI works with built-in tools only. No MCP tools shown. No error.

### TC-18.9.4 — MCP server goes down mid-conversation
- **Steps**: Start chat with MCP tools → stop MCP server → try to use MCP tool.
- **Expected**: Graceful error. AI reports tool unavailable. Conversation continues with built-in tools.

### TC-18.9.5 — Knowledge file updated between chat turns
- **Steps**: Chat turn 1 → edit instructions.md between turns → chat turn 2.
- **Expected**: Turn 2 uses updated instructions (context rebuilt per turn). No stale cache.

### TC-18.9.6 — AI chat with maximum token budget used
- **Steps**: Fill all knowledge files to max. Check AI still gets user messages through.
- **Expected**: Knowledge may be truncated but user message always reaches AI. Long context doesn't cause timeout.

---

## 18.10 Tracing & Observability (P2)

### TC-18.10.1 — MCP tool calls traced in admin
- **Steps**: Trigger MCP tool calls → check admin panel (Copilot Sessions or traces).
- **Expected**: MCP_CALL and MCP_RESULT events logged with: connector, tool, args, response, duration.

### TC-18.10.2 — MCP errors traced
- **Steps**: Trigger MCP tool error → check traces.
- **Expected**: MCP_ERROR event with error details.

### TC-18.10.3 — Context injection visible in traces
- **Steps**: Check trace data for a chat turn.
- **Expected**: System prompt size/contents logged. Knowledge files included are listed.

### TC-18.10.4 — Tool call sent to WebSocket for real-time UI
- **Steps**: Trigger MCP tool call → check WebSocket messages.
- **Expected**: Tool progress events sent to client via WS. UI updates in real-time during tool execution.

---

## 18.11 Cross-Feature Scenarios (P1)

### TC-18.11.1 — New user joins workspace → inherits all settings
- **Steps**:
  1. Set up workspace: knowledge, skills, rules, MCP servers, environment
  2. Invite new user to workspace
  3. New user creates project (inherits workspace default)
  4. New user chats with AI
- **Expected**: New user's AI has full context: workspace knowledge, skills, rules, active MCP tools. No manual setup needed.

### TC-18.11.2 — Template with environment → new project gets full config
- **Steps**:
  1. Create template project with custom environment
  2. User creates new project from template
- **Expected**: New project inherits the template's environment assignment. All environment items (skills, rules, knowledge, connectors) active.

### TC-18.11.3 — Workspace admin changes default environment → all projects affected
- **Steps**:
  1. Workspace has 5 projects (no per-project overrides)
  2. Admin changes workspace default environment
  3. Chat in any project
- **Expected**: All 5 projects now use the new default environment's settings.

### TC-18.11.4 — Delete workspace default environment → graceful fallback
- **Steps**: Delete the workspace default environment.
- **Expected**: All projects fall back to "all workspace items" virtual default. No errors. AI still works.

### TC-18.11.5 — Rapid environment/knowledge changes don't corrupt state
- **Steps**: Rapidly: edit knowledge → switch environment → edit again → switch back → chat.
- **Expected**: Final state is consistent. AI uses whatever is currently set. No stale cache or corruption.
