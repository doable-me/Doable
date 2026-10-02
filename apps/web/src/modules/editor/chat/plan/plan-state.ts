import type { Plan } from "@doable/shared/types/ai";
export function acceptPlanSnapshot(
  current: Plan | null,
  next: Plan | null,
  projectId: string,
): Plan | null {
  if (next && next.projectId !== projectId)
    return current?.projectId === projectId ? current : null;
  if (!next) return null;
  if (current?.id === next.id && (current.revision ?? 0) > (next.revision ?? 0))
    return current;
  if (
    current?.projectId === projectId &&
    current.id !== next.id &&
    Date.parse(current.createdAt) > Date.parse(next.createdAt)
  )
    return current;
  return next;
}
export function planProgressState(plan: Plan, running: boolean) {
  const completed = plan.steps.filter((s) => s.status === "completed").length;
  const skipped = plan.steps.filter((s) => s.status === "skipped").length;
  const failed = plan.steps.some((s) => s.status === "failed");
  const finished =
    plan.status === "completed" ||
    (plan.steps.length > 0 && completed + skipped === plan.steps.length);
  return {
    completed,
    skipped,
    percentage: plan.steps.length
      ? Math.round(((completed + skipped) / plan.steps.length) * 100)
      : 0,
    finished,
    label: finished
      ? "Plan finished"
      : running
        ? "Executing plan"
        : failed
          ? "Plan needs attention"
          : "Plan paused",
    spinning: running && !finished,
  };
}
