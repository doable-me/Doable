/**
 * Default content for .doable/ context files.
 *
 * Each file serves a distinct purpose in shaping how the AI understands
 * and works within a project. Content is markdown so users can edit
 * naturally while the AI gets structured guidance.
 */

export interface ContextFileDefinition {
  filename: string;
  displayName: string;
  description: string;
  defaultContent: string;
  /** Lower number = higher priority when building the prompt */
  priority: number;
  /** If true, always include in prompt regardless of mode */
  alwaysInclude: boolean;
}

export const DEFAULT_CONTEXT_FILES: ContextFileDefinition[] = [
  {
    filename: "identity.md",
    displayName: "Identity",
    description: "Defines who this project is: its name, purpose, and personality.",
    priority: 1,
    alwaysInclude: true,
    defaultContent: `# Project Identity

## Name
<!-- Your project's name -->

## Purpose
<!-- One sentence: what does this project do and who is it for? -->

## Personality & Tone
<!-- How should the AI communicate when working on this project? -->
- Professional but approachable
- Concise explanations, no filler
- Show, don't tell — prefer code examples over descriptions
`,
  },
  {
    filename: "knowledge.md",
    displayName: "Knowledge Base",
    description: "Technical decisions, architecture, and domain knowledge the AI needs.",
    priority: 2,
    alwaysInclude: true,
    defaultContent: `# Knowledge Base

## Tech Stack
<!-- List your frameworks, libraries, and tools -->
- Frontend: React + Vite + Tailwind CSS
- UI Components: shadcn/ui
- Language: TypeScript (strict mode)

## Architecture Decisions
<!-- Key decisions and why they were made -->

## Domain Glossary
<!-- Define project-specific terms so the AI uses them correctly -->

## File Structure Conventions
<!-- Where things live and why -->
- \`src/components/\` — Reusable UI components
- \`src/pages/\` — Route-level page components
- \`src/lib/\` — Utilities and helpers
- \`src/hooks/\` — Custom React hooks
`,
  },
  {
    filename: "instructions.md",
    displayName: "Instructions",
    description: "Rules and constraints the AI must follow when generating code.",
    priority: 3,
    alwaysInclude: true,
    defaultContent: `# Instructions

## Code Style
- Use TypeScript strict mode — no \`any\` unless absolutely necessary
- Prefer named exports over default exports
- Use \`const\` arrow functions for React components
- Destructure props in function parameters

## Component Patterns
- Use shadcn/ui components when available
- Keep components under 150 lines — extract sub-components
- Co-locate styles with components using Tailwind classes
- Use \`cn()\` utility for conditional class merging

## State Management
- Local state with \`useState\` for UI-only state
- React Context for shared component state
- Server state patterns for API data

## Error Handling
- Always handle loading and error states in UI
- Use try/catch with meaningful error messages
- Never swallow errors silently

## Do NOT
- Add comments explaining obvious code
- Use CSS modules or styled-components
- Create barrel files (index.ts re-exports) unless requested
- Import from node_modules directly when a wrapper exists
`,
  },
  {
    filename: "soul.md",
    displayName: "Soul",
    description: "The creative vision and design philosophy behind the project.",
    priority: 4,
    alwaysInclude: false,
    defaultContent: `# Soul

## Design Philosophy
<!-- What feeling should the UI evoke? What's the visual identity? -->
- Clean and minimal — every element earns its place
- Consistent spacing using an 8px grid
- Subtle animations that feel responsive, never distracting

## Color Strategy
<!-- Your palette and when to use each color -->
- Neutral backgrounds, bold accents for actions
- Use semantic colors: success (green), warning (amber), error (red)

## Typography
- Inter for UI text, monospace for code
- Clear hierarchy: headings, body, captions

## Inspiration
<!-- Reference apps, sites, or design systems you admire -->
`,
  },
  {
    filename: "memory.md",
    displayName: "Memory",
    description: "Running log of what's been built, what's in progress, and what failed.",
    priority: 5,
    alwaysInclude: false,
    defaultContent: `# Memory

## Completed
<!-- Features and changes that are done -->

## In Progress
<!-- What's currently being worked on -->

## Known Issues
<!-- Bugs or problems that need fixing -->

## Attempted & Reverted
<!-- Things that were tried but didn't work, and why -->

## Session Notes
<!-- The AI appends observations here during sessions -->
`,
  },
  {
    filename: "user.md",
    displayName: "User Preferences",
    description: "Personal preferences and working style for the project owner.",
    priority: 6,
    alwaysInclude: false,
    defaultContent: `# User Preferences

## Skill Level
<!-- Helps the AI calibrate explanation depth -->
- Comfortable with: TypeScript, React, CSS
- Learning: (technologies you're exploring)
- Avoid deep explanations of: (things you already know well)

## Working Style
- Prefer small, incremental changes over large rewrites
- Show diffs when modifying existing code
- Ask before making architectural changes

## Communication
- Be direct — skip pleasantries in code discussions
- Explain trade-offs when there are multiple approaches
- Flag potential performance issues proactively
`,
  },
  {
    filename: "plan.md",
    displayName: "Plan",
    description: "Current roadmap, milestones, and the next steps for the project.",
    priority: 7,
    alwaysInclude: false,
    defaultContent: `# Plan

## Current Milestone
<!-- What's the immediate goal? -->

## Next Steps
<!-- Ordered list of what to build next -->
1.
2.
3.

## Backlog
<!-- Ideas and features for later -->

## Non-Goals
<!-- Things explicitly NOT being built (prevents scope creep) -->
`,
  },
];

/** Map from filename to definition for quick lookup */
export const CONTEXT_FILE_MAP = new Map(
  DEFAULT_CONTEXT_FILES.map((f) => [f.filename, f])
);

/** All valid context filenames */
export const VALID_CONTEXT_FILENAMES = DEFAULT_CONTEXT_FILES.map((f) => f.filename);

/** Filenames that are always included in the AI prompt */
export const ALWAYS_INCLUDE_FILES = DEFAULT_CONTEXT_FILES
  .filter((f) => f.alwaysInclude)
  .map((f) => f.filename);
