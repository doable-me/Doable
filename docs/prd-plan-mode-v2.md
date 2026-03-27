# PRD: Plan Mode v2 — Interactive Planning for Doable AI

**Status:** Draft
**Date:** 2026-03-27
**Author:** AI-assisted (Claude)

---

## 1. Problem Statement

Doable's current plan mode is a thin wrapper around chat — the AI generates a markdown plan in `.doable/plan.md` and displays it as plain text in the chat panel. There are:

- **No clarifying questions** — the AI guesses what the user wants
- **No structured plan representation** — just a markdown blob
- **No plan-specific UI** — plans render identically to regular chat messages
- **No approval workflow** — users must manually switch to agent mode
- **No editing affordances** — users can't reorder, remove, or modify plan steps
- **No visual preview** — users can't see what the AI intends to build

This means users either skip planning entirely (going straight to agent mode and burning tokens on misaligned output) or get a wall of markdown they don't engage with. For Doable's target audience — creators, designers, producers, CEOs — this is especially problematic. These users need visual, interactive guidance, not developer-style spec docs.

### Current Flow (What Exists Today)

```
User types prompt → Selects "Plan" toggle → AI reads codebase →
AI outputs markdown plan in chat → User reads text → User manually
switches to Agent mode → AI re-reads plan from .doable/plan.md →
AI starts building (may still misunderstand intent)
```

### Key Files (Current Implementation)

| Layer | File | Role |
|-------|------|------|
| Backend | `services/api/src/ai/modes/plan.ts` | Plan mode handler (read-only tools, extracts markdown) |
| Backend | `services/api/src/ai/context/injector.ts` | Builds system prompt, injects "ACTIVE PLAN" section |
| Backend | `services/api/src/routes/chat.ts` | Main chat endpoint, mode routing, SSE streaming |
| Frontend | `apps/web/src/modules/editor/chat/mode-toggle.tsx` | Agent/Plan toggle button |
| Frontend | `apps/web/src/modules/editor/chat/chat-message.tsx` | Message renderer (no plan-specific rendering) |
| Frontend | `apps/web/src/modules/editor/chat/chat-panel.tsx` | Chat container |
| Frontend | `apps/web/src/modules/editor/hooks/use-chat.ts` | Chat API + SSE streaming |
| Frontend | `apps/web/src/modules/editor/hooks/use-editor-store.ts` | Zustand state (ChatMessage type) |
| Shared | `packages/shared/src/types/ai.ts` | AiMode, ChatMessage types |

---

## 2. Target Audience

Doable serves **non-developers who build web apps and sites** — creators, designers, producers, CEOs. Planning UX must:

- Use **visual language**, not technical jargon
- Follow **progressive disclosure** — show simplicity first, detail on demand
- Feel like a **conversation with a collaborator**, not configuring a tool
- Offer **sensible defaults** so users can approve quickly if the AI understood them
- Never require the user to read or write markdown to interact with a plan

---

## 3. Competitive Landscape (Planning Phase Only)

| Tool | Clarifying Questions | Structured Plan | Editable Plan | Approval Gate | Visual Preview |
|------|---------------------|-----------------|---------------|---------------|----------------|
| **Lovable** | Yes (built-in tool) | Markdown in `.lovable/plan.md` | Yes (edit markdown) | "Approve" button | No |
| **Bolt.new** | Sometimes (user-prompted) | Step list in chat | No (discuss then implement) | "Implement this plan" button | No |
| **Replit** | Yes (during plan mode) | Ordered task list | Yes (refine via chat) | "Start Building" button | No |
| **Cursor** | Yes (3-5 targeted) | Interactive checklist | Yes (add/remove/reorder) | Manual transition | No |
| **Devin** | Yes (during plan) | Plan with code citations | Yes (edit/reorder steps) | 30s auto-proceed (configurable) | No |
| **v0** | No (guesses) | None (implicit) | N/A | None (immediate build) | Generated UI preview |
| **GitHub Copilot Workspace** | Spec-based | Spec + Plan (2 artifacts) | Yes (both editable) | "Implement" button | No |
| **Kiro (AWS)** | Requirements-first | 3 artifacts (requirements, design, tasks) | Yes | Per-task execution | No |
| **Doable (current)** | No | Markdown blob | No | No (manual mode switch) | No |

