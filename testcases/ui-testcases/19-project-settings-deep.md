# TC-19: Project Settings — All Tabs Deep Testing

> **Scope:** Every UI element, action, state, and validation across all 8 project settings tabs.
> **Navigation:** Dashboard → Project card → Settings (gear icon), or `/projects/{id}/settings?tab={tabId}`
> **Tabs:** general, integrations, mcp, skills, context, domain, environments, danger

---

## 19.1 Settings Page — Loading & Navigation (P0)

### TC-19.1.1 — Navigate to project settings from dashboard
- **Steps:** On dashboard, click the gear/settings icon on any project card.
- **Expected:** `/projects/{id}/settings` loads. Default tab is "General". All 8 tab buttons visible in horizontal nav.

### TC-19.1.2 — Navigate via direct URL with tab param
- **Steps:** Navigate to `/projects/{id}/settings?tab=domain`.
- **Expected:** Page loads directly on the Custom Domain tab. Tab button highlighted.

### TC-19.1.3 — Navigate with invalid tab param
- **Steps:** Navigate to `/projects/{id}/settings?tab=nonexistent`.
- **Expected:** Falls back to "General" tab. No error.

### TC-19.1.4 — Loading skeleton
- **Steps:** Navigate to project settings with slow network (throttle to Slow 3G).
- **Expected:** `SettingsLoadingSkeleton` shown: animated placeholder with 7 tab button placeholders. Content loads once API responds.

### TC-19.1.5 — Invalid project ID
- **Steps:** Navigate to `/projects/invalid-uuid/settings`.
- **Expected:** "Project not found" error message shown. No crash.

### TC-19.1.6 — Tab switching
- **Steps:** Click each of the 8 tab buttons in sequence: General → Integrations → MCP Servers → Skills & Rules → Knowledge → Custom Domain → Environments → Danger Zone.
- **Expected:** Each tab renders its content. Tab button shows active state (highlighted). Previous tab's content unmounts.

### TC-19.1.7 — Tab icons display
- **Steps:** Inspect all 8 tab buttons in the nav bar.
- **Expected:** Each tab has a Lucide icon + text label. Icons are contextually appropriate (Settings, Plug, Terminal, Brain, BookOpen, Globe, Server, AlertTriangle).

### TC-19.1.8 — Responsive tab nav on narrow viewport
- **Steps:** Resize browser to mobile width (< 640px). Look at tab nav.
- **Expected:** Tabs are horizontally scrollable. All 8 remain accessible via scroll.

---

## 19.2 General Tab — Project Details (P0)

### TC-19.2.1 — View initial project details
- **Steps:** Open General tab.
- **Expected:** Name input pre-filled with project name. Description textarea pre-filled (or empty). Visibility shows current state (Public or Private button highlighted).

### TC-19.2.2 — Edit project name
- **Steps:** Clear name input → type "Renamed Project" → observe.
- **Expected:** "You have unsaved changes" label appears. Save button becomes enabled (blue).

### TC-19.2.3 — Edit project description
- **Steps:** Type a description in the textarea → observe.
- **Expected:** "You have unsaved changes" label. Save button enabled. Textarea has 3 rows.

### TC-19.2.4 — Toggle visibility: Public → Private
- **Steps:** Click "Private" button (with EyeOff icon).
- **Expected:** Private button gets active styling (border-primary, bg-primary/5). Public button gets inactive styling. "You have unsaved changes" shown.

### TC-19.2.5 — Toggle visibility: Private → Public
- **Steps:** Click "Public" button (with Eye icon).
- **Expected:** Public button active. Private button inactive. Change tracked.

### TC-19.2.6 — Save changes successfully
- **Steps:** Change name → click "Save Changes".
- **Expected:** Button shows "Saving..." with spinning Loader2 icon. Toast: "Project settings saved". Button reverts to disabled. "Unsaved changes" label disappears.

### TC-19.2.7 — Save with empty name
- **Steps:** Clear name input entirely → click "Save Changes".
- **Expected:** Save should fail. Name required (trimmed). Toast shows error message.

### TC-19.2.8 — Save button disabled when no changes
- **Steps:** Open General tab without making changes.
- **Expected:** "Save Changes" button is grayed out (bg-muted), not clickable. No "unsaved changes" label.

### TC-19.2.9 — Clear description to empty
- **Steps:** Clear description textarea → save.
- **Expected:** Description saved as empty/null. No error. Placeholder "A brief description of your project" shown after save.

### TC-19.2.10 — Multiple rapid changes then save
- **Steps:** Quickly type name, change description, toggle visibility → click Save once.
- **Expected:** All three changes saved in a single API call. Toast confirms success.

---

## 19.3 General Tab — Project Information (P0)

### TC-19.3.1 — View project info cards
- **Steps:** Scroll down on General tab below "Project Details".
- **Expected:** 6 read-only info cards in 2-column grid: Project ID, Created, Last Updated, Project URL, Status, Visibility.

### TC-19.3.2 — Project ID display
- **Steps:** Check Project ID card.
- **Expected:** Shows full UUID in monospace font. Hash icon. Not editable.

### TC-19.3.3 — Created date
- **Steps:** Check Created card.
- **Expected:** Shows formatted date (e.g., "April 14, 2026"). Calendar icon.

