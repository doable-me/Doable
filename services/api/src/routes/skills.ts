import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { skillsQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { hasWorkspaceReadAccessViaProject } from "./projects/helpers.js";

const skills = skillsQueries(sql);
const workspaces = workspaceQueries(sql);

export const skillsRoutes = new Hono<AuthEnv>({ strict: false });

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
//
// READ-only. Workspace members are authorized as before. Project collaborators
// (shared into a private project, not a workspace member) are authorized when
// they pass the projectId of the project they collaborate on and that project
// lives in this workspace — they need the manifest to run AI chat there.
skillsRoutes.get("/:workspaceId/skills/manifest", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const projectId = c.req.query("projectId");

  const allowed = await hasWorkspaceReadAccessViaProject(userId, workspaceId, projectId);
  if (!allowed) return c.json({ error: "Not a member of this workspace" }, 403);

  const data = await skills.listSkillManifest(workspaceId, projectId ?? undefined);
  return c.json({ data });
});

const createSkillSchema = z.object({
  scope: z.enum(["workspace", "project", "user"]),
  skillName: z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9_\- ]*$/, "skillName must start alphanumeric and contain only letters/numbers/-/_/space"),
  description: z.string().max(500).default(""),
  skillContent: z.string().min(1),
  autoInvoke: z.boolean().default(true),
  projectId: z.string().uuid().optional(),
});

// Helper: load skill, verify it belongs to the path's workspace
async function getSkillForWorkspace(workspaceId: string, skillId: string) {
  const [row] = await sql<{ id: string; workspace_id: string; scope: string; project_id: string | null; user_id: string | null }[]>`
    SELECT id, workspace_id, scope, project_id, user_id FROM context_skills WHERE id = ${skillId}
  `;
  if (!row) return null;
  if (row.workspace_id !== workspaceId) return null; // cross-workspace access denied
  return row;
}

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

    // Scope/FK consistency validation
    if (body.scope === "project" && !body.projectId) {
      return c.json({ error: "projectId is required for project-scoped skills" }, 400);
    }
    if (body.scope !== "project" && body.projectId) {
      return c.json({ error: "projectId must be omitted for non-project-scoped skills" }, 400);
    }

    // user_id is ALWAYS bound to the authenticated user (never trusted from body).
    const ownerUserId = body.scope === "user" ? userId : undefined;

    const row = await skills.createSkill({
      workspaceId,
      scope: body.scope,
      skillName: body.skillName,
      description: body.description,
      skillContent: body.skillContent,
      autoInvoke: body.autoInvoke,
      projectId: body.projectId,
      userId: ownerUserId,
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

    const target = await getSkillForWorkspace(workspaceId, skillId);
    if (!target) return c.json({ error: "Skill not found" }, 404);
    // user-scoped skills can only be edited by their owner
    if (target.scope === "user" && target.user_id && target.user_id !== userId) {
      return c.json({ error: "Cannot edit another user's personal skill" }, 403);
    }

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

  const target = await getSkillForWorkspace(workspaceId, skillId);
  if (!target) return c.json({ error: "Skill not found" }, 404);
  if (target.scope === "user" && target.user_id && target.user_id !== userId) {
    return c.json({ error: "Cannot delete another user's personal skill" }, 403);
  }

  const deleted = await skills.deleteSkill(skillId);
  if (!deleted) return c.json({ error: "Skill not found" }, 404);

  return c.json({ data: { id: skillId, deleted: true } });
});

// ─── Skill companion files (multi-file folder support) ───────────

const FILE_PATH_RE = /^[a-zA-Z0-9._\-]+(?:\/[a-zA-Z0-9._\-]+)*$/;
function isSafeFilePath(p: string): boolean {
  if (!p || p.length > 512) return false;
  if (p === "SKILL.md") return false; // reserved — that's the parent row's skill_content
  if (p.includes("..")) return false;
  if (!FILE_PATH_RE.test(p)) return false;
  return true;
}

