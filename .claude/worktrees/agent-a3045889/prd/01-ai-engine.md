# 01 — AI Engine & Prompt System

## Overview

The AI engine is the core of Doable. It processes natural language prompts, generates code, debugs issues, plans architecture, and iterates on applications. It operates in multiple modes, each optimized for different stages of the development workflow.

**Backend**: Copilot SDK powers all AI inference, code generation, and reasoning.

---

## 1. Agent Mode (Default)

### 1.1 Core Behavior
- **Default mode** for all new conversations and projects
- Autonomous code generation: receives a prompt → explores codebase → generates/modifies multiple files → debugs → deploys
- Multi-step edits across files in a single turn
- Proactive debugging: inspects logs, searches web for solutions, applies fixes independently
- Extended processing time: **up to 15 minutes per request** for complex tasks
- Creates **visible task cards** while working, giving users transparency and control over progress

### 1.2 Capabilities
| Capability | Description |
|-----------|-------------|
| **Full-stack generation** | Creates frontend pages, components, routing, backend tables, auth, storage, edge functions from a single prompt |
| **Multi-file editing** | Modifies multiple source files in one turn with proper dependency resolution |
| **Codebase exploration** | Reads existing files, understands project structure, types, references, relationships |
| **TypeScript intelligence** | IDE-level understanding of types, references, and relationships (deep TS comprehension) |
| **Web search** | Searches the web in real-time for documentation, solutions, and best practices |
| **Error auto-fix** | Detects errors in preview/build, attempts fix automatically (up to 3 attempts via "Try to Fix" button) |
| **Package management** | Installs, updates, and correctly uses npm packages |
| **Edge function management** | Creates, deploys, tests, and cleans up unused edge functions |
| **Video generation** | Generates videos when prompted |
| **Publish suggestions** | Suggests publishing at the right moment, opens publish menu |
| **Logo/favicon generation** | Generates logos, favicons, and Open Graph images on prompt |
| **Slide generation** | Creates slideshows from prompts with enhanced knowledge handling |

### 1.3 Agent Task Visibility
- Agent creates **visible task cards** in the chat showing current actions
- Each task shows status: pending → in-progress → completed/failed
- Users can see the full timeline of actions taken (tool calls, file changes)
- Condensed cards group tool calls and actions for readability
- Details view available showing full action timeline

### 1.4 Prompt Queuing
- **Stack prompts while AI works**: Users can queue multiple prompts without waiting
- **Re-prioritize queue**: Drag to reorder queued prompts
- **Collaborative workflow**: Multiple team members can queue prompts concurrently
- Grab a coffee, come back, and review results

### 1.5 Automated Browser Testing
- Agent can **open its own browser** to explore app flows
- Tests apps like a real user: clicks buttons, fills forms, navigates pages
- Catches bugs during testing and fixes them automatically
- Produces production-ready work by verifying before presenting results
- Trigger via: "Check if everything works" or "Test the signup flow"

### 1.6 Clarifying Questions (Agent Mode)
- When a request has **multiple ways forward**, agent asks clarifying questions before building
- Users pick from multiple-choice options or type custom input
- Prevents wrong assumptions and reduces rework
- Works in both Agent Mode and Plan Mode

### 1.7 Request Stopping
- **Stopping a request immediately halts** further processing and token usage
- No wasted credits on unwanted generation
- File edits made before stopping **persist** (not lost)

### 1.8 Error Handling
- **"Try to Fix" button**: Appears when errors are detected, attempts up to 3 automatic fixes
- **Publishing failure recovery**: Failed publishes show built-in "Try to fix" actions
- **Error messages**: Appear consistently with clear descriptions
- **Edge function error reduction**: 91% reduction through improved agent logic

---

## 2. Plan Mode (formerly Chat Mode)

### 2.1 Core Behavior
- Renamed from "Chat Mode" to "Plan Mode" to clarify purpose
- **Does NOT write code directly** — analyzes, reasons, and produces structured plans
- User reviews and approves plans before implementation begins
- Reduces credit consumption by preventing unnecessary code generation

### 2.2 Capabilities
| Capability | Description |
|-----------|-------------|
| **Idea generation** | Brainstorm features, architectures, and approaches |
| **Multi-step reasoning** | Break complex problems into sequential steps |
| **Codebase analysis** | Reads and explains existing code |
| **Trade-off analysis** | Compare approaches with pros/cons |
| **Root-cause debugging** | Analyze errors using chain-of-thought reasoning |
| **Meta-prompting** | AI refines user's prompts for better results |
| **Reverse meta-prompting** | Save sessions for optimization |
| **Clarifying questions** | AI asks questions to fully understand requirements before planning |

### 2.3 Plan Workflow
1. User enters prompt or switches to Plan Mode
2. AI explores codebase, asks clarifying questions
3. AI generates structured plan with editable sections
4. Plan displayed in **rich-text editor** combining read and edit modes
5. User reviews, edits, approves plan
6. Plan card shows single "Implement plan" action button
7. On approval, plan saved to `.doable/plan.md` for persistent context
8. Agent Mode takes over to implement the approved plan

### 2.4 Plan Persistence
- Approved plans saved to `.doable/plan.md`
- Plans persist across messages for continuous context
- Plan cards standardized with single "Implement plan" action

