# TC-15: Environments — Deep Test Suite

> **Goal-oriented**: Users want reusable configuration presets that bundle skills, rules, knowledge, and MCP connectors so different projects get the right AI behavior without manual setup each time.

## Human Goals Mapped

| Goal | User Story | Test Area |
|------|-----------|-----------|
| G1 | "I want my React projects to always use Tailwind + certain coding rules" | Custom environment creation |
| G2 | "I want all projects to inherit workspace defaults unless I override" | Default environment inheritance |
| G3 | "I want to reuse a proven environment template from the gallery" | Templates |
| G4 | "I want to share my environment config with a colleague" | Export/Import |
| G5 | "I want projects to use different MCP servers and knowledge per use-case" | Environment scoping |
| G6 | "I want to switch a project's environment without losing settings" | Assignment/reassignment |
| G7 | "I want environment variables injected into my app runtime" | Env vars for dev/preview/prod |

---

## 15.1 Navigation & Panel Access (P0)

### TC-15.1.1 — Open Environments tab from Workspace Settings
- **Steps**: Navigate to `/workspace-settings?tab=environments`.
- **Expected**: Environments panel loads. Header: "Environments". Subtext: "Bundle skills, rules, knowledge, and MCP connectors into reusable presets."

### TC-15.1.2 — Tab persistence across reload
- **Steps**: Click Environments tab → reload page.
- **Expected**: URL retains `?tab=environments`. Same tab is active after reload.

### TC-15.1.3 — Deep link to Environments tab
- **Steps**: Directly navigate to `/workspace-settings?tab=environments` via URL bar.
- **Expected**: Environments tab is active. No redirect or flash of other tabs.

### TC-15.1.4 — Environments tab shows count badge
- **Steps**: Create 2 environments. Go back and view tab.
- **Expected**: Tab or header displays count "2" next to "Environments".

---

## 15.2 Workspace Defaults Card (P0)

### TC-15.2.1 — Workspace Defaults card always visible
- **Steps**: Open Environments tab with 0 custom environments.
- **Expected**: "🌐 Workspace Defaults" card is shown with "Auto" badge and description "Items available to all environments".

### TC-15.2.2 — Expand Workspace Defaults card
- **Steps**: Click the Workspace Defaults card.
- **Expected**: Card expands to show workspace-level Skills, Rules, Knowledge, and Connectors sections.

### TC-15.2.3 — Workspace defaults show items from all workspace sources
- **Steps**: Add a workspace skill, a workspace rule, and a workspace knowledge file. Open Environments tab.
- **Expected**: Workspace Defaults card lists all three items in their respective sections.

### TC-15.2.4 — Workspace defaults are read-only in this view
- **Steps**: Expand Workspace Defaults card.
- **Expected**: Items are displayed but cannot be added/removed from this card (managed elsewhere). No "Add" or "Remove" buttons.

---

## 15.3 Create Custom Environment (P0)

### TC-15.3.1 — Open create form via "New" button
- **Steps**: Click "New" button in Environments header.
- **Expected**: Inline form appears with: icon selector (12 emojis), name field, description field, color picker (8 colors).

### TC-15.3.2 — Create environment with all fields
- **Steps**: Select icon 🚀, enter name "React + Tailwind", description "For React projects using Tailwind CSS", select purple color → click Create.
- **Expected**: Environment created. Card appears in list with 🚀 icon, "React + Tailwind" name, purple color accent, description.

### TC-15.3.3 — Create environment with only required name
- **Steps**: Enter only name "Minimal Env" → click Create.
- **Expected**: Environment created with default icon (🔧), no description, default color.

### TC-15.3.4 — Create environment with empty name (validation)
- **Steps**: Click Create without entering a name.
- **Expected**: Form shows validation error. Environment not created.

### TC-15.3.5 — Create environment with duplicate name
- **Steps**: Create "Test Env". Try creating another "Test Env".
- **Expected**: Either allowed (duplicate names OK) or error message. Verify which behavior applies.

### TC-15.3.6 — Cancel environment creation
- **Steps**: Click "New" → fill in fields → click Cancel.
- **Expected**: Form dismissed. No environment created. No changes persisted.

### TC-15.3.7 — Icon selector has all 12 options
- **Steps**: Open create form → click icon selector.
- **Expected**: 12 emoji options visible: 🔧 🚀 💻 🎨 📦 🔬 🎯 ⚡ 🌐 🛠️ 📝 🤖.

### TC-15.3.8 — Color picker has all 8 options
- **Steps**: Open create form → view color picker.
- **Expected**: 8 colors: blue, green, purple, orange, pink, yellow, red, teal. Each selectable.

---

## 15.4 Environment Card Operations (P0)