// Authorize a skill-file mutation: must be a workspace member, skill must
// belong to this workspace, and user-scoped skills can only be edited by
// their owner.
async function authorizeSkillFileWrite(
  c: import("hono").Context<AuthEnv>,
): Promise<{ workspaceId: string; skillId: string; userId: string } | { error: string; status: 400 | 403 | 404 }> {
  const workspaceId = c.req.param("workspaceId")!;
  const skillId = c.req.param("id")!;
  const userId = c.get("userId");
  const memberErr = await requireMember(workspaceId, userId);
  if (memberErr) return { error: memberErr, status: 403 };
  const target = await getSkillForWorkspace(workspaceId, skillId);
  if (!target) return { error: "Skill not found", status: 404 };
  if (target.scope === "user" && target.user_id && target.user_id !== userId) {
    return { error: "Cannot modify another user's personal skill", status: 403 };
  }
  return { workspaceId, skillId, userId };
}

// GET /:workspaceId/skills/:id/files — list companion files (no content)
skillsRoutes.get("/:workspaceId/skills/:id/files", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const skillId = c.req.param("id");
  const userId = c.get("userId");
  const memberErr = await requireMember(workspaceId, userId);
  if (memberErr) return c.json({ error: memberErr }, 403);
  const target = await getSkillForWorkspace(workspaceId, skillId);
  if (!target) return c.json({ error: "Skill not found" }, 404);

  const rows = await skills.listSkillFiles(skillId);
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      file_path: r.file_path,
      size: r.content.length,
      updated_at: r.updated_at,
    })),
  });
});

// GET /:workspaceId/skills/:id/files/:path{.+} — read one file
skillsRoutes.get("/:workspaceId/skills/:id/files/:path{.+}", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const skillId = c.req.param("id");
  const userId = c.get("userId");
  const filePath = decodeURIComponent(c.req.param("path") ?? "");
  const memberErr = await requireMember(workspaceId, userId);
  if (memberErr) return c.json({ error: memberErr }, 403);
  const target = await getSkillForWorkspace(workspaceId, skillId);
  if (!target) return c.json({ error: "Skill not found" }, 404);
  if (!isSafeFilePath(filePath)) return c.json({ error: "Invalid file path" }, 400);

  const row = await skills.getSkillFile(skillId, filePath);
  if (!row) return c.json({ error: "File not found" }, 404);
  return c.json({ data: row });
});

const upsertFileSchema = z.object({
  filePath: z.string().min(1).max(512),
  content: z.string().max(2 * 1024 * 1024), // 2 MB cap
});

// POST /:workspaceId/skills/:id/files — create or update a companion file
skillsRoutes.post(
  "/:workspaceId/skills/:id/files",
  zValidator("json", upsertFileSchema),
  async (c) => {
    const auth = await authorizeSkillFileWrite(c);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    const body = c.req.valid("json");
    if (!isSafeFilePath(body.filePath)) return c.json({ error: "Invalid file path" }, 400);
    const row = await skills.upsertSkillFile({
      skillId: auth.skillId,
      filePath: body.filePath,
      content: body.content,
    });
    return c.json({ data: row }, 201);
  },
);

// DELETE /:workspaceId/skills/:id/files/:path{.+} — delete companion file
skillsRoutes.delete("/:workspaceId/skills/:id/files/:path{.+}", async (c) => {
  const auth = await authorizeSkillFileWrite(c);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const filePath = decodeURIComponent(c.req.param("path") ?? "");
  if (!isSafeFilePath(filePath)) return c.json({ error: "Invalid file path" }, 400);
  const ok = await skills.deleteSkillFile(auth.skillId, filePath);
  if (!ok) return c.json({ error: "File not found" }, 404);
  return c.json({ data: { skillId: auth.skillId, file_path: filePath, deleted: true } });
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