### Key Insight

**No tool currently combines visual preview with interactive planning.** This is Doable's opportunity. Doable already has a live preview pane — showing a wireframe or sketch of what will be built, alongside an interactive plan, would be a genuine differentiator.

---

## 4. Proposed Flow: Plan Mode v2

### 4.1 High-Level Flow

```
User types prompt
    ↓
┌─────────────────────────────────────────────────┐
│  PHASE 1: UNDERSTAND (Clarifying Questions)     │
│  AI asks 2-4 focused questions, one at a time   │
│  Rendered as interactive cards with:             │
│  - Quick-select options (smart defaults)         │
│  - Free-text override                            │
│  - "Skip" to accept AI's best guess             │
│  User answers → AI refines understanding         │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│  PHASE 2: PLAN (Visual Plan Card)               │
│  AI generates structured plan displayed as:      │
│  - Summary card (1-2 sentence overview)          │
│  - Step cards (draggable, editable, removable)   │
│  - Estimated complexity badge                    │
│  - Optional: wireframe sketch in preview pane    │
│  User can: reorder, edit, remove, add steps      │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│  PHASE 3: APPROVE (Explicit Transition)         │
│  "Start Building" button (primary CTA)           │
│  "Refine Plan" button (continue discussing)      │
│  "Start Over" button (reset)                     │
│  Approval locks the plan + switches to agent     │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│  PHASE 4: BUILD (Agent Mode with Plan Context)  │
│  Agent executes plan step-by-step               │
│  Progress shown as checkmarks on plan steps      │
│  User can pause, skip steps, or abort            │
└─────────────────────────────────────────────────┘
```

### 4.2 Phase 1: Clarifying Questions

**Why this matters:** Cursor reports 34% fewer implementation errors and 42% fewer iteration cycles when the AI asks clarifying questions before building. For non-developer users who struggle to write precise prompts, this is even more impactful.

**How it works:**

1. User submits initial prompt
2. AI analyzes the request + existing codebase
3. AI returns a `clarification` message type with 2-4 questions
4. Each question is rendered as an **interactive card** (not text in chat):

```
┌─────────────────────────────────────────┐
│  🎨  What visual style are you going    │
│      for?                               │
│                                         │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐  │
│  │ Minimal │ │ Playful  │ │ Bold    │  │
│  └─────────┘ └──────────┘ └─────────┘  │
│                                         │
│  Or describe your own: [_____________]  │
│                                         │
│  [Skip — let AI decide]                 │
└─────────────────────────────────────────┘
```

**Card types:**

| Type | When to Use | UI |
|------|-------------|-----|
| **Multi-choice** | AI has 2-5 likely answers | Clickable option pills + free-text fallback |
| **Yes/No** | Binary decision | Two buttons + optional "Tell me more" |
| **Free-text** | Open-ended (e.g., "describe your brand") | Text input with placeholder example |
| **File reference** | AI needs to see existing content | File picker or "show me" button |

**Rules:**
- Maximum 4 questions per clarification round
- AI should ask questions **one round at a time** (not all upfront)
- Each question has a "Skip" option that uses the AI's best guess
- If the user's initial prompt is highly specific, skip clarification entirely
- Questions should use plain language, no technical terms
- After answers, AI may ask 1-2 follow-up questions (max 2 rounds total)

### 4.3 Phase 2: Structured Plan

**Why this matters:** A structured, visual plan is dramatically more reviewable than a wall of markdown. Users can scan, edit, and approve without reading paragraphs of text.

**Plan data structure:**

```typescript
interface Plan {
  id: string;
  projectId: string;
  summary: string;           // 1-2 sentence plain-language overview
  complexity: "simple" | "moderate" | "complex";
  steps: PlanStep[];
  status: "draft" | "approved" | "in_progress" | "completed" | "abandoned";
  createdAt: string;
  approvedAt?: string;
}

interface PlanStep {
  id: string;
  order: number;
  title: string;             // Short, user-friendly title
  description: string;       // What this step accomplishes (plain language)
  details?: string;          // Technical details (hidden by default, expandable)
  status: "pending" | "in_progress" | "completed" | "skipped";
  filePaths?: string[];      // Files that will be touched (hidden by default)
}
```

