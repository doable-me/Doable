/**
 * Deterministic guard: block hand-rolled MCP tool-calling loops in generated apps.
 *
 * When a user builds an "AI assistant / chatbot over a connected MCP server",
 * the model is told (framework-prompts/vite-react.ts §0b + skills/vite-react/
 * mcp-tools.md) to use the platform helper `runMcpAgent` from `@doable/ai`,
 * which runs a robust model↔tool ReAct loop and answers from REAL tool results.
 *
 * In practice the model often ACKNOWLEDGES runMcpAgent in its reasoning but then
 * writes its OWN loop anyway: it runs `ai.chat`, calls `doable.mcp.call`, and
 * parses the model's reply for a tool call with a regex + JSON.parse (or
 * scrapes `[TOOL_CALL]` markers). That hand-rolled parser is the #1 cause of
 * broken MCP chatbots — it throws the instant the model emits more than one
 * tool-call object, wraps it in `[TOOL_CALL]` tags, or uses unquoted keys, so
 * the tool never executes and the model's fabricated text (hallucinated counts/
 * rows) leaks to the UI as if it were real data.
 *
 * Guidance alone does not stop this (the model ignores it), so we enforce it
 * deterministically at the single write chokepoint (ai/project-files.ts:
 * writeProjectFile, which both the native create_file/edit_file tools and the
 * copilot write path converge on). A file that hand-rolls the loop is REJECTED
 * with an actionable message telling the agent to use runMcpAgent instead.
 *
 * Precise by design — it fires ONLY when a single source file does ALL of:
 *   1. runs the model itself          (ai.chat / ai.chatSync)
 *   2. calls an MCP tool itself       (doable.mcp.call / .mcp.call)
 *   3. parses tool calls itself       ([TOOL_CALL] markers, or .match()+JSON.parse)
 *   4. does NOT use runMcpAgent
 * so it never flags: dashboards (mcp.call in a useEffect, no ai.chat), plain AI
 * chat with no MCP (ai.chat, no mcp.call), or apps that correctly use
 * runMcpAgent (the loop lives in @doable/ai, not in app code). Generic to any
 * MCP server / workspace / project — keys only off the generated code's shape.
 */

/** Source files we inspect — generated app code only. */
function isInspectableSource(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/");
  if (p.includes("node_modules/")) return false;
  return /\.(t|j)sx?$/.test(p);
}

/**
 * Return a human-readable reason when `content` hand-rolls an MCP tool-calling
 * loop (and should use `runMcpAgent` instead), or `null` when the file is fine.
 * Never throws; safe to call on every write.
 */
export function handRolledMcpAgentViolation(
  relPath: string,
  content: string,
): string | null {
  if (!isInspectableSource(relPath)) return null;
  if (typeof content !== "string" || content.length === 0) return null;

  // 4. Already using the platform helper → always fine.
  if (/\brunMcpAgent\s*\(/.test(content) || /\brunMcpAgent\b/.test(content)) {
    return null;
  }

  // 1. Runs the model in app code.
  const usesAiChat = /\bai\.chatSync\s*\(/.test(content) || /\bai\.chat\s*\(/.test(content);
  // 2. Calls an MCP tool in app code.
  const usesMcpCall = /\.mcp\.call\s*\(/.test(content);
  if (!usesAiChat || !usesMcpCall) return null;

  // 3. Parses tool calls itself — the fragile part.
  const hasToolCallMarker = /\[\/?TOOL_CALL\]/i.test(content);
  const hasRegexJsonParse =
    /\.match\s*\(/.test(content) &&
    /JSON\.parse\s*\(/.test(content) &&
    /["'`]tool["'`]|\{\s*tool\b|\\?\{[^}]*\btool\b/i.test(content);

  if (!hasToolCallMarker && !hasRegexJsonParse) return null;

  return (
    "This file hand-rolls an MCP tool-calling loop (it runs ai.chat, calls " +
    "doable.mcp.call, and parses the model's reply for a tool call itself). That " +
    "pattern is fragile and breaks whenever the model emits multiple tool calls, " +
    "wraps them in [TOOL_CALL] tags, or uses unquoted keys — the tool never runs " +
    "and fabricated data leaks to the UI. Use the built-in helper instead:\n\n" +
    "  import { runMcpAgent } from \"@doable/ai\";\n" +
    "  import { createDoableClient } from \"@doable/sdk\";\n" +
    "  const doable = createDoableClient();\n" +
    "  const { answer, toolsUsed } = await runMcpAgent({ mcp: doable.mcp, prompt: userText });\n" +
    "  // render `answer` (markdown). Optional: { system, history, onToolCall }.\n\n" +
    "runMcpAgent discovers tools, runs the model↔tool ReAct loop, and answers " +
    "from REAL tool results. Remove your manual ai.chat/doable.mcp.call/tool-call " +
    "parsing and the [TOOL_CALL] handling, and call runMcpAgent from your send handler."
  );
}