### TC-19.3.4 — Last Updated date
- **Steps:** Check Last Updated card.
- **Expected:** Shows formatted date AND time. Clock icon. Updates after saving changes.

### TC-19.3.5 — Project URL
- **Steps:** Check Project URL card.
- **Expected:** Shows `{slug}.doable.me` in monospace. Link2 icon.

### TC-19.3.6 — Status badge
- **Steps:** Check Status card.
- **Expected:** Shows project status ("active", "draft", etc.) as a badge. Shield icon.

### TC-19.3.7 — Visibility badge
- **Steps:** Check Visibility card.
- **Expected:** Shows "public" or "private" as a badge. Eye icon. Updates after saving visibility change.

### TC-19.3.8 — Last Updated refreshes after save
- **Steps:** Make a change → save → check Last Updated card.
- **Expected:** Timestamp updated to current time.

---

## 19.4 Integrations Tab — Integrations Panel (P1)

### TC-19.4.1 — Open Integrations tab
- **Steps:** Click Integrations tab.
- **Expected:** Panel loads with header (Plug icon + "Integrations"), Refresh button, Add button.

### TC-19.4.2 — Integration catalog — initial view
- **Steps:** Observe the catalog section.
- **Expected:** Search bar visible. Category pills ("All" + categories). Grid of available integrations with icon, name, description, status badge.

### TC-19.4.3 — Search integrations
- **Steps:** Type "github" in the search bar → wait 300ms (debounce).
- **Expected:** Catalog filters to show only GitHub-related integrations. Other items hidden.

### TC-19.4.4 — Search with no results
- **Steps:** Type "zzznonexistent" in search bar.
- **Expected:** No integrations shown. Empty state or "No results" message.

### TC-19.4.5 — Filter by category pill
- **Steps:** Click a category pill (e.g., "Database", "AI", "Code").
- **Expected:** Catalog filters to that category only. "All" pill deselects. Category pill gets active styling.

### TC-19.4.6 — Switch back to "All" category
- **Steps:** After filtering, click "All" pill.
- **Expected:** All integrations shown again. Pagination resets.

### TC-19.4.7 — Pagination ("Load more")
- **Steps:** If more than 24 integrations exist, scroll to bottom.
- **Expected:** "Load more" button visible. Clicking it loads next 24 items.

### TC-19.4.8 — Connected vs Available sections
- **Steps:** If any integrations are connected, observe layout.
- **Expected:** "Connected" section appears first (green dot + "Connected" badge). "Available" section below.

### TC-19.4.9 — Click "Connect" on an integration
- **Steps:** Click "Connect" on an available integration card.
- **Expected:** ConnectFlow dialog opens with configuration form (scope, credentials, display name).

### TC-19.4.10 — Integration loading skeleton
- **Steps:** Force slow network → open Integrations tab.
- **Expected:** Skeleton grid (6 placeholder items) shown while loading.

### TC-19.4.11 — Integration error state
- **Steps:** Simulate API failure (block network request).
- **Expected:** Red alert box with error message replaces catalog.

### TC-19.4.12 — Refresh integrations
- **Steps:** Click Refresh button.
- **Expected:** Refresh icon spins. Integration list reloads from API. Spinner stops.

---

## 19.5 Integrations Tab — Custom MCP Connectors Section (P1)

### TC-19.5.1 — View custom MCP connectors
- **Steps:** Scroll down past catalog to "Custom MCP Connectors" section.
- **Expected:** Section heading in uppercase muted text. Cards grouped by scope.

### TC-19.5.2 — Scope grouping
- **Steps:** If connectors exist at different scopes, observe grouping.
- **Expected:** Three groups: "Everyone in this workspace", "Everyone on this project", "Only me (personal)". Each group shows its connectors.

### TC-19.5.3 — Expand connector card
- **Steps:** Click on a connector card.
- **Expected:** Card expands (ChevronRight → ChevronDown). Shows connection details, tools, test/delete buttons.

### TC-19.5.4 — Test connector from integrations
- **Steps:** Expand a connector → click "Test" button.
- **Expected:** Toast shows test result (success or error).

### TC-19.5.5 — Delete connector from integrations
- **Steps:** Expand a connector → click "Delete" → confirm.
- **Expected:** Connector removed. Success toast. Card disappears from list.

### TC-19.5.6 — Add integration button
- **Steps:** Click "Add" button in header.
- **Expected:** AddIntegrationForm dialog opens with fields for scope, transport type, credentials, etc.

---

## 19.6 Integrations Tab — GitHub Sync (P1)

### TC-19.6.1 — GitHub sync section visibility (no token)
- **Steps:** Open Integrations tab when GitHub is NOT connected.
- **Expected:** GitHub Sync section either hidden or shows "Not connected to GitHub" message.

### TC-19.6.2 — GitHub sync section visibility (with token)
- **Steps:** Open Integrations tab when GitHub IS connected.
- **Expected:** Full sync UI: connection status card, push section, pull section, commit history, disconnect.

### TC-19.6.3 — Connection status display
- **Steps:** View status card when connected.
- **Expected:** Shows repo link (`owner/repo` clickable to GitHub), status dot (green=synced, orange=behind, red=diverged), branch name, last synced time.

### TC-19.6.4 — Push changes to GitHub
- **Steps:** Type commit message "test push" in input → click "Push".
- **Expected:** Button shows "Pushing...". On success: toast "Pushed X files (abc1234)". Commit appears in history with blue "push" badge.