**Plan card UI:**

```
┌─────────────────────────────────────────────┐
│  📋  PLAN                          Simple   │
│                                              │
│  "Build a portfolio site with a hero         │
│   section, project gallery, and contact      │
│   form."                                     │
│                                              │
│  ┌─ ○ 1. Set up the page layout ──────────┐ │
│  │  Create the main page structure with a  │ │
│  │  responsive layout and navigation.      │ │
│  │  [Show details ▾]                       │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─ ○ 2. Build the hero section ──────────┐ │
│  │  Add a full-width hero with headline,   │ │
│  │  subtitle, and call-to-action button.   │ │
│  │  [Show details ▾]                       │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─ ○ 3. Create the project gallery ──────┐ │
│  │  Grid of project cards with images,     │ │
│  │  titles, and hover effects.             │ │
│  │  [Show details ▾]                       │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─ ○ 4. Add the contact form ────────────┐ │
│  │  Simple form with name, email, and      │ │
│  │  message fields.                        │ │
│  │  [Show details ▾]                       │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  [+ Add a step]                              │
│                                              │
│  ┌──────────────┐  ┌───────────┐  ┌──────┐  │
│  │ Start Building│  │ Refine... │  │ Reset│  │
│  └──────────────┘  └───────────┘  └──────┘  │
└──────────────────────────────────────────────┘
```

**Interactions:**
- **Drag to reorder** steps
- **Click step title** to edit inline
- **Click description** to edit inline
- **"Show details"** expands technical implementation notes + file paths
- **Swipe/delete** to remove a step
- **"+ Add a step"** to insert a custom step
- **Step cards are collapsible** — collapsed by default on small screens

### 4.4 Phase 3: Approval Gate

Three explicit actions:

| Button | Behavior |
|--------|----------|
| **Start Building** (primary) | Locks plan, saves to `.doable/plan.md` + DB, switches to agent mode, begins step-by-step execution |
| **Refine Plan** | Returns to chat with plan as context, user can request changes, AI regenerates plan |
| **Reset** | Clears the plan, returns to empty chat |

**No auto-proceed.** The user must explicitly click "Start Building." This is critical for non-developer users who may not realize the AI is about to modify their project.

### 4.5 Phase 4: Build with Progress

Once approved, the plan becomes a **progress tracker** pinned at the top of the chat panel (or as a sidebar widget):

```
┌────────────────────────────────────────┐
│  Building your portfolio site...       │
│  ━━━━━━━━━━━━━━━━━━━━━━━░░░░░  75%    │
│                                        │
│  ✅ 1. Set up page layout              │
│  ✅ 2. Build hero section              │
│  🔄 3. Create project gallery          │
│  ○  4. Add contact form                │
│                                        │
│  [Pause]  [Skip step]                  │
└────────────────────────────────────────┘
```

- Steps update in real-time as the agent completes work
- User can **pause** execution between steps
- User can **skip** a step
- Clicking a completed step shows what was done (files changed, preview)

---

## 5. Data Model Changes

### 5.1 New SSE Event Types

Add to the existing streaming protocol:

```typescript
// New event types for plan mode
type PlanStreamEvent =
  | { type: "clarification"; data: ClarificationQuestion[] }
  | { type: "plan"; data: Plan }
  | { type: "plan_step_update"; data: { stepId: string; status: PlanStepStatus } }
  | { type: "plan_approved"; data: { planId: string } };

interface ClarificationQuestion {
  id: string;
  question: string;           // Plain-language question text
  type: "multi_choice" | "yes_no" | "free_text" | "file_reference";
  options?: string[];          // For multi_choice
  default?: string;            // AI's best guess (used if skipped)
  context?: string;            // Why the AI is asking this
}
```

### 5.2 Database Schema

