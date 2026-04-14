# TC-17: Knowledge Files — Deep Test Suite

> **Goal-oriented**: Users want to control the AI's personality, coding style, domain awareness, and memory by editing context files that are injected into every AI interaction — making the AI behave like a knowledgeable team member who understands their specific project.

## Knowledge File Significance Reference

| File | Significance | What It Controls | Merge Strategy |
|------|-------------|-----------------|----------------|
| **identity.md** | WHO the project is | Project name, purpose, personality tone, target audience | Replace (narrower scope wins) |
| **soul.md** | HOW the project feels | Design philosophy, visual identity, colors, typography, inspiration, tone | Replace |
| **instructions.md** | RULES the AI must follow | Coding style, component patterns, state management, error handling, forbidden practices | Append (all scopes stacked) |
| **knowledge.md** | WHAT the AI knows | Tech stack, architecture decisions, domain glossary, file structure, conventions | Append |
| **user.md** | WHO the human is | Skill level (beginner/expert), working style, communication preferences | Replace |
| **plan.md** | WHAT to build next | Current milestone, next steps, backlog items, non-goals (NOT injected — read on-demand) | Replace |
| **memory.md** | WHAT happened before | Completed work, in-progress items, known issues, session history | Append |
| **agents.md** | Custom agent definitions | Agent personalities, tools, behaviors for specialized roles | N/A |

## Modes & File Inclusion

| File | Agent Mode | Plan Mode | Chat Mode |
|------|-----------|-----------|-----------|
| identity.md | ✅ | ✅ | ✅ |
| soul.md | ✅ | ❌ | ❌ |
| user.md | ✅ | ❌ | ✅ |
| instructions.md | ✅ | ❌ | ✅ |
| knowledge.md | ✅ | ✅ | ✅ |
| plan.md | ❌ (read on-demand) | ❌ (read on-demand) | ❌ |
| memory.md | ✅ | ✅ | ✅ |

## Human Goals Mapped

| Goal | User Story | Test Area |
|------|-----------|-----------|
| G1 | "I want the AI to know my project's brand and personality" | identity.md + soul.md |
| G2 | "I want the AI to follow my coding standards consistently" | instructions.md |
| G3 | "I want the AI to understand my tech stack without re-explaining" | knowledge.md |
| G4 | "I want the AI to remember what we've done across sessions" | memory.md |
| G5 | "I want to plan features and have AI follow the roadmap" | plan.md |
| G6 | "I want the AI to adapt to my skill level" | user.md |
| G7 | "I want to define custom agent roles for my team" | agents.md |
| G8 | "I want my project to inherit workspace-level knowledge" | Multi-scope merging |
| G9 | "I want to create custom knowledge files for domain docs" | Custom files |
| G10 | "I want to know how much token budget I'm using" | Stats & budget |

---

## 17.1 Knowledge Tab — Workspace Settings UI (P0)

### TC-17.1.1 — Open Knowledge tab from Workspace Settings
- **Steps**: Navigate to `/workspace-settings?tab=knowledge`.
- **Expected**: Knowledge tab active. Header: "Knowledge Base". Subtext about context files the AI reads before every interaction.

### TC-17.1.2 — Tab describes workspace-level knowledge
- **Steps**: Read the Knowledge tab description.
- **Expected**: Clear messaging: "Workspace knowledge is inherited by all projects. Projects can add their own overrides."

### TC-17.1.3 — "Add Knowledge File" button visible
- **Steps**: View Knowledge tab.
- **Expected**: "Add Knowledge File" button visible with + icon.

### TC-17.1.4 — List workspace knowledge files
- **Steps**: Add workspace-level knowledge files. Open Knowledge tab.
- **Expected**: All workspace knowledge files listed with filename, preview, file size.

---

## 17.2 Knowledge in Project Editor (P0)

### TC-17.2.1 — Access knowledge from project editor sidebar
- **Steps**: Open a project → find Environment panel → Knowledge tab.
- **Expected**: Knowledge tab showing project-level context files. Default files listed.