### TC-19.6.5 — Push with empty commit message
- **Steps:** Leave commit message empty → observe Push button.
- **Expected:** Push button disabled (grayed out). Cannot submit.

### TC-19.6.6 — Push with Enter key
- **Steps:** Type commit message → press Enter.
- **Expected:** Triggers push (same as clicking button).

### TC-19.6.7 — Pull changes from GitHub
- **Steps:** Click "Pull" button.
- **Expected:** Button shows "Pulling...". On success: toast "Pulled X files". Commit in history with green "pull" badge.

### TC-19.6.8 — Force push (diverged state)
- **Steps:** Simulate diverged state (push from another source). View error.
- **Expected:** Red error message. "Force Push" button appears. Clicking it overwrites remote with local.

### TC-19.6.9 — Commit history display
- **Steps:** After push/pull, check commit history section.
- **Expected:** Recent commits shown with: message, SHA (7 chars), author, timestamp, direction badge (blue push / green pull).

### TC-19.6.10 — Disconnect GitHub repo
- **Steps:** Click "Disconnect Repository" in the red-bordered card → confirm.
- **Expected:** Toast: "Disconnected from GitHub". Sync UI disappears. Note: "Your code will not be deleted."

---

## 19.7 MCP Servers Tab (P0)

### TC-19.7.1 — Open MCP Servers tab
- **Steps:** Click MCP Servers tab.
- **Expected:** Header: "MCP Servers" with description. Stats: "{count} servers configured • {activeCount} active". Refresh + "Add MCP Server" buttons.

### TC-19.7.2 — Empty state
- **Steps:** Open when no MCP servers configured.
- **Expected:** Terminal icon. "No MCP servers configured". "Add Your First Server" button.

### TC-19.7.3 — Add MCP server — stdio transport
- **Steps:** Click "Add MCP Server" → select transport "stdio" → enter command: `npx` → args: `-y, @modelcontextprotocol/server-everything` → name: "Test Server" → scope: "project" → Create.
- **Expected:** Server added. Card appears in list. Status shows "active" or "inactive". Tools discovered.

### TC-19.7.4 — Add MCP server — HTTP SSE transport
- **Steps:** Click "Add MCP Server" → select "http_sse" → enter URL → name → Create.
- **Expected:** Server added. URL shown in connection info.

### TC-19.7.5 — Add MCP server — Streamable HTTP transport
- **Steps:** Click "Add MCP Server" → select "streamable_http" → enter URL → name → Create.
- **Expected:** Server added with streamable HTTP config.

### TC-19.7.6 — Validation: missing required fields
- **Steps:** Try to add without name. Try to add stdio without command. Try to add HTTP without URL.
- **Expected:** Each case shows validation error. Create button disabled or form shows error.

### TC-19.7.7 — Connector card — collapsed view
- **Steps:** View a configured server card (collapsed).
- **Expected:** Shows: server name, status badge (green/gray/red), tools count badge, chevron icon.

### TC-19.7.8 — Connector card — expanded view
- **Steps:** Click on a server card to expand.
- **Expected:** Shows: connection info (URL/command, transport type), tools list (name + description + args table), Test/Activate-Deactivate/Delete buttons.

### TC-19.7.9 — Test connection
- **Steps:** Expand a server → click "Test Connection".
- **Expected:** Toast shows result. Success: "Connection successful" (or similar). Failure: error message with details.

### TC-19.7.10 — Activate/Deactivate server
- **Steps:** Click "Deactivate" on an active server → then "Activate" on it.
- **Expected:** Status toggles. Badge changes (green ↔ gray). Tools become unavailable when deactivated.

### TC-19.7.11 — Delete server
- **Steps:** Click Delete (red) → confirm.
- **Expected:** Server removed from list. Stats count decreases. Toast confirms deletion.

### TC-19.7.12 — Refresh servers list
- **Steps:** Click Refresh button.
- **Expected:** Refresh icon spins. List reloads from API. New servers appear if added elsewhere.

### TC-19.7.13 — Error alert display
- **Steps:** Simulate API error on load.
- **Expected:** Red banner with error message shown above server list.

### TC-19.7.14 — Tools list in expanded card
- **Steps:** Add the `@modelcontextprotocol/server-everything` server → expand card.
- **Expected:** Tools listed: echo, add, longRunningOperation, printEnv, etc. Each shows description and arguments table.

### TC-19.7.15 — Project-scoped vs workspace-scoped MCP
- **Steps:** Add one server at project scope, one at workspace scope. Check both appear.
- **Expected:** Both listed. Scope indicators differentiate them.

---

## 19.8 Skills & Rules Tab — Skills (P1)

### TC-19.8.1 — Open Skills & Rules tab
- **Steps:** Click Skills & Rules tab.
- **Expected:** Two sections: Skills (Brain icon, counter) and Rules (ScrollText icon, counter). "Add Skill" and "Add Rule" buttons visible.

### TC-19.8.2 — Skills empty state
- **Steps:** Open tab when no skills exist.
- **Expected:** Brain icon faded. "No skills yet. Add one to teach the AI new capabilities."

