import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import {getPlan,revisePlan,approvePlan} from "../ai/plan-store.js";
import {requireProjectAccess,hasProjectAccess} from "../middleware/project-access.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { updateContextFile } from "../ai/context/index.js";

export const planRoutes = new Hono<AuthEnv>({ strict: false });

// Auth middleware for all plan routes
planRoutes.use("/projects/:id/plan", authMiddleware);
planRoutes.use("/projects/:id/plan/*", authMiddleware);

planRoutes.use("/projects/:id/plan", requireProjectAccess());
planRoutes.use("/projects/:id/plan/*", requireProjectAccess());
planRoutes.use("/projects/:id/plan/*", async(c,next) => {
  const access = await hasProjectAccess(c.get("userId"),c.req.param("id")!);
  if(access?.detail === "viewer") return c.json({error:"Read-only project access"},403);
  await next();
});
planRoutes.get("/projects/:id/plan", async(c) => {
  try { return c.json({data:await getPlan(c.req.param("id"))}); }
  catch(err) { return c.json({error:err instanceof Error ? err.message : String(err)},500); }
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
      const plan = await approvePlan(projectId,planId);
      return c.json({success:true,data:plan});
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
      const updatedPlan = await revisePlan(projectId,planId,steps.map((step,i)=>({...step,id:step.id ?? randomUUID(),order:i+1})));
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
        SET status = 'abandoned', revision=revision+1
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
