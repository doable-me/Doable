import type {
  Plan,
  PlanStep,
  PlanStepStatus,
} from "@doable/shared/types/ai.js";

export const stepStatuses = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "failed",
] as const;
export function isStepStatus(value: unknown): value is PlanStepStatus {
  return (
    typeof value === "string" &&
    (stepStatuses as readonly string[]).includes(value)
  );
}
export function planToMarkdown(plan: Plan): string {
  let md = `# Plan\n\nPlan ID: ${plan.id}\nRevision: ${plan.revision ?? 0}\nStatus: ${plan.status}\n\n${plan.summary}\n\n**Complexity:** ${plan.complexity}\n\n`;
  for (const step of [...plan.steps].sort((a, b) => a.order - b.order)) {
    md += `## ${step.order}. ${step.title}\n\nStep ID: ${step.id}\nStatus: ${step.status}\n\n${step.description}\n\n`;
    if (step.details) md += `**Details:** ${step.details}\n\n`;
    if (step.filePaths?.length)
      md += `**Files:** ${step.filePaths.join(", ")}\n\n`;
  }
  return (
    md +
    `\nUse get_plan to read current IDs and status. Call mark_step_complete with status=in_progress when starting a step, completed only after checking its result, failed on a confirmed failure, or skipped with an explanation. Use update_plan to revise order/scope while keeping existing step IDs. A finished chat turn does not complete unverified steps.\n`
  );
}
export function revisedSteps(
  previous: PlanStep[],
  next: Array<Omit<PlanStep, "id" | "status"> & { id: string }>,
): PlanStep[] {
  const ids = new Set<string>();
  return next.map((step, index) => {
    if (ids.has(step.id)) throw new Error("Duplicate step ID");
    ids.add(step.id);
    const prior = previous.find((item) => item.id === step.id);
    return {
      ...step,
      details: step.details ?? prior?.details,
      filePaths: step.filePaths ?? prior?.filePaths,
      order: index + 1,
      status: prior?.status ?? "pending",
    };
  });
}