### TC-19.8.3 — Create a skill
- **Steps:** Click "Add Skill" → Name: "React Best Practices" → Content: "Always use functional components with hooks. Prefer composition over inheritance." → Click "Create".
- **Expected:** Form closes. New skill card appears in list. Counter increments. Toast confirms creation.

### TC-19.8.4 — Create skill — validation
- **Steps:** Click "Add Skill" → leave name empty → observe Create button.
- **Expected:** Create button disabled. Both name and content required (trimmed).

### TC-19.8.5 — Create skill — empty content
- **Steps:** Enter name but leave content empty.
- **Expected:** Create button disabled. Content is required.

### TC-19.8.6 — Cancel skill creation
- **Steps:** Click "Add Skill" → fill some fields → click "Cancel".
- **Expected:** Form collapses. No skill created. Data cleared.

### TC-19.8.7 — "Add Skill" button disabled during creation
- **Steps:** Open the add skill form → look at "Add Skill" button.
- **Expected:** "Add Skill" button is disabled while form is open (prevents double-form).

### TC-19.8.8 — Expand/collapse skill card
- **Steps:** Click on a skill card header.
- **Expected:** Toggles expansion. Chevron rotates. Collapsed shows first 2 lines (line-clamp-2). Expanded shows full content.

### TC-19.8.9 — Inline edit skill content
- **Steps:** Expand a skill → click edit icon on content area → modify text → click check button.
- **Expected:** Content updates. "Unsaved" badge shown while editing. Saved on confirmation. API call updates content.

### TC-19.8.10 — Cancel inline edit (Escape)
- **Steps:** Enter inline edit mode → make changes → press Escape.
- **Expected:** Edit cancelled. Original content restored. No API call made.

### TC-19.8.11 — Scope badge on skill cards
- **Steps:** Observe skill cards.
- **Expected:** Each card shows scope badge: "workspace", "project", or "user".

### TC-19.8.12 — Delete skill — confirmation flow
- **Steps:** Click trash icon on a skill → observe.
- **Expected:** Shows inline confirmation: "Delete this skill?" with Cancel/Delete buttons. Not deleted until confirmed.

### TC-19.8.13 — Delete skill — confirm
- **Steps:** Click trash icon → click "Delete" in confirmation.
- **Expected:** Skill removed from list. Counter decrements. API call made.

### TC-19.8.14 — Delete skill — cancel
- **Steps:** Click trash icon → click "Cancel".
- **Expected:** Confirmation dismissed. Skill remains.

### TC-19.8.15 — Skill affects AI chat behavior
- **Steps:** Create skill: "Always respond in bullet points. Never use numbered lists." → Open AI chat → ask "List 5 programming languages".
- **Expected:** AI responds in bullet points, not numbered list. Skill context injected.

---

## 19.9 Skills & Rules Tab — Rules (P1)

### TC-19.9.1 — Rules empty state
- **Steps:** Open tab when no rules exist.
- **Expected:** ScrollText icon faded. "No rules yet. Add one to set constraints for the AI."

### TC-19.9.2 — Create a rule
- **Steps:** Click "Add Rule" → Name: "TypeScript Conventions" → File Patterns: "*.tsx, *.ts" → Content: "Always use strict TypeScript with explicit return types. No any types." → Click "Create".
- **Expected:** Rule card appears. Counter increments. File patterns shown as badges below name.

### TC-19.9.3 — Create rule — without file patterns
- **Steps:** Click "Add Rule" → Name + Content only, leave File Patterns empty → Create.
- **Expected:** Rule created. Shows "No file patterns — applies to all files" in gray italic.

### TC-19.9.4 — Create rule — validation
- **Steps:** Try to create with empty name. Try with empty content.
- **Expected:** Create button disabled. Name and content both required.

### TC-19.9.5 — File patterns display
- **Steps:** Create rule with patterns: "*.tsx, *.ts, src/**/*.js" → view card.
- **Expected:** Three badges shown: `*.tsx`, `*.ts`, `src/**/*.js`. Each in secondary styling.

### TC-19.9.6 — Inline edit file patterns
- **Steps:** Expand a rule → click "Edit" next to "File Patterns" → modify patterns → save.
- **Expected:** Patterns update. Input shows comma-separated list. Check button saves. Escape cancels.

### TC-19.9.7 — Inline edit rule content
- **Steps:** Expand a rule → click edit on content → modify → save.
- **Expected:** Content updated via API. "Unsaved" badge while editing.

### TC-19.9.8 — Delete rule — confirmation flow
- **Steps:** Click trash on a rule → observe confirmation → confirm or cancel.
- **Expected:** Same flow as skills: "Delete this rule?" with Cancel/Delete. Rule removed only on confirm.

### TC-19.9.9 — Rule affects AI code generation
- **Steps:** Create rule: "Never use var. Always use const or let." with pattern "*.ts,*.tsx" → ask AI to write code in a .ts file.
- **Expected:** AI uses const/let exclusively. Rule constraint respected in generated code.

### TC-19.9.10 — Multiple rules coexisting
- **Steps:** Create 3 rules with different file patterns → ask AI to generate code matching each pattern.
- **Expected:** Correct rule applied based on file context. Rules don't conflict.

---

## 19.10 Knowledge Tab — File List (P0)

### TC-19.10.1 — Open Knowledge tab
- **Steps:** Click Knowledge tab.
- **Expected:** Header: "Knowledge (.doable/)". Description shown. Token budget status bar. File list with all context files.