```sql
-- Plans table
CREATE TABLE plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  complexity TEXT NOT NULL DEFAULT 'moderate',
  status TEXT NOT NULL DEFAULT 'draft',
  original_prompt TEXT,        -- The user's initial request
  clarification_answers JSONB, -- Answers to clarifying questions
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Plan steps
CREATE TABLE plan_steps (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  file_paths TEXT[],
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_plans_project ON plans(project_id);
CREATE INDEX idx_plan_steps_plan ON plan_steps(plan_id);
```

### 5.3 Updated ChatMessage Type

```typescript
interface ChatMessage {
  // ... existing fields ...

  // New plan-related fields
  planId?: string;                          // Associated plan
  clarificationQuestions?: ClarificationQuestion[];  // For question cards
  clarificationAnswers?: Record<string, string>;     // User's answers
  plan?: Plan;                              // Structured plan object
}
```

---

## 6. Backend Changes

### 6.1 Plan Mode Handler (`services/api/src/ai/modes/plan.ts`)

Replace the current implementation with a two-phase approach:

**Phase 1 — Clarification:**
- Add a new tool: `ask_clarification` that the AI calls instead of directly generating a plan
- Tool schema: `{ questions: ClarificationQuestion[] }`
- When AI calls this tool, emit a `clarification` SSE event
- Wait for user response (new API endpoint or follow-up message)
- Inject answers into context for plan generation

**Phase 2 — Plan Generation:**
- Update the plan generation prompt to output **structured JSON**, not markdown
- Parse the AI's response into `Plan` + `PlanStep[]` objects
- Save to database (not just `.doable/plan.md`)
- Also save to `.doable/plan.md` for backward compatibility
- Emit a `plan` SSE event with the structured data

### 6.2 New System Prompt for Plan Mode

```
You are in PLAN mode. Your job is to help the user plan their project before building.

STEP 1 — CLARIFY (use the ask_clarification tool):
- Read the user's request carefully
- If anything is ambiguous or underspecified, ask 2-4 clarifying questions
- Questions must be in plain language — no technical jargon
- Each question should have smart default options when possible
- If the request is already clear and specific, skip to STEP 2

STEP 2 — PLAN (use the create_plan tool):
- Generate a structured plan with:
  - A 1-2 sentence summary in plain language
  - 3-8 concrete steps, each with a title and description
  - Complexity estimate (simple / moderate / complex)
- Step titles should be action-oriented ("Build the hero section", not "Hero section")
- Step descriptions should explain WHAT will be built, not HOW
- Technical details (file paths, implementation notes) go in the optional details field
- Do NOT start building. Only output the plan.
```

### 6.3 New Tools for Plan Mode

```typescript
// ask_clarification — AI calls this to ask the user questions
defineTool({
  name: "ask_clarification",
  description: "Ask the user clarifying questions before generating a plan",
  parameters: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          type: { type: "string", enum: ["multi_choice", "yes_no", "free_text"] },
          options: { type: "array", items: { type: "string" } },
          default: { type: "string" },
          context: { type: "string" }
        }
      }
    }
  }
});

// create_plan — AI calls this to output a structured plan
defineTool({
  name: "create_plan",
  description: "Create a structured development plan for user approval",
  parameters: {
    summary: { type: "string" },
    complexity: { type: "string", enum: ["simple", "moderate", "complex"] },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          details: { type: "string" },
          filePaths: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
});
```

### 6.4 New API Endpoints

```
POST /projects/:id/plan/approve
  → Marks plan as approved, switches session to agent mode with plan context

POST /projects/:id/plan/update
  → Updates plan steps (reorder, edit, remove, add) from frontend edits
  Body: { steps: PlanStep[] }

GET /projects/:id/plan
  → Returns current active plan (if any)

POST /projects/:id/plan/abandon
  → Marks plan as abandoned, clears plan context
```

### 6.5 Agent Mode Enhancement

When agent mode starts with an approved plan:
- System prompt includes the full plan with step IDs
- After completing work related to a step, AI calls a `mark_step_complete` tool
- This emits a `plan_step_update` SSE event
- Frontend updates the progress tracker in real-time

---

## 7. Frontend Changes

### 7.1 New Components

