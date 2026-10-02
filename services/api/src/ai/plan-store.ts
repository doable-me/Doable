import type {
  Plan,
  PlanStep,
  PlanStepStatus,
} from "@doable/shared/types/ai.js";
import { sql } from "../db/index.js";
import { updateContextFile } from "./context/index.js";
import { isStepStatus, planToMarkdown, revisedSteps } from "./plan-state.js";

async function readPlan(
  db: typeof sql,
  projectId: string,
  planId?: string,
  lock = false,
): Promise<Plan | null> {
  const rows = planId
    ? await db`SELECT * FROM plans WHERE project_id=${projectId} AND id=${planId} ${lock ? db`FOR UPDATE` : db``}`
    : await db`SELECT * FROM plans WHERE project_id=${projectId} ORDER BY created_at DESC LIMIT 1 ${lock ? db`FOR UPDATE` : db``}`;
  const row = rows[0];
  if (!row || row.status === "abandoned") return null;
  const steps =
    await db`SELECT * FROM plan_steps WHERE plan_id=${row.id} ORDER BY "order"`;
  return {
    id: row.id,
    projectId: row.project_id,
    summary: row.summary,
    complexity: row.complexity,
    status: row.status,
    revision: Number(row.revision ?? 0),
    createdAt: row.created_at.toISOString(),
    approvedAt: row.approved_at?.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    originalPrompt: row.original_prompt ?? undefined,
    clarificationAnswers: row.clarification_answers ?? undefined,
    steps: steps.map(
      (s): PlanStep => ({
        id: s.id,
        order: s.order,
        title: s.title,
        description: s.description,
        details: s.details ?? undefined,
        filePaths: s.file_paths ?? undefined,
        status: s.status,
      }),
    ),
  };
}
export async function getPlan(
  projectId: string,
  planId?: string,
): Promise<Plan | null> {
  return sql.begin(async (tx) => {
    return readPlan(tx as unknown as typeof sql, projectId, planId, true);
  });
}
const mirrors = new Map<string, Promise<void>>();
async function mirror(plan: Plan) {
  const previous = mirrors.get(plan.projectId) ?? Promise.resolve();
  const write = previous
    .catch(() => {})
    .then(async () => {
      const latest = await getPlan(plan.projectId);
      if (latest)
        await updateContextFile(
          plan.projectId,
          "plan.md",
          planToMarkdown(latest),
        );
    })
    .catch((err) =>
      console.warn(
        "[Plan] Context mirror failed; DB is authoritative:",
        err instanceof Error ? err.message : err,
      ),
    );
  mirrors.set(plan.projectId, write);
  await write;
  if (mirrors.get(plan.projectId) === write) mirrors.delete(plan.projectId);
}
export async function savePlan(plan: Plan): Promise<Plan> {
  await sql.begin(async (tx) => {
    const db = tx as unknown as typeof sql;
    await db`INSERT INTO plans (id,project_id,summary,complexity,status,created_at,revision,original_prompt,clarification_answers) VALUES (${plan.id},${plan.projectId},${plan.summary},${plan.complexity},${plan.status},${plan.createdAt},0,${plan.originalPrompt ?? null},${plan.clarificationAnswers ? db.json(plan.clarificationAnswers) : null})`;
    for (const step of plan.steps)
      await db`INSERT INTO plan_steps (id,plan_id,"order",title,description,details,status,file_paths) VALUES (${step.id},${plan.id},${step.order},${step.title},${step.description},${step.details ?? null},${step.status},${step.filePaths ?? null})`;
  });
  const saved = (await getPlan(plan.projectId, plan.id))!;
  await mirror(saved);
  return saved;
}
export async function setPlanStep(
  projectId: string,
  planId: string,
  stepId: string,
  status: PlanStepStatus,
): Promise<Plan> {
  if (!isStepStatus(status)) throw new Error("Invalid step status");
  const updated = await sql.begin(async (tx) => {
    const db = tx as unknown as typeof sql;
    const plan = await readPlan(db, projectId, planId, true);
    if (
      !plan ||
      !["approved", "in_progress", "completed"].includes(plan.status)
    )
      throw new Error("Approved plan not found in this project");
    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) throw new Error("Step not found in this plan");
    // Replays are idempotent. Explicitly reopen a completed step before changing its result.
    if (step.status === status) return plan;
    if (
      ["completed", "skipped"].includes(step.status) &&
      status !== "in_progress"
    )
      throw new Error("Reopen the step before changing a terminal result");
    await db`UPDATE plan_steps SET status=${status}, started_at=CASE WHEN ${status}='in_progress' THEN COALESCE(started_at,now()) ELSE started_at END, completed_at=CASE WHEN ${status} IN ('completed','skipped') THEN now() ELSE NULL END WHERE id=${stepId} AND plan_id=${planId}`;
    const allDone = plan.steps.every((s) =>
      ["completed", "skipped"].includes(s.id === stepId ? status : s.status),
    );
    await db`UPDATE plans SET status=${allDone ? "completed" : "in_progress"}, completed_at=CASE WHEN ${allDone} THEN now() ELSE NULL END, revision=revision+1 WHERE id=${planId} AND project_id=${projectId}`;
    return (await readPlan(db, projectId, planId))!;
  });
  await mirror(updated);
  return updated;
}
export async function revisePlan(
  projectId: string,
  planId: string,
  steps: Array<Omit<PlanStep, "status">>,
): Promise<Plan> {
  if (!steps.length) throw new Error("Plan must contain at least one step");
  const updated = await sql.begin(async (tx) => {
    const db = tx as unknown as typeof sql;
    const plan = await readPlan(db, projectId, planId, true);
    if (!plan || plan.status === "abandoned")
      throw new Error("Plan not found in this project");
    const next = revisedSteps(plan.steps, steps);
    // Editing the plan does not erase progress on surviving IDs.
    for (const step of next) {
      if (plan.steps.some((s) => s.id === step.id)) {
        await db`UPDATE plan_steps SET "order"=${step.order},title=${step.title},description=${step.description},details=${step.details ?? null},file_paths=${step.filePaths ?? null} WHERE id=${step.id} AND plan_id=${planId}`;
      } else {
        await db`INSERT INTO plan_steps (id,plan_id,"order",title,description,details,status,file_paths) VALUES (${step.id},${planId},${step.order},${step.title},${step.description},${step.details ?? null},'pending',${step.filePaths ?? null})`;
      }
    }
    for (const step of plan.steps)
      if (!next.some((s) => s.id === step.id))
        await db`DELETE FROM plan_steps WHERE id=${step.id} AND plan_id=${planId}`;
    const finished = next.every((s) =>
      ["completed", "skipped"].includes(s.status),
    );
    const status =
      plan.status === "draft"
        ? "draft"
        : finished
          ? "completed"
          : "in_progress";
    await db`UPDATE plans SET status=${status},completed_at=CASE WHEN ${status}='completed' THEN now() ELSE NULL END,revision=revision+1 WHERE id=${planId} AND project_id=${projectId}`;
    return (await readPlan(db, projectId, planId))!;
  });
  await mirror(updated);
  return updated;
}

export async function approvePlan(
  projectId: string,
  planId: string,
): Promise<Plan> {
  const updated = await sql.begin(async (tx) => {
    const db = tx as unknown as typeof sql;
    const plan = await readPlan(db, projectId, planId, true);
    if (!plan || plan.status === "abandoned")
      throw new Error("Plan not found in this project");
    if (plan.status !== "draft") return plan; // Retrying an approval never resets progress.
    await db`UPDATE plans SET status='approved', approved_at=now(),revision=revision+1 WHERE id=${planId} AND project_id=${projectId}`;
    return (await readPlan(db, projectId, planId))!;
  });
  await mirror(updated);
  return updated;
}