### TC-15.4.1 — Expand environment card
- **Steps**: Click on a custom environment card.
- **Expected**: Card expands showing: Edit Metadata, Skills RefPicker, Rules RefPicker, Knowledge tab, Connectors RefPicker, Instructions section.

### TC-15.4.2 — Edit environment metadata
- **Steps**: Expand card → click edit on name/description → change name to "Updated Env" → save.
- **Expected**: Name updates immediately in card header. Change persisted on reload.

### TC-15.4.3 — Change environment icon
- **Steps**: Edit metadata → select different icon → save.
- **Expected**: Card icon updates. Persisted on reload.

### TC-15.4.4 — Change environment color
- **Steps**: Edit metadata → select different color → save.
- **Expected**: Card color accent updates. Persisted on reload.

### TC-15.4.5 — Set environment as workspace default
- **Steps**: Expand card → click "Set as Default" (star icon).
- **Expected**: Environment marked as default. Badge/indicator shown. All projects without explicit override use this environment.

### TC-15.4.6 — Unset workspace default
- **Steps**: Click "Set as Default" on the currently-default environment.
- **Expected**: Default removed. Projects fall back to "Workspace Defaults" (all items).

### TC-15.4.7 — Clone environment
- **Steps**: Expand card → click "Clone".
- **Expected**: New environment created with same skills, rules, knowledge, connectors, instructions. Name appended with "(Copy)" or similar.

### TC-15.4.8 — Export environment as JSON
- **Steps**: Expand card → click "Export".
- **Expected**: JSON file downloaded. Contains: name, description, icon, color, skills, rules, knowledge, connectors, instructions.

### TC-15.4.9 — Delete environment with confirmation
- **Steps**: Expand card → click "Delete" → confirm.
- **Expected**: Confirmation dialog appears. On confirm, environment removed from list. Projects using it fall back to default.

### TC-15.4.10 — Delete environment — cancel confirmation
- **Steps**: Click Delete → click Cancel in confirmation.
- **Expected**: Environment not deleted. Card still present.

---

## 15.5 Environment Items — Skills (P1)

### TC-15.5.1 — Add skill to environment via RefPicker
- **Steps**: Expand environment → click "Edit" next to Skills → enable a workspace skill from the picker.
- **Expected**: Skill added to environment. Listed under Skills section. Saved immediately.

### TC-15.5.2 — Remove skill from environment
- **Steps**: In Skills section → click remove/uncheck a skill.
- **Expected**: Skill removed from environment. No longer listed.

### TC-15.5.3 — Multiple skills in one environment
- **Steps**: Add 3 different skills to the environment.
- **Expected**: All 3 listed under Skills. Order preserved.

### TC-15.5.4 — Skill in environment reflected in AI chat
- **Steps**: Assign environment with specific skill "Always use TypeScript strict mode" to a project. Open project chat → ask "Create a config file".
- **Expected**: AI generates `tsconfig.json` with `strict: true`. Skill took effect.

---

## 15.6 Environment Items — Rules (P1)

### TC-15.6.1 — Add rule to environment
- **Steps**: Expand environment → click "Edit" next to Rules → add a rule.
- **Expected**: Rule added. Listed under Rules section.

### TC-15.6.2 — Remove rule from environment
- **Steps**: Remove a rule from the environment.
- **Expected**: Rule removed. No longer listed.

### TC-15.6.3 — Rule in environment reflected in AI chat
- **Steps**: Add rule "Never use console.log, always use a proper logger". Assign environment to project. Ask AI to "Add error handling".
- **Expected**: AI uses logger instead of console.log.

---

## 15.7 Environment Items — Knowledge (P1)

### TC-15.7.1 — Add knowledge file to environment
- **Steps**: Expand environment → Knowledge tab → click "Add file" → enter filename "api-docs.md" → add content.
- **Expected**: Knowledge file created in environment. Listed with filename and content.

### TC-15.7.2 — Edit knowledge file in environment
- **Steps**: Click on an existing knowledge file → edit content → save.
- **Expected**: Content updated. Changed persisted on reload.

### TC-15.7.3 — Delete knowledge file from environment
- **Steps**: Delete a knowledge file.
- **Expected**: File removed from environment.

### TC-15.7.4 — Multiple knowledge files per environment
- **Steps**: Add 3 knowledge files to one environment.
- **Expected**: All 3 listed. All injected into AI context.

### TC-15.7.5 — Knowledge filename validation
- **Steps**: Try creating file with: (a) no extension, (b) `.txt` extension, (c) special characters, (d) uppercase.
- **Expected**: Only lowercase `.md` files accepted. Validation errors for invalid names.

---

## 15.8 Environment Items — Connectors (P1)