| Component | Purpose |
|-----------|---------|
| `ClarificationCard` | Renders a single clarifying question with options/input |
| `ClarificationFlow` | Manages the sequence of clarification cards |
| `PlanCard` | Renders the full structured plan with step list |
| `PlanStep` | Individual step card (draggable, editable, collapsible) |
| `PlanActions` | "Start Building" / "Refine" / "Reset" button group |
| `PlanProgress` | Pinned progress tracker during build phase |
| `PlanStepDetail` | Expandable technical details for a step |

### 7.2 Chat Message Rendering Updates

`chat-message.tsx` needs to detect plan-related message types and render the appropriate component instead of plain markdown:

```tsx
// Pseudocode for message rendering logic
if (message.clarificationQuestions) {
  return <ClarificationFlow questions={message.clarificationQuestions} />;
}
if (message.plan) {
  return <PlanCard plan={message.plan} />;
}
// ... existing markdown rendering
```

### 7.3 State Management Updates

Add to the editor store:

```typescript
interface EditorState {
  // ... existing state ...

  // Plan state
  activePlan: Plan | null;
  planPhase: "idle" | "clarifying" | "planning" | "reviewing" | "building";
  pendingQuestions: ClarificationQuestion[] | null;

  // Plan actions
  setActivePlan(plan: Plan): void;
  updatePlanStep(stepId: string, updates: Partial<PlanStep>): void;
  reorderPlanSteps(stepIds: string[]): void;
  removePlanStep(stepId: string): void;
  addPlanStep(step: Partial<PlanStep>): void;
  approvePlan(): void;
  abandonPlan(): void;
  setPlanPhase(phase: string): void;
}
```

### 7.4 Mode Toggle Update

Replace the current binary Agent/Plan toggle with a more descriptive selector:

- **Build** (was "Agent") — "AI writes code directly"
- **Plan first** (was "Plan") — "AI helps you plan, then builds"

