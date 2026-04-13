/**
 * Plan parsing helpers extracted from routes/chat.ts.
 *
 * - parsePlanSteps: parses plan.md markdown into structured steps.
 * - extractPlanFromResponse: extracts a plan from an AI response text.
 * - extractSseHintPayload: extracts tagged payloads from SDK tool results.
 */

/**
 * Parse plan.md content into structured steps.
 * The SDK plan mode writes markdown with `## Step N: Title` headings.
 */
export function parsePlanSteps(planContent: string | null | undefined): Array<{
  id: string;
  order: number;
  title: string;
  description: string;
  status: "pending";
}> {
  if (!planContent) return [];
  const steps: Array<{ id: string; order: number; title: string; description: string; status: "pending" }> = [];
  const lines = planContent.split("\n");
  let currentStep: { title: string; lines: string[] } | null = null;
  let order = 0;

  for (const line of lines) {
    // Match "## 1. Title", "## Step 1: Title", or "- [ ] Title"
    const headingMatch = line.match(/^##\s+(?:(?:Step\s+)?\d+[\.:]\s*)?(.+)/i);
    const checkboxMatch = line.match(/^-\s+\[[ x]\]\s+(.+)/i);
    const match = headingMatch || checkboxMatch;
    if (match) {
      if (currentStep) {
        steps.push({
          id: `plan-step-${order}`,
          order,
          title: currentStep.title,
          description: currentStep.lines.join("\n").trim(),
          status: "pending",
        });
      }
      order++;
      currentStep = { title: match[1]!.trim(), lines: [] };
    } else if (currentStep && line.trim()) {
      currentStep.lines.push(line.trim());
    }
  }
  if (currentStep) {
    steps.push({
      id: `plan-step-${order}`,
      order,
      title: currentStep.title,
      description: currentStep.lines.join("\n").trim(),
      status: "pending",
    });
  }
  return steps;
}

/**
 * Extract a plan from the AI's response text.
 * Looks for markdown plan structure and wraps it appropriately.
 */
export function extractPlanFromResponse(text: string): string | null {
  // Look for a markdown plan header
  const planHeaderPattern = /^#\s+Plan/m;
  if (planHeaderPattern.test(text)) {
    const match = text.match(planHeaderPattern);
    if (match?.index !== undefined) {
      return text.slice(match.index).trim();
    }
  }

  // If the response looks like a structured plan, wrap it
  if (
    text.includes("##") &&
    (text.includes("Step") || text.includes("Task") || text.includes("Phase"))
  ) {
    return `# Plan\n\n${text.trim()}`;
  }

  // Fallback: if substantial text, treat it all as a plan
  if (text.trim().length > 200) {
    return `# Plan\n\n${text.trim()}`;
  }

  return null;
}

/**
 * Extract the `_sseHint` payload from the SDK's tool result envelope.
 */
export function extractSseHintPayload(
  result: unknown,
  expectedHint: string,
): Record<string, unknown> | null {
  if (!result) return null;

  const tryObject = (obj: Record<string, unknown>): Record<string, unknown> | null => {
    if (obj._sseHint === expectedHint) return obj;
    if (typeof obj.output === "string") {
      try {
        const parsed = JSON.parse(obj.output) as Record<string, unknown>;
        if (parsed?._sseHint === expectedHint) return parsed;
      } catch { /* fall through */ }
    }
    if (typeof obj.textResultForLlm === "string") {
      try {
        const parsed = JSON.parse(obj.textResultForLlm) as Record<string, unknown>;
        if (parsed?._sseHint === expectedHint) return parsed;
      } catch { /* fall through */ }
    }
    return null;
  };

  if (typeof result === "object") {
    return tryObject(result as Record<string, unknown>);
  }
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      if (parsed && typeof parsed === "object") {
        return tryObject(parsed as Record<string, unknown>);
      }
    } catch { /* not JSON */ }
  }
  return null;
}