### TC-15.8.1 — Add MCP connector to environment
- **Steps**: Expand environment → click "Edit" next to Connectors → enable a workspace connector.
- **Expected**: Connector added to environment. Listed under Connectors section.

### TC-15.8.2 — Remove MCP connector from environment
- **Steps**: Remove a connector from the environment.
- **Expected**: Connector removed. AI no longer has access to that connector's tools when using this environment.

### TC-15.8.3 — Connector filtering in AI chat
- **Steps**: Create env with only Connector A (not Connector B). Assign to project. Chat with AI.
- **Expected**: Only Connector A's tools available. Connector B's tools not exposed to AI even if configured at workspace level.

---

## 15.9 Environment Items — Instructions (P1)

### TC-15.9.1 — Add instruction file to environment
- **Steps**: Expand environment → Instructions section → click "Add" → enter filename "coding-style.md" → add content.
- **Expected**: Instruction file created. Listed in Instructions section.

### TC-15.9.2 — Edit instruction file
- **Steps**: Click on instruction file → edit content → save.
- **Expected**: Content updated. Persisted on reload.

### TC-15.9.3 — Delete instruction file
- **Steps**: Delete an instruction file.
- **Expected**: File removed. AI no longer receives these instructions.

### TC-15.9.4 — Instructions injected into AI context
- **Steps**: Add instruction: "Always respond in bullet points. Never use paragraphs." → assign env to project → chat.
- **Expected**: AI responds in bullet points.

---

## 15.10 Environment Templates (P1)

### TC-15.10.1 — Open template gallery
- **Steps**: Click "Templates" button in Environments header.
- **Expected**: Modal/gallery opens showing available environment templates with icons, names, descriptions.

### TC-15.10.2 — Clone template to workspace
- **Steps**: In gallery, click "Use Template" on a template.
- **Expected**: Template cloned as new environment in workspace. Appears in environments list with all template items (skills, rules, knowledge, connectors).

### TC-15.10.3 — Template is independent after cloning
- **Steps**: Clone a template → modify the cloned environment (add/remove items).
- **Expected**: Changes apply only to clone. Original template unchanged.

### TC-15.10.4 — Empty templates gallery
- **Steps**: Open templates when no templates exist.
- **Expected**: Empty state message. No errors.

---

## 15.11 Environment Import/Export (P1)

### TC-15.11.1 — Import environment from JSON file
- **Steps**: Click "Import" → select a valid environment JSON file.
- **Expected**: Environment imported. Appears in list with all items from JSON.

### TC-15.11.2 — Import invalid JSON
- **Steps**: Try importing a file with invalid JSON.
- **Expected**: Error message. No environment created.

### TC-15.11.3 — Import non-JSON file
- **Steps**: Try importing a `.txt` or `.csv` file.
- **Expected**: File input only accepts `.json`. If forced, error message shown.

### TC-15.11.4 — Round-trip: Export then Import
- **Steps**: Export an environment → delete it → import the exported JSON.
- **Expected**: Environment recreated with same name, description, icon, color, and all items.

---

## 15.12 Environment Assignment to Projects (P0)

### TC-15.12.1 — Assign environment to project via Project Settings
- **Steps**: Open project → Settings → Environments tab → select custom environment from dropdown.
- **Expected**: Project now uses selected environment. API call: `PUT /projects/{id}/environment`.

### TC-15.12.2 — Project shows "custom environment override" indicator
- **Steps**: After assignment, view project settings.
- **Expected**: Message: "This project uses a custom environment override."

### TC-15.12.3 — Reassign project to different environment
- **Steps**: Change project environment from Env A to Env B.
- **Expected**: Project now uses Env B. Previous Env A settings no longer apply.

### TC-15.12.4 — Remove project environment override (use workspace default)
- **Steps**: In project settings dropdown, select "Use workspace default".
- **Expected**: API call: `DELETE /projects/{id}/environment`. Message shows "Inheriting from workspace default."

### TC-15.12.5 — Project environment overrides workspace default
- **Steps**: Set workspace default env with Rule A. Assign project-specific env with Rule B (different). Chat with AI.
- **Expected**: AI follows Rule B from project env. Rule A from workspace default not applied.

### TC-15.12.6 — Project with no override inherits workspace defaults
- **Steps**: Set workspace default env with Skill X. Create project with no override. Chat with AI.
- **Expected**: AI has Skill X from workspace default environment.

---

## 15.13 Environment Variables (P1)

### TC-15.13.1 — Navigate to env vars panel
- **Steps**: In Environments or Project Settings, find the Variables tab.
- **Expected**: Variables tab visible with key-value table. Columns: Key, Value (masked for secrets), Target, Actions.

