import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { environmentQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

const envs = environmentQueries(sql);
const workspaces = workspaceQueries(sql);

export const environmentRoutes = new Hono<AuthEnv>({ strict: false });

environmentRoutes.use("*", authMiddleware);

// ─── Role helper ──────────────────────────────────────────

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

// ─── Environments CRUD ────────────────────────────────────

environmentRoutes.get("/:workspaceId/environments", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const scope = c.req.query("scope") as "workspace" | "project" | "user" | undefined;
  const projectId = c.req.query("projectId");
  const data = await envs.listForWorkspace(workspaceId, { scope: scope || undefined, projectId: projectId || undefined });
  return c.json({ data });
});

environmentRoutes.get("/environments/templates", async (c) => {
  const data = await envs.listTemplates();
  return c.json({ data });
});

const createEnvSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  isTemplate: z.boolean().optional(),
});

environmentRoutes.post(
  "/:workspaceId/environments",
  zValidator("json", createEnvSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const env = await envs.create({ workspaceId, createdBy: userId, ...body });
    return c.json({ data: env }, 201);
  },
);

environmentRoutes.get("/:workspaceId/environments/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("id");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const data = await envs.getById(envId);
  if (!data) return c.json({ error: "Environment not found" }, 404);
  return c.json({ data });
});

const updateEnvSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  isTemplate: z.boolean().optional(),
});

environmentRoutes.put(
  "/:workspaceId/environments/:id",
  zValidator("json", updateEnvSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const envId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const updated = await envs.update(envId, body);
    if (!updated) return c.json({ error: "Environment not found" }, 404);
    return c.json({ data: updated });
  },
);

environmentRoutes.delete("/:workspaceId/environments/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("id");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const deleted = await envs.remove(envId);
  if (!deleted) return c.json({ error: "Environment not found" }, 404);
  return c.json({ data: { id: envId, deleted: true } });
});

// ─── Apply / Remove / Clone ───────────────────────────────

environmentRoutes.post("/:workspaceId/environments/:id/apply", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("id");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const link = await envs.applyToWorkspace(workspaceId, envId);
  return c.json({ data: link }, 201);
});

environmentRoutes.delete("/:workspaceId/environments/:id/apply", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("id");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const removed = await envs.removeFromWorkspace(workspaceId, envId);
  if (!removed) return c.json({ error: "Not applied" }, 404);
  return c.json({ data: { removed: true } });
});

const cloneSchema = z.object({ newName: z.string().min(1).max(100).optional() });

environmentRoutes.post(
  "/:workspaceId/environments/:id/clone",
  zValidator("json", cloneSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const envId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const cloned = await envs.clone(envId, workspaceId, userId, body.newName);
    return c.json({ data: cloned }, 201);
  },
);

// ─── Default environment ──────────────────────────────────

// GET default environment items (all workspace-level items)
environmentRoutes.get("/:workspaceId/environments-default", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  // Check if a custom default is set
  const customDefault = await envs.getDefault(workspaceId);
  if (customDefault) {
    return c.json({ data: customDefault, isCustom: true });
  }

  // Return virtual default (all workspace items)
  const items = await envs.getDefaultItems(workspaceId);
  return c.json({ data: null, isCustom: false, items });
});

environmentRoutes.post("/:workspaceId/environments/:id/default", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("id");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  await envs.applyToWorkspace(workspaceId, envId);
  await envs.setDefault(workspaceId, envId);
  return c.json({ data: { workspaceId, environmentId: envId, isDefault: true } });
});

// ─── Ref-based item management ────────────────────────────
// Add/remove references to existing workspace items

const refSchema = z.object({ id: z.string().uuid() });

// --- Skill refs ---
environmentRoutes.post(
  "/:workspaceId/environments/:envId/skills",
  zValidator("json", refSchema),
  async (c) => {
    const { workspaceId, envId } = c.req.param() as { workspaceId: string; envId: string };
    const userId = c.get("userId");
    const { id: skillId } = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const row = await envs.addSkillRef(envId, skillId);
    return c.json({ data: row }, 201);
  },
);

environmentRoutes.delete("/:workspaceId/environments/:envId/skills/:skillId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("envId");
  const skillId = c.req.param("skillId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const deleted = await envs.removeSkillRef(envId, skillId);
  if (!deleted) return c.json({ error: "Ref not found" }, 404);
  return c.json({ data: { deleted: true } });
});