### TC-19.10.2 — Token budget display
- **Steps:** Observe the budget section.
- **Expected:** Shows: "{totalFiles} files, {estimatedTokens} tokens". Progress bar with percentage. Color: green (< 80%), amber (80-95%), red (> 95%).

### TC-19.10.3 — File list — all default files present
- **Steps:** Check the file list.
- **Expected:** All 7 core files shown: identity.md (BookOpen), knowledge.md (Brain), instructions.md (Lightbulb), soul.md (Heart), memory.md (Clock), user.md (User), plan.md (Map). Each with custom icon.

### TC-19.10.4 — File with content vs empty file
- **Steps:** Observe files that have content vs empty ones.
- **Expected:** Files with content: icon has `bg-primary/10`, emerald status dot, shows character count. Empty files: icon has `bg-muted`, muted dot, shows "Empty -- click to edit".

### TC-19.10.5 — Click file to enter editor
- **Steps:** Click on "identity.md".
- **Expected:** Switches to editor view. File list hidden. Editor shows with back button, file name, character count, save button, monospace textarea.

### TC-19.10.6 — Refresh files list
- **Steps:** Click Refresh button at bottom.
- **Expected:** File list reloads from API. Any external changes reflected.

### TC-19.10.7 — Loading skeleton
- **Steps:** Force slow network → open Knowledge tab.
- **Expected:** 5 skeleton items with shimmer animation shown while loading.

### TC-19.10.8 — Load error
- **Steps:** Simulate API failure.
- **Expected:** Toast: error message or "Failed to load context files".

---

## 19.11 Knowledge Tab — File Editor (P0)

### TC-19.11.1 — Editor layout
- **Steps:** Click a file to edit it.
- **Expected:** Toolbar: back arrow, file icon + name, "Unsaved" badge (hidden initially), character count, Save button. Main area: monospace textarea (20 rows), spellcheck off, auto-focused. Footer: last updated timestamp, "Ctrl+S to save" hint.

### TC-19.11.2 — Type content in editor
- **Steps:** Type text in the textarea.
- **Expected:** "Unsaved" badge appears (amber). Character count updates live. Save button becomes enabled.

### TC-19.11.3 — Save with Ctrl+S keyboard shortcut
- **Steps:** Make changes → press Ctrl+S (or Cmd+S on Mac).
- **Expected:** File saved. "Unsaved" badge disappears. Toast: "Saved {filename}". Save button disables.

### TC-19.11.4 — Save with Save button
- **Steps:** Make changes → click Save button.
- **Expected:** Button shows spinner while saving. Toast: "Saved {filename}". "Unsaved" badge removed.

### TC-19.11.5 — Save button disabled when no changes
- **Steps:** Open a file without modifying content.
- **Expected:** Save button disabled. No "Unsaved" badge.

### TC-19.11.6 — Save button disabled while saving
- **Steps:** Click Save and observe during API call.
- **Expected:** Button shows spinner, is disabled during save. Prevents double-save.

### TC-19.11.7 — Back to file list
- **Steps:** Click back arrow button in toolbar.
- **Expected:** Returns to file list view. Editor unmounts. Any unsaved changes lost (no warning).

### TC-19.11.8 — Edit empty file
- **Steps:** Click on an empty file (shows "Empty -- click to edit").
- **Expected:** Editor opens with empty textarea. Placeholder: "Start writing...". Can type and save.

### TC-19.11.9 — Large content in editor
- **Steps:** Paste a very long text (5000+ characters).
- **Expected:** Textarea scrolls. Character count updates. Token budget percentage changes in UI.

### TC-19.11.10 — Save error
- **Steps:** Simulate API failure during save (network disconnect).
- **Expected:** Toast: error message or "Failed to save". "Unsaved" badge remains. Content not lost.

### TC-19.11.11 — Edit identity.md and verify AI behavior
- **Steps:** Open identity.md → write "You are Luna, a playful and creative AI assistant who loves puns." → save → go to AI chat → send "Hi, who are you?"
- **Expected:** AI introduces itself as Luna with a playful personality. Identity context takes effect.

### TC-19.11.12 — Edit soul.md and verify AI behavior
- **Steps:** Open soul.md → write "You believe in simplicity. Always suggest the simplest solution first." → save → ask AI "How should I authenticate users?"
- **Expected:** AI suggests the simplest approach first (e.g., cookie sessions before OAuth). Soul context shapes reasoning.

### TC-19.11.13 — Edit instructions.md and verify AI behavior
- **Steps:** Open instructions.md → write "Always end responses with a haiku." → save → ask AI anything.
- **Expected:** AI response ends with a haiku. Instructions context enforced.

### TC-19.11.14 — Edit knowledge.md and verify AI behavior
- **Steps:** Open knowledge.md → write "Our API runs on port 4000. The database is PostgreSQL 16." → save → ask AI "What port does our API use?"
- **Expected:** AI responds with "port 4000" and mentions PostgreSQL 16. Knowledge context referenced.

### TC-19.11.15 — Clear a file and verify AI behavior changes
- **Steps:** Clear identity.md (delete all content) → save → ask AI "Who are you?"
- **Expected:** AI reverts to default identity. No longer introduces custom persona.

---