### TC-15.13.2 — Add workspace-scoped env var
- **Steps**: Click "Add Variable" → key "API_URL", value "https://api.example.com", target "all", not secret → save.
- **Expected**: Variable appears in list. Value visible. Scope: workspace.

### TC-15.13.3 — Add secret env var
- **Steps**: Add variable with `isSecret: true` → key "DB_PASSWORD", value "s3cr3t".
- **Expected**: Variable saved. Value shown as `••••••` or masked. Not visible in UI.

### TC-15.13.4 — Reveal secret value
- **Steps**: Click reveal/eye icon on a secret variable.
- **Expected**: API call to `/env-vars/{id}/value`. Decrypted value shown temporarily.

### TC-15.13.5 — Add project-scoped env var
- **Steps**: In project settings → Variables tab → add variable.
- **Expected**: Variable scoped to project. Not visible in workspace-level vars.

### TC-15.13.6 — Project env var overrides workspace env var
- **Steps**: Set workspace var `API_URL=https://workspace.com`. Set project var `API_URL=https://project.com`. Check resolved vars.
- **Expected**: Resolved value for project is `https://project.com` (project overrides workspace).

### TC-15.13.7 — Target filtering (development/preview/production)
- **Steps**: Add var with target "development". Check resolved vars for "production".
- **Expected**: Variable only appears when target matches. Not included in production resolution.

### TC-15.13.8 — Delete env var
- **Steps**: Click delete on a variable → confirm.
- **Expected**: Variable removed. No longer injected.

### TC-15.13.9 — Edit env var key and value
- **Steps**: Click edit on a variable → change key and value → save.
- **Expected**: Variable updated. New key/value persisted.

### TC-15.13.10 — Env var injected into project runtime
- **Steps**: Add env var `GREETING=Hello World`. In project code, reference `import.meta.env.GREETING`. Run preview.
- **Expected**: Environment variable accessible in code. Preview displays "Hello World".

### TC-15.13.11 — Encrypted at rest verification
- **Steps**: Add a secret env var. Check DB directly (if possible) or verify via API that raw value is never returned in list responses.
- **Expected**: List API returns masked value. Only `/env-vars/{id}/value` reveals plaintext. DB stores `pgp_sym_encrypt()`'d value.

---

## 15.14 Environment in Editor Sidebar (P1)

### TC-15.14.1 — Open environment panel in editor
- **Steps**: In project editor, find the Environment panel/tab in sidebar.
- **Expected**: Panel shows with tabs: Integrations, Knowledge, Skills, Variables, Settings.

### TC-15.14.2 — View assigned environment in editor
- **Steps**: Open project with custom environment assigned. Check Settings tab.
- **Expected**: Shows which environment is active. Name and icon visible.

### TC-15.14.3 — Change environment from editor sidebar
- **Steps**: In Settings tab → change environment dropdown.
- **Expected**: Environment changes. Other tabs (Skills, Knowledge, etc.) update to reflect new environment's items.

### TC-15.14.4 — Detach environment panel as floating modal
- **Steps**: Click detach/float button on environment panel.
- **Expected**: Panel opens as floating modal. Still functional with all tabs.

---

## 15.15 Environment Resolution Priority (P0)

### TC-15.15.1 — Resolution order: project env > workspace default > all workspace items
- **Steps**:
  1. Add workspace-level skill "A" (default items)
  2. Set workspace default environment with skill "B"
  3. Assign project-specific environment with skill "C"
  4. Chat in project.
- **Expected**: Only skill "C" is active (project env wins). Skill "A" and "B" are not injected.

### TC-15.15.2 — No project env: workspace default used
- **Steps**: Set workspace default environment with skill "B". Create project without override. Chat.
- **Expected**: Skill "B" is active.

### TC-15.15.3 — No project env, no workspace default: all workspace items used
- **Steps**: Remove workspace default environment. Add workspace-level skills/rules directly. Create project without override. Chat.
- **Expected**: All workspace-level skills and rules are injected as "virtual default."

### TC-15.15.4 — Delete assigned environment: project falls back
- **Steps**: Assign environment to project → delete that environment → chat in project.
- **Expected**: Project falls back to workspace default or all workspace items. No error in chat.

---

## 15.16 Refresh & Error States (P2)

### TC-15.16.1 — Refresh button reloads environments list
- **Steps**: Click "Refresh" button in header.
- **Expected**: List re-fetched from API. Loading indicator briefly shown.

### TC-15.16.2 — Network error loading environments
- **Steps**: Disconnect network → open Environments tab.
- **Expected**: Error state shown. Retry possible.

### TC-15.16.3 — Concurrent edits by two users
- **Steps**: Two users edit the same environment simultaneously.
- **Expected**: Last write wins. No data corruption. One user may see stale data until refresh.