### TC-17.2.2 — Default files auto-created on first access
- **Steps**: Open a brand-new project's knowledge panel for the first time.
- **Expected**: Default files created automatically: identity.md, soul.md, instructions.md, knowledge.md, user.md, plan.md, memory.md. Each has default template content.

### TC-17.2.3 — View knowledge file content
- **Steps**: Click on `identity.md` in the knowledge panel.
- **Expected**: File content displayed in an editor. Default content visible with template structure.

### TC-17.2.4 — Knowledge file stats shown
- **Steps**: View knowledge file list.
- **Expected**: Stats displayed: total files count, total characters, estimated tokens, budget used percent (of 12,000 token max).

---

## 17.3 identity.md — Project Identity (P0)

### TC-17.3.1 — View default identity.md content
- **Steps**: Open identity.md in a new project.
- **Expected**: Template content with sections: Project Name, Purpose, Personality Tone, Target Audience.

### TC-17.3.2 — Edit identity to set project brand
- **Steps**: Edit identity.md:
  ```
  # Identity
  ## Name: CafeTracker
  ## Purpose: A coffee shop management app for small business owners
  ## Personality: Warm, friendly, knowledgeable about coffee culture
  ## Target Audience: Small cafe owners who aren't tech-savvy
  ```
  → Save.
- **Expected**: Content saved. Auto-save triggers after 2.5s debounce OR manual Ctrl+S.

### TC-17.3.3 — Identity affects AI greeting/tone
- **Steps**: After setting identity to "CafeTracker" with "warm, friendly" personality → open chat → send: "Hello, what can you help me with?"
- **Expected**: AI introduces itself in context of CafeTracker. Uses warm/friendly tone. Mentions coffee shop management.

### TC-17.3.4 — Identity affects generated content
- **Steps**: With CafeTracker identity → send: "Create the landing page".
- **Expected**: AI generates landing page with coffee-related imagery/copy, "CafeTracker" branding, language targeted at small business owners.

### TC-17.3.5 — Changed identity reflects immediately in next chat turn
- **Steps**: Change identity from "CafeTracker" to "DevDash — a developer dashboard" → immediately send new message.
- **Expected**: AI now responds in context of DevDash. No reference to CafeTracker. Identity change took effect within same session.

### TC-17.3.6 — Identity with replace strategy: project overrides workspace
- **Steps**: Set workspace identity: "All projects are part of AcmeCorp". Set project identity: "This project is BetaWidget". Chat in project.
- **Expected**: AI identifies as BetaWidget, NOT AcmeCorp. Replace strategy means project level wins completely.

---

## 17.4 soul.md — Design Philosophy (P0)

### TC-17.4.1 — View default soul.md content
- **Steps**: Open soul.md in a new project.
- **Expected**: Template with sections: Design Philosophy, Visual Identity, Typography, Colors, Inspiration.

### TC-17.4.2 — Set soul to minimalist design
- **Steps**: Edit soul.md:
  ```
  # Soul
  ## Design Philosophy: Minimalist. Less is more. Every element earns its place.
  ## Colors: Monochrome with one accent color (#3B82F6 blue)
  ## Typography: Inter for body, JetBrains Mono for code
  ## Tone: Clean, professional, no decoration or gradients
  ```
  → Save.
- **Expected**: Content persisted.

### TC-17.4.3 — Soul affects generated UI design
- **Steps**: With minimalist soul set → send: "Build a settings page".
- **Expected**: AI generates clean, minimal settings page. Uses monochrome colors with blue accent. Inter font. No gradients or decorative elements.

### TC-17.4.4 — Change soul to playful design
- **Steps**: Change soul.md to:
  ```
  ## Design Philosophy: Playful and colorful. Fun for kids.
  ## Colors: Rainbow palette with rounded corners
  ## Typography: Comic Neue for headings
  ```
  → Chat: "Build a welcome page".
- **Expected**: AI generates colorful, playful page. Rounded corners. Kid-friendly language. Completely different from minimalist version.

