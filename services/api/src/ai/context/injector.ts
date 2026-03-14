import type { AiMode, ProjectContext } from "@doable/shared/types/ai.js";
import { SYSTEM_PROMPT } from "../prompts/system.js";
import { toolRegistry } from "../tools/index.js";

// ─── Build Full System Prompt ─────────────────────────────

export function buildSystemPrompt(
  context: ProjectContext,
  mode: AiMode,
): string {
  const sections: string[] = [];

  // Base system prompt
  sections.push(SYSTEM_PROMPT);

  // Mode-specific instructions
  sections.push(getModeInstructions(mode));

  // Identity & soul
  if (context.contextFiles["identity.md"]) {
    sections.push(wrapSection("IDENTITY", context.contextFiles["identity.md"]));
  }
  if (context.contextFiles["soul.md"]) {
    sections.push(wrapSection("PERSONALITY", context.contextFiles["soul.md"]));
  }

  // Project knowledge
  if (context.contextFiles["knowledge.md"]) {
    sections.push(
      wrapSection("PROJECT KNOWLEDGE", context.contextFiles["knowledge.md"]),
    );
  }

  // Instructions
  if (context.contextFiles["instructions.md"]) {
    sections.push(
      wrapSection("INSTRUCTIONS", context.contextFiles["instructions.md"]),
    );
  }

  // User preferences
  if (context.contextFiles["user.md"]) {
    sections.push(
      wrapSection("USER PREFERENCES", context.contextFiles["user.md"]),
    );
  }

  // Memory
  if (context.contextFiles["memory.md"]) {
    sections.push(wrapSection("MEMORY", context.contextFiles["memory.md"]));
  }

  // Active plan (if in plan or agent mode)
  if (
    (mode === "plan" || mode === "agent") &&
    context.contextFiles["plan.md"]
  ) {
    sections.push(
      wrapSection("ACTIVE PLAN", context.contextFiles["plan.md"]),
    );
  }

  // Available tools
  if (mode === "agent" || mode === "plan") {
    sections.push(buildToolsSection());
  }

  // Project path
  sections.push(`\nProject path: ${context.projectPath}`);

  return sections.join("\n\n");
}

// ─── Mode Instructions ────────────────────────────────────

function getModeInstructions(mode: AiMode): string {
  switch (mode) {
    case "agent":
      return wrapSection(
        "MODE: AGENT",
        `You are in AGENT mode. You can autonomously:
- Read, create, edit, and delete files
- Run builds and fix errors
- Install packages
- Search across the codebase

Work autonomously to complete the user's request. Plan internally before acting.
Execute multi-file changes as needed. If a build fails, debug and retry (up to 3 times).
Always verify your changes compile correctly.`,
      );

    case "plan":
      return wrapSection(
        "MODE: PLAN",
        `You are in PLAN mode. Your job is to:
1. Analyze the user's request thoroughly
2. Generate a structured, step-by-step development plan
3. Save the plan to .doable/plan.md
4. Return the plan for user approval before any execution

The plan should include:
- Overview of changes
- Step-by-step tasks with file paths
- Estimated complexity
- Potential risks or considerations

Do NOT execute any file changes in plan mode. Only generate the plan.`,
      );

    case "chat":
      return wrapSection(
        "MODE: CHAT",
        `You are in CHAT mode. Respond conversationally.
You can read files to answer questions but should NOT make changes.
Help the user understand their code, debug issues, or discuss architecture.`,
      );
  }
}

// ─── Tools Section ────────────────────────────────────────

function buildToolsSection(): string {
  const tools = toolRegistry.getAll();
  const toolDescriptions = tools
    .map((t) => `- **${t.name}**: ${t.description}`)
    .join("\n");

  return wrapSection(
    "AVAILABLE TOOLS",
    `You have access to the following tools:\n\n${toolDescriptions}\n\nUse tools by calling them with the appropriate parameters. Always handle tool errors gracefully.`,
  );
}

// ─── Helpers ──────────────────────────────────────────────

function wrapSection(title: string, content: string): string {
  return `## ${title}\n\n${content.trim()}`;
}