## 19.12 Custom Domain Tab — Default Domain (P1)

### TC-19.12.1 — View default domain
- **Steps:** Click Custom Domain tab.
- **Expected:** "Default Domain" section always shown. Shows `{slug}.doable.me` in monospace. "Visit" button present.

### TC-19.12.2 — Visit default domain
- **Steps:** Click "Visit" button on default domain.
- **Expected:** Opens `https://{slug}.doable.me` in new browser tab.

---

## 19.13 Custom Domain Tab — Custom Domain Management (P1)

### TC-19.13.1 — Custom domain section visibility
- **Steps:** Observe custom domain section (below default domain).
- **Expected:** If Pro: shows add domain form + domain list. If not Pro: shows upgrade prompt with Crown icon and "Upgrade to Pro" button.

### TC-19.13.2 — Add custom domain
- **Steps:** Type "app.example.com" in domain input → click "Add Domain".
- **Expected:** Domain added. Toast: "Domain app.example.com added. Configure your DNS records below." Domain appears in list with "Pending" status (amber badge, Clock icon).

### TC-19.13.3 — Add domain with Enter key
- **Steps:** Type domain → press Enter.
- **Expected:** Same as clicking "Add Domain" button. Domain added.

### TC-19.13.4 — Add domain — validation (empty)
- **Steps:** Leave input empty → observe "Add Domain" button.
- **Expected:** Button disabled. Cannot add empty domain.

### TC-19.13.5 — Add domain — API error (duplicate)
- **Steps:** Try adding a domain that already exists.
- **Expected:** Error toast: API error message (e.g., "Domain already configured").

### TC-19.13.6 — DNS configuration display
- **Steps:** After adding a domain, observe the DNS config section.
- **Expected:** "Configure DNS" heading. Table with: Type=CNAME, Name={domain}, Target={cname_target}. Copy button for target. Note about Cloudflare DNS and proxied CNAME.

### TC-19.13.7 — Copy CNAME target
- **Steps:** Click Copy button next to CNAME target.
- **Expected:** Value copied to clipboard. Button shows green Check icon for 2 seconds, then reverts to Copy icon.

### TC-19.13.8 — Verify domain (pending)
- **Steps:** Click "Verify" button on a pending domain.
- **Expected:** Verification starts. Badge may change to "Verifying" (blue, spinner). If DNS correct → "Active" (green). If DNS wrong → "Failed" (red) with error message.

### TC-19.13.9 — Domain status: Active
- **Steps:** After successful verification.
- **Expected:** Green badge with ShieldCheck icon. "Visit" button appears. Green success box: "Domain Active — SSL and routing configured via Cloudflare". "HTTPS certificate managed by Cloudflare. Auto-renews."

### TC-19.13.10 — Domain status: Failed
- **Steps:** Verify a domain with incorrect DNS.
- **Expected:** Red badge with AlertCircle. Red alert box with verification error message. Can retry "Verify" or delete.

### TC-19.13.11 — Domain status: SSL Pending
- **Steps:** After DNS verification passes but SSL is provisioning.
- **Expected:** Blue badge with spinner. "ssl_pending" status. Auto-polls every 15 seconds.

### TC-19.13.12 — Auto-polling for pending domains
- **Steps:** Add a domain → observe network requests.
- **Expected:** API polled every 15 seconds while any domain is pending/verifying/ssl_pending. Polling stops when all are active or failed.

### TC-19.13.13 — Remove custom domain
- **Steps:** Click trash/delete icon on a domain.
- **Expected:** Badge changes to "Removing" (gray, spinner). Domain removed from list. Toast: "Domain removed".

### TC-19.13.14 — Visit active custom domain
- **Steps:** Click "Visit" on an active domain.
- **Expected:** Opens `https://{domain}` in new tab. Site loads.

### TC-19.13.15 — Empty state (no custom domains)
- **Steps:** Open with no custom domains configured.
- **Expected:** Globe icon faded. "No custom domains configured. Add one above to get started."

### TC-19.13.16 — Loading state
- **Steps:** Force slow network → open Custom Domain tab.
- **Expected:** Spinner shown in center while loading domains list.

---

## 19.14 Environments Tab — Project Override (P0)

### TC-19.14.1 — Open Environments tab
- **Steps:** Click Environments tab.
- **Expected:** Three sections: "Project Environment" (override), "Environment Presets", "Deployment".

### TC-19.14.2 — Default state — no override
- **Steps:** Open when no project environment override is set.
- **Expected:** Dropdown shows "Use workspace default". Info text: "Inheriting from workspace default. Select an environment above to override."

### TC-19.14.3 — Select environment override
- **Steps:** Open dropdown → select a workspace environment (shows emoji + name).
- **Expected:** API call: PUT `/projects/{id}/environment`. Info text changes to: "This project uses a custom environment override. The workspace default is bypassed."

### TC-19.14.4 — Clear environment override
- **Steps:** Open dropdown → select "Use workspace default" (empty option).
- **Expected:** API call: DELETE `/projects/{id}/environment`. Info text reverts to inheritance message.

### TC-19.14.5 — Dropdown disabled while saving
- **Steps:** Select an environment → observe during API call.
- **Expected:** Dropdown disabled. Spinner visible. Re-enables after save completes.

