import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { skillsQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

const skills = skillsQueries(sql);
const workspaces = workspaceQueries(sql);

export const skillsRoutes = new Hono<AuthEnv>();

// All skills/rules routes require authentication
skillsRoutes.use("*", authMiddleware);

// ─── Role helpers ──────────────────────────────────────────

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

// ─── Skills ────────────────────────────────────────────────

// GET /:workspaceId/skills
skillsRoutes.get("/:workspaceId/skills", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const projectId = c.req.query("projectId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const data = await skills.listSkills(workspaceId, projectId);
  return c.json({ data });
});

// GET /:workspaceId/skills/manifest — lightweight list for autocomplete
skillsRoutes.get("/:workspaceId/skills/manifest", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const projectId = c.req.query("projectId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const data = await skills.listSkillManifest(workspaceId, projectId ?? undefined);
  return c.json({ data });
});

const createSkillSchema = z.object({
  scope: z.enum(["workspace", "project", "user"]),
  skillName: z.string().min(1).max(200),
  description: z.string().max(500).default(""),
  skillContent: z.string().min(1),
  autoInvoke: z.boolean().default(true),
  projectId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

// POST /:workspaceId/skills
skillsRoutes.post(
  "/:workspaceId/skills",
  zValidator("json", createSkillSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const row = await skills.createSkill({
      workspaceId,
      scope: body.scope,
      skillName: body.skillName,
      description: body.description,
      skillContent: body.skillContent,
      autoInvoke: body.autoInvoke,
      projectId: body.projectId,
      userId: body.userId,
    });

    return c.json({ data: row }, 201);
  }
);

const updateSkillSchema = z.object({
  skillContent: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  autoInvoke: z.boolean().optional(),
});

// PUT /:workspaceId/skills/:id
skillsRoutes.put(
  "/:workspaceId/skills/:id",
  zValidator("json", updateSkillSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const skillId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const row = await skills.updateSkill(skillId, {
      skillContent: body.skillContent,
      description: body.description,
      autoInvoke: body.autoInvoke,
    });
    if (!row) return c.json({ error: "Skill not found" }, 404);

    return c.json({ data: row });
  }
);

// DELETE /:workspaceId/skills/:id
skillsRoutes.delete("/:workspaceId/skills/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const skillId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const deleted = await skills.deleteSkill(skillId);
  if (!deleted) return c.json({ error: "Skill not found" }, 404);

  return c.json({ data: { id: skillId, deleted: true } });
});

// ─── Rules ─────────────────────────────────────────────────

// GET /:workspaceId/rules
skillsRoutes.get("/:workspaceId/rules", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const projectId = c.req.query("projectId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const data = await skills.listRules(workspaceId, projectId);
  return c.json({ data });
});

const createRuleSchema = z.object({
  scope: z.enum(["workspace", "project", "user"]),
  ruleName: z.string().min(1).max(200),
  content: z.string().min(1),
  filePatterns: z.array(z.string()).default([]),
  projectId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

// POST /:workspaceId/rules
skillsRoutes.post(
  "/:workspaceId/rules",
  zValidator("json", createRuleSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const row = await skills.createRule({
      workspaceId,
      scope: body.scope,
      ruleName: body.ruleName,
      content: body.content,
      filePatterns: body.filePatterns,
      projectId: body.projectId,
      userId: body.userId,
    });

    return c.json({ data: row }, 201);
  }
);

const updateRuleSchema = z.object({
  content: z.string().min(1),
  filePatterns: z.array(z.string()).optional(),
});

// PUT /:workspaceId/rules/:id
skillsRoutes.put(
  "/:workspaceId/rules/:id",
  zValidator("json", updateRuleSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const ruleId = c.req.param("id");
    const userId = c.get("userId");
    const { content, filePatterns } = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const row = await skills.updateRule(ruleId, content, filePatterns);
    if (!row) return c.json({ error: "Rule not found" }, 404);

    return c.json({ data: row });
  }
);

// DELETE /:workspaceId/rules/:id
skillsRoutes.delete("/:workspaceId/rules/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const ruleId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const deleted = await skills.deleteRule(ruleId);
  if (!deleted) return c.json({ error: "Rule not found" }, 404);

  return c.json({ data: { id: ruleId, deleted: true } });
});
