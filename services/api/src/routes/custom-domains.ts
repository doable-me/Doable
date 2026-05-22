import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { customDomainQueries } from "@doable/db/queries/custom-domains";
import { projectQueries } from "@doable/db/queries/projects";
import { workspaceQueries } from "@doable/db/queries/workspaces";
import {
  addDomain,
  removeDomain,
  checkDomainStatus,
  DomainError,
} from "../services/domain-service.js";
import { PLAN_LIMITS } from "@doable/shared";

const domains = customDomainQueries(sql);
const projects = projectQueries(sql);
const workspaces = workspaceQueries(sql);

export const customDomainRoutes = new Hono<AuthEnv>({ strict: false });

customDomainRoutes.use("/*", authMiddleware);

// ─── GET /domains/project/:projectId ────────────────────
// List custom domains for a project
customDomainRoutes.get("/project/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Verify user has access to this project's workspace
  const [member] = await sql<{ role: string }[]>`
    SELECT role FROM workspace_members WHERE workspace_id = ${project.workspace_id} AND user_id = ${userId}
  `;
  if (!member) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const rows = await domains.listByProject(projectId);
  return c.json({ data: rows });
});

// ─── POST /domains/project/:projectId ───────────────────
// Add a custom domain to a project
const addDomainSchema = z.object({
  domain: z.string().min(4).max(253),
});

customDomainRoutes.post("/project/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  // Validate request body
  const body = await c.req.json().catch(() => ({}));
  const parsed = addDomainSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid domain", details: parsed.error.flatten() }, 400);
  }

  // Check plan allows custom domains
  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const workspace = await workspaces.findById(project.workspace_id);
  if (!workspace) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const planLimits = PLAN_LIMITS[workspace.plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;
  if (!planLimits.customDomains) {
    return c.json(
      { error: "Custom domains require a Pro plan or higher. Please upgrade your workspace." },
      403
    );
  }

  try {
    const domain = await addDomain({
      projectId,
      domain: parsed.data.domain,
      userId,
    });
    return c.json({ data: domain }, 201);
  } catch (err) {
    if (err instanceof DomainError) {
      return c.json({ error: err.message }, err.statusCode as any);
    }
    console.error("[custom-domains] Unexpected error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── DELETE /domains/:domainId ──────────────────────────
// Remove a custom domain
customDomainRoutes.delete("/:domainId", async (c) => {
  const domainId = c.req.param("domainId");
  const userId = c.get("userId");

  const domain = await domains.findById(domainId);
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  // Verify user owns the project and has admin/owner access
  const project = await projects.findById(domain.project_id);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  const [member] = await sql<{ role: string }[]>`
    SELECT role FROM workspace_members WHERE workspace_id = ${project.workspace_id} AND user_id = ${userId}
  `;
  if (!member || !['admin', 'owner'].includes(member.role)) {
    return c.json({ error: "Not authorized — admin or owner role required" }, 403);
  }

  try {
    await removeDomain(domainId);
    return c.json({ data: { id: domainId, removed: true } });
  } catch (err) {
    if (err instanceof DomainError) {
      return c.json({ error: err.message }, err.statusCode as any);
    }
    console.error("[custom-domains] Remove error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── POST /domains/:domainId/verify ─────────────────────
// Trigger a verification check (polls Cloudflare)
customDomainRoutes.post("/:domainId/verify", async (c) => {
  const domainId = c.req.param("domainId");

  try {
    const updated = await checkDomainStatus(domainId);
    return c.json({ data: updated });
  } catch (err) {
    if (err instanceof DomainError) {
      return c.json({ error: err.message }, err.statusCode as any);
    }
    console.error("[custom-domains] Verify error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});