### TC-17.4.5 — Soul only injected in Agent mode
- **Steps**: Check that soul.md appears in Agent mode context but not in Plan or Chat mode.
- **Expected**: Agent mode: soul injected (AI follows design). Plan mode: soul NOT injected (planning doesn't need design details). Chat mode: soul NOT injected.

### TC-17.4.6 — Soul with replace strategy
- **Steps**: Set workspace soul to "Corporate blue theme". Set project soul to "Neon cyberpunk theme". Chat in Agent mode.
- **Expected**: AI follows "Neon cyberpunk" (project wins via replace strategy).

---

## 17.5 instructions.md — Coding Rules (P0)

### TC-17.5.1 — View default instructions.md content
- **Steps**: Open instructions.md.
- **Expected**: Template with sections: Code Style, Component Patterns, State Management, Error Handling.

### TC-17.5.2 — Set strict coding rules
- **Steps**: Edit instructions.md:
  ```
  # Instructions
  ## Code Rules
  - ALWAYS use TypeScript with strict mode
  - NEVER use `any` type
  - ALWAYS use functional components with hooks
  - NEVER use class components
  - ALWAYS use `const` declarations, never `let` or `var`
  - ALWAYS add error boundaries to component trees
  - Use Tailwind CSS for ALL styling, never inline styles
  ```
  → Save.
- **Expected**: Content saved.

### TC-17.5.3 — Instructions enforce coding style
- **Steps**: With strict rules → send: "Build a counter component".
- **Expected**: AI generates:
  - TypeScript file (`.tsx`)
  - Functional component with hooks (`useState`)
  - No `any` type annotations
  - `const` declarations only
  - Tailwind CSS classes (not inline styles)
  - Error boundary wrapper

### TC-17.5.4 — Instructions prevent forbidden patterns
- **Steps**: With "NEVER use console.log" instruction → send: "Add logging to the component".
- **Expected**: AI uses a proper logger or `console.error`/`console.warn` — NOT `console.log`.

### TC-17.5.5 — Instructions with append strategy: workspace + project stack
- **Steps**: Set workspace instructions: "Always use semicolons". Set project instructions: "Always use 2-space indentation". Chat.
- **Expected**: AI follows BOTH rules. Semicolons AND 2-space indentation. Append strategy means both apply.

### TC-17.5.6 — Contradictory instructions between scopes
- **Steps**: Workspace instructions: "Use tabs for indentation". Project instructions: "Use 2 spaces for indentation".
- **Expected**: Both injected (append). AI should follow project instruction (listed later in context). Verify which wins.

### TC-17.5.7 — Instructions respected across multiple files
- **Steps**: Set instruction "All files must have a header comment with filename and description". Ask AI to create 3 files.
- **Expected**: All 3 generated files have the header comment. Instruction applied consistently.

---

## 17.6 knowledge.md — Domain Knowledge (P0)

### TC-17.6.1 — View default knowledge.md content
- **Steps**: Open knowledge.md.
- **Expected**: Template with sections: Tech Stack, Architecture Decisions, Domain Glossary, File Structure.

### TC-17.6.2 — Set tech stack knowledge
- **Steps**: Edit knowledge.md:
  ```
  # Knowledge
  ## Tech Stack
  - Frontend: React 19 + Vite + TypeScript
  - Styling: Tailwind CSS v4
  - State: Zustand
  - HTTP: axios with interceptors
  - Auth: Supabase Auth
  
  ## Project Structure
  - src/components/ — Reusable UI components
  - src/pages/ — Route pages
  - src/hooks/ — Custom hooks
  - src/stores/ — Zustand stores
  - src/api/ — API client functions
  ```
  → Save.
- **Expected**: Content saved.

### TC-17.6.3 — AI uses tech stack from knowledge
- **Steps**: With tech stack knowledge set → send: "Add a user profile page".
- **Expected**: AI generates code using React 19 + TypeScript + Tailwind + Zustand (not Redux) + axios (not fetch). File placed in `src/pages/`.

### TC-17.6.4 — AI references domain glossary
- **Steps**: Add to knowledge.md:
  ```
  ## Domain Glossary
  - "Brew" = a coffee preparation order
  - "Barista" = staff member who prepares beverages
  - "Ticket" = a single customer order
  ```
  → Ask AI: "Show all active brews for today".
- **Expected**: AI understands "brews" = coffee orders. Generates code that queries/displays orders. Uses correct column names.

### TC-17.6.5 — Knowledge with append strategy: all scopes combined
- **Steps**: Workspace knowledge: "All projects use PostgreSQL". Project knowledge: "Database name is 'cafe_db'". Chat.
- **Expected**: AI knows PostgreSQL AND that the database is 'cafe_db'. Both pieces of knowledge available.

### TC-17.6.6 — AI doesn't hallucinate beyond knowledge
- **Steps**: Set knowledge with specific tech stack (no mention of MongoDB). Ask AI: "Connect to the database".
- **Expected**: AI uses PostgreSQL (from knowledge), NOT MongoDB. Knowledge constrains AI's assumptions.

---

## 17.7 user.md — User Preferences (P1)

### TC-17.7.1 — View default user.md content
- **Steps**: Open user.md.
- **Expected**: Template with sections: Skill Level, Working Style, Communication Preferences.

### TC-17.7.2 — Set beginner skill level
- **Steps**: Edit user.md:
  ```
  # User
  ## Skill Level: Beginner
  ## Working Style: Prefers detailed explanations with each code block
  ## Communication: Simple language, no jargon, explain every concept
  ```
  → Save → chat.
- **Expected**: AI provides detailed explanations. Comments in code explain each step. No unexplained jargon.

### TC-17.7.3 — Set expert skill level
- **Steps**: Edit user.md:
  ```
  # User
  ## Skill Level: Expert
  ## Working Style: Concise. Just code, minimal explanation.
  ## Communication: Direct, technical. Assume deep React/TS knowledge.
  ```
  → save → chat.
- **Expected**: AI provides clean code without excessive explanation. Uses advanced patterns without explaining basics.

### TC-17.7.4 — User.md with replace strategy
- **Steps**: Set workspace user.md: "All users are intermediate". Set project user.md: "Expert level". Chat.
- **Expected**: AI treats user as Expert (project user.md replaces workspace).

### TC-17.7.5 — User.md only in Agent and Chat modes
- **Steps**: Verify user.md is included in Agent and Chat, but NOT Plan mode.
- **Expected**: Agent: user preferences affect code generation. Chat: affect explanation style. Plan: NOT included.

---

## 17.8 plan.md — Project Roadmap (P1)

### TC-17.8.1 — View default plan.md content
- **Steps**: Open plan.md.
- **Expected**: Template with sections: Current Milestone, Next Steps, Backlog, Non-Goals.

### TC-17.8.2 — Set project plan
- **Steps**: Edit plan.md:
  ```
  # Plan
  ## Current Milestone: v1.0 MVP
  - [x] User authentication
  - [ ] Dashboard page
  - [ ] Settings page
  
  ## Next Steps
  1. Build dashboard with order statistics
  2. Add settings page for cafe profile
  
  ## Non-Goals
  - No mobile app (web only for v1)
  - No payment processing (v2 feature)
  ```
  → Save.
- **Expected**: Content saved.

### TC-17.8.3 — Plan NOT auto-injected (saves tokens)
- **Steps**: Check system prompt content when chatting (via traces or console).
- **Expected**: plan.md content NOT in system prompt. Token budget note: plan is read on-demand via read_file tool.

### TC-17.8.4 — AI reads plan on demand
- **Steps**: Send: "What's the current plan for this project?"
- **Expected**: AI uses read_file tool to read `.doable/plan.md`. Responds with current plan details. Tool call visible in chat.

### TC-17.8.5 — Plan mode uses plan for guidance
- **Steps**: Switch to Plan mode → send: "What should we build next?"
- **Expected**: AI reads plan.md. Suggests work based on unchecked items. References non-goals appropriately.

### TC-17.8.6 — AI updates plan after work
- **Steps**: Complete a task in Agent mode → AI may auto-update plan.md to check off completed item.
- **Expected**: plan.md updated with completed checkmarks. Or AI suggests updating plan.

---

## 17.9 memory.md — Session History (P1)

### TC-17.9.1 — View default memory.md content
- **Steps**: Open memory.md.
- **Expected**: Template with sections: Completed Work, In-Progress Items, Known Issues, Session Notes.

### TC-17.9.2 — Memory auto-appended after AI work
- **Steps**: Ask AI to "Build a login page" → check memory.md after completion.
- **Expected**: memory.md updated with entry: date, what was built, files created/modified.

### TC-17.9.3 — AI references memory in new session
- **Steps**: Close and reopen project. Send: "What have we built so far?"
- **Expected**: AI references memory.md entries. Lists previously completed work. Demonstrates cross-session awareness.

### TC-17.9.4 — Memory with append strategy: accumulates
- **Steps**: Build 5 features across multiple sessions. Check memory.md.
- **Expected**: All 5 features documented in memory. Chronological order. No overwrites.

### TC-17.9.5 — Memory included in all modes
- **Steps**: Verify memory.md appears in Agent, Plan, and Chat modes.
- **Expected**: All three modes have access to memory context.

### TC-17.9.6 — Manual memory editing
- **Steps**: Edit memory.md to add "Known Issue: the login redirect is broken" → chat.
- **Expected**: AI is aware of the known issue. May reference it when relevant.

---

## 17.10 agents.md — Custom Agents (P2)

### TC-17.10.1 — View default agents.md content
- **Steps**: Open agents.md (if present in default files).
- **Expected**: Template explaining how to define custom agent roles with name, personality, tools, behaviors.

### TC-17.10.2 — Define custom agent
- **Steps**: Edit agents.md:
  ```
  # Agents
  ## Designer Agent
  - Role: UI/UX design specialist
  - Focus: Visual design, layout, accessibility
  - Tools: Only use create_file and edit_file for CSS/HTML/JSX
  - Personality: Creative, detail-oriented, always considers mobile-first
  ```
  → Save.
- **Expected**: Content saved. Agent definition available as context.

### TC-17.10.3 — Custom agent affects behavior
- **Steps**: Reference the Designer Agent in chat context. Ask to redesign a page.
- **Expected**: AI behaves as the Designer Agent — focuses on visual design, accessibility, mobile-first approach.

---

## 17.11 Custom Knowledge Files (P1)

### TC-17.11.1 — Create custom knowledge file
- **Steps**: Click "Add Knowledge File" → filename: `api-docs.md` → content: API endpoint documentation → save.
- **Expected**: File created. Listed alongside default files. Filename validation: lowercase, `.md` extension.

### TC-17.11.2 — Custom file content included in AI context
- **Steps**: Create custom file `style-guide.md` with specific design tokens. Chat and ask about design tokens.
- **Expected**: AI references the custom file's content. Aware of the design tokens.

### TC-17.11.3 — Multiple custom files
- **Steps**: Create 3 custom files: `api-docs.md`, `deployment.md`, `testing-guide.md`.
- **Expected**: All 3 listed. All available to AI (subject to token budget).

### TC-17.11.4 — Delete custom file
- **Steps**: Delete `api-docs.md`.
- **Expected**: File removed permanently. AI no longer has access to it.

### TC-17.11.5 — Delete default file resets to default
- **Steps**: Delete `identity.md` from project.
- **Expected**: File resets to default template content (NOT permanently deleted). Default files can't be truly removed.

### TC-17.11.6 — Filename validation — valid names
- **Steps**: Try creating files: `api-docs.md`, `my-guide.md`, `tools_v2.md`, `a1.md`.
- **Expected**: All accepted. Lowercase alphanumeric with `.`, `-`, `_` allowed.

### TC-17.11.7 — Filename validation — invalid names
- **Steps**: Try creating files: `API-DOCS.md` (uppercase), `no extension`, `file.txt`, `file with spaces.md`, `../escape.md`.
- **Expected**: All rejected with validation error. Only lowercase `.md` files accepted.

### TC-17.11.8 — Content size limit (50,000 chars)
- **Steps**: Try saving a knowledge file with 51,000 characters.
- **Expected**: Rejected. Error message about max content size.

### TC-17.11.9 — File already exists (409)
- **Steps**: Try creating a file with a name that already exists via POST.
- **Expected**: 409 Conflict error. Use PUT to update instead.

---

## 17.12 Multi-Scope Context Merging (P0)

### TC-17.12.1 — Replace strategy: project overrides workspace
- **Steps**:
  - Workspace identity.md: "Company-wide app"
  - Project identity.md: "CafeTracker"
  → Chat in project.
- **Expected**: AI only sees "CafeTracker" identity. "Company-wide app" completely replaced.

### TC-17.12.2 — Replace strategy: user overrides project
- **Steps**:
  - Project user.md: "Intermediate developer"  
  - User-level user.md: "Expert developer"
  → Chat.
- **Expected**: AI treats user as Expert (user scope wins over project scope).

### TC-17.12.3 — Append strategy: all scopes concatenated
- **Steps**:
  - Workspace instructions.md: "Use semicolons. Use 2-space indent."
  - Project instructions.md: "Use Tailwind CSS only. No inline styles."
  - User instructions.md: "Add JSDoc comments to all exports."
  → Chat → generate code.
- **Expected**: Generated code has semicolons + 2-space indent + Tailwind CSS + JSDoc comments. All three scopes applied.

### TC-17.12.4 — Append sections separated properly
- **Steps**: Set workspace and project knowledge.md with different content. Check AI context.
- **Expected**: Sections separated by `\n\n---\n\n` separator. Not concatenated as one blob.

### TC-17.12.5 — Missing scope handled gracefully
- **Steps**: Only set workspace instructions.md (no project or user). Chat.
- **Expected**: Workspace instructions used. No errors about missing project/user scope.

### TC-17.12.6 — All scopes empty: defaults used
- **Steps**: Don't customize any knowledge files. Chat.
- **Expected**: Default template content from all files used. AI still has basic context.

---

## 17.13 Token Budget & Prioritization (P1)

### TC-17.13.1 — Budget stats shown in UI
- **Steps**: View knowledge panel stats.
- **Expected**: Shows: total files, total characters, estimated tokens, budget used % (of 12,000 tokens).

### TC-17.13.2 — Within budget: all files included
- **Steps**: Keep all knowledge files small (total < 12,000 tokens). Chat.
- **Expected**: All files included in AI context. Budget % < 100%.

### TC-17.13.3 — Over budget: low-priority files truncated
- **Steps**: Write very long content in identity.md, soul.md, instructions.md, knowledge.md (total > 48,000 chars / 12,000 tokens). Chat.
- **Expected**: High-priority files (identity=1, soul=2) included fully. Lower-priority files truncated or omitted. AI still works.

### TC-17.13.4 — Priority order respected
- **Steps**: Fill many files. Check which files appear in AI context and which are dropped.
- **Expected**: Files included in priority order: identity(1) → soul(2) → user(3) → instructions(4) → knowledge(5) → plan(6) → memory(7) → extended files(10+).

### TC-17.13.5 — Truncated files marked
- **Steps**: Cause a file to be truncated due to budget.
- **Expected**: Truncated file marked with `truncated="true"` in XML context block. Truncation at paragraph boundary.

### TC-17.13.6 — Token estimation accuracy
- **Steps**: Write exactly 4,000 characters in a file. Check estimated tokens.
- **Expected**: Estimated tokens ≈ 1,000 (4 chars per token for English + markdown).

---

## 17.14 Knowledge Editing Experience (P1)

### TC-17.14.1 — Auto-save with debounce
- **Steps**: Start typing in a knowledge file. Stop typing.
- **Expected**: After 2.5 seconds of no typing, content auto-saved. Save indicator shown briefly.

### TC-17.14.2 — Manual save with Ctrl+S
- **Steps**: Edit a knowledge file → press Ctrl+S.
- **Expected**: Content saved immediately. Save confirmation shown.

### TC-17.14.3 — Manual save with save button
- **Steps**: Edit a knowledge file → click Save button.
- **Expected**: Content saved. Confirmation shown.

### TC-17.14.4 — Markdown syntax in editor
- **Steps**: Write markdown with headers, lists, code blocks, bold/italic.
- **Expected**: Editor displays raw markdown. Content saved as-is. AI receives and parses the markdown.

### TC-17.14.5 — Large file editing
- **Steps**: Edit a knowledge file with 40,000 characters (near 50,000 limit).
- **Expected**: Editor handles large content smoothly. No lag or truncation.

### TC-17.14.6 — Empty content save
- **Steps**: Clear all content from a knowledge file → save.
- **Expected**: File saved with empty content. AI doesn't receive this file's section (empty files may be skipped).

---

## 17.15 Knowledge via API (P1)

### TC-17.15.1 — List project context files
- **Steps**: `GET /projects/{id}/context`
- **Expected**: Response: array of files with `{filename, content, updatedAt}` + stats `{totalFiles, totalChars, estimatedTokens, budgetUsedPercent}`.

### TC-17.15.2 — Read single context file
- **Steps**: `GET /projects/{id}/context/identity.md`
- **Expected**: Response: `{filename: "identity.md", content: "...", updatedAt: "..."}`.

### TC-17.15.3 — Update context file (upsert)
- **Steps**: `PUT /projects/{id}/context/identity.md` with `{content: "New identity"}`.
- **Expected**: Content updated. 200 OK. Works as upsert (creates if missing).

### TC-17.15.4 — Create custom context file
- **Steps**: `POST /projects/{id}/context/my-custom.md` with `{content: "Custom knowledge"}`.
- **Expected**: 201 Created. File accessible via GET.

### TC-17.15.5 — Create duplicate file via POST (409)
- **Steps**: POST a file that already exists.
- **Expected**: 409 Conflict. Use PUT to update.

### TC-17.15.6 — Delete custom file
- **Steps**: `DELETE /projects/{id}/context/my-custom.md`.
- **Expected**: File permanently deleted. 200 OK.

### TC-17.15.7 — Delete default file (reset)
- **Steps**: `DELETE /projects/{id}/context/identity.md`.
- **Expected**: File content reset to default template. File still exists.

### TC-17.15.8 — Initialize project context
- **Steps**: `POST /projects/{id}/context/initialize`.
- **Expected**: All default files created if missing. Existing files untouched (`ON CONFLICT DO NOTHING`).

---

## 17.16 AI Context Injection Verification (P0)

### TC-17.16.1 — Agent mode: full context injected
- **Steps**: Set identity, soul, user, instructions, knowledge, memory. Switch to Agent mode. Chat.
- **Expected**: AI demonstrates awareness of ALL files. Follows identity, soul styling, user tone, instructions as rules, uses knowledge for tech decisions, references memory.

### TC-17.16.2 — Plan mode: reduced context
- **Steps**: Switch to Plan mode. Chat: "What should we build next?"
- **Expected**: AI uses identity + knowledge + memory + architecture + schema. Does NOT reference soul or instructions (not included in plan mode).

### TC-17.16.3 — Chat mode: Q&A context
- **Steps**: Switch to Chat mode. Ask a question.
- **Expected**: AI uses identity + instructions + memory + user + knowledge. Does NOT reference soul (not in chat mode).

### TC-17.16.4 — Context wrapped in XML tags
- **Steps**: Check AI system prompt (via trace or debugging).
- **Expected**: Each file wrapped as: `<context-file name="identity.md" label="Identity">...content...</context-file>`.

### TC-17.16.5 — Mode preamble sets expectations
- **Steps**: Check beginning of system prompt for each mode.
- **Expected**:
  - Agent: "You are working inside a project. Follow identity, knowledge, instructions precisely..."
  - Plan: "You are helping plan next steps..."
  - Chat: "You are answering questions..."

---

## 17.17 Behavioral Verification Through AI Chat (P0)

These are the critical "does it ACTUALLY work?" tests.

### TC-17.17.1 — Identity changes project name in responses
- **Steps**: Set identity name to "SpaceStation". Ask AI: "What project are we working on?"
- **Expected**: AI responds with "SpaceStation" — NOT a generic name.

### TC-17.17.2 — Soul changes visual output
- **Steps**: Soul: "Dark mode only. Neon green (#00FF00) accents on black backgrounds." → Ask: "Create a card component".
- **Expected**: Generated CSS uses dark background (`#000` or similar) with `#00FF00` accents. NOT light mode.

### TC-17.17.3 — Instructions override AI defaults
- **Steps**: Instructions: "NEVER import React. Use automatic JSX runtime." → Ask: "Create a component".
- **Expected**: No `import React from 'react'` at the top. Automatic JSX runtime assumed.

### TC-17.17.4 — Knowledge constrains tech choices
- **Steps**: Knowledge: "State management: Jotai atoms only. Do NOT use Redux, Zustand, or Context." → Ask: "Add global state for user auth".
- **Expected**: AI uses Jotai atoms. Does NOT suggest or import Redux/Zustand/Context.

### TC-17.17.5 — User level changes explanation depth
- **Steps**: User: "Complete beginner. Has never written code before." → Ask: "What is a component?"
- **Expected**: AI explains with no jargon. Uses analogies. Very basic explanation. Not "a component is a reusable UI fragment..."

### TC-17.17.6 — Memory provides historical context
- **Steps**: Memory: "Session 1 (Jan 5): Built auth system with login/register pages. Used Supabase Auth." → Ask: "What auth system do we have?"
- **Expected**: AI knows auth is built with Supabase. References the specific pages. Doesn't suggest rebuilding.

### TC-17.17.7 — Multiple knowledge files combined correctly
- **Steps**: Set:
  - identity.md → "BudgetBot"
  - instructions.md → "Use snake_case for all variables"
  - knowledge.md → "Framework: Svelte"
  → Ask: "Create a budget tracker component"
- **Expected**: AI creates Svelte component (from knowledge), uses snake_case variables (from instructions), references BudgetBot (from identity).

### TC-17.17.8 — Empty identity: AI uses generic defaults
- **Steps**: Clear identity.md entirely. Chat.
- **Expected**: AI responds generically. No forced project name. Basic helpful assistant.

### TC-17.17.9 — Contradictory knowledge files
- **Steps**: instructions.md: "Always use REST APIs". knowledge.md section: "We use GraphQL exclusively".
- **Expected**: AI may attempt to reconcile or follow the most recently stated direction. It should not crash or ignore both.

### TC-17.17.10 — Knowledge about file structure honored
- **Steps**: Knowledge: "Components go in src/ui/, NOT src/components/". Ask: "Create a Button component".
- **Expected**: File created at `src/ui/Button.tsx`, NOT `src/components/Button.tsx`.

---

## 17.18 Edge Cases (P2)

### TC-17.18.1 — Very large single file fills budget
- **Steps**: Write 45,000 characters in identity.md (uses ~11,250 of 12,000 tokens). Chat.
- **Expected**: identity.md fills most of budget. Other files may be truncated or omitted. AI still functions.

### TC-17.18.2 — Unicode/emoji in knowledge files
- **Steps**: Add content with emojis 🎉, Chinese characters 你好, Arabic الله. Save.
- **Expected**: Content saved correctly. UTF-8 preserved. AI can read and reference.

### TC-17.18.3 — Markdown code blocks in knowledge
- **Steps**: Add knowledge file with large code examples in ` ``` ` blocks.
- **Expected**: Code blocks preserved in AI context. AI can reference the example code.

### TC-17.18.4 — Rapid editing (debounce test)
- **Steps**: Type rapidly in a knowledge file for 10 seconds without pausing.
- **Expected**: Auto-save only triggers AFTER typing stops for 2.5s. No intermediate saves during typing.

### TC-17.18.5 — Concurrent editing by two users
- **Steps**: Two users edit the same knowledge file simultaneously.
- **Expected**: Last save wins. No corruption. One user may see stale content until refresh.

### TC-17.18.6 — Network error during save
- **Steps**: Disconnect network. Edit a knowledge file. Try to save.
- **Expected**: Error shown. Content preserved in editor (not lost). Retry possible when network returns.

### TC-17.18.7 — XSS attempt in knowledge content
- **Steps**: Add `<script>alert('xss')</script>` to a knowledge file.
- **Expected**: Content saved as plain text/markdown. No script execution in UI. Content escaped when rendered.