### TC-19.14.6 — Loading environments list
- **Steps:** Open Environments tab → observe.
- **Expected:** Spinner shown while fetching workspace environments list. Dropdown populates after load.

### TC-19.14.7 — No environments in workspace
- **Steps:** Open when workspace has 0 environments.
- **Expected:** Dropdown shows placeholder "No environments in this workspace..." (or equivalent). Override not possible.

### TC-19.14.8 — Override affects AI chat
- **Steps:** Create workspace environment "Formal" with skill "Always use formal English" → assign to project → open AI chat → ask a casual question.
- **Expected:** AI responds in formal English. Environment override injected into context.

---

## 19.15 Environments Tab — Presets & Deployment (P1)

### TC-19.15.1 — Environment presets display
- **Steps:** Scroll to "Environment Presets" section.
- **Expected:** Shows all workspace environments as read-only cards. Each card: colored emoji icon, name, description, creation date.

### TC-19.15.2 — Preset empty state
- **Steps:** When workspace has no environments.
- **Expected:** Server icon faded. "No environment presets". "Create environment presets from the editor's Environments panel."

### TC-19.15.3 — Preset card colors
- **Steps:** Create environments with different colors → view presets.
- **Expected:** Card backgrounds match environment color (blue, green, purple, orange, pink, yellow, red, teal).

### TC-19.15.4 — Presets are read-only
- **Steps:** Try clicking on a preset card.
- **Expected:** No action. Cards are display-only. Cannot edit from project settings (must use editor panel).

### TC-19.15.5 — Deployment section
- **Steps:** Scroll to "Deployment" section.
- **Expected:** Two deployment environment cards: Production and Preview.

### TC-19.15.6 — Production deployment card
- **Steps:** Observe Production card.
- **Expected:** Name: "Production". Status: "active" (green badge). Description: "Live site accessible to all visitors". URL: `{slug}.doable.me` (monospace). Last deployed timestamp. "Visit" button.

### TC-19.15.7 — Preview deployment card
- **Steps:** Observe Preview card.
- **Expected:** Name: "Preview". Status: "active" (green badge). Description: "Test changes before publishing to production". URL: `preview-{slug}.doable.me`. "Visit" button.

### TC-19.15.8 — Visit production/preview URLs
- **Steps:** Click "Visit" on Production → click "Visit" on Preview.
- **Expected:** Each opens the correct URL in a new tab.

---

## 19.16 Danger Zone Tab — Transfer Project (P1)

### TC-19.16.1 — Open Danger Zone tab
- **Steps:** Click Danger Zone tab.
- **Expected:** Two sections with warning styling: "Transfer Project" (amber) and "Delete Project" (red).

### TC-19.16.2 — Transfer section layout
- **Steps:** Observe Transfer Project card.
- **Expected:** ArrowRightLeft icon (amber). Title. Description about transferring to another workspace. Email input with label. Transfer button.

### TC-19.16.3 — Transfer — enter email
- **Steps:** Type "owner@example.com" in destination email input.
- **Expected:** Transfer button becomes enabled (previously disabled if empty or no @).

### TC-19.16.4 — Transfer — validation (empty email)
- **Steps:** Leave email empty → observe button.
- **Expected:** Button disabled. Cannot submit without email.

### TC-19.16.5 — Transfer — validation (no @ symbol)
- **Steps:** Type "invalidemail" without @.
- **Expected:** Button disabled. Email must contain "@".

### TC-19.16.6 — Transfer — submit
- **Steps:** Enter valid email → click "Transfer Project".
- **Expected:** Toast: "Transfer request sent. The recipient will receive an email to accept." (Note: currently mock — no actual API call).

---

## 19.17 Danger Zone Tab — Delete Project (P0)

### TC-19.17.1 — Delete section layout
- **Steps:** Observe Delete Project card.
- **Expected:** Trash2 icon (red). Title in red text. Description about permanent deletion. "Delete This Project" button (destructive red).

### TC-19.17.2 — Click "Delete This Project"
- **Steps:** Click the delete button.
- **Expected:** Confirmation form appears: "Are you absolutely sure?" (red text). Input field with label "Type {projectName} to confirm" (project name shown in red monospace). Two buttons: destructive "I understand, delete this project" and "Cancel".

### TC-19.17.3 — Confirmation input — auto-focus
- **Steps:** After clicking Delete, check the confirmation input.
- **Expected:** Input is auto-focused. Cursor ready for typing. Border: destructive/30 red tint.

### TC-19.17.4 — Confirmation — wrong text
- **Steps:** Type something that doesn't match the project name.
- **Expected:** Delete button remains disabled. Cannot proceed until exact match.

### TC-19.17.5 — Confirmation — case sensitivity
- **Steps:** If project is "My App", type "my app" (lowercase).
- **Expected:** Button remains disabled. Match is CASE-SENSITIVE.

### TC-19.17.6 — Confirmation — exact match
- **Steps:** Type the exact project name (case-sensitive).
- **Expected:** Delete button becomes enabled (red, clickable).

### TC-19.17.7 — Cancel deletion
- **Steps:** Click "Cancel" button in confirmation form.
- **Expected:** Confirmation form closes. Input cleared. Returns to initial state with just "Delete This Project" button.

### TC-19.17.8 — Confirm deletion
- **Steps:** Type exact project name → click "I understand, delete this project".
- **Expected:** Button shows "Deleting..." with spinner. API call: DELETE project. Toast: "Project deleted successfully". After 1 second delay: redirects to `/projects`.

