# TC-09: Environments, Knowledge, Skills & Identity

## 9.1 Environments Panel (P1)

### TC-9.1.1 — Open environments panel in editor
- **Steps**: In editor, click "More" → "Environment" or find the environment panel/tab.
- **Expected**: Environment panel with tabs: Knowledge, Skills, Integrations, Settings.

### TC-9.1.2 — List environments
- **Steps**: View available environments for the workspace.
- **Expected**: Environments listed with scope badges (workspace, project, user). Default environment shown.

### TC-9.1.3 — Create new environment
- **Steps**: Click "Create environment" → enter name "staging" → set scope → save.
- **Expected**: New environment appears in list with scope badge. Editable.

### TC-9.1.4 — Edit environment
- **Steps**: Click edit on an existing environment → change name or settings → save.
- **Expected**: Changes persisted. Environment reflects updates.

### TC-9.1.5 — Delete environment
- **Steps**: Click delete on an environment → confirm.
- **Expected**: Environment removed. Project falls back to default/workspace environment.

### TC-9.1.6 — Clone environment
- **Steps**: Click clone on an environment → modify clone → save.
- **Expected**: New environment created with all settings from original. Independent from original.

## 9.2 Knowledge Files (Custom Context) (P0)

### TC-9.2.1 — View knowledge files
- **Steps**: In environment → Knowledge tab (or Knowledge tab in sidebar).
- **Expected**: Default context files listed (project.md, architecture.md, dependencies.md, guidelines.md). File count and size stats shown.

### TC-9.2.2 — Edit knowledge file
- **Steps**: Click on `project.md` → edit content → save.
- **Expected**: Content saved. AI uses updated context in future conversations.

### TC-9.2.3 — Create custom knowledge file
- **Steps**: Click "Add file" → name "api-reference.md" → add content describing API endpoints → save.
- **Expected**: New file appears in list. AI references this context when relevant.

### TC-9.2.4 — Delete knowledge file
- **Steps**: Click delete on a custom knowledge file → confirm.
- **Expected**: File removed. AI no longer has this context.

### TC-9.2.5 — Knowledge file affects AI output
- **Steps**: Add knowledge file with specific instruction: "Always use blue as primary color. Never use red." → ask AI to "Add a button".
- **Expected**: AI creates blue button, not red. Knowledge context clearly influenced output.

### TC-9.2.6 — Markdown rendering in knowledge editor
- **Steps**: Add markdown with headers, code blocks, lists to a knowledge file.
- **Expected**: Editor shows raw markdown. Preview (if available) renders properly.

## 9.3 Custom Identity / Instructions (P1)

### TC-9.3.1 — Set custom AI instructions
- **Steps**: In environment settings, find instructions/identity settings → enter: "You are a senior React developer. Always use functional components with hooks. Never use class components."
- **Expected**: AI follows these instructions in all subsequent conversations for this environment.

### TC-9.3.2 — Verify custom instructions take effect
- **Steps**: After setting instructions, ask AI to "Build a counter component".
- **Expected**: AI produces functional component with hooks. No class component.

### TC-9.3.3 — Override default identity
- **Steps**: Set identity instructions at project level that differ from workspace level.
- **Expected**: Project-level instructions take priority. AI follows project-specific rules.

## 9.4 Skills (P1)

### TC-9.4.1 — View workspace skills
- **Steps**: Go to Skills panel or Environment → Skills tab.
- **Expected**: List of available skills shown. Each with name, description, status.

### TC-9.4.2 — Create custom skill
- **Steps**: Click "Create skill" → name "SEO Optimizer" → define what the skill does → save.
- **Expected**: Skill created. Now available in AI context. AI can reference/use it.

### TC-9.4.3 — Edit skill
- **Steps**: Click edit on a skill → modify description or behavior → save.
- **Expected**: Skill updated. Changes reflected in future AI interactions.

### TC-9.4.4 — Delete skill
- **Steps**: Delete a custom skill.
- **Expected**: Skill removed. AI no longer has access to it.

### TC-9.4.5 — Skill takes effect in AI chat
- **Steps**: Create skill "Always add meta tags for SEO to every page" → ask AI to "Build a landing page".
- **Expected**: AI generates landing page WITH meta tags. Skill clearly influenced output.

## 9.5 Rules (P2)

### TC-9.5.1 — Create automation rule
- **Steps**: Click "Create rule" → define trigger and action → save.
- **Expected**: Rule created. Listed in rules panel.

### TC-9.5.2 — Edit/delete rule
- **Steps**: Edit rule → change trigger → save. Then delete another rule.
- **Expected**: Both operations work. Updates persisted.

## 9.6 Environment Scope Priority (P1)

### TC-9.6.1 — Project env overrides workspace env
- **Steps**: Set workspace knowledge: "Use Material UI". Set project knowledge: "Use Tailwind CSS". Ask AI to build a component.
- **Expected**: AI uses Tailwind (project scope takes priority).

### TC-9.6.2 — Scope badges visible
- **Steps**: View environments list.
- **Expected**: Each environment shows scope badge (Workspace, Project, User).

## 9.7 Environment Variables (P2)

### TC-9.7.1 — Add environment variable
- **Steps**: In environment → Variables tab → add key "API_URL" with value "https://api.example.com" → save.
- **Expected**: Variable saved. Available in project runtime (e.g., `import.meta.env.API_URL`).

### TC-9.7.2 — Use env var in code
- **Steps**: After adding env var, ask AI to "Fetch data from the API_URL environment variable".
- **Expected**: AI generates code that references the env var. Code uses proper syntax.

### TC-9.7.3 — Delete environment variable
- **Steps**: Remove an env var.
- **Expected**: Variable deleted. Code referencing it may break (expected behavior).

## 9.8 Custom Agents (P2)

### TC-9.8.1 — Define custom agent behavior
- **Steps**: In environment settings, configure a custom agent profile.
- **Expected**: Agent personality/behavior changes. AI responses reflect custom agent configuration.

## 9.9 Context Assembly Verification (P1)

### TC-9.9.1 — Multi-scope context merge
- **Steps**: Set knowledge at workspace, project, and user scope. Ask AI a question that requires referencing all three.
- **Expected**: AI's response shows awareness of all three scopes. Workspace + project + user context all injected.

### TC-9.9.2 — Context not duplicated
- **Steps**: Set same content at workspace and project scope. Check AI's context window.
- **Expected**: Content not duplicated in AI's context. Deduplication prevents wasted tokens.