The "Plan first" option could be the default for new projects (where there's no existing code context).

---

## 8. Interaction Scenarios

### Scenario 1: Simple Request (No Clarification Needed)

> User: "Add a dark mode toggle to my site"

AI detects this is specific enough → skips clarification → generates plan:

```
Plan: Add dark mode toggle
Complexity: Simple

1. Add a theme toggle button to the navigation
2. Set up dark mode CSS variables
3. Wire up the toggle to switch themes
4. Save the user's preference
```

User clicks "Start Building" → agent executes.

### Scenario 2: Vague Request (Clarification Needed)

> User: "Build me a landing page"

AI asks clarifying questions:

**Card 1:** "What's this landing page for?"
- Options: [Product launch] [Newsletter signup] [Portfolio] [Event] [Other: ___]

**Card 2:** "What sections do you need?"
- Options: [Hero + CTA] [Hero + Features + CTA] [Hero + Features + Testimonials + CTA] [Let AI decide]

**Card 3:** "Any visual style preference?"
- Options: [Clean & minimal] [Bold & colorful] [Dark & modern] [Warm & friendly]

After answers → AI generates a tailored plan → user reviews → approves.

### Scenario 3: Iterative Refinement

> User approves plan but then says: "Actually, swap steps 3 and 4, and remove the testimonials section"

User can either:
- **Drag steps** in the plan card to reorder
- **Click delete** on the testimonials step
- **Type in chat** and AI updates the plan

### Scenario 4: Mid-Build Pause

During build phase, user clicks "Pause" after step 2 completes:
- Agent stops after current step
- User reviews what was built
- User can resume, skip the next step, or modify remaining steps

---

## 9. Design Principles

1. **Questions, not forms.** Clarification feels like a conversation, not a configuration wizard. One question at a time, with smart defaults.

2. **Visual plans, not documents.** Plans are interactive card lists, not markdown files. Users scan, drag, and edit — they don't read paragraphs.

3. **Always skippable.** Every question has a "Skip" option. Every plan step can be removed. Users who know what they want should never feel slowed down.

4. **Progressive disclosure.** Summary first. Technical details hidden behind "Show details." File paths only shown if expanded. Non-developers never need to see implementation specifics.

5. **Explicit transitions.** The "Start Building" button is the only way to begin execution. No auto-proceed. No ambiguity about when the AI will start changing files.

6. **Plan as living document.** The plan stays visible and updates during building. It's not a one-time artifact — it's a progress tracker.

7. **Plain language always.** "Build the hero section" not "Create Hero component with responsive flex layout." The AI translates user intent into technical steps internally.

---

## 10. Implementation Phases

### Phase 1: Foundation (Backend + Data Model)
- Add `plans` and `plan_steps` database tables
- Implement `ask_clarification` and `create_plan` tools
- Update plan mode handler to use structured output
- Add plan CRUD API endpoints
- Update system prompt for plan mode
- Backward compatibility: still write `.doable/plan.md`

### Phase 2: Clarification UI
- Build `ClarificationCard` component (multi-choice, yes/no, free-text)
- Build `ClarificationFlow` to manage card sequence
- Update `chat-message.tsx` to render clarification cards
- Handle user responses → send back to API → continue plan generation
- Update SSE handling for `clarification` event type

### Phase 3: Plan Card UI
- Build `PlanCard`, `PlanStep`, `PlanStepDetail` components
- Implement drag-to-reorder (using existing drag library or lightweight solution)
- Implement inline editing of step titles and descriptions
- Build `PlanActions` button group (Start Building / Refine / Reset)
- Update editor store with plan state management
- Handle plan approval → API call → mode switch

### Phase 4: Build Progress Tracker
- Build `PlanProgress` component (pinned during build)
- Add `mark_step_complete` tool for agent mode
- Wire up `plan_step_update` SSE events to update progress
- Implement pause/resume/skip controls
- Show step completion animations

### Phase 5: Polish & Intelligence
- Smart defaults for clarification options (based on existing project content)
- Auto-detect when clarification is unnecessary (skip for specific prompts)
- Plan templates for common project types
- Keyboard shortcuts for plan interactions
- Mobile/responsive plan card layout

---

## 11. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Plan mode usage rate | ~5% of sessions (estimated) | 30%+ of new project sessions |
| Prompt-to-correct-output iterations | 3-5 rounds | 1-2 rounds |
| Plan approval rate (plans that lead to builds) | N/A (no tracking) | 70%+ |
| User engagement with plan steps | N/A (no interactions) | 50%+ of users edit at least one step |
| Time from prompt to "Start Building" | N/A | < 2 minutes for simple, < 5 minutes for complex |

---

## 12. Out of Scope (For Now)

- **Wireframe/visual preview** in the preview pane alongside the plan — high impact but requires a separate design generation pipeline. Consider for v3.
- **Plan templates library** — pre-built plans for common project types (portfolio, SaaS landing page, blog). Good idea, defer to v3.
- **Collaborative plan editing** — multiple users editing the same plan via Yjs CRDT. Current implementation is single-user plan creation.
- **Plan versioning** — keeping history of plan revisions. Start with single active plan per project.
- **AI-generated time estimates** — too unreliable. Show complexity level instead.
- **Voice input for clarification** — potentially valuable for the target audience, but separate initiative.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Clarification questions feel tedious | Max 4 questions, always skippable, skip entirely for specific prompts |
| Structured plan output is unreliable from LLM | Use tool calling (not free-text parsing) for structured output; validate schema server-side |
| Plan mode adds friction, users avoid it | Make it the default for new projects; show value quickly; allow instant skip to building |
| Plan steps don't map cleanly to agent actions | Steps are high-level guidance, not strict instructions; agent has flexibility within each step |
| Non-developers confused by step details | Technical details hidden by default; only shown on expand |

---

## 14. Open Questions

1. **Should Plan mode be the default for new projects?** Argument for: new projects benefit most from planning. Argument against: adds friction for users who know exactly what they want.

2. **Should the AI auto-detect whether to clarify or plan directly?** Could use a lightweight classifier on the prompt to decide. Risk: wrong classification frustrates users.

3. **How should plan context work across sessions?** If a user closes the browser and returns, should the plan still be visible and resumable? (Recommendation: yes, persist in DB.)

4. **Should completed plans be reusable as templates?** A "Build something like this again" feature using a previous plan as a starting point.

5. **Should the plan show in the preview pane?** Instead of (or alongside) the live preview, show a visual representation of the plan. This would be unique in the market.
