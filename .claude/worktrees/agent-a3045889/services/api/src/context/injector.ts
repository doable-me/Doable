import type { AiSessionMode } from "@doable/shared";
import type { ContextFile } from "./manager.js";
import { CONTEXT_FILE_MAP, DEFAULT_CONTEXT_FILES } from "./defaults.js";

// ─── Token Budget ───────────────────────────────────────────

/** Rough chars-per-token estimate for English + markdown */
const CHARS_PER_TOKEN = 4;

/** Max tokens allocated for context injection */
const MAX_CONTEXT_TOKENS = 8_000;
const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;

// ─── Mode Configuration ────────────────────────────────────

/**
 * Which files to include per mode, and any mode-specific preamble.
 *
 * - agent: Full context — the AI is writing code and needs everything.
 * - plan: Focus on plan, knowledge, and identity — high-level thinking.
 * - chat: Lighter context — identity + instructions + memory for Q&A.
 */
interface ModeConfig {
  /** Filenames to include, in priority order */
  include: string[];
  /** Preamble prepended to the context block */
  preamble: string;
}

const MODE_CONFIGS: Record<AiSessionMode, ModeConfig> = {
  agent: {
    include: [
      "identity.md",
      "knowledge.md",
      "instructions.md",
      "soul.md",
      "memory.md",
      "user.md",
      "plan.md",
    ],
    preamble:
      "You are working inside a project. Follow the project's identity, knowledge, and instructions precisely. Apply the design soul. Reference memory for prior context. Respect user preferences.",
  },
  plan: {
    include: [
      "identity.md",
      "knowledge.md",
      "plan.md",
      "memory.md",
    ],
    preamble:
      "You are helping plan the next steps for this project. Use the project identity and knowledge base to make informed suggestions. Reference the current plan and memory.",
  },
  chat: {
    include: [
      "identity.md",
      "instructions.md",
      "memory.md",
      "user.md",
    ],
    preamble:
      "You are answering questions about this project. Use the project identity and instructions to stay consistent. Check memory for recent context. Adapt to user preferences.",
  },
};

// ─── Builder ────────────────────────────────────────────────

/**
 * Build the system prompt context block from context files and mode.
 *
 * Files are included in priority order until the token budget is
 * exhausted. Each file is wrapped in XML-style tags for clarity.
 */
export function buildContextPrompt(
  files: ContextFile[],
  mode: AiSessionMode
): string {
  const config = MODE_CONFIGS[mode];
  const fileMap = new Map(files.map((f) => [f.filename, f]));

  const sections: string[] = [];
  let charBudget = MAX_CONTEXT_CHARS;

  // Add preamble
  const preambleBlock = `<project-context-preamble>\n${config.preamble}\n</project-context-preamble>`;
  charBudget -= preambleBlock.length;
  sections.push(preambleBlock);

  // Add files in mode-priority order
  for (const filename of config.include) {
    const file = fileMap.get(filename);
    if (!file || !file.content.trim()) continue;

    const content = file.content.trim();
    const def = CONTEXT_FILE_MAP.get(filename);
    const label = def?.displayName ?? filename;

    const block = `<context-file name="${filename}" label="${label}">\n${content}\n</context-file>`;

    if (block.length > charBudget) {
      // Try to fit a truncated version
      const truncated = truncateToFit(content, charBudget - 100);
      if (truncated) {
        const truncBlock = `<context-file name="${filename}" label="${label}" truncated="true">\n${truncated}\n</context-file>`;
        sections.push(truncBlock);
        charBudget -= truncBlock.length;
      }
      break; // Budget exhausted
    }

    sections.push(block);
    charBudget -= block.length;
  }

  // Include any custom files (not in the default set) if budget allows
  const defaultNames = new Set(DEFAULT_CONTEXT_FILES.map((f) => f.filename));
  const customFiles = files.filter(
    (f) => !defaultNames.has(f.filename) && f.content.trim()
  );

  for (const file of customFiles) {
    const block = `<context-file name="${file.filename}" label="Custom: ${file.filename}">\n${file.content.trim()}\n</context-file>`;

    if (block.length > charBudget) break;

    sections.push(block);
    charBudget -= block.length;
  }

  return sections.join("\n\n");
}

/**
 * Estimate the token count for a string.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Get the context stats for a project's files.
 */
export function getContextStats(files: ContextFile[]): {
  totalFiles: number;
  totalChars: number;
  estimatedTokens: number;
  budgetUsedPercent: number;
} {
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
  const tokens = estimateTokens(
    files.map((f) => f.content).join("")
  );

  return {
    totalFiles: files.length,
    totalChars,
    estimatedTokens: tokens,
    budgetUsedPercent: Math.round((tokens / MAX_CONTEXT_TOKENS) * 100),
  };
}

// ─── Helpers ────────────────────────────────────────────────

function truncateToFit(content: string, maxChars: number): string | null {
  if (maxChars < 200) return null;

  // Try to break at a paragraph boundary
  const lines = content.split("\n");
  let result = "";

  for (const line of lines) {
    if (result.length + line.length + 1 > maxChars) break;
    result += line + "\n";
  }

  if (result.length < 100) return null;
  return result.trimEnd() + "\n\n[... truncated to fit context budget]";
}