// --- Rule refs ---
environmentRoutes.post(
  "/:workspaceId/environments/:envId/rules",
  zValidator("json", refSchema),
  async (c) => {
    const { workspaceId, envId } = c.req.param() as { workspaceId: string; envId: string };
    const userId = c.get("userId");
    const { id: ruleId } = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const row = await envs.addRuleRef(envId, ruleId);
    return c.json({ data: row }, 201);
  },
);

environmentRoutes.delete("/:workspaceId/environments/:envId/rules/:ruleId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("envId");
  const ruleId = c.req.param("ruleId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const deleted = await envs.removeRuleRef(envId, ruleId);
  if (!deleted) return c.json({ error: "Ref not found" }, 404);
  return c.json({ data: { deleted: true } });
});

// --- Knowledge (direct CRUD via environment_knowledge) ---

const knowledgeCreateSchema = z.object({
  filename: z.string().min(1).max(255),
  content: z.string().default(""),
});

const knowledgeUpdateSchema = z.object({
  content: z.string(),
});

// List knowledge files for an environment
environmentRoutes.get("/:workspaceId/environments/:envId/knowledge", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("envId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const files = await envs.listKnowledge(envId);
  return c.json({ data: files });
});

// Create / upsert a knowledge file
environmentRoutes.post(
  "/:workspaceId/environments/:envId/knowledge",
  zValidator("json", knowledgeCreateSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const envId = c.req.param("envId");
    const userId = c.get("userId");
    const { filename, content } = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const row = await envs.upsertKnowledge(envId, filename, content);
    return c.json({ data: row }, 201);
  },
);

// Update a knowledge file by filename
environmentRoutes.put(
  "/:workspaceId/environments/:envId/knowledge/:filename",
  zValidator("json", knowledgeUpdateSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const envId = c.req.param("envId");
    const filename = c.req.param("filename");
    const userId = c.get("userId");
    const { content } = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const row = await envs.upsertKnowledge(envId, filename, content);
    return c.json({ data: row });
  },
);

// Delete a knowledge file by filename
environmentRoutes.delete("/:workspaceId/environments/:envId/knowledge/:filename", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("envId");
  const filename = c.req.param("filename");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const deleted = await envs.removeKnowledge(envId, filename);
  if (!deleted) return c.json({ error: "Knowledge file not found" }, 404);
  return c.json({ data: { deleted: true } });
});

// --- Connector refs ---
environmentRoutes.post(
  "/:workspaceId/environments/:envId/connectors",
  zValidator("json", refSchema),
  async (c) => {
    const { workspaceId, envId } = c.req.param() as { workspaceId: string; envId: string };
    const userId = c.get("userId");
    const { id: connectorId } = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const row = await envs.addConnectorRef(envId, connectorId);
    return c.json({ data: row }, 201);
  },
);

environmentRoutes.delete("/:workspaceId/environments/:envId/connectors/:connectorId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const envId = c.req.param("envId");
  const connectorId = c.req.param("connectorId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const deleted = await envs.removeConnectorRef(envId, connectorId);
  if (!deleted) return c.json({ error: "Ref not found" }, 404);
  return c.json({ data: { deleted: true } });
});

// ─── Instructions CRUD (environment-specific, no refs) ────

const addInstructionSchema = z.object({
  filename: z.string().min(1).max(200),
  content: z.string().default(""),
});

environmentRoutes.post(
  "/:workspaceId/environments/:envId/instructions",
  zValidator("json", addInstructionSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const envId = c.req.param("envId");
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const row = await envs.addInstruction(envId, body.filename, body.content);
    return c.json({ data: row }, 201);
  },
);

const updateInstructionSchema = z.object({
  filename: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
});

environmentRoutes.put(
  "/:workspaceId/environments/:envId/instructions/:instrId",
  zValidator("json", updateInstructionSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const instrId = c.req.param("instrId");
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
    const row = await envs.updateInstruction(instrId, body);
    if (!row) return c.json({ error: "Instruction not found" }, 404);
    return c.json({ data: row });
  },
);

environmentRoutes.delete("/:workspaceId/environments/:envId/instructions/:instrId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const instrId = c.req.param("instrId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);
  const deleted = await envs.removeInstruction(instrId);
  if (!deleted) return c.json({ error: "Instruction not found" }, 404);
  return c.json({ data: { id: instrId, deleted: true } });
});
