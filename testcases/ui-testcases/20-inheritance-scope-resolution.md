# TC-20: Workspace ↔ Project Inheritance & Scope Resolution — Deep Testing

> **Scope:** Verify that every layer of workspace→project inheritance, override, fallback, and merge behavior works correctly — and that the AI chat actually reflects the resolved configuration.
> **Resolution Rule:** Project env > Workspace default env > Virtual default (all workspace items)
> **Context Files:** User > Project > Workspace (per-file: replace or append)
> **MCP Connectors:** All scopes MERGED (workspace + project + user)
> **Env Vars:** Project key overrides workspace key (DISTINCT ON key, project first)
> **Integrations:** Project > User > Workspace (one per integration_id, deduped)

---

## Goal Map

| Goal | What the User Wants | Inheritance Layer |
|------|---------------------|-------------------|
| G1 | "Set once at workspace, apply everywhere" | Workspace defaults cascade to projects |
| G2 | "Override for just this project" | Project-level overrides workspace |
| G3 | "My personal settings without affecting others" | User-scope overrides |
| G4 | "Different behaviors per project, same workspace" | Per-project environment assignment |
| G5 | "Verify the AI actually uses the right config" | End-to-end behavioral verification |
| G6 | "Know which scope is winning" | Transparency of resolution |
| G7 | "Delete/unset override and fall back correctly" | Fallback behavior |

---

## 20.1 Environment Resolution Chain (P0)

### TC-20.1.1 — Project with NO override inherits workspace default ENV
- **Steps:** 
  1. Go to workspace settings → Environments → create environment "Workspace Formal" with skill "Always use formal English".
  2. Set "Workspace Formal" as workspace default.
  3. Create a new project (no environment override).
  4. Open AI chat in that project → ask "Hi, tell me a joke."
- **Expected:** AI responds in formal English (formal language, no slang). The workspace default environment's skill is applied.

### TC-20.1.2 — Project WITH override uses project env, NOT workspace default
- **Steps:**
  1. Keep "Workspace Formal" as workspace default.
  2. Create environment "Project Casual" with skill "Be extremely casual, use slang and abbreviations."
  3. In project settings → Environments tab → select "Project Casual" from dropdown.
  4. Open AI chat → ask "Tell me about JavaScript."
- **Expected:** AI responds casually with slang/abbreviations. NOT formal. Project environment completely replaces workspace default.

### TC-20.1.3 — Remove project override → falls back to workspace default
- **Steps:**
  1. With project using "Project Casual" override from TC-20.1.2.
  2. Go to project settings → Environments tab → select "Use workspace default".
  3. Open AI chat → ask "Tell me about JavaScript."
- **Expected:** AI now responds formally again (workspace default "Workspace Formal" restored). No trace of casual behavior.

### TC-20.1.4 — No workspace default, no project override → virtual default (all workspace items)
- **Steps:**
  1. Unset workspace default environment (remove default flag).
  2. Ensure project has no environment override.
  3. Create workspace-level skill: "Always mention TypeScript when discussing JavaScript."
  4. Create workspace-level rule: "Never use var, only const/let."
  5. Open AI chat → ask "Write a JavaScript function."
- **Expected:** AI mentions TypeScript (skill applied) AND uses const/let (rule applied). Virtual default = all workspace-scoped items combined.

### TC-20.1.5 — Delete workspace default env → projects fall back to virtual default
- **Steps:**
  1. Set an environment as workspace default.
  2. Delete that environment entirely.
  3. Open AI chat in a project with no override.
- **Expected:** AI uses virtual default behavior (all workspace items). No error. Graceful fallback.

### TC-20.1.6 — Delete project's assigned environment → project falls back
- **Steps:**
  1. Assign environment "Staging Config" to a project.
  2. Delete "Staging Config" from workspace environments.
  3. Open AI chat in that project.
- **Expected:** Project falls back to workspace default (or virtual default if none). No error. AI responds normally.

### TC-20.1.7 — Multiple projects, different environments, same workspace
- **Steps:**
  1. Create 3 environments: "Formal", "Casual", "Technical".
  2. Create 3 projects: A, B, C.
  3. Assign "Formal" to Project A, "Casual" to Project B, leave Project C with no override.
  4. Set "Technical" as workspace default.
  5. Chat in each project: "Describe a REST API."