---

## 3. Visual Edits Mode

> (See [02-editor-ui.md](02-editor-ui.md) for detailed visual editing specs)

- Click-to-select any UI element in the preview
- Modify properties (color, text, size, spacing, font) without writing prompts
- Drag-and-drop images directly into components
- Multi-select (Shift/Cmd) for bulk edits
- 40% reduction in iteration cycles vs chat-only editing

---

## 4. Prompt System

### 4.1 Prompt Input
- Bottom-aligned textarea in chat panel
- **Enter** to submit, **Shift+Enter** for multi-line
- Image/file attachment via 📎 button (for screenshots, reference designs)
- Prompt templates and suggestions for common actions
- Speech-to-text input using ElevenLabs Scribe V2 (accurate language detection and transcription)

### 4.2 Prompt Best Practices (Built-in Guidance)
Doable should provide built-in prompting guidance:

| Phase | Guidance |
|-------|----------|
| **Planning** | "What are you building? For whom? Why? What's the key action?" |
| **User Journey Mapping** | Guide users to specify flows visually |
| **Design First** | Encourage specifying design style early (e.g., "calm and elegant") |
| **Atomic Prompting** | Suggest prompting per component, not per page |
| **Systems Thinking** | Encourage modularity and reusable components |
| **Phased Build** | Phase 1: foundation/design → Phase 2: atomic UI → Phase 3: logic/data |

### 4.3 Context Management
- **Custom Knowledge**: Project-level context (branding, conventions, guidelines) that persists across all edits
- Stored in `.doable/knowledge.md`
- Editable from Project Settings > Custom Knowledge
- AI references knowledge on every interaction
- Supports design systems, coding standards, business rules

### 4.4 Next-Step Suggestions
- After each AI response, provide **natural next-step suggestions**
- Help users understand what to do after their first message
- Contextual suggestions based on project state (e.g., "Connect a database", "Add authentication", "Deploy your app")

### 4.5 Smart Nudges
- **Automatic mode suggestions**: When debugging, agent suggests switching to Plan Mode
- Guides users to the right mode for the right task
- Reduces frustration from using wrong mode

### 4.6 In-Product Feedback
- **Thumbs down button** on AI edits when they cause issues
- Feedback improves AI quality for all users
- Non-intrusive — only appears on edit cards

### 4.7 Mermaid Diagram Rendering
- Chat renders **Mermaid diagrams** to visualize backend logic and app structure
- Triggered when user asks for charts or architecture visualization
- Displays inline in the chat as rendered diagrams (not just code blocks)

---

## 5. Built-in AI for Generated Apps

### 5.1 Lovable AI Equivalent ("Doable AI")
- Zero-setup AI capabilities available in generated apps
- Users can add AI features via prompts (no API key setup required)
- Capabilities:
  - Chatbots and conversational interfaces
  - Sentiment detection
  - Document Q&A
  - Translation
  - Creative content generation
  - Text summarization
  - Image generation (via DALL-E or equivalent)

### 5.2 User Consent
- When AI performs actions, users see Allow/Deny/Adjust preferences prompts
- Transparent about what AI actions will do before executing

---

## 6. Debugging System

### 6.1 Proactive Debugging (Agent Mode)
- Inspects console logs and error output automatically
- Searches web for solutions to known issues
- Fixes SQL migrations, TypeScript errors, runtime exceptions
- Tests authenticated edge functions while user is logged in

### 6.2 Interactive Debugging (Plan Mode)
- Paste error messages for root-cause analysis
- "Use chain-of-thought reasoning to identify the root cause"
- Explains code behavior step by step
- Suggests multiple fix approaches with trade-offs

### 6.3 Error Surface
- Build errors shown in preview panel with line references
- Publishing failures visible with "Try to fix" action
- Edge function logs readable by agent for debugging
- Error consistency improvements (always shown when something goes wrong)

---

## 7. AI Model & Processing

### 7.1 Model Configuration
- Copilot SDK as the inference backend
- No user-facing model selection (unified AI experience)
- Internal model routing for optimal performance per task type
- Continuous model upgrades for better output quality:
  - Target: ~25% fewer errors per major model upgrade
  - Target: ~40% faster prompt execution per generation
  - Target: ~15–21% improvement on app-building benchmarks
  - Target: 2x longer processing on complex tasks

### 7.2 Processing Limits
- Max processing time per request: **15 minutes**
- Support for longer browser sessions for complex tasks
- Credit-based usage (see [11-pricing-billing.md](11-pricing-billing.md))

### 7.3 Response Streaming
- AI responses stream in real-time (typing effect)
- Code diffs appear progressively
- Fix: responses appear gradually, not all at once

### 7.4 ChatGPT Integration
- Users can start a Doable build **directly from ChatGPT**
- ChatGPT partnership: plan in ChatGPT → build in Doable
- Reduces friction for users already planning in ChatGPT
- Deep link from ChatGPT conversation into Doable project creation

---

## 8. Automation & Extensibility

### 8.1 Webhook Support
- Generated apps can expose webhooks for external automation
- Integration with make.com, n8n, Zapier patterns

### 8.2 API Generation
- Agent generates REST API endpoints via edge functions
- OpenAPI spec support for API documentation
- Authenticated endpoints with proper auth middleware