### TC-19.17.9 — Delete error handling
- **Steps:** Simulate API failure during deletion.
- **Expected:** Toast: error message or "Failed to delete project". Confirmation dialog resets to initial state. Project NOT deleted.

### TC-19.17.10 — Verify redirect after deletion
- **Steps:** Successfully delete a project → wait 1 second.
- **Expected:** Browser navigates to `/projects` (dashboard). Deleted project no longer appears in list.

---

## 19.18 Cross-Tab Interactions (P1)

### TC-19.18.1 — General save updates Last Updated across tabs
- **Steps:** Go to General → save a change → switch to another tab → return to General.
- **Expected:** "Last Updated" info card shows the new timestamp.

### TC-19.18.2 — Environment override reflects in AI chat
- **Steps:** Set environment override on Environments tab → go to AI chat → ask about the environment config.
- **Expected:** AI uses the overridden environment's skills, rules, knowledge, and connectors.

### TC-19.18.3 — Skills + Knowledge combined in AI
- **Steps:** Add a skill on Skills tab → add knowledge on Knowledge tab → open AI chat.
- **Expected:** AI chat receives both skill AND knowledge context. Both influence responses.

### TC-19.18.4 — MCP server added → available in AI chat
- **Steps:** Add MCP server on MCP tab → activate → open AI chat → ask AI to use an MCP tool.
- **Expected:** AI can invoke MCP tools (e.g., `mcp_{serverName}_echo`). Tool results returned.

### TC-19.18.5 — Visibility change → share behavior
- **Steps:** Change visibility to "Private" on General tab → try sharing/viewing the project from another browser.
- **Expected:** Private project not accessible without authentication.

### TC-19.18.6 — Delete project → all settings gone
- **Steps:** After deleting on Danger Zone tab, navigate back.
- **Expected:** Cannot access any tab for that project. All settings, knowledge, skills, rules, domains, connectors deleted.

### TC-19.18.7 — Tab state preserved during session
- **Steps:** Open Knowledge tab → click into identity.md editor → switch to General tab → switch back to Knowledge tab.
- **Expected:** Knowledge tab reloads in file list view (editor state not persisted across tab switches).

---

## 19.19 Role-Based Access Control (P1)

### TC-19.19.1 — Owner access to all tabs
- **Steps:** Log in as project owner → navigate to project settings.
- **Expected:** All 8 tabs visible and accessible. Full CRUD on all features.

### TC-19.19.2 — Editor access to settings
- **Steps:** Log in as workspace editor → navigate to project settings.
- **Expected:** Can view settings. May have restricted access to Danger Zone (transfer/delete).

### TC-19.19.3 — Viewer access to settings
- **Steps:** Log in as workspace viewer → navigate to project settings.
- **Expected:** Settings page may be read-only or hidden depending on permissions. No edit capabilities.

### TC-19.19.4 — Non-member access to settings
- **Steps:** Log in as a user NOT in the workspace → navigate to `/projects/{id}/settings`.
- **Expected:** Access denied. Redirect to dashboard or 403 error.

---

## 19.20 Edge Cases & Error Handling (P2)

### TC-19.20.1 — Rapid tab switching
- **Steps:** Click through all 8 tabs rapidly (< 100ms between clicks).
- **Expected:** No crash. Last clicked tab renders correctly. No stale data from previous tab.

### TC-19.20.2 — Network disconnect during save
- **Steps:** Start saving (any tab) → disconnect network.
- **Expected:** Error toast shown. Data not lost locally. Can retry after reconnect.

### TC-19.20.3 — Concurrent edits warning
- **Steps:** Open settings in two browser tabs. Edit name in tab A → save. Edit name in tab B → save.
- **Expected:** Tab B save succeeds (last write wins) or shows conflict warning.

### TC-19.20.4 — Very long project name
- **Steps:** Enter a 500+ character project name → save.
- **Expected:** Either truncated or API returns validation error. No crash.

### TC-19.20.5 — Special characters in project name
- **Steps:** Enter name with emojis, unicode, HTML tags: `<script>alert(1)</script> 🎉`.
- **Expected:** Name saved/displayed correctly. HTML not executed (XSS safe). Emojis render properly.

### TC-19.20.6 — Browser back button from settings
- **Steps:** Navigate to settings → click a tab → press browser Back.
- **Expected:** Navigates away from settings appropriately. No broken state.

### TC-19.20.7 — Refresh browser on settings page
- **Steps:** On any tab, press F5 to refresh.
- **Expected:** Settings page reloads. If tab was in URL param, same tab opens. Data reloads.

### TC-19.20.8 — Knowledge file with token budget exceeded
- **Steps:** Write very large content across all knowledge files until budget bar turns red (> 95%).
- **Expected:** Budget bar shows red. Content still saveable (soft limit). AI may truncate context internally.

### TC-19.20.9 — Add many MCP servers
- **Steps:** Add 10+ MCP servers. Check list behavior.
- **Expected:** All listed. Stats count updates. No UI lag. Scrollable if needed.

### TC-19.20.10 — Delete last skill/rule
- **Steps:** Delete all skills. Delete all rules.
- **Expected:** Empty state returns after last deletion. Counters show (0).