- **Expected:** 
  - Project A: Formal response.
  - Project B: Casual response.
  - Project C: Technical response (inherits workspace default).

### TC-20.1.8 — Environment with connectors, skills, rules, instructions — all inherited
- **Steps:**
  1. Create environment with: 1 skill, 1 rule, 1 instruction, 1 MCP connector ref.
  2. Set as workspace default.
  3. Open project with no override → chat.
- **Expected:** AI follows skill + rule + instruction. MCP tools available. Full environment inherited.

---

## 20.2 Knowledge (Context Files) Multi-Scope Merge (P0)

### TC-20.2.1 — Workspace knowledge inherited by project (no project knowledge)
- **Steps:**
  1. Go to workspace settings → Knowledge → edit `knowledge.md`: "Our company is Acme Corp. We build widgets."
  2. Create a new project (don't edit project knowledge).
  3. AI chat → "What company do we work for?"
- **Expected:** AI responds "Acme Corp" — workspace knowledge injected.

### TC-20.2.2 — Project knowledge file REPLACES workspace (replace strategy files)
- **Steps:**
  1. Workspace `identity.md`: "You are a helpful assistant named Atlas."
  2. Project `identity.md`: "You are Luna, a creative AI who loves art."
  3. AI chat → "Who are you?"
- **Expected:** AI says "Luna" with art personality. NOT Atlas. identity.md uses REPLACE strategy — project wins.

### TC-20.2.3 — Project knowledge file APPENDS to workspace (append strategy files)
- **Steps:**
  1. Workspace `knowledge.md`: "The API runs on port 4000."
  2. Project `knowledge.md`: "This project uses React 19 and Tailwind 4."
  3. AI chat → "What port does the API run on? What framework do we use?"
- **Expected:** AI knows BOTH: port 4000 (workspace) AND React 19 + Tailwind 4 (project). knowledge.md uses APPEND strategy — merged with separator.

### TC-20.2.4 — Empty project file does NOT override workspace (replace strategy)
- **Steps:**
  1. Workspace `soul.md`: "You believe in simplicity."
  2. Project `soul.md`: leave empty (0 characters).
  3. AI chat → "What's your approach to design?"
- **Expected:** AI follows "simplicity" from workspace soul.md. Empty project file = null = skipped in resolution.

### TC-20.2.5 — All 7 core files — verify replace vs append per file
- **Steps:**
  Set workspace AND project content for all 7 files:
  - `identity.md` — WS: "Atlas", Proj: "Luna" → **replace** → Luna wins
  - `soul.md` — WS: "Minimalist", Proj: "Maximalist" → **replace** → Maximalist wins
  - `user.md` — WS: "Enterprise dev team", Proj: "Solo indie hacker" → **replace** → Solo wins
  - `instructions.md` — WS: "Use bullet points", Proj: "Use numbered lists" → **replace** → Numbered lists win
  - `plan.md` — WS: "Phase 1: backend", Proj: "Phase 1: frontend" → **replace** → Frontend wins
  - `knowledge.md` — WS: "Port 4000", Proj: "Uses React" → **append** → Both present
  - `memory.md` — WS: "User prefers dark mode", Proj: "User chose Tailwind" → **append** → Both present
- **Expected:** Replace files: project version only. Append files: both versions joined with `---` separator.

### TC-20.2.6 — User scope overrides project (3-level hierarchy)
- **Steps (if user-level editing available):**
  1. Workspace `identity.md`: "Atlas"
  2. Project `identity.md`: "Luna"
  3. User `identity.md`: "Nova"
  4. AI chat → "Who are you?"
- **Expected:** AI says "Nova". User > Project > Workspace for replace-strategy files.

### TC-20.2.7 — Append strategy with 3 scopes
- **Steps:**
  1. Workspace `knowledge.md`: "API on port 4000."
  2. Project `knowledge.md`: "Uses React 19."
  3. User `knowledge.md`: "Prefers TypeScript strictly."
  4. AI chat → ask about port, framework, and language preference.
- **Expected:** AI knows all three. Content appended: workspace + project + user (in that order) with `---` separators.

### TC-20.2.8 — Token budget respected across scopes
- **Steps:**
  1. Fill workspace knowledge.md with ~8000 chars of content.
  2. Fill project knowledge.md with ~8000 chars of content.
  3. Total exceeds 12K token budget.
  4. Check Knowledge tab token budget bar.
  5. AI chat → ask about content from both.
- **Expected:** Budget bar shows > 95% (red). AI may not have access to ALL content — later/lower-priority files truncated.

### TC-20.2.9 — Clear project knowledge → workspace knowledge takes effect
- **Steps:**
  1. Project has `identity.md` = "Luna".
  2. Delete all content from project `identity.md` → save (empty).
  3. AI chat → "Who are you?"
- **Expected:** AI reverts to workspace identity (e.g., "Atlas"). Empty = null = falls through to next scope.

---

## 20.3 Skills Resolution via Environment (P0)

### TC-20.3.1 — Workspace default env skills cascade to project
- **Steps:**
  1. Create workspace environment "Dev Standard" with skills: "Always use TypeScript", "Prefer functional components".
  2. Set as workspace default.
  3. Open a project with NO environment override → chat → ask to build a component.
- **Expected:** AI generates TypeScript functional component. Both skills applied.

### TC-20.3.2 — Project env skills REPLACE workspace env skills
- **Steps:**
  1. Keep workspace default with "Always use TypeScript" skill.
  2. Create project environment with skill: "Always use plain JavaScript, no TypeScript."
  3. Assign to project → chat → ask to write a function.
- **Expected:** AI writes plain JavaScript. Workspace skill NOT applied — project env completely replaces.

### TC-20.3.3 — Virtual default: all workspace skills combined
- **Steps:**
  1. No workspace default env set. No project env set.
  2. Create 3 workspace-scoped skills: "Use TailwindCSS", "Prefer async/await", "Add JSDoc comments".
  3. Chat → ask to build a styled async function.
- **Expected:** AI uses Tailwind, async/await, AND JSDoc. All workspace skills combined as virtual default.

### TC-20.3.4 — Project-scoped skill NOT in environment → not applied
- **Steps:**
  1. Create a project-scoped skill "Use SCSS".
  2. Don't add it to any environment.
  3. Chat (with workspace default env active) → ask for styling.
- **Expected:** AI follows environment skills, NOT the floating project-scoped skill. Skills must be referenced in an environment to be used.

### TC-20.3.5 — Workspace skill referenced in project environment
- **Steps:**
  1. Create workspace-scoped skill "Accessibility First".
  2. Create project environment → add "Accessibility First" skill ref.
  3. Assign project environment → chat → ask to build a form.
- **Expected:** AI generates accessible form (ARIA labels, etc.). Cross-scope refs work: workspace skill in project env.

### TC-20.3.6 — Delete skill that's referenced in environment
- **Steps:**
  1. Create skill "Never use inline styles" → add to environment.
  2. Delete that skill.
  3. Chat with that environment active.
- **Expected:** Deleted skill silently ignored (outer join, ref skipped). No error. Other skills still work.

---

## 20.4 Rules Resolution via Environment (P0)

### TC-20.4.1 — Workspace default env rules cascade to project
- **Steps:**
  1. Add rule "Always use const, never var or let" with pattern "*.ts,*.tsx" to workspace default env.
  2. Open project with no override → chat → ask to write TypeScript.
- **Expected:** AI uses only `const`. Rule inherited.

### TC-20.4.2 — Project env rules REPLACE workspace env rules
- **Steps:**
  1. Workspace default env rule: "Use 2-space indentation."
  2. Project env rule: "Use tabs for indentation."
  3. Assign project env → chat → ask for code.
- **Expected:** AI uses tabs. Workspace rule NOT applied.

### TC-20.4.3 — Rule with file pattern — only applied to matching files
- **Steps:**
  1. Rule: "Use PascalCase for component names" with pattern "*.tsx".
  2. Chat → ask to create a .tsx component → ask to create a .ts utility.
- **Expected:** .tsx component has PascalCase name. .ts utility may use camelCase (pattern doesn't match .ts).

### TC-20.4.4 — Rule without file pattern — applies to all files
- **Steps:**
  1. Create rule: "Add a comment header to every file" with NO file pattern.
  2. Chat → ask to create .ts, .css, and .json files.
- **Expected:** All files get comment headers. "No file patterns — applies to all files" behavior confirmed.

---

## 20.5 MCP Connectors Scope Resolution (P0)

### TC-20.5.1 — Workspace MCP connector available in all projects
- **Steps:**
  1. Add MCP connector at workspace scope: `@modelcontextprotocol/server-everything` named "ws-tools".
  2. Activate it.
  3. Open any project → AI chat → "Use the echo tool to repeat 'hello world'."
- **Expected:** AI calls `mcp_ws-tools_echo` tool. Result: "hello world". Workspace connector available everywhere.

### TC-20.5.2 — Project MCP connector only in that project
- **Steps:**
  1. Add MCP connector at project scope in Project A: named "proj-tools".
  2. Open Project A → AI chat → ask to use echo tool.
  3. Open Project B → AI chat → ask to use echo tool from "proj-tools".
- **Expected:** Project A: tool works. Project B: tool NOT available (project-scoped to A only).

### TC-20.5.3 — Workspace + project connectors MERGED (not replaced)
- **Steps:**
  1. Workspace connector "ws-server" with tool `echo`.
  2. Project connector "proj-server" with tool `add`.
  3. AI chat → ask to use both tools.
- **Expected:** BOTH tools available: `mcp_ws-server_echo` AND `mcp_proj-server_add`. Merged, not replaced.

### TC-20.5.4 — Inactive connector skipped
- **Steps:**
  1. Add workspace connector → activate → verify tools available.
  2. Deactivate workspace connector.
  3. AI chat → try to use the tool.
- **Expected:** Tool NOT available when connector inactive. AI can't call it.

### TC-20.5.5 — User-scoped connector only for that user
- **Steps:**
  1. As testadmin: add user-scoped connector "my-tools".
  2. As testadmin: AI chat → use tool from "my-tools" → works.
  3. As testuser (if able): AI chat → try same tool → not available.
- **Expected:** User-scoped connectors private to creator. Other users don't see them.

### TC-20.5.6 — Duplicate connector names across scopes
- **Steps:**
  1. Create workspace connector named "tools".
  2. Create project connector named "tools" (same name).
  3. Chat → check which MCP tools available.
- **Expected:** BOTH connectors included (no dedup by name). Tools from both: `mcp_tools_echo` might have duplicates or the naming disambiguates.

### TC-20.5.7 — Connector connection failure doesn't block others
- **Steps:**
  1. Add workspace connector (valid, active).
  2. Add project connector pointing to nonexistent URL (will fail).
  3. Chat → use workspace connector tool.
- **Expected:** Workspace connector tools still work. Failed project connector logged but doesn't block.

---

## 20.6 Environment Variables Scope Resolution (P1)

### TC-20.6.1 — Workspace env var available in project
- **Steps:**
  1. Create workspace env var: `API_KEY=ws-secret-123` (scope: workspace).
  2. Open a project → check if `API_KEY` is accessible (via code referencing `process.env.API_KEY` or AI chat asking about env vars).
- **Expected:** `API_KEY` resolves to `ws-secret-123`.

### TC-20.6.2 — Project env var OVERRIDES workspace env var (same key)
- **Steps:**
  1. Workspace var: `DATABASE_URL=postgresql://workspace-db`.
  2. Project var: `DATABASE_URL=postgresql://project-db` (same key, project scope).
  3. Resolve → check which value wins.
- **Expected:** `DATABASE_URL` = `postgresql://project-db`. Project overrides workspace for matching keys.

### TC-20.6.3 — Unique keys across scopes are MERGED
- **Steps:**
  1. Workspace var: `GLOBAL_KEY=workspace-value`.
  2. Project var: `LOCAL_KEY=project-value`.
  3. Resolve → both available.
- **Expected:** Both `GLOBAL_KEY` and `LOCAL_KEY` available. Unique keys from both scopes merge.

### TC-20.6.4 — Delete project var → workspace var becomes active again
- **Steps:**
  1. Workspace var: `API_URL=https://workspace.com`.
  2. Project var: `API_URL=https://project.com` (overrides).
  3. Delete the project var.
  4. Resolve.
- **Expected:** `API_URL` reverts to `https://workspace.com`. Workspace fallback restored.

### TC-20.6.5 — Target filtering: dev/preview/prod/all
- **Steps:**
  1. Create workspace var `STRIPE_KEY` with target "production".
  2. Create workspace var `STRIPE_TEST_KEY` with target "development".
  3. Resolve for development mode.
- **Expected:** `STRIPE_TEST_KEY` available (target matches). `STRIPE_KEY` NOT available (production only). Target "all" always included.

### TC-20.6.6 — Encrypted env var values
- **Steps:**
  1. Create env var marked as secret: `DB_PASSWORD=supersecret`.
  2. View in UI.
  3. Verify it's used correctly in runtime.
- **Expected:** UI shows masked value (•••••). Backend decrypts via pgcrypto. Actual value used in context.

### TC-20.6.7 — Empty value env var
- **Steps:**
  1. Create env var `EMPTY_VAR` with empty string value.
  2. Resolve.
- **Expected:** Variable exists with empty string value (not null, not skipped). Used verbatim.

---

## 20.7 Integrations Scope Resolution (P1)

### TC-20.7.1 — Workspace integration available to all projects
- **Steps:**
  1. Connect Supabase at workspace scope.
  2. Open any project → check AI chat for Supabase tools.
- **Expected:** Supabase tools available. Workspace integration inherited.

### TC-20.7.2 — Project connection overrides workspace connection (same integration)
- **Steps:**
  1. Connect Supabase at workspace scope with credentials A (Workspace Supabase instance).
  2. Connect Supabase at project scope with credentials B (Different Supabase instance).
  3. AI chat in that project → use Supabase tools.
- **Expected:** Project Supabase credentials used (credentials B). Workspace connection ignored for this project. One connection per integration_id.

### TC-20.7.3 — User connection overrides workspace but not project
- **Steps:**
  1. Workspace Supabase connection (credentials W).
  2. User Supabase connection (credentials U).
  3. AI chat (no project connection).
- **Expected:** User connection wins (credentials U). Priority: project > user > workspace.

### TC-20.7.4 — All three scopes — project wins
- **Steps:**
  1. Workspace Supabase (W).
  2. User Supabase (U).
  3. Project Supabase (P).
  4. AI chat.
- **Expected:** Project Supabase (P) used. ONE active connection per integration_id.

### TC-20.7.5 — Disconnect project integration → user/workspace takes over
- **Steps:**
  1. Project Supabase active (overriding workspace).
  2. Disconnect project Supabase.
  3. AI chat.
- **Expected:** Falls back to user Supabase (if exists) or workspace Supabase. Graceful fallback.

### TC-20.7.6 — Integration env vars expansion
- **Steps:**
  1. Connect Supabase at workspace scope.
  2. Check that env vars like `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_KEY` are available.
- **Expected:** Client vars (VITE_ prefix) safe for browser. Server vars (no VITE_) server-only. Values decrypted from vault.

### TC-20.7.7 — Integration manifest in AI prompt (metadata only)
- **Steps:**
  1. Connect integration.
  2. AI chat → ask "What integrations are connected?"
- **Expected:** AI knows integration name and env var NAMES (not values). Manifest contains metadata only. No credential leak.

---

## 20.8 Chat Context Assembly — Full Stack Verification (P0)

### TC-20.8.1 — All inheritance layers combined in single chat
- **Steps:**
  1. Setup:
     - Workspace knowledge.md: "Company is Acme Corp."
     - Project knowledge.md: "This project uses Next.js."
     - Workspace default env with skill: "Always use TypeScript."
     - Project env override with rule: "Use 4-space indentation."
     - Workspace MCP connector "tools" (active).
     - Workspace env var: `API_PORT=4000`.
  2. AI chat → "Build a Next.js API route for Acme Corp on port 4000 using the echo tool."
- **Expected:** AI combines ALL layers:
  - Knows "Acme Corp" (workspace knowledge, appended)
  - Knows "Next.js" (project knowledge, appended)
  - Uses TypeScript (skill — but wait, project env overrides... depends on environment assignment)
  - Uses 4-space indent (rule from project env)
  - Can call echo tool (MCP connector)
  - References port 4000 (env var knowledge)

### TC-20.8.2 — Mode affects what gets included
- **Steps:**
  1. Set up knowledge files for all 7 core files at workspace level.
  2. Chat in **Agent mode** → check response.
  3. Chat in **Plan mode** → check response.
  4. *(If chat mode available)* Chat in **Chat mode** → check response.
- **Expected:**
  - Agent: Full context (identity, soul, user, instructions, knowledge, plan, memory).
  - Plan: Reduced (identity, knowledge, memory, architecture, schema).
  - Chat: Q&A (identity, instructions, memory, user, knowledge).

### TC-20.8.3 — Skills included in agent mode, filtered in plan/chat
- **Steps:**
  1. Create skill "Always add error handling."
  2. Agent mode → ask to write function → gets error handling.
  3. Plan mode → ask to plan function → may not get error handling (if skills filtered).
- **Expected:** Skills active in Agent mode. May be filtered in other modes.

### TC-20.8.4 — MCP tools filtered by mode
- **Steps:**
  1. Add MCP connector with tools.
  2. Agent mode → tools available.
  3. Plan mode → tools may be filtered out.
- **Expected:** Agent mode: all tools. Other modes: tools may be filtered (mode-specific tool filtering applies).

### TC-20.8.5 — Context token budget prevents overflow
- **Steps:**
  1. Fill ALL knowledge files at workspace + project with maximum content.
  2. Add many skills and rules.
  3. AI chat → ask complex question.
- **Expected:** System doesn't crash. Token budget (12K) enforced. Lower-priority or later files truncated. AI still responds coherently.

---

## 20.9 Fallback & Recovery Scenarios (P1)

### TC-20.9.1 — Workspace default set → unset → behavior changes
- **Steps:**
  1. Set workspace default env with specific skill.
  2. Verify AI follows skill.
  3. Unset workspace default (remove `is_default` flag).
  4. AI chat → verify skill no longer applied (unless in virtual default).
- **Expected:** If skill is workspace-scoped, virtual default still includes it. If skill was env-only, it's lost.

### TC-20.9.2 — Project env deleted while chatting
- **Steps:**
  1. Assign project env → start chat → verify behavior.
  2. In another browser tab, delete the project environment.
  3. Send another message in the chat.
- **Expected:** Next message uses fallback (workspace default or virtual default). No crash. Graceful degradation.

### TC-20.9.3 — All knowledge files empty → AI still works
- **Steps:**
  1. Clear all knowledge files at all scopes (workspace, project).
  2. AI chat → ask a question.
- **Expected:** AI responds using its base training. No context files injected. No error.

### TC-20.9.4 — No skills, no rules, no instructions → baseline AI
- **Steps:**
  1. Remove all skills, rules, instructions from all environments.
  2. No workspace default env, no project override.
  3. AI chat.
- **Expected:** AI works with baseline behavior. No custom modifications applied.

### TC-20.9.5 — Rapid environment switching
- **Steps:**
  1. Switch project environment 5 times rapidly (A → B → C → workspace default → A).
  2. AI chat after rapid switches.
- **Expected:** AI uses the LAST assigned environment. No stale state.

---

## 20.10 Visibility & Transparency (P1)

### TC-20.10.1 — Project settings shows "Inheriting from workspace default"
- **Steps:** Open project settings → Environments tab when no override set.
- **Expected:** Message: "Inheriting from workspace default. Select an environment above to override."

### TC-20.10.2 — Project settings shows "Custom environment override"
- **Steps:** Set project environment override → observe.
- **Expected:** Message: "This project uses a custom environment override. The workspace default is bypassed."

### TC-20.10.3 — Knowledge tab shows which files have content
- **Steps:** Edit workspace knowledge → open project Knowledge tab.
- **Expected:** Project Knowledge tab shows: files with project-level content (emerald dot), files without (muted dot "Empty -- click to edit"). Workspace content visible only indirectly via AI behavior.

### TC-20.10.4 — MCP panel shows scope badges on connectors
- **Steps:** View MCP panel with connectors at multiple scopes.
- **Expected:** Each connector shows scope: "workspace", "project", or "user" badge. User can see which level each comes from.

### TC-20.10.5 — Skills/Rules show scope badges
- **Steps:** View Skills & Rules tab with items at different scopes.
- **Expected:** Each skill/rule card shows scope badge: "workspace", "project", or "user".

### TC-20.10.6 — Env vars differentiate workspace vs project
- **Steps:** View environment variables with vars at both scopes.
- **Expected:** Variables indicate scope. User can see which are workspace-wide vs project-specific.

---

## 20.11 Edge Cases & Conflict Resolution (P2)

### TC-20.11.1 — Conflicting skills across scopes
- **Steps:**
  1. Virtual default includes workspace skill: "Always use React class components."
  2. Workspace also has skill: "Never use React class components."
  3. AI chat → ask to build a React component.
- **Expected:** AI receives both conflicting skills. Behavior may be unpredictable. Test to document actual behavior.

### TC-20.11.2 — Environment references deleted skill
- **Steps:**
  1. Create skill → add ref to environment → delete skill → chat with that environment.
- **Expected:** Deleted skill silently skipped (left JOIN). Other skills still active. No crash.

### TC-20.11.3 — Same integration connected at all 3 scopes
- **Steps:**
  1. Connect Supabase at workspace, user, AND project scope (3 different instances).
  2. Chat.
- **Expected:** Project connection wins (highest priority). Only ONE Supabase active. Deduplication by integration_id.

### TC-20.11.4 — Duplicate env var key at same scope
- **Steps:** Try creating two env vars with same key at workspace scope.
- **Expected:** Database UNIQUE constraint prevents it. Error returned. Cannot have duplicate keys at same scope.

### TC-20.11.5 — Very large number of workspace items as virtual default
- **Steps:**
  1. Create 20 workspace skills + 20 workspace rules + fill all knowledge files.
  2. No environment set (virtual default: everything).
  3. Chat.
- **Expected:** All items included up to token budget. System handles large virtual default without crash. Token budget truncates if exceeded.

### TC-20.11.6 — Environment with 0 skills, 0 rules, 0 connectors
- **Steps:**
  1. Create empty environment (name + description only, no items).
  2. Assign to project.
  3. Chat.
- **Expected:** Environment is valid but has no modifications. AI behaves with baseline + knowledge files only. Workspace skills NOT applied (environment replaced, even if empty).

### TC-20.11.7 — Workspace member changes workspace → different defaults
- **Steps:**
  1. Switch from Workspace Alpha (with default env A) to Workspace Beta (with default env B).
  2. Open a project in Beta → chat.
- **Expected:** Uses Beta's default env. No bleed from Alpha's config.

### TC-20.11.8 — Create project, switch workspace, come back
- **Steps:**
  1. In Workspace A, create project with env override.
  2. Switch to Workspace B.
  3. Switch back to Workspace A → open same project.
- **Expected:** Project still has its env override. Workspace switching doesn't lose project settings.

---

## 20.12 Cross-Feature Inheritance Verification Matrix (P0)

> For each cell, verify the inheritance/resolution actually works by chatting with AI.

| Feature | Workspace → Project Inheritance | Override Behavior | Fallback on Delete |
|---------|-------------------------------|-------------------|-------------------|
| Environment assignment | WS default → project | Project env replaces WS default entirely | Falls to WS default → virtual |
| Knowledge (replace files) | WS files used if no project file | Project file replaces WS file | WS file restored |
| Knowledge (append files) | WS content always included | Project appends to WS (both present) | WS-only content remains |
| Skills | Via environment resolution | Project env skills replace WS env skills | WS env skills restored |
| Rules | Via environment resolution | Project env rules replace WS env rules | WS env rules restored |
| Instructions | Via environment resolution | Project env instructions replace WS | WS instructions restored |
| MCP connectors | WS connectors always available | Project connectors ADDED (merged) | WS connectors still available |
| Env vars (same key) | WS var available | Project var overrides WS var | WS var restored |
| Env vars (unique keys) | WS vars available | Project vars added alongside | WS vars remain |
| Integrations | WS integration available | Project connection overrides (same integration) | WS/user connection restored |

### TC-20.12.1 — Walk through entire matrix
- **Steps:** For each row above, set up workspace-level item → verify inheritance → set project override → verify override → delete project override → verify fallback.
- **Expected:** Every cell in the matrix behaves as documented. AI chat confirms each transition.

### TC-20.12.2 — Full reset: remove all project overrides
- **Steps:**
  1. Project has: env override, project knowledge, project skills, project MCP, project env vars, project integration.
  2. Remove ALL project-level items.
  3. Chat.
- **Expected:** AI uses purely workspace-level configuration. Complete fallback to workspace defaults.

### TC-20.12.3 — Full isolation: set all to project level
- **Steps:**
  1. Set project env override with unique skills/rules.
  2. Write project-level knowledge files for all 7 files.
  3. Add project-scoped MCP connector.
  4. Add project-scoped env vars.
  5. Connect project-scoped integration.
  6. Chat.
- **Expected:** AI uses entirely project-level config. No workspace leakage. Project is fully self-contained.
