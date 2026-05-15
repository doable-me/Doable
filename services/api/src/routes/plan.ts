import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { updateContextFile } from "../ai/context/index.js";
import type { Plan, PlanStep } from "@doable/shared/types/ai.js";

export const planRoutes = new Hono<AuthEnv>({ strict: false });

// Auth middleware for all plan routes
planRoutes.use("/projects/:id/plan", authMiddleware);
planRoutes.use("/projects/:id/plan/*", authMiddleware);

// ─── Helpers ──────────────────────────────────────────────

function planToMarkdown(plan: Plan): string {
  let md = `# Plan\n\n${plan.summary}\n\n**Complexity:** ${plan.complexity}\n\n`;
  for (const step of plan.steps) {
    md += `## ${step.order}. ${step.title}\n\n${step.description}\n\n`;
    if (step.details) md += `**Details:** ${step.details}\n\n`;
    if (step.filePaths?.length) md += `**Files:** ${step.filePaths.join(", ")}\n\n`;
  }
  return md;
}

// ─── GET /projects/:id/plan — Get active plan ────────────

planRoutes.get("/projects/:id/plan", async (c) => {
  const projectId = c.req.param("id");

  try {
    // Get the most recent active plan
    const plans = await sql`
      SELECT id, project_id, summary, complexity, status,
             original_prompt, clarification_answers,
             created_at, approved_at, completed_at
      FROM plans
      WHERE project_id = ${projectId}
        AND status IN ('draft', 'approved', 'in_progress')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (plans.length === 0) {
      return c.json({ data: null });
    }

    const planRow = plans[0]!;

    // Get plan steps
    const steps = await sql`
      SELECT id, plan_id, "order", title, description, details,
             status, file_paths, started_at, completed_at
      FROM plan_steps
      WHERE plan_id = ${planRow.id}
      ORDER BY "order" ASC
    `;

    const plan: Plan = {
      id: planRow.id,
      projectId: planRow.project_id,
      summary: planRow.summary,
      complexity: planRow.complexity,
      status: planRow.status,
      originalPrompt: planRow.original_prompt ?? undefined,
      clarificationAnswers: planRow.clarification_answers ?? undefined,
      createdAt: planRow.created_at.toISOString(),
      approvedAt: planRow.approved_at?.toISOString() ?? undefined,
      completedAt: planRow.completed_at?.toISOString() ?? undefined,
      steps: steps.map((s): PlanStep => ({
        id: s.id,
        order: s.order,
        title: s.title,
        description: s.description,
        details: s.details ?? undefined,
        status: s.status,
        filePaths: s.file_paths ?? undefined,
      })),
    };

    return c.json({ data: plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to fetch plan: ${msg}` }, 500);
  }
});

// ─── POST /projects/:id/plan/approve — Approve a plan ────

const approveSchema = z.object({
  planId: z.string().min(1),
});

planRoutes.post(
  "/projects/:id/plan/approve",
  zValidator("json", approveSchema),
  async (c) => {
    const projectId = c.req.param("id");
    const { planId } = c.req.valid("json");

    try {
      const result = await sql`
        UPDATE plans
        SET status = 'approved', approved_at = now()
        WHERE id = ${planId} AND project_id = ${projectId}
        RETURNING id
      `;

      if (result.length === 0) {
        return c.json({ error: "Plan not found" }, 404);
      }

      return c.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to approve plan: ${msg}` }, 500);
    }
  },
);

// ─── POST /projects/:id/plan/update — Update plan steps ──

const updateStepSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  details: z.string().optional(),
  filePaths: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  planId: z.string().min(1),
  steps: z.array(updateStepSchema).min(1),
});

planRoutes.post(
  "/projects/:id/plan/update",
  zValidator("json", updateSchema),
  async (c) => {
    const projectId = c.req.param("id");
    const { planId, steps } = c.req.valid("json");

    try {
      // Verify plan exists and belongs to project
      const plans = await sql`
        SELECT id, summary, complexity, status, original_prompt,
               clarification_answers, created_at, approved_at, completed_at
        FROM plans
        WHERE id = ${planId} AND project_id = ${projectId}
      `;

      if (plans.length === 0) {
        return c.json({ error: "Plan not found" }, 404);
      }

      const planRow = plans[0]!;

      // Delete existing steps and insert new ones
      await sql`DELETE FROM plan_steps WHERE plan_id = ${planId}`;

      for (const step of steps) {
        const stepId = step.id ?? randomUUID();
        await sql`
          INSERT INTO plan_steps (id, plan_id, "order", title, description, details, status, file_paths)
          VALUES (
            ${stepId},
            ${planId},
            ${step.order},
            ${step.title},
            ${step.description},
            ${step.details ?? null},
            'pending',
            ${step.filePaths ?? null}
          )
        `;
      }

      // Re-fetch the updated plan with steps
      const updatedSteps = await sql`
        SELECT id, plan_id, "order", title, description, details,
               status, file_paths, started_at, completed_at
        FROM plan_steps
        WHERE plan_id = ${planId}
        ORDER BY "order" ASC
      `;

      const updatedPlan: Plan = {
        id: planRow.id,
        projectId,
        summary: planRow.summary,
        complexity: planRow.complexity,
        status: planRow.status,
        originalPrompt: planRow.original_prompt ?? undefined,
        clarificationAnswers: planRow.clarification_answers ?? undefined,
        createdAt: planRow.created_at.toISOString(),
        approvedAt: planRow.approved_at?.toISOString() ?? undefined,
        completedAt: planRow.completed_at?.toISOString() ?? undefined,
        steps: updatedSteps.map((s): PlanStep => ({
          id: s.id,
          order: s.order,
          title: s.title,
          description: s.description,
          details: s.details ?? undefined,
          status: s.status,
          filePaths: s.file_paths ?? undefined,
        })),
      };

      // Regenerate and save .doable/plan.md
      try {
        const markdown = planToMarkdown(updatedPlan);
        await updateContextFile(projectId, "plan.md", markdown);
      } catch {
        // Non-fatal — DB is the source of truth for the API
      }

      return c.json({ success: true, data: updatedPlan });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to update plan: ${msg}` }, 500);
    }
  },
);

// ─── POST /projects/:id/plan/abandon — Abandon plan ──────

const abandonSchema = z.object({
  planId: z.string().min(1),
});

planRoutes.post(
  "/projects/:id/plan/abandon",
  zValidator("json", abandonSchema),
  async (c) => {
    const projectId = c.req.param("id");
    const { planId } = c.req.valid("json");

    try {
      const result = await sql`
        UPDATE plans
        SET status = 'abandoned'
        WHERE id = ${planId} AND project_id = ${projectId}
        RETURNING id
      `;

      if (result.length === 0) {
        return c.json({ error: "Plan not found" }, 404);
      }

      // Clear .doable/plan.md
      try {
        await updateContextFile(projectId, "plan.md", "");
      } catch {
        // Non-fatal
      }

      return c.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to abandon plan: ${msg}` }, 500);
    }
  },
);
