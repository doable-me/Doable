# AI Chat — Comprehensive Browser Test Scenarios

> **Scope**: Every testable user flow through the Doable AI chat, editor, integrations, publishing, collaboration, and visual editing — tested via integrated browser tools.
> **Last Updated**: 2026-04-11
> **Browser Tools**: `open_browser_page`, `read_page`, `screenshot_page`, `click_element`, `type_in_page`, `hover_element`, `drag_element`, `handle_dialog`, `navigate_page`

---

## Table of Contents

1. [Project Creation & First Message](#1-project-creation--first-message)
2. [Chat Streaming & Message Display](#2-chat-streaming--message-display)
3. [Multi-Turn Conversations](#3-multi-turn-conversations)
4. [Plan Mode — Full Lifecycle](#4-plan-mode--full-lifecycle)
5. [Supabase Integration Flow](#5-supabase-integration-flow)
6. [Other Integration Flows](#6-other-integration-flows)
7. [Tool Calls & File Operations](#7-tool-calls--file-operations)
8. [Preview Panel](#8-preview-panel)
9. [Code Editor Panel](#9-code-editor-panel)
10. [Visual Edit Mode](#10-visual-edit-mode)
11. [Version Control & Undo](#11-version-control--undo)
12. [Publishing & Deployment](#12-publishing--deployment)
13. [Collaboration & Multi-User](#13-collaboration--multi-user)
14. [Knowledge & Context Files](#14-knowledge--context-files)
15. [Stop / Cancel / Abort](#15-stop--cancel--abort)
16. [Error Handling & Recovery](#16-error-handling--recovery)
17. [Chat Input Features](#17-chat-input-features)
18. [Editor Layout & Navigation](#18-editor-layout--navigation)
19. [Chat History & Persistence](#19-chat-history--persistence)
20. [End-to-End Journeys](#20-end-to-end-journeys)

---

## 1. Project Creation & First Message

### TC-1.1: Create Project from Dashboard (Build Mode)

**Steps:**
1. `navigate_page` → `http://localhost:3000/dashboard`
2. `read_page` → confirm dashboard loaded, find chat input area
3. `screenshot_page` → capture dashboard state
4. `type_in_page` → type prompt: "Build a todo app with dark mode"
5. `screenshot_page` → confirm prompt text visible, "Build" toggle active (default)
6. `click_element` → click send / press Enter
7. `screenshot_page` → capture "Creating project…" overlay
8. Wait for navigation to `/editor/{projectId}`
9. `read_page` → confirm editor loaded
10. `screenshot_page` → capture initial streaming state

**Verify:**
- Dashboard shows status overlay during creation
- URL changes to `/editor/{projectId}`
- Chat panel shows streaming indicator ("Generating...")
- Prompt bridge delivers buffered events without gap

### TC-1.2: Create Project from Dashboard (Plan Mode)

**Steps:**
1. `navigate_page` → `http://localhost:3000/dashboard`
2. `read_page` → find mode toggle
3. `click_element` → click "Plan first" button (ListChecks icon)
4. `screenshot_page` → confirm "Plan first" toggle is active/highlighted
5. `type_in_page` → type prompt: "Build a recipe sharing app"
6. `click_element` → submit
7. Wait for navigation to editor
8. `read_page` → check for clarification card or plan-mode behavior
9. `screenshot_page` → capture plan mode initial state

**Verify:**
- "Plan first" toggle visually active (`bg-background text-foreground shadow-sm`)
- API request includes `mode: "plan"`
- Editor shows plan-mode UI (clarification/plan card, not code writing)
- Status message: "AI is analyzing the project..." NOT "AI is writing code..."

### TC-1.3: Create Project from Template

**Steps:**
1. `navigate_page` → `http://localhost:3000/dashboard`
2. `read_page` → find template cards/grid
3. `click_element` → click a template (e.g., "Blog", "E-commerce", "Landing Page")
4. `read_page` → confirm template dialog or auto-creation
5. `screenshot_page` → capture result

**Verify:**
- Template pre-populates project with scaffold files
- Preview loads with template content
- File tree shows template structure

### TC-1.4: Empty Prompt Submission

**Steps:**
1. `navigate_page` → `http://localhost:3000/dashboard`
2. `click_element` → click send with empty input
3. `read_page` → confirm nothing happened / button was disabled

**Verify:**
- Send button is disabled when input is empty (`!hasContent || disabled`)
- No API call made
- No navigation

### TC-1.5: Very Long Prompt

**Steps:**
1. `type_in_page` → type a 2000+ character prompt
2. `screenshot_page` → confirm textarea expanded
3. `click_element` → submit
4. Wait for editor
5. `read_page` → confirm AI received full prompt

**Verify:**
- Textarea auto-expands (max 200px height, then scrolls)
- Full prompt sent to API
- AI response references details from the long prompt

---

## 2. Chat Streaming & Message Display

### TC-2.1: Text Delta Streaming

**Steps:**
1. Send a simple prompt in agent mode: "Add a counter component"
2. During streaming, `read_page` repeatedly (every 2-3s)
3. `screenshot_page` at: start, middle, end

**Verify:**
- Text appears character-by-character (RAF batching + 120ms flush)
- Live cursor visible at end of streaming text
- Auto-scroll keeps bottom of chat visible
- "Generating..." indicator in chat header

### TC-2.2: Thinking/Reasoning Display

**Steps:**
1. Send prompt that triggers thinking: "Analyze the architecture and refactor"
2. `read_page` → look for thinking section
3. `screenshot_page` → capture expanded thinking

**Verify:**
- Brain icon + "Thought process" / "Thinking…" header
- Collapsible thinking section auto-opens during streaming
- Monospace text (11px) with auto-scroll
- Live cursor at end of thinking text
- Max height: 72 lines with scroll

### TC-2.3: Tool Call Progress Display

**Steps:**
1. Send prompt: "Create a login page with form validation"
2. During streaming, `read_page` after first tool call
3. `screenshot_page` → capture tool call indicators

**Verify:**
- Tool call status: wrench icon (spinning) + tool name
- Tool result status: check icon (green) + "Done" / friendly message
- Status text changes: "Reading package.json" → "Created login.tsx" → etc.
- After completion, tool activity summary: "Created 3 files · Edited 1 file"

### TC-2.4: Message Completion & Final State

**Steps:**
1. Wait for streaming to finish
2. `read_page` → inspect final message
3. `screenshot_page` → capture completed message

**Verify:**
- "Generating..." indicator gone
- Message content fully rendered with markdown
- Tool activity summary shown (wrench icon + counts)
- Thinking section collapsed (expandable on click)
- Send button returns to green (idle state)

### TC-2.5: Keep-Alive During Long Operations

**Steps:**
1. Send complex prompt that takes 30s+
2. Monitor for timeout behavior

**Verify:**
- Stream doesn't disconnect (keep_alive events prevent timeout)
- Status messages rotate: "Thinking…" → "Still thinking…" → "This one's taking a while"
- Connection stays alive until completion

---

## 3. Multi-Turn Conversations

### TC-3.1: Follow-Up Message After Build

**Steps:**
1. First message: "Build a counter app"
2. Wait for completion
3. `type_in_page` → "Add a reset button that sets count to zero"
4. Submit
5. Wait for completion
6. `read_page` → verify both messages visible

**Verify:**
- Conversation history shows both user + assistant messages
- AI references previous context ("I'll add a reset button to the counter")
- Files modified correctly (not recreated from scratch)
- Preview updates with new button

### TC-3.2: Continue Building with Refinements

**Steps:**
1. After initial build, send: "Change the color scheme to dark blue and add animations"
2. Wait for completion
3. `screenshot_page` → preview showing dark blue theme

**Verify:**
- AI edits existing files (not recreates)
- CSS/Tailwind classes updated
- Preview reflects new styling
- Version created for each response

### TC-3.3: Multi-Turn with Supabase

**Steps:**
1. First message: "Build a bookmark manager with Supabase"
2. Handle Supabase provisioning dialog (if triggered)
3. Wait for initial build
4. Second message: "Add tag filtering and search"
5. Third message: "Add user authentication with Supabase Auth"
6. Fourth message: "Add export bookmarks as CSV"

**Verify:**
- Each turn builds on previous code
- Supabase client used consistently across turns
- Database schema evolves (new tables/columns)
- Preview shows cumulative features
- Chat history shows full conversation

### TC-3.4: Ask for Explanation (Non-Code Message)

**Steps:**
1. After building something, send: "Explain the architecture you used"
2. Wait for response
3. `read_page` → check for text-only response (no tool calls)

**Verify:**
- AI responds with text explanation only
- No tool calls (no file edits)
- No "Building..." overlay
- Preview doesn't refresh

### TC-3.5: Request Bug Fix

**Steps:**
1. After initial build, send: "The login form doesn't validate email format, fix it"
2. Wait for response
3. `read_page` → verify tool calls (edit_file)

**Verify:**
- AI reads the file first, then edits it
- Tool activity shows "Read 1 file · Edited 1 file"
- Preview updates with fix
- Auto-fix loop might trigger if build errors detected

---

## 4. Plan Mode — Full Lifecycle

### TC-4.1: Plan Mode — Clarification Questions

**Steps:**
1. Select "Plan first" on dashboard
2. Submit: "Build a recipe sharing app with search, categories, and favorites"
3. Wait for editor to load
4. `read_page` → look for clarification card
5. `screenshot_page` → capture "Before we plan..." card

**Verify:**
- Blue card with "Before we plan..." header
- One question shown at a time with progress dots
- Question types: multi_choice (radio), yes_no (buttons), free_text (input)
- "Skip all — let AI decide" button visible

### TC-4.2: Answer Clarification Questions One-by-One

**Steps:**
1. From TC-4.1, `read_page` → get first question
2. `click_element` → select an option or type answer
3. `screenshot_page` → capture progress (dot filled)
4. Repeat for each question
5. After last answer, `read_page` → check for plan card

**Verify:**
- Answered questions collapse/show above current question
- Progress dots advance (filled = answered, empty = upcoming)
- After last answer, `planPhase` transitions: "clarifying" → "planning" → "reviewing"
- API sends answers as follow-up message

### TC-4.3: Skip All Clarifications

**Steps:**
1. From TC-4.1, `click_element` → "Skip all — let AI decide"
2. `read_page` → check for plan card directly

**Verify:**
- AI proceeds to plan creation without answers
- Plan appears using default assumptions
- No questions displayed after skip

### TC-4.4: Plan Card Review

**Steps:**
1. After plan is generated, `read_page` → inspect plan card
2. `screenshot_page` → full plan card

**Verify:**
- Complexity badge: `simple` / `moderate` / `complex`
- Summary text (1-3 sentences)
- Numbered steps (3-8 typical) with titles and descriptions
- All steps show `pending` status (empty circle)
- Three action buttons: "Start Building" (green), "Refine..." (outline), "Reset" (outline)

### TC-4.5: Edit Plan Steps

**Steps:**
1. `click_element` → click a step title to edit
2. `type_in_page` → change title
3. `click_element` → save/confirm
4. `screenshot_page` → verify edit applied

**Verify:**
- Step title changes inline
- Edit persisted in store (`activePlan` updated)

### TC-4.6: Add and Remove Plan Steps

**Steps:**
1. `click_element` → "Add step" button
2. `read_page` → new empty step appears at end
3. `type_in_page` → fill in title for new step
4. `click_element` → remove button on a different step
5. `read_page` → step list updated

**Verify:**
- New step added with empty title/description
- Removed step disappears
- Step numbering re-indexes

### TC-4.7: Reorder Plan Steps (Drag)

**Steps:**
1. `drag_element` → drag step 3 handle above step 1
2. `read_page` → verify new order
3. `screenshot_page` → capture reordered plan

**Verify:**
- Step 3's title now appears at position 1
- All step numbers updated
- Order persisted in store

### TC-4.8: Approve Plan → Build Phase

**Steps:**
1. `click_element` → "Start Building" (green button)
2. `read_page` → check for PlanProgress component
3. `screenshot_page` → capture building progress
4. During build, `read_page` periodically → watch step status changes

**Verify:**
- `planPhase` = "building"
- PlanProgress visible with progress bar + step tracker
- Steps transition: pending → in_progress (spinner) → completed (checkmark)
- Mode switches from "plan" to "agent"
- Write tools now appear (create_file, edit)
- Preview updates as code is written

### TC-4.9: Refine Plan

**Steps:**
1. From plan card, `click_element` → "Refine..."
2. `type_in_page` → "Add a step for database setup and another for error handling"
3. Submit
4. Wait for updated plan
5. `read_page` → verify updated plan card

**Verify:**
- New plan-mode message sent
- AI regenerates plan with refinements
- Updated steps appear in plan card
- Old plan replaced

### TC-4.10: Reset/Abandon Plan

**Steps:**
1. From plan card, `click_element` → "Reset"
2. `read_page` → verify plan card gone
3. `screenshot_page` → confirm idle state

**Verify:**
- Plan abandoned, `planPhase` = "idle"
- Plan card removed from chat
- User can type new messages
- Mode remains "plan" (can start new plan)

### TC-4.11: Plan Mode Tool Restrictions

**Steps:**
1. Send plan mode request
2. Monitor SSE stream (via API or browser DevTools)
3. Check all tool calls

**Verify:**
- Only read-only tools appear: `read_file`/`view`, `glob`, `grep`, `report_intent`
- Plan-specific tools: `ask_clarification`, `create_plan`, `mark_step_complete`
- MUST NOT appear: `create_file`, `edit`, `bash`, `powershell`
- Status says "AI is analyzing the project..." (not "writing code")

---

## 5. Supabase Integration Flow

### TC-5.1: Supabase Provisioning Triggered

**Steps:**
1. Connect Supabase account in workspace settings first
2. Send: "Build a task manager app with Supabase backend"
3. `read_page` → look for Supabase provisioning dialog
4. `screenshot_page` → capture provisioning dialog

**Verify:**
- `provision_supabase_required` SSE event triggers dialog
- Dialog shows: project name, org selection, region picker
- 8 regions available (US East, US West, EU West, EU Central, APAC SE, APAC NE, APAC South, South America)
- Pre-filled project name from AI suggestion

### TC-5.2: Complete Supabase Provisioning

**Steps:**
1. From TC-5.1, `click_element` → select an organization
2. `click_element` → select a region
3. Optionally edit project name
4. `click_element` → "Create Project" button
5. `read_page` → watch progress phases
6. `screenshot_page` → capture progress streaming

**Verify:**
- Shows "Creating project..." spinner
- Progress phases stream: Creating → Waiting for DB → Saving credentials → Done
- Dialog auto-closes on success
- Chat auto-sends continuation: "The new Supabase project is ready and the credentials are connected..."
- AI continues building with Supabase credentials available

### TC-5.3: Build App Using Supabase CRUD

**Steps:**
1. After Supabase provisioned, wait for AI to build
2. `read_page` → check preview for app
3. `screenshot_page` → capture preview showing Supabase-backed app
4. Interact with the preview: add data, check persistence

**Verify:**
- App uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- CRUD operations work (data persists on refresh)
- Supabase client initialized correctly in code
- No hardcoded credentials visible in code

### TC-5.4: Add Supabase Auth to Existing App

**Steps:**
1. After initial build, send: "Add email/password authentication with Supabase Auth"
2. Wait for AI to implement
3. `read_page` → check preview for login page
4. `screenshot_page` → capture auth UI

**Verify:**
- Login/signup form appears in preview
- Supabase Auth client used (`supabase.auth.signUp`, `signInWithPassword`)
- Auth state management (session persistence)
- Protected routes redirect to login
- No service role key exposed in client code

### TC-5.5: Supabase Not Connected — OAuth Flow

**Steps:**
1. Without Supabase connected, send prompt needing Supabase
2. `read_page` → check for connect/provision dialog
3. `screenshot_page` → capture "connect your account" state

**Verify:**
- Dialog shows OAuth redirect option
- "Connect Supabase" button leads to OAuth flow
- After connecting, provisioning continues

### TC-5.6: Continue Building on Supabase App

**Steps:**
1. After initial Supabase app, send: "Add a real-time comments feature using Supabase Realtime"
2. Wait for build
3. `read_page` → check for realtime subscription code

**Verify:**
- AI adds Supabase Realtime subscriptions
- New table created for comments
- Real-time updates visible in preview
- Existing Supabase configuration reused (not duplicated)

---

## 6. Other Integration Flows

### TC-6.1: Integration Connect Card (Generic)

**Steps:**
1. Send: "Build a payment checkout with Stripe"
2. `read_page` → look for integration connect card
3. `screenshot_page` → capture connect card

**Verify:**
- `integration_required` SSE event triggers card
- Card shows: service logo, display name ("Stripe"), reason ("Your app needs Stripe to accept payments")
- Two buttons: "Connect Stripe" and "I just connected"
- Close (X) button

### TC-6.2: Click "Connect" on Integration Card

**Steps:**
1. From TC-6.1, `click_element` → "Connect Stripe"
2. `read_page` → verify redirect to integrations settings

**Verify:**
- Redirects to `/workspace-settings/integrations?connect=stripe`
- Integration settings page shows Stripe with API key input or OAuth flow

### TC-6.3: Dismiss and Continue After Connecting

**Steps:**
1. After connecting integration externally, go back to editor
2. `click_element` → "I just connected" button
3. `read_page` → AI continues building

**Verify:**
- Card dismissed
- Auto-sends continuation message
- AI proceeds with integration-specific code

### TC-6.4: Dismiss Integration Without Connecting

**Steps:**
1. `click_element` → X (close) button on integration card
2. `read_page` → card dismissed, no continuation

**Verify:**
- Card removed
- No continuation message sent
- User can manually type next message

---

## 7. Tool Calls & File Operations

### TC-7.1: Create File Tool Call

**Steps:**
1. Send: "Create a utils/helpers.ts file with date formatting functions"
2. During streaming, `read_page` → look for tool call indicator
3. `screenshot_page` → capture "Creating file..." status
4. After completion, check sidebar

**Verify:**
- Tool call shows: "create_file" → friendly message
- File appears in sidebar file tree
- File content visible in code editor when opened
- Preview updates if file is imported

### TC-7.2: Edit File Tool Call

**Steps:**
1. Send: "Add input validation to the login form"
2. `read_page` → tool call shows "edit_file" or "edit"
3. After completion, click on edited file in sidebar

**Verify:**
- Tool activity: "Edited 1 file"
- File content updated in editor
- Changes visible in diff (version history)

### TC-7.3: Read File Tool Call

**Steps:**
1. Send: "What does the main App component do?"
2. `read_page` → tool call shows "read_file" or "view"

**Verify:**
- Tool activity: "Read 1 file"
- AI response references file content accurately
- No files modified

### TC-7.4: Install Package Tool Call

**Steps:**
1. Send: "Add framer-motion for page transitions"
2. `read_page` → tool call shows "install_package" or "bash: npm install"

**Verify:**
- Package installed (visible in package.json)
- Import statements added to relevant files
- Preview loads with new package functionality

### TC-7.5: Multiple Tool Calls in Single Response

**Steps:**
1. Send: "Create a complete user profile page with avatar upload, bio editor, and settings form"
2. Monitor tool calls during streaming
3. `read_page` → count tool calls

**Verify:**
- Multiple tool calls shown in sequence (create_file × N, edit_file × M)
- Tool activity summary: "Created 5 files · Edited 2 files · Installed 1 package"
- All files appear in sidebar
- Preview shows complete feature

### TC-7.6: Tool Call Failure Display

**Steps:**
1. Send prompt that might cause a tool failure (e.g., edit non-existent file)
2. `read_page` → check for error in tool result

**Verify:**
- Failed tool call visible with error indicator
- AI auto-retries or explains the error
- Stream doesn't hang

---

## 8. Preview Panel

### TC-8.1: Preview Loads After Build

**Steps:**
1. After first build completes, `read_page` → check preview iframe
2. `screenshot_page` → capture preview

**Verify:**
- Preview iframe loaded with app content
- No loading spinner (build complete)
- Preview URL shows project route

### TC-8.2: Preview Auto-Refresh After Edit

**Steps:**
1. Send a modification message
2. Watch preview during streaming
3. After completion, `screenshot_page` → verify preview updated

**Verify:**
- If HMR active: preview updates automatically (no full refresh)
- If no HMR: full refresh after 800ms delay
- Preview shows latest changes

### TC-8.3: Manual Refresh Button

**Steps:**
1. `click_element` → preview refresh button (RefreshCw icon)
2. `screenshot_page` → confirm refresh happened

**Verify:**
- Refresh icon spins during reload
- Preview content reloaded
- No stale content

### TC-8.4: Device Mode Toggle

**Steps:**
1. `click_element` → "Tablet" device mode button
2. `screenshot_page` → preview at 768px width
3. `click_element` → "Mobile" device mode button
4. `screenshot_page` → preview at 375px width
5. `click_element` → "Desktop" device mode button
6. `screenshot_page` → preview at full width

**Verify:**
- Preview container resizes to match device width
- Active mode button highlighted
- App responsive layout changes visible
- Content renders correctly at each breakpoint

### TC-8.5: Route Navigation Dropdown

**Steps:**
1. After building multi-page app, `click_element` → URL bar / route dropdown
2. `read_page` → list of detected routes
3. `click_element` → select a different route (e.g., "/about")
4. `screenshot_page` → preview shows new route

**Verify:**
- Routes auto-detected from `src/pages/`
- Clicking route navigates preview iframe
- URL display updates
- Correct page content shown

### TC-8.6: Preview Fullscreen Mode

**Steps:**
1. `click_element` → fullscreen button (Maximize2 icon)
2. `screenshot_page` → preview in fullscreen
3. `click_element` → exit fullscreen (Minimize2 icon or Escape)

**Verify:**
- Preview takes full viewport
- All other panels hidden
- ESC or button returns to normal layout

### TC-8.7: Open Preview in New Tab

**Steps:**
1. `click_element` → external link button (ExternalLink icon)
2. `read_page` → check if new page opened

**Verify:**
- New browser tab opens with preview URL
- Preview works standalone (outside editor)

### TC-8.8: Preview Error Overlay

**Steps:**
1. Send code that causes build/runtime error
2. `read_page` → check for error overlay in preview
3. `screenshot_page` → capture error state

**Verify:**
- Red error overlay appears in preview
- Error message displayed
- Refresh button available
- After fixing code, error clears

---

## 9. Code Editor Panel

### TC-9.1: Open File from Sidebar

**Steps:**
1. `click_element` → sidebar "Files" tab
2. `read_page` → file tree visible
3. `click_element` → click a file (e.g., `src/App.tsx`)
4. `screenshot_page` → file content in Monaco editor

**Verify:**
- File tab appears at top
- Monaco editor shows syntax-highlighted content
- Line numbers visible
- Language auto-detected from extension

### TC-9.2: Multiple File Tabs

**Steps:**
1. Open file A from sidebar
2. Open file B from sidebar
3. `read_page` → two tabs visible
4. `click_element` → click tab A
5. `screenshot_page` → file A content shown
6. `click_element` → click tab B
7. `screenshot_page` → file B content shown

**Verify:**
- Both tabs visible in tab bar
- Active tab highlighted
- Content switches correctly
- Previous content preserved (cached)

### TC-9.3: Close Tab

**Steps:**
1. Open multiple files
2. `click_element` → X button on a tab
3. `read_page` → tab removed, another tab becomes active

**Verify:**
- Tab disappears from bar
- Next tab auto-selected
- If last tab closed, editor shows empty state

### TC-9.4: Manual Edit → Autosave

**Steps:**
1. Open a file in editor
2. `click_element` → click in editor content
3. `type_in_page` → type some code
4. Wait 1.5s
5. `read_page` → check for save indicator

**Verify:**
- Dirty indicator (dot) appears on tab after edit
- After 1.5s debounce, autosave triggers
- Dirty indicator clears
- File saved to API

### TC-9.5: File Tree Expand/Collapse

**Steps:**
1. `click_element` → expand a folder in file tree
2. `read_page` → children visible
3. `click_element` → collapse the folder
4. `read_page` → children hidden

**Verify:**
- Folder arrow rotates (expanded/collapsed)
- Children rendered/hidden
- Nested folders work recursively

### TC-9.6: AI Edits Reflected in Open File

**Steps:**
1. Open `src/App.tsx` in editor
2. Send AI message: "Add a footer component to App.tsx"
3. After completion, `read_page` → editor content updated

**Verify:**
- Open file tab content updates automatically
- No stale content
- Cursor position may shift to show changes

---

## 10. Visual Edit Mode

### TC-10.1: Enable Visual Edit

**Steps:**
1. `click_element` → visual edit toggle in preview toolbar (MousePointer2 icon)
2. `screenshot_page` → visual edit mode active

**Verify:**
- Toggle button highlighted/active
- Preview enters selection mode
- Cursor changes to crosshair/pointer

### TC-10.2: Select Element in Preview

**Steps:**
1. Enable visual edit mode
2. `hover_element` → hover over an element in preview
3. `screenshot_page` → element outline visible
4. `click_element` → click the element
5. `screenshot_page` → element selected (solid outline)

**Verify:**
- Hover shows dashed outline on element
- Click shows solid outline + selection handles
- Floating toolbar appears near selected element

### TC-10.3: Visual Edit Floating Toolbar

**Steps:**
1. Select an element
2. `read_page` → look for floating toolbar (max 360px wide)
3. `screenshot_page` → capture toolbar

**Verify:**
- Toolbar shows: AI prompt input, submit button, parent select, view code, delete
- Positioned above/below element (responsive to viewport)

### TC-10.4: AI Prompt from Visual Edit

**Steps:**
1. Select a heading element
2. `type_in_page` → in toolbar AI input: "Make this text larger and blue"
3. `click_element` → submit (ArrowUp icon)
4. Wait for AI response

**Verify:**
- AI modifies the selected element's styling
- Preview updates in real-time
- CSS classes or inline styles changed
- Chat shows the modification message

### TC-10.5: Select Parent Element

**Steps:**
1. Select a child element (e.g., a `<span>` inside a `<div>`)
2. `click_element` → parent select button (CornerRightUp icon)
3. `screenshot_page` → parent element now selected

**Verify:**
- Selection moves to parent container
- Toolbar repositions
- Design panel (if open) shows parent's properties

### TC-10.6: Delete Element

**Steps:**
1. Select an element
2. `click_element` → delete button (Trash2 icon)
3. `screenshot_page` → element removed from preview

**Verify:**
- Element removed from DOM
- Change requires Save to persist
- Design panel shows "Unsaved changes" state

### TC-10.7: Design Panel Property Editing

**Steps:**
1. Select an element
2. Open design panel (if not auto-opened)
3. Change text color → `screenshot_page`
4. Change padding → `screenshot_page`
5. Change font size → `screenshot_page`
6. Change background → `screenshot_page`

**Verify:**
- Each property change reflects immediately in preview (live DOM editing)
- All property editors work: text, colors, typography, spacing, size, borders, layout
- "Save Changes" and "Discard Changes" buttons visible

### TC-10.8: Save/Discard Visual Changes

**Steps:**
1. Make visual edits (change colors, spacing)
2. `click_element` → "Save Changes" button → changes persisted to file
3. Open same element again, make changes
4. `click_element` → "Discard Changes" → changes reverted

**Verify:**
- Save: changes written to source file, version created
- Discard: preview reverts to original state
- AI prompt input disabled while pending changes ("Save first")

### TC-10.9: View Code from Visual Edit

**Steps:**
1. Select an element
2. `click_element` → "View Code" (Code2 icon) in toolbar
3. `screenshot_page` → code editor opens with element's file

**Verify:**
- Code editor opens to correct file
- Cursor positioned at element's source location
- File and line visible

---

## 11. Version Control & Undo

### TC-11.1: Version Created After AI Response

**Steps:**
1. Send an AI message that modifies files
2. After completion, `click_element` → sidebar "History" tab
3. `read_page` → check for new version entry

**Verify:**
- New version appears at top of history
- Type badge: "AI" with Sparkles icon
- Shows: timestamp, user avatar, "+X -Y files changed"
- Git SHA visible (short form)

### TC-11.2: View Diff for a Version

**Steps:**
1. `click_element` → click on a version entry in history
2. `read_page` → diff viewer opens
3. `screenshot_page` → capture diff

**Verify:**
- File list with status badges: Added (green), Modified (yellow), Deleted (red)
- Syntax-highlighted diff (side-by-side or unified)
- Line-level additions (green) and deletions (red)

### TC-11.3: Undo Last AI Response

**Steps:**
1. Send AI message → files modified
2. In the AI message bubble, `click_element` → "Undo changes" (Undo2 icon)
3. `read_page` → verify undo applied

**Verify:**
- Files reverted to pre-message state
- Message marked as `undone: true`
- Preview refreshes to reverted state
- New "Restore" version created

### TC-11.4: Restore to Earlier Version

**Steps:**
1. Click "History" tab
2. Find an older version
3. `click_element` → restore button
4. `handle_dialog` → confirm "Restore to this version?"
5. `read_page` → files restored

**Verify:**
- Confirmation dialog appears
- After confirming: files restored, preview updates
- New "Restore" version entry created
- Editor shows restored content

### TC-11.5: Bookmark a Version

**Steps:**
1. In history, `hover_element` → version entry
2. `click_element` → bookmark button
3. `screenshot_page` → bookmark filled/highlighted

**Verify:**
- Bookmark icon toggles (outline → filled)
- Bookmarked version findable via filter (if implemented)

### TC-11.6: Multiple Undo Operations

**Steps:**
1. Send 3 AI messages (each modifies files)
2. Undo message 3 → verify revert
3. Undo message 2 → verify further revert
4. Send new message on top of reverted state

**Verify:**
- Each undo independently revertible
- No corruption from sequential undos
- New messages work correctly after undo

---

## 12. Publishing & Deployment

### TC-12.1: Open Publish Dialog

**Steps:**
1. `click_element` → "Publish" button in toolbar (Rocket icon)
2. `read_page` → publish dialog opens
3. `screenshot_page` → capture dialog

**Verify:**
- Dialog shows: environment selector, adapter selector
- Environments: "production", "preview"
- Default adapter: "doable-cloud"
- "Publish" and "Cancel" buttons

### TC-12.2: Publish to Production

**Steps:**
1. From dialog, `click_element` → select "production"
2. `click_element` → "Publish" button
3. `read_page` → watch build progress (streaming logs)
4. `screenshot_page` → capture at build, deploy, and success stages

**Verify:**
- Building: spinner + "Building your project..." + streaming log
- Deploying: spinner + "Deploying..."
- Success: deployed URL shown, "Copy" button, "View Live" button
- URL format: `{slug}.doable.me`

### TC-12.3: Copy Published URL

**Steps:**
1. After successful publish, `click_element` → "Copy" button
2. `read_page` → check for "Copied!" toast

**Verify:**
- URL copied to clipboard
- Toast confirmation appears
- URL is valid and accessible

### TC-12.4: Publish Error Handling

**Steps:**
1. Introduce a build error in code → try to publish
2. `screenshot_page` → capture error state

**Verify:**
- Build fails with error message
- Build log available for inspection
- "Retry" button visible
- Error indicates what went wrong (compilation error, missing dep, etc.)

### TC-12.5: Republish After Changes

**Steps:**
1. Publish once → success
2. Make changes (send AI message)
3. `click_element` → "Republish" button (changed label)
4. Complete publish flow

**Verify:**
- Button says "Republish" (not "Publish") after first deploy
- Second publish updates the same URL
- Live site reflects new changes

### TC-12.6: Deployment History

**Steps:**
1. After multiple publishes, open publish dialog
2. `click_element` → expand history section
3. `read_page` → list of deployments

**Verify:**
- Shows last 10 deployments
- Each entry: timestamp, environment, status, URL
- Build/deploy times visible
- Clickable for details

### TC-12.7: Preview Environment Deploy

**Steps:**
1. Open publish dialog
2. `click_element` → select "preview" environment
3. Complete publish flow

**Verify:**
- Deploys to preview URL (different from production)
- Preview environment accessible
- Production unchanged

---

## 13. Collaboration & Multi-User

### TC-13.1: Presence Avatars

**Steps:**
1. Open editor page
2. `read_page` → look for presence avatar bar

**Verify:**
- Shows current user's avatar
- If multiple users connected, all avatars visible
- Color coding per user
- Hover shows display name

### TC-13.2: Remote User Sends AI Message

**Steps:**
1. User A has editor open
2. User B (simulated) sends an AI message
3. `read_page` → User A sees message appear

**Verify:**
- User A sees User B's message in chat (via `ai:message-sent` WS event)
- AI response streams to both users (via `ai:stream-chunk`)
- Both see final response
- Sender name shown on message

### TC-13.3: Remote Cursor in Code Editor

**Steps:**
1. User A opens a file
2. User B edits same file
3. `read_page` → look for remote cursor decoration

**Verify:**
- Remote cursor visible in Monaco editor
- Cursor color matches user's assigned color
- Cursor moves as remote user types
- Label shows remote user's name

### TC-13.4: File Tab Presence Dots

**Steps:**
1. User A opens `App.tsx`
2. User B also opens `App.tsx`
3. `read_page` → check for presence dot on App.tsx tab

**Verify:**
- Colored dot appears on shared file tab
- Dot color matches remote user
- Multiple dots if multiple remote users

### TC-13.5: Team Chat (Non-AI)

**Steps:**
1. Open team chat panel (if accessible)
2. `type_in_page` → type a team message
3. `click_element` → send
4. `read_page` → message appears

**Verify:**
- Team messages separate from AI chat
- Real-time delivery via WebSocket
- Sender name and avatar shown
- Typing indicator ("X is typing...")

### TC-13.6: Share Project Link

**Steps:**
1. `click_element` → share button in toolbar
2. `read_page` → share dialog with link
3. `screenshot_page` → capture share dialog

**Verify:**
- Shareable URL generated
- Copy button works
- Permission options (if any): view only, edit, admin
- Link tracking (share_link_visits table)

---

## 14. Knowledge & Context Files

### TC-14.1: View Knowledge Tab

**Steps:**
1. `click_element` → sidebar "Knowledge" tab
2. `read_page` → list of context files
3. `screenshot_page` → capture knowledge panel

**Verify:**
- Default files listed: knowledge.md, instructions.md, identity.md, soul.md, memory.md, user.md, plan.md
- Each shows: filename, description tooltip, edit area, last updated time
- Editable textarea per file

### TC-14.2: Edit Knowledge File

**Steps:**
1. `click_element` → click in a knowledge file textarea (e.g., instructions.md)
2. `type_in_page` → add text: "Always use TypeScript strict mode"
3. Wait 2.5s for autosave
4. `read_page` → check for save indicator

**Verify:**
- Autosave triggers after 2.5s debounce
- Save indicator shown (checkmark or "Saving...")
- Content persisted to API
- Next AI message respects the new instruction

### TC-14.3: Add New Knowledge File

**Steps:**
1. `click_element` → "Add file" button
2. `type_in_page` → filename: "api-conventions"
3. `click_element` → confirm/create
4. `read_page` → new file appears in list

**Verify:**
- Filename normalized: lowercase, dashes, .md extension → `api-conventions.md`
- New file appears in knowledge panel
- Editable immediately
- Duplicate names rejected

### TC-14.4: Knowledge Affects AI Response

**Steps:**
1. Edit `instructions.md`: "Always use Tailwind CSS classes, never inline styles"
2. Send message: "Add a blue header"
3. After completion, check code

**Verify:**
- AI uses `className="bg-blue-500 text-white"` (Tailwind)
- NOT `style={{ backgroundColor: 'blue' }}` (inline)
- Instruction honored in generated code

---

## 15. Stop / Cancel / Abort

### TC-15.1: Stop During Streaming

**Steps:**
1. Send a complex prompt
2. During streaming (text appearing), `click_element` → stop button (red square)
3. `read_page` → streaming stopped
4. `screenshot_page` → capture partial response

**Verify:**
- Red square button visible during streaming (`isStreaming = true`)
- Click stops the stream immediately
- Partial text preserved in message
- Send button returns to green (idle)
- "Generating..." indicator disappears

### TC-15.2: Stop During Tool Calls

**Steps:**
1. Send prompt that triggers many tool calls
2. During tool execution, `click_element` → stop button
3. `read_page` → check state

**Verify:**
- Tool calls in progress are abandoned
- Partial files may exist (incomplete writes)
- No duplicate/corrupted files
- User can send follow-up message

### TC-15.3: Send New Message After Stop

**Steps:**
1. Stop a streaming response
2. `type_in_page` → new message: "Continue from where you left off"
3. Submit
4. `read_page` → AI continues

**Verify:**
- New message sends successfully
- AI has context from partial response
- No stuck state

---

## 16. Error Handling & Recovery

### TC-16.1: Network Error During Streaming

**Steps:**
1. Start streaming
2. Simulate network failure (disable network in browser)
3. `read_page` → check for error message

**Verify:**
- Error message: "Sorry, something went wrong. Please try again."
- Stream closes cleanly
- User can retry by sending new message

### TC-16.2: Server Error Response

**Steps:**
1. Send prompt that causes server error (e.g., expired token)
2. `read_page` → check for error display

**Verify:**
- Error message displayed in chat
- No partial/corrupted message
- User can retry

### TC-16.3: Empty AI Response

**Steps:**
1. Send prompt → AI returns empty response
2. Wait for auto-retry

**Verify:**
- Status: "Model returned empty — retrying..."
- Auto-retry fires
- If retry also empty: "The AI model returned an empty response after retrying..."

### TC-16.4: Token Expiration Mid-Session

**Steps:**
1. Use a token that expires soon
2. Wait for expiration
3. Try sending message

**Verify:**
- Token refresh attempted
- If refresh fails, error shown
- User redirected to login or prompted to re-authenticate

### TC-16.5: Auto-Fix Loop

**Steps:**
1. Send prompt that generates code with compile errors
2. After initial build, preview shows error overlay
3. `read_page` → check for auto-fix behavior

**Verify:**
- AI detects errors from preview
- Auto-sends fix attempts
- Error resolved or AI explains the issue after max retries
- No infinite loop

### TC-16.6: Stale Stream Detection

**Steps:**
1. Send prompt → stream hangs (no events for 30s+)
2. Wait for timeout behavior

**Verify:**
- After 30s of only keep_alive events, stream auto-closes
- Partial content preserved
- Error message displayed if no content received

---

## 17. Chat Input Features

### TC-17.1: Rotating Placeholder Suggestions

**Steps:**
1. Open editor chat with empty input
2. `read_page` at 0s, 5s, 10s → capture placeholder text

**Verify:**
- Placeholder rotates with typing animation (30ms/char)
- Examples like: "Build a SaaS landing page...", "Create a dashboard..."
- Animation: type → hold 2500ms → erase → next

### TC-17.2: File Attachment via Button

**Steps:**
1. `click_element` → paperclip button
2. Simulate file selection (or check for file dialog)
3. `read_page` → attachment preview strip visible

**Verify:**
- File dialog opens (or drop zone activated)
- Attachment preview shows filename, type icon
- Badge count on paperclip button
- Remove button (X) on each attachment

### TC-17.3: File Attachment via Drag & Drop

**Steps:**
1. `drag_element` → drag file into chat input area
2. `screenshot_page` → capture drag-over highlight

**Verify:**
- Drop zone highlights (`border-primary ring-1 ring-primary bg-primary/5`)
- File added to attachments on drop
- Preview strip shows attachment

### TC-17.4: Image Paste

**Steps:**
1. Copy an image to clipboard
2. `click_element` → focus chat input
3. Paste (Ctrl+V)
4. `read_page` → image attachment appears

**Verify:**
- Image extracted from clipboard
- Preview thumbnail shown
- Sent with message as attachment

### TC-17.5: Multi-Line Input

**Steps:**
1. `type_in_page` → type "Line 1"
2. `type_in_page` key="Shift+Enter"
3. `type_in_page` → type "Line 2"
4. `read_page` → textarea shows 2 lines

**Verify:**
- Shift+Enter adds newline (doesn't send)
- Textarea auto-expands
- Multi-line content sent correctly

### TC-17.6: Send with Keyboard

**Steps:**
1. `type_in_page` → type prompt
2. `type_in_page` key="Enter" → sends immediately

**Verify:**
- Enter key triggers send
- Message appears in chat
- Streaming begins

---

## 18. Editor Layout & Navigation

### TC-18.1: View Mode — Split (Default)

**Steps:**
1. Open editor → default split view
2. `screenshot_page` → shows chat + preview

**Verify:**
- Chat panel visible on left/center
- Preview panel visible on right
- Sidebar optionally visible
- Resizable dividers between panels

### TC-18.2: View Mode — Code Only

**Steps:**
1. `click_element` → "Code" view mode button (Code2 icon)
2. `screenshot_page` → preview hidden

**Verify:**
- Preview panel hidden
- Code editor and sidebar take full width
- Chat panel still accessible

### TC-18.3: View Mode — Preview Only

**Steps:**
1. `click_element` → "Preview" view mode button (Eye icon)
2. `screenshot_page` → code editor hidden

**Verify:**
- Preview takes full width
- Code editor hidden
- Chat still accessible

### TC-18.4: Resize Panels

**Steps:**
1. `drag_element` → drag divider between center and preview
2. `screenshot_page` → panel sizes changed

**Verify:**
- Panels resize as divider is dragged
- `col-resize` cursor appears on hover
- Minimum/maximum constraints respected

### TC-18.5: Collapse/Expand Sidebar

**Steps:**
1. `click_element` → sidebar collapse button (PanelLeftClose)
2. `screenshot_page` → sidebar collapsed (narrow icon bar)
3. `click_element` → sidebar expand button (PanelLeft)
4. `screenshot_page` → sidebar expanded

**Verify:**
- Collapse: sidebar shrinks to icon bar (w-10)
- Expand: sidebar returns to full width
- Tab content hidden/shown

### TC-18.6: Rename Project

**Steps:**
1. `click_element` → project name in toolbar (or pencil icon)
2. `type_in_page` → new name: "My Awesome App"
3. `type_in_page` key="Enter" → save
4. `read_page` → name updated

**Verify:**
- Name editable inline (text input appears)
- Enter saves, Escape cancels
- Name updated in toolbar and backend
- Max width: 200px (truncated if longer)

### TC-18.7: Navigate Between Dashboard and Editor

**Steps:**
1. From editor, `navigate_page` → `http://localhost:3000/dashboard`
2. `read_page` → dashboard shows project list
3. `click_element` → click on a project
4. `read_page` → editor loads with that project

**Verify:**
- Dashboard shows all projects (grid/list)
- Clicking project navigates to `/editor/{projectId}`
- File tree, chat history, preview all load correctly
- Previous conversation preserved

---

## 19. Chat History & Persistence

### TC-19.1: Reload Page — History Preserved

**Steps:**
1. Send several AI messages
2. `navigate_page` → reload page
3. `read_page` → messages still visible

**Verify:**
- All messages restored from API (`GET /projects/{id}/chat/history`)
- User messages + assistant responses shown
- Tool call summaries preserved (wrench icon + counts)
- Thinking content loaded (if saved)
- Version SHAs linked to appropriate messages

### TC-19.2: Active Stream Recovery

**Steps:**
1. Start AI streaming
2. Reload page mid-stream
3. `read_page` → check for recovery state

**Verify:**
- Status check: `GET /projects/{id}/chat/status` → `streaming: true`
- Shows "AI is still working..." on last message
- Polls every 3s until stream ends
- On completion, final content loaded from history

### TC-19.3: Long Chat History Scroll

**Steps:**
1. Have 20+ message history
2. Scroll to top of chat
3. `read_page` → oldest messages visible
4. Scroll to bottom
5. `read_page` → newest messages visible

**Verify:**
- All messages rendered
- Scroll works smoothly
- Auto-scroll to bottom when new message arrives
- Older messages not truncated

---

## 20. End-to-End Journeys

### E2E-1: Build a Complete App with Supabase (Agent Mode)

**Full journey — dashboard to published site.**

1. **Dashboard** → select "Build" mode
2. **Submit**: "Build a bookmark manager where users can save URLs with tags, search by tag, and import/export as JSON. Use Supabase for the database."
3. **Supabase dialog** → select org, region, create project
4. **Wait for build** → watch stream, tool calls, file creation
5. **Preview** → app renders with form, list, search
6. **Interact with preview** → add bookmarks, search, verify CRUD
7. **Follow-up**: "Add dark mode toggle and persist preference in localStorage"
8. **Wait for build** → verify dark mode works
9. **Preview check** → toggle dark mode, refresh, preference persists
10. **Follow-up**: "Add export as CSV button and import from CSV file upload"
11. **Wait for build** → verify export/import
12. **Publish** → publish dialog → production → success URL
13. **Visit published URL** → app works live
14. **History** → check all versions created
15. **Undo last change** → CSV feature removed
16. **Republish** → updated without CSV feature

### E2E-2: Plan Mode Full Lifecycle

**From planning to published app.**

1. **Dashboard** → select "Plan first"
2. **Submit**: "Build a project management tool with kanban boards, task assignments, due dates, and team chat"
3. **Clarification** → answer 3-5 questions
4. **Plan card** → review 6-8 steps
5. **Edit plan** → add "Database schema design" step, reorder, remove one
6. **Approve plan** → click "Start Building"
7. **Building phase** → watch step-by-step progress
8. **Preview** → verify each feature works
9. **Follow-up in agent mode**: "The drag-and-drop on kanban isn't smooth, fix it"
10. **Publish** → deploy to production

### E2E-3: Collaborative Development Session

**Two users building together.**

1. **User A** creates project, shares link
2. **User B** opens shared link → sees presence avatar
3. **User A** sends AI message → User B sees it stream
4. **User B** opens same file → User A sees remote cursor
5. **User B** sends AI message → User A sees other user's request
6. **Both** see tool calls and preview updates
7. **User A** undoes User B's change → Both see revert
8. **User A** publishes → Both see published URL

### E2E-4: Visual Edit → AI Enhancement → Publish

**Design-driven workflow.**

1. **Build initial app**: "Create a portfolio website with hero, about, projects, and contact sections"
2. **Enable visual edit mode**
3. **Select hero heading** → change text via design panel
4. **Select hero background** → change color to gradient
5. **Use toolbar AI prompt**: "Make this section full-height with centered content"
6. **Save changes** from design panel
7. **Switch to chat** → "Add smooth scroll navigation and page transition animations"
8. **Verify** in preview → all visual + AI changes combined
9. **Publish** → live site has all changes

### E2E-5: Integration-Heavy App

**App requiring multiple integrations.**

1. **Submit**: "Build a SaaS invoicing app with Stripe payments, Google Sheets export, and email notifications"
2. **Integration cards** → Connect Stripe (or dismiss)
3. **Integration cards** → Connect Google Sheets
4. **Integration cards** → Connect email service
5. **Build** → verify each integration used correctly
6. **Follow-up**: "Add a customer dashboard showing payment history"
7. **Preview** → verify Stripe data rendered
8. **Publish** → verify integrations work in production

### E2E-6: Error Recovery Journey

**When things go wrong.**

1. **Submit**: "Build a complex data visualization dashboard"
2. **AI builds** → but introduces a runtime error
3. **Preview** shows error overlay
4. **AI auto-detects** → attempts auto-fix
5. **If fix fails**: User sends "The chart component crashes, fix the import"
6. **AI fixes** → preview clears error
7. **User undoes** one fix → error returns
8. **User sends**: "Try a different approach — use Recharts instead of D3"
9. **AI rebuilds** with alternative library
10. **Preview** works → publish

### E2E-7: Context-Aware Multi-Turn with Knowledge

**Using knowledge files to guide AI behavior.**

1. **Open Knowledge tab** → edit `instructions.md`: "Use Tailwind CSS only. No CSS modules. Component file naming: PascalCase. Always add prop types with TypeScript interfaces."
2. **Edit `identity.md`**: "Brand colors: #1E40AF (primary), #F59E0B (accent). Modern, clean aesthetic."
3. **Send**: "Build a marketing landing page"
4. **Verify**: AI uses Tailwind, PascalCase components, TypeScript interfaces, brand colors
5. **Follow-up**: "Add a pricing section with 3 tiers"
6. **Verify**: Same conventions followed in new section
7. **Update instructions**: "Add all new components to a src/components/ folder"
8. **Send**: "Add a testimonials carousel"
9. **Verify**: Component created in `src/components/TestimonialsCarousel.tsx`

### E2E-8: Mobile-Responsive Testing

**Using device modes to verify responsiveness.**

1. **Build**: "Create a dashboard with sidebar navigation"
2. **Desktop view** → sidebar visible, full layout
3. **Switch to Tablet** (768px) → sidebar collapses or becomes hamburger
4. **Switch to Mobile** (375px) → fully stacked layout
5. **Send**: "The mobile layout is broken — the sidebar overlaps the content"
6. **AI fixes** → verify at each breakpoint
7. **Visual edit in mobile mode** → select element, adjust spacing
8. **Save** → verify changes work at all breakpoints

### E2E-9: From Scratch with Step-by-Step Instructions

**User who sends many small follow-up messages.**

1. "Create a new React app with Vite"
2. "Add a header with logo and navigation links"
3. "Add a hero section with a background image"
4. "Create an about page at /about"
5. "Add a contact form with name, email, message fields"
6. "Add form validation — all fields required, email must be valid"
7. "Add a footer with social media links"
8. "Style everything with dark theme — dark background, light text"
9. "Add page transitions with framer-motion"
10. "Publish it"

Each step: verify preview updates, file tree grows, no regressions.

### E2E-10: Project Lifecycle — Create, Iterate, Share, Publish, Sunset

**Complete project lifecycle.**

1. **Create** project: "Build a URL shortener"
2. **Build** → basic app works
3. **Iterate** → add analytics, custom slugs, QR codes
4. **Share** → generate share link, collaborator joins
5. **Collaborate** → both users make changes
6. **Review history** → 10+ versions, diff each
7. **Bookmark** key versions
8. **Publish** to production
9. **Republish** after fixes
10. **View deployment history** → see all deploys
11. **Archive/delete** (if supported)

---

## Appendix A: Browser Tool Quick Reference

| Tool | Use For | Example |
|------|---------|---------|
| `open_browser_page` | Navigate to URL | `url="http://localhost:3000/dashboard"` |
| `navigate_page` | Navigate, reload, go back | `type="url", url="..."` or `type="reload"` |
| `read_page` | Get DOM content for assertions | Check for text, elements, states |
| `screenshot_page` | Visual verification | Full page or specific element |
| `click_element` | Click buttons, links, toggles | `element="Start Building"` or CSS selector |
| `type_in_page` | Type text into inputs | `element="chat input", text="..."` |
| `hover_element` | Trigger hover states | `element="version entry"` |
| `drag_element` | Drag-and-drop | `fromElement="step 3", toElement="step 1"` |
| `handle_dialog` | Accept/dismiss modals | `action="accept"` or `action="dismiss"` |

## Appendix B: Key Selectors

| Element | Likely Selector |
|---------|-----------------|
| Chat input textarea | `textarea` inside chat input component |
| Send button | `button[aria-label="Send message"]` or green button with Send icon |
| Stop button | `button[aria-label="Stop generating"]` or red square button |
| Plan first toggle | Button containing "Plan" text with ListChecks icon |
| Build toggle | Button containing "Build" text with Bot icon |
| Start Building button | Green button with "Start Building" text |
| Refine button | Outline button with "Refine" text |
| Reset button | Outline button with "Reset" text |
| Publish button | Green button with Rocket icon + "Publish" text |
| Sidebar tabs | Buttons in sidebar tab bar: Pages, Files, History, Knowledge, Skills |
| View mode buttons | Segmented buttons with Code2, Columns2, Eye icons |
| Refresh preview | Button with RefreshCw icon |
| Device modes | Desktop/Tablet/Mobile buttons |
| Visual edit toggle | Button with MousePointer2 icon |

## Appendix C: State Verification via read_page

When `read_page` returns DOM content, verify states by looking for:

| State | Look For |
|-------|----------|
| Streaming active | "Generating..." text, Sparkles icon, red stop button |
| Streaming idle | Green send button, no "Generating..." text |
| Plan: clarifying | "Before we plan..." card header, progress dots |
| Plan: reviewing | Complexity badge, "Start Building" button |
| Plan: building | Progress bar, step tracker, completed/pending icons |
| Plan: idle | No plan UI components |
| Integration needed | Connect card with service logo and "Connect" button |
| Supabase provisioning | Dialog with org picker, region selector |
| Preview loading | Spinner in preview area |
| Preview error | Red error overlay, error text |
| Visual edit active | MousePointer2 button highlighted |
| File dirty | Dot indicator on file tab |
| Publishing | "Publishing..." with spinner |
| Published | "Published" with green check, live URL |

## Appendix D: API Endpoints for Verification

Use curl alongside browser testing for deeper verification:

```powershell
$token = "<jwt>"
$headers = @{Authorization="Bearer $token"}

# Chat history
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/chat/history" -Headers $headers

# Stream status
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/chat/status" -Headers $headers

# File tree
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/files" -Headers $headers

# Versions
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/versions" -Headers $headers

# Traces (per-turn event log)
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces?limit=5" -Headers $headers

# Live trace (during streaming)
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces/live" -Headers $headers

# Deploy history
Invoke-RestMethod -Uri "http://127.0.0.1:4000/deploy/$projectId/history" -Headers $headers

# X-Ray (integration monitoring)
Invoke-RestMethod -Uri "http://127.0.0.1:4000/xray/active" -Headers $headers
Invoke-RestMethod -Uri "http://127.0.0.1:4000/xray/stats" -Headers $headers
```
