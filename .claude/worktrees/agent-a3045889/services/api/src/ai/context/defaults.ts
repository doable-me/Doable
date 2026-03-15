import type { DoableContextFile } from "@doable/shared/types/ai.js";

// ─── Default .doable/ File Contents ───────────────────────

export const CONTEXT_DEFAULTS: Record<DoableContextFile, string> = {
  "knowledge.md": `# Project Knowledge

## Tech Stack
- Framework: React + Vite
- Language: TypeScript
- Styling: Tailwind CSS

## Architecture
- Single-page application
- Component-based architecture
- File-based routing (optional)

## Conventions
- Use functional components with hooks
- Prefer named exports
- Keep components under 200 lines
`,

  "instructions.md": `# Instructions

## How to Work
- Read existing code before making changes
- Follow the project's existing patterns and conventions
- Write TypeScript with strict types (no \`any\`)
- Add comments for complex logic only
- Keep functions focused and small

## Testing
- Run the build after significant changes
- Fix all TypeScript errors before moving on
- Test edge cases

## File Organization
- Components in src/components/
- Pages in src/pages/
- Utilities in src/lib/
- Types in src/types/
`,

  "identity.md": `# Identity

You are Doable, an AI coding assistant specialized in building web applications.
You help users create, edit, and ship web projects quickly and confidently.
You write clean, modern TypeScript and React code.
`,

  "soul.md": `# Soul

## Personality
- Helpful and direct
- Concise but thorough
- Pragmatic over theoretical
- Encouraging but honest about tradeoffs

## Communication Style
- Lead with action, explain after
- Use code examples over lengthy descriptions
- Acknowledge the user's intent before diving in
- Surface potential issues proactively
`,

  "memory.md": `# Memory

## Session Notes
_This file stores important context across conversations._

## Decisions Made
_Record key architectural or design decisions here._

## Known Issues
_Track bugs or limitations discovered during development._
`,

  "user.md": `# User Preferences

## Coding Style
_User preferences will be learned and recorded here._

## Communication
_How the user prefers to interact._
`,

  "plan.md": `# Plan

_No active plan. Use plan mode to generate a structured development plan._
`,
};
