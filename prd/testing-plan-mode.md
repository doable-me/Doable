# Plan Mode — Testing Guide

> **Feature**: SDK Native Plan Mode (commit `b2ce830`)
> **Last Updated**: 2026-04-11
> **Scope**: Plan mode activation, clarification flow, plan creation, approval, and building

---

## Table of Contents

1. [Testing Methods Overview](#1-testing-methods-overview)
2. [Integrated Browser Testing](#2-integrated-browser-testing)
3. [API-Level Testing (curl)](#3-api-level-testing-curl)
4. [X-Ray & Trace Observability](#4-x-ray--trace-observability)
5. [Server Log Inspection](#5-server-log-inspection)
6. [Test Cases](#6-test-cases)
7. [Known Issues & Edge Cases](#7-known-issues--edge-cases)

---

## 1. Testing Methods Overview

| Method | What it validates | When to use |
|--------|-------------------|-------------|
| **Integrated Browser** | Full E2E: UI rendering, SSE events, user interaction, plan cards, clarification flow | Primary — tests real user experience |
| **curl / API** | SSE event stream, SDK behavior, tool restrictions, event ordering | Debugging backend behavior, quick verification |
| **X-Ray API** | Integration call latency, phase breakdowns, stuck calls | When integrations (Supabase, etc.) are involved |
| **Trace API** | Per-turn event log, tool calls, deltas, timing, DB-persisted history | Post-mortem analysis, regression verification |
| **Server Logs** | `console.log` output from chat.ts, copilot.ts, SDK events | Real-time debugging during development |

---

## 2. Integrated Browser Testing

### Prerequisites

- API server running: `http://127.0.0.1:4000`
- Web app running: `http://localhost:3000`
- Logged in with valid session (token in `localStorage` as `doable_access_token`)

### Available Browser Tools

| Tool | Purpose |
|------|---------|
| `open_browser_page` | Open a new page at a URL |
| `read_page` | Get DOM snapshot — use for assertions |
| `screenshot_page` | Capture visual state |
| `click_element` | Click buttons, links, toggles |
| `type_in_page` | Type into inputs, textareas |
| `hover_element` | Trigger tooltips, hover states |
| `drag_element` | Drag-and-drop (plan step reordering) |
| `handle_dialog` | Accept/dismiss modals |
| `navigate_page` | Navigate, go back/forward, reload |

### 2.1 — Dashboard: Create Project in Plan Mode

```
Page: http://localhost:3000/dashboard
Page ID: (use existing or open_browser_page)
```

**Steps:**

1. **Navigate to dashboard**
   ```
   navigate_page(pageId, type="url", url="http://localhost:3000/dashboard")
   ```

2. **Read page to find the mode toggle and prompt input**
   ```
   read_page(pageId)
   ```
   Look for: `ChatInput` component with mode toggle buttons (Bot icon = Build, ListChecks icon = Plan first)

3. **Click "Plan first" toggle**
   ```
   click_element(pageId, element="Plan first button" or selector="button:has-text('Plan')")
   ```

4. **Type a prompt**
   ```
   type_in_page(pageId, element="chat input", text="Build a recipe sharing app with search, categories, and favorites")
   ```
   Or use selector: `selector="textarea[placeholder*='What do you want to build']"`

5. **Submit**
   ```
   type_in_page(pageId, key="Enter")
   ```
   Or click the submit button:
   ```
   click_element(pageId, element="submit button" or selector="button[type='submit']")
   ```

6. **Wait for navigation to editor**
   The dashboard will start the SSE stream via prompt-bridge, then navigate to `/editor/{projectId}`.

7. **Screenshot the transition**
   ```
   screenshot_page(pageId)  # Capture the status overlay
   ```

**Expected Result:**
- Status overlay shows "Creating project…" → "Connecting to AI…" → transitions to editor
- URL changes to `http://localhost:3000/editor/{projectId}`

### 2.2 — Editor: Clarification Flow

```
Page: http://localhost:3000/editor/{projectId}
```

After the editor loads, the AI should ask clarifying questions before creating a plan.

**Verification Steps:**

1. **Read the page to check for clarification card**
   ```
   read_page(pageId)
   ```
   Look for: `ClarificationFlow` component — blue card with "Before we plan..." header

2. **Screenshot the clarification UI**
   ```
   screenshot_page(pageId, element="clarification card")
   ```

3. **Verify question structure**
   - The card should show one question at a time
   - Progress dots visible at the bottom
   - Question types: `multi_choice` (radio buttons), `yes_no` (Yes/No buttons), `free_text` (text input)
   - "Skip all — let AI decide" button available

4. **Answer a clarification question**
   - For multi-choice:
     ```
     click_element(pageId, element="option label text")
     ```
   - For free_text:
     ```
     type_in_page(pageId, element="answer input", text="Keep it simple, no auth needed")
     click_element(pageId, element="Submit answer button")
     ```
   - For yes_no:
     ```
     click_element(pageId, element="Yes button")
     ```

5. **Skip all clarifications**
   ```
   click_element(pageId, element="Skip all — let AI decide")
   ```

**Expected Result:**
- `planPhase` = `"clarifying"` in editor store
- Clarification card renders with questions from `ask_clarification` tool
- After answering all questions (or skipping), phase transitions to `"planning"`

### 2.3 — Editor: Plan Review Card

After clarifications are answered, the AI creates a plan.

**Verification Steps:**

1. **Read page for PlanCard**
   ```
   read_page(pageId)
   ```
   Look for: `PlanCard` component with plan summary, complexity badge, step list

2. **Screenshot the plan card**
   ```
   screenshot_page(pageId, element="plan card")
   ```

3. **Verify plan structure**
   - Complexity badge: `simple`, `moderate`, or `complex`
   - Plan summary text
   - Numbered steps with titles and descriptions
   - Each step has status icon (should all be `pending` = empty circle)
   - Action buttons: "Start Building" (green), "Refine..." (outline), "Reset" (outline)

4. **Edit a step title** (inline editing)
   ```
   click_element(pageId, element="step 1 title")
   type_in_page(pageId, text="Updated Step Title")
   click_element(pageId, element="save step button")
   ```

5. **Reorder steps** (drag and drop)
   ```
   drag_element(pageId, fromElement="step 3 drag handle", toElement="step 1 drag handle")
   ```

6. **Add a step**
   ```
   click_element(pageId, element="Add step button")
   ```

7. **Remove a step**
   ```
   click_element(pageId, element="remove step button on step 2")
   ```

8. **Approve the plan**
   ```
   click_element(pageId, element="Start Building")
   ```

9. **Refine the plan**
   ```
   click_element(pageId, element="Refine...")
   type_in_page(pageId, element="refinement input", text="Add a step for database schema setup")
   click_element(pageId, element="Send refinement")
   ```

10. **Reset/abandon the plan**
    ```
    click_element(pageId, element="Reset")
    ```

**Expected Result:**
- `planPhase` = `"reviewing"` in editor store
- Plan card renders with structured steps
- Steps are editable, reorderable, addable, removable
- "Start Building" transitions to `planPhase = "building"` and mode switches to `"agent"`
- "Refine" sends a follow-up message with refinement request
- "Reset" clears the plan, returns to idle

### 2.4 — Editor: Plan Building Progress

After approving, the AI builds step-by-step.

**Verification Steps:**

1. **Read page for PlanProgress**
   ```
   read_page(pageId)
   ```
   Look for: `PlanProgress` component with step tracker, progress bar

2. **Screenshot during build**
   ```
   screenshot_page(pageId)  # Full page to see code + preview + progress
   ```

3. **Verify step status transitions**
   As the AI works through steps:
   - `pending` → `in_progress` (spinner icon)
   - `in_progress` → `completed` (checkmark icon)
   - Progress bar advances

4. **Check the preview panel**
   The preview iframe should show the app being built in real-time.
   ```
   screenshot_page(pageId, element="preview iframe")
   ```

**Expected Result:**
- `planPhase` = `"building"` in editor store
- PlanProgress tracks step completion
- Code files appear in file explorer
- Preview updates as code is written

### 2.5 — Assertion Patterns (read_page)

The `read_page` tool returns DOM content. Use it to assert UI state:

```
# Check planPhase via visible UI
read_page(pageId)
# Look for:
#   - "Before we plan..." → clarifying
#   - Complexity badge + "Start Building" button → reviewing
#   - Progress bar + step tracker → building
#   - No plan UI → idle

# Check for specific elements
read_page(pageId)
# Look for text content:
#   - "Before we plan..." (clarification header)
#   - "Start Building" (plan approval button)
#   - "Building step 2 of 5..." (progress indicator)
#   - Tool names in status: "read_file", "view", "glob" (plan mode read-only)
#   - SHOULD NOT SEE: "create_file", "edit", "bash" (write tools — blocked in plan mode)
```

---

## 3. API-Level Testing (curl)

### Prerequisites

Generate a JWT token:
```powershell
$token = node -e "const crypto=require('crypto');const s='change-me-to-a-64-char-random-string';const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const n=Math.floor(Date.now()/1000);const p=Buffer.from(JSON.stringify({sub:'0ff7b403-24dd-4609-8d06-d594a6551658',email:'uniquegodwin@gmail.com',iss:'doable',iat:n,exp:n+7200})).toString('base64url');const sig=crypto.createHmac('sha256',s).update(h+'.'+p).digest('base64url');console.log(h+'.'+p+'.'+sig)"
```

### 3.1 — Create a Test Project

```powershell
$headers = @{Authorization="Bearer $token"; "Content-Type"="application/json"}
$body = '{"name":"Plan Mode Test","description":"Testing plan mode"}'
$project = Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects" -Method POST -Headers $headers -Body $body
$projectId = $project.data.id
```

### 3.2 — Send Plan Mode Chat Request

```powershell
# Streaming SSE via curl (async terminal — output continues)
$body = '{"content":"Build a recipe sharing app with search, categories, favorites","mode":"plan"}'
curl.exe -s -N -X POST "http://127.0.0.1:4000/projects/$projectId/chat" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d $body --max-time 120
```

### 3.3 — Verify SSE Event Stream

**Expected events in plan mode (in order):**

```
data: {"type":"status","data":{"phase":"dev-server","message":"Starting live preview..."}}
data: {"type":"status","data":{"phase":"thinking","message":"Thinking…"}}
data: {"type":"status","data":{"phase":"connecting","message":"Connecting to AI..."}}
data: {"type":"status","data":{"phase":"thinking","message":"AI is analyzing the project..."}}   ← plan-specific message
data: {"type":"thinking","data":"..."}                                                           ← AI reasoning
data: {"type":"tool_call","data":{"name":"read_file",...}}                                       ← READ-ONLY tools only
data: {"type":"tool_result","data":{"name":"read_file","success":true,...}}
data: {"type":"text_delta","data":"I've reviewed the project..."}                                ← AI text response
data: {"type":"tool_call","data":{"name":"ask_clarification",...}}                                ← Clarification tool
data: {"type":"clarification","data":{"questions":[...]}}                                        ← Clarification SSE event
data: {"type":"done","data":{}}                                                                  ← Stream ends
```

**Events that MUST NOT appear in plan mode:**

```
# Write tools — these indicate plan mode is NOT working
data: {"type":"tool_call","data":{"name":"create_file",...}}       ← FAIL
data: {"type":"tool_call","data":{"name":"edit",...}}              ← FAIL
data: {"type":"tool_call","data":{"name":"bash",...}}              ← FAIL
data: {"type":"tool_call","data":{"name":"powershell",...}}        ← FAIL (Windows)
```

**Read-only tools that ARE allowed in plan mode:**

```
read_file / view          ← Read file contents
glob                      ← List files
grep                      ← Search files
report_intent             ← SDK built-in, informational only
ask_clarification         ← Doable custom tool (plan mode only)
create_plan               ← Doable custom tool (plan mode only)
mark_step_complete        ← Doable custom tool (plan mode only)
```

### 3.4 — Send Follow-up (Answer Clarifications)

```powershell
$body = '{"content":"Keep it simple, use localStorage for favorites, Supabase for recipes. Categories: Breakfast, Lunch, Dinner, Dessert. No auth. Create the plan.","mode":"plan"}'
curl.exe -s -N -X POST "http://127.0.0.1:4000/projects/$projectId/chat" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d $body --max-time 120
```

**Expected:** Plan creation, possibly `exit_plan_mode.requested` event (SDK native), or `create_plan` tool call (Doable custom).

### 3.5 — Test Mode Switch (Plan → Agent)

```powershell
# After plan approval, switch to agent mode
$body = '{"content":"Approved. Start building.","mode":"agent"}'
curl.exe -s -N -X POST "http://127.0.0.1:4000/projects/$projectId/chat" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d $body --max-time 180
```

**Expected:** Session evicted and recreated in agent mode, write tools now available.

---

## 4. X-Ray & Trace Observability

### 4.1 — X-Ray API (Integration Monitoring)

X-Ray tracks integration calls (Supabase, Google Drive, MCP, etc.), NOT individual SDK events. Use when plan mode involves external integrations.

**Endpoints (all require JWT Bearer token):**

```powershell
# Active integration calls right now
Invoke-RestMethod -Uri "http://127.0.0.1:4000/xray/active" -Headers @{Authorization="Bearer $token"}

# Stuck calls (running > 30s)
Invoke-RestMethod -Uri "http://127.0.0.1:4000/xray/stuck?threshold=30000" -Headers @{Authorization="Bearer $token"}

# All integration latency stats
Invoke-RestMethod -Uri "http://127.0.0.1:4000/xray/stats" -Headers @{Authorization="Bearer $token"}

# Per-integration stats (e.g., Supabase)
Invoke-RestMethod -Uri "http://127.0.0.1:4000/xray/stats/supabase" -Headers @{Authorization="Bearer $token"}

# Recent call history with phases + HTTP
Invoke-RestMethod -Uri "http://127.0.0.1:4000/xray/history/supabase?limit=10" -Headers @{Authorization="Bearer $token"}

# Single call forensics
Invoke-RestMethod -Uri "http://127.0.0.1:4000/xray/call/$callId" -Headers @{Authorization="Bearer $token"}
```

**X-Ray response shape (per call):**
```json
{
  "callId": "uuid",
  "integrationId": "supabase",
  "action": "query",
  "startedAt": "ISO timestamp",
  "phases": [
    {"name": "piece_load", "startMs": 0, "endMs": 12},
    {"name": "credential_lookup", "startMs": 12, "endMs": 45},
    {"name": "token_refresh", "startMs": 45, "endMs": 200},
    {"name": "action_run", "startMs": 200, "endMs": 450}
  ],
  "httpCalls": [
    {"method": "POST", "url": "https://xxx.supabase.co/rest/v1/recipes", "status": 200, "durationMs": 180}
  ],
  "totalMs": 450,
  "status": "completed"
}
```

### 4.2 — Trace API (AI Turn Observability)

Traces capture every SDK event for an AI chat turn. Persisted to `ai_traces` table in DB.

**Endpoints:**

```powershell
# Live in-flight trace (during active streaming)
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces/live" -Headers @{Authorization="Bearer $token"}

# Historical traces for a project
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces?limit=10" -Headers @{Authorization="Bearer $token"}

# Single trace with full events
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces/$traceId" -Headers @{Authorization="Bearer $token"}

# Aggregate trace stats
Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/trace-stats" -Headers @{Authorization="Bearer $token"}
```

**How to use traces for plan mode verification:**

```powershell
# 1. Start a plan mode request (curl in background terminal)
# 2. Immediately check live trace:
$trace = Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces/live" -Headers @{Authorization="Bearer $token"}

# 3. Inspect events array
$trace.data.events | ForEach-Object { "$($_.type): $($_.toolName ?? $_.data ?? '')" }

# Expected output:
# user_message: Build a recipe sharing app...
# sdk_event: session.tools_updated
# sdk_event: assistant.message_delta
# tool_start: read_file
# tool_end: read_file
# tool_start: ask_clarification       ← Plan mode tool
# tool_end: ask_clarification
# text_delta: I've reviewed...
# sse_emit: clarification

# SHOULD NOT SEE:
# tool_start: create_file             ← Write tool = FAIL
# tool_start: edit                    ← Write tool = FAIL
# tool_start: bash                    ← Write tool = FAIL
```

**After stream completes, query historical trace:**
```powershell
$traces = Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces?limit=1" -Headers @{Authorization="Bearer $token"}
$traceId = $traces.data[0].id
$full = Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces/$traceId" -Headers @{Authorization="Bearer $token"}

# Check all tool calls in the trace
$full.data.events | Where-Object { $_.type -eq "tool_start" } | ForEach-Object { $_.toolName }
# Expected: read_file, glob, grep, view, ask_clarification, create_plan
# Must NOT contain: create_file, edit, bash, powershell
```

---

## 5. Server Log Inspection

### What to Look For

The API server (`tsx watch` in tmux/terminal) logs key plan mode events:

```
# SDK plan mode activation
[CopilotEngine] mode.set(plan) → plan (abc12345…)

# Plan mode failure (non-fatal, falls back to custom filter)
[Chat] Failed to set SDK plan mode for abc12345: <error message>

# SDK exit_plan_mode event
[Chat] exit_plan_mode.requested: summary="Recipe Sharing App...", actions=["approve","reject"], recommended=approve

# respondToExitPlanMode result
[CopilotEngine] respondToExitPlanMode(approve) for abc12345…

# Tool calls (check no write tools)
[Chat][9717d5db] tool.execution_start: read_file
[Chat][9717d5db] tool.execution_complete: read_file
[Chat][9717d5db] tool.execution_start: ask_clarification

# Stream completion
[Chat][9717d5db] terminal: session.idle
[Chat][9717d5db] stream done — content: 342 chars, thinking: 1205 chars, toolCalls: true, tools: 4
```

### How to Read Logs

The API runs via `tsx watch` — logs go to the terminal where it was started. In tmux:
```bash
# Attach to the API tmux window
tmux attach -t doable:api

# Or on local dev, check the terminal running:
cd services/api && pnpm dev
```

---

## 6. Test Cases

### TC-01: Plan Mode Activates SDK Native Mode

| Field | Value |
|-------|-------|
| **Priority** | P0 — Critical |
| **Method** | Browser + API |
| **Precondition** | Project exists, API running |

**Steps (Browser):**
1. Open dashboard → select "Plan first" → type prompt → submit
2. Wait for editor to load
3. `read_page` — check for clarification card or plan card

**Steps (API):**
1. POST `/projects/{id}/chat` with `mode: "plan"`
2. Observe SSE stream

**Expected:**
- Server log shows `[CopilotEngine] mode.set(plan) → plan`
- Status message: `"AI is analyzing the project..."` (NOT `"AI is writing code..."`)
- Only read-only tool calls (`read_file`, `view`, `glob`, `grep`)
- No `create_file`, `edit`, `bash`, `powershell` tool calls

**Pass Criteria:** Zero write tool invocations in SSE stream or trace.

---

### TC-02: Clarification Questions Render

| Field | Value |
|-------|-------|
| **Priority** | P0 — Critical |
| **Method** | Browser |
| **Precondition** | Plan mode request sent (TC-01) |

**Steps:**
1. After AI processes the prompt, `read_page` for clarification card
2. Verify blue card with "Before we plan..." header
3. Verify at least 1 question is shown
4. Verify progress dots match question count
5. `screenshot_page` for visual verification

**Expected:**
- `clarification` SSE event emitted with `questions` array
- frontend `planPhase` = `"clarifying"`
- Each question has: `id`, `question`, `type` (`multi_choice`/`yes_no`/`free_text`)

**Pass Criteria:** Clarification card visible with at least one question.

---

### TC-03: Answer Clarification Questions

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Method** | Browser |
| **Precondition** | Clarification card visible (TC-02) |

**Steps:**
1. Click an option or type an answer
2. Click submit / next
3. Repeat for all questions
4. After last answer, verify `planPhase` transitions

**Expected:**
- Answering sends the response back to the AI
- After all answers, AI proceeds to plan creation
- `planPhase` transitions from `"clarifying"` → `"planning"` → `"reviewing"`

---

### TC-04: Skip Clarifications

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Method** | Browser |
| **Precondition** | Clarification card visible (TC-02) |

**Steps:**
1. Click "Skip all — let AI decide"
2. Verify AI proceeds directly to plan creation

**Expected:**
- Default answers used
- Plan creation begins without further questions

---

### TC-05: Plan Card Renders with Steps

| Field | Value |
|-------|-------|
| **Priority** | P0 — Critical |
| **Method** | Browser |
| **Precondition** | Clarifications answered or skipped (TC-03/TC-04) |

**Steps:**
1. Wait for plan to be created
2. `read_page` for PlanCard component
3. Verify: summary text, complexity badge, numbered steps
4. `screenshot_page` for visual verification

**Expected:**
- `plan` SSE event emitted with plan object
- `planPhase` = `"reviewing"`
- Plan card shows:
  - Summary (1-2 sentences)
  - Complexity badge (`simple`/`moderate`/`complex`)
  - 3-8 numbered steps with titles
  - "Start Building", "Refine...", "Reset" buttons

**Pass Criteria:** Plan card visible with structured steps.

---

### TC-06: Edit Plan Steps

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Method** | Browser |
| **Precondition** | Plan card visible (TC-05) |

**Steps:**
1. Click a step title to edit → type new title → confirm
2. Click "Add step" → verify new step appears
3. Click remove on a step → verify it disappears
4. Drag step 3 to position 1 → verify reorder

**Expected:**
- Steps are editable inline
- Add/remove updates the step list
- Drag reorder works (step numbers update)

---

### TC-07: Approve Plan → Build Phase

| Field | Value |
|-------|-------|
| **Priority** | P0 — Critical |
| **Method** | Browser |
| **Precondition** | Plan card visible (TC-05) |

**Steps:**
1. Click "Start Building" button
2. Verify `planPhase` transitions to `"building"`
3. `read_page` for PlanProgress component
4. Observe step status changes
5. Check that the chat mode switches to `"agent"`

**Expected:**
- Plan approved, mode changes from `"plan"` to `"agent"`
- SDK session recreated in interactive/autopilot mode
- Write tools now available (`create_file`, `edit`, `bash`)
- PlanProgress shows real-time step completion
- Preview updates as code is written

---

### TC-08: Refine Plan

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Method** | Browser |
| **Precondition** | Plan card visible (TC-05) |

**Steps:**
1. Click "Refine..."
2. Type refinement: "Add a step for database setup"
3. Submit
4. Verify new/updated plan is returned

**Expected:**
- New plan-mode message sent with refinement context
- Updated plan replaces the old one
- Step list reflects refinement

---

### TC-09: Reset/Abandon Plan

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Method** | Browser |
| **Precondition** | Plan card visible (TC-05) |

**Steps:**
1. Click "Reset"
2. Verify plan card disappears
3. Verify `planPhase` → `"idle"`
4. Verify user can send new messages

**Expected:**
- Plan abandoned
- `planPhase` = `"idle"`
- Chat returns to normal state

---

### TC-10: No Write Tools in Plan Mode (API Verification)

| Field | Value |
|-------|-------|
| **Priority** | P0 — Critical |
| **Method** | API + Trace |
| **Precondition** | Project exists |

**Steps:**
1. Send plan mode request via curl
2. Capture full SSE stream
3. Query live trace during streaming
4. Query historical trace after completion
5. Filter for `tool_start` events

**Verification Script:**
```powershell
# After stream completes:
$traces = Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces?limit=1" -Headers @{Authorization="Bearer $token"}
$traceId = $traces.data[0].id
$full = Invoke-RestMethod -Uri "http://127.0.0.1:4000/projects/$projectId/traces/$traceId" -Headers @{Authorization="Bearer $token"}

$writeTools = @("create_file", "edit", "bash", "powershell", "edit_file")
$violations = $full.data.events | Where-Object { $_.type -eq "tool_start" -and $_.toolName -in $writeTools }
if ($violations.Count -gt 0) {
    Write-Error "FAIL: Write tools used in plan mode: $($violations.toolName -join ', ')"
} else {
    Write-Host "PASS: No write tools in plan mode"
}
```

**Pass Criteria:** Zero write tool events in the trace.

---

### TC-11: Status Messages Are Mode-Aware

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Method** | API |

**Steps:**
1. Send plan mode request → check for `"AI is analyzing the project..."`
2. Send agent mode request → check for `"AI is writing code..."`

**Expected:**
- Plan mode: `{"type":"status","data":{"phase":"thinking","message":"AI is analyzing the project..."}}`
- Agent mode: `{"type":"status","data":{"phase":"thinking","message":"AI is writing code..."}}`

---

### TC-12: Session Mode Switching (Plan → Agent → Plan)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Method** | API |

**Steps:**
1. Send plan mode message → verify plan mode behavior
2. Switch to agent mode (new message with `mode: "agent"`) → verify write tools available
3. Switch back to plan mode (new message with `mode: "plan"`) → verify read-only tools only

**Expected:**
- Each mode switch evicts the cached session (logged: `[Chat] mode changed plan→agent, evicting session`)
- New session created with correct mode
- Tool availability matches mode

---

### TC-13: exit_plan_mode.requested Event Handling

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Method** | API + Server Logs |

**Steps:**
1. Send plan mode request → answer clarifications → request plan creation
2. Watch server logs for `[Chat] exit_plan_mode.requested`
3. Verify `plan` SSE event is emitted

**Expected:**
- When SDK's plan mode agent finishes creating plan.md:
  - Server logs: `[Chat] exit_plan_mode.requested: summary="...", actions=[...], recommended=approve`
  - SSE: `{"type":"plan","data":{"plan":{...}}}` with structured steps
  - Auto-approve: `[CopilotEngine] respondToExitPlanMode(approve) for ...`

**Note:** This event may NOT fire if the custom `create_plan` tool is used instead. Both paths should work.

---

### TC-14: SDK Plan Mode Failure Fallback

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Method** | API + Server Logs |

**Steps:**
1. Simulate `mode.set("plan")` failure (e.g., corrupt session)
2. Verify fallback to custom PLAN_MODE_ALLOWED filter

**Expected:**
- Server logs: `[Chat] Failed to set SDK plan mode for ...: <error>`
- Custom tool filter still applies (belt-and-braces)
- Plan mode still mostly works (custom tools restricted, SDK tools unrestricted)

---

### TC-15: Prompt Bridge — Dashboard to Editor Transition

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Method** | Browser |

**Steps:**
1. On dashboard, select "Plan first" and submit prompt
2. Screenshot dashboard during "Creating project..." overlay
3. After navigation to editor, `read_page` immediately
4. Verify buffered events were replayed (thinking/status events visible)

**Expected:**
- Stream starts on dashboard (prompt-bridge)
- Buffered events replayed when editor mounts
- No gap or "dead time" between dashboard and editor
- Status messages flow continuously

---

### TC-16: Concurrent Plan Mode Sessions

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Method** | API (two curl requests) |

**Steps:**
1. Create two projects
2. Send plan mode requests to both simultaneously
3. Verify both sessions operate independently

**Expected:**
- Each session gets its own SDK plan mode activation
- Tool restrictions apply independently
- No cross-session contamination

---

### TC-17: Plan Mode with Supabase Integration

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Method** | Browser + X-Ray |
| **Precondition** | Supabase integration connected |

**Steps:**
1. Send plan mode request: "Build a recipe app with Supabase backend"
2. Verify AI reads project files but doesn't create Supabase tables
3. Check X-Ray for any integration calls: `GET /xray/active`

**Expected:**
- Plan mode doesn't trigger integration write actions
- X-Ray shows no active calls during planning phase
- Plan output references Supabase schema but doesn't execute it

---

## 7. Known Issues & Edge Cases

### 7.1 — `report_intent` Still Fires
The SDK's `report_intent` built-in tool fires even in plan mode. It's informational-only (no side effects) and can be safely ignored. Not worth filtering.

### 7.2 — `powershell` Tool in Plan Mode
Observed `powershell` tool call (`ls`, `dir` commands) in plan mode on Windows. This is the SDK using shell commands for file listing. These are read-only but ideally should be `glob`/`view` instead. Non-critical.

### 7.3 — Long Planning Sessions
Complex prompts can cause plan mode to take 60-120s analyzing files. The `keep_alive` SSE events prevent timeout. Status messages alternate between "Still thinking…" and "This one's taking a while — still going…".

### 7.4 — AI Exploring Host Filesystem
In plan mode, the SDK agent may explore the workspace root (`C:\Users\gj\Documents\workspace\doable\`) instead of limiting itself to the project directory. This is because the SDK's `cwd` is set to the project dir but `view`/`glob` can reach parent directories. The system prompt instructs it to focus on the project, but it may still read host files. Non-critical for plan mode (read-only) but worth noting.

### 7.5 — exit_plan_mode.requested May Not Fire
If the AI uses Doable's custom `create_plan` tool instead of writing `plan.md`, the SDK's native `exit_plan_mode.requested` event won't fire. The plan is still surfaced via the `create_plan` tool's SSE emission. Both paths work — the SDK native path is preferred but the custom path is the existing fallback.

### 7.6 — Session Recreation on Mode Switch
When switching from plan → agent, the cached session is evicted and a new one is created. This means the AI loses conversation context from the planning phase. The plan content is included in the system prompt for the agent mode session, but tool call history is lost. This is by design (SDK modes are per-session).
