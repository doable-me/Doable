import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sql } from "../../db/index.js";
import { deploymentQueries } from "@doable/db/queries/deployments";
import { projectQueries } from "@doable/db/queries/projects";
import { runPipeline } from "../../deploy/pipeline.js";

const deployments = deploymentQueries(sql);
const projects = projectQueries(sql);

export const deployQueryRoutes = new Hono<AuthEnv>({ strict: false });

deployQueryRoutes.use("/*", authMiddleware);

// ─── GET /deploy/:projectId/status ──────────────────────────
deployQueryRoutes.get("/:projectId/status", async (c) => {
  const projectId = c.req.param("projectId");
  const environment = c.req.query("environment") ?? "production";

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const deployment = await deployments.getLatestLive(projectId, environment);

  return c.json({
    data: deployment ?? null,
    publishedUrl: project.published_url,
    subdomain: project.subdomain,
  });
});

// ─── GET /deploy/:projectId/history ─────────────────────────
deployQueryRoutes.get("/:projectId/history", async (c) => {
  const projectId = c.req.param("projectId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const pageSize = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "20", 10) || 20, 1), 100);
  const environment = c.req.query("environment");

  const { rows, total } = await deployments.listByProject(projectId, {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    environment,
  });

  return c.json({
    data: rows,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// ─── GET /deploy/:projectId/deployments (alias for history) ──
deployQueryRoutes.get("/:projectId/deployments", async (c) => {
  const projectId = c.req.param("projectId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const pageSize = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "20", 10) || 20, 1), 100);
  const environment = c.req.query("environment");

  const { rows, total } = await deployments.listByProject(projectId, {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    environment,
  });

  return c.json({
    data: rows,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// ─── GET /deploy/:projectId/deployments/:deploymentId ────────
deployQueryRoutes.get("/:projectId/deployments/:deploymentId", async (c) => {
  const deploymentId = c.req.param("deploymentId");

  const deployment = await deployments.findById(deploymentId);
  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404);
  }

  return c.json({ data: deployment });
});

// ─── POST /deploy/:projectId/rollback/:deploymentId ──────────
deployQueryRoutes.post("/:projectId/rollback/:deploymentId", async (c) => {
  const projectId = c.req.param("projectId");
  const deploymentId = c.req.param("deploymentId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Find the target deployment to rollback to
  const targetDeployment = await deployments.findById(deploymentId);
  if (!targetDeployment) {
    return c.json({ error: "Deployment not found" }, 404);
  }

  if (targetDeployment.project_id !== projectId) {
    return c.json({ error: "Deployment does not belong to this project" }, 400);
  }

  if (targetDeployment.status !== "live" && targetDeployment.status !== "rolled_back") {
    return c.json(
      { error: "Can only rollback to a previously successful deployment" },
      400
    );
  }

  // Mark the current live deployment as rolled_back
  const currentLive = await deployments.getLatestLive(
    projectId,
    targetDeployment.environment
  );
  if (currentLive && currentLive.id !== deploymentId) {
    await deployments.rollback(currentLive.id, userId);
  }

  // Bug-112: Prevent concurrent deploys
  const existing = await deployments.findInProgress(projectId);
  if (existing) {
    return c.json(
      { error: "A deployment is already in progress for this project", deploymentId: existing.id },
      409,
    );
  }

  // Re-deploy by running a fresh pipeline
  const result = await runPipeline({
    projectId,
    userId,
    environment: targetDeployment.environment as "preview" | "production",
    adapterName: targetDeployment.adapter,
  });

  if (result.status === "failed") {
    return c.json(
      {
        error: "Rollback deployment failed",
        data: {
          deploymentId: result.deploymentId,
          buildLog: result.buildLog,
          errorMessage: result.error,
          durationMs: result.durationMs,
        },
      },
      500
    );
  }

  return c.json({
    data: {
      deploymentId: result.deploymentId,
      url: result.url,
      status: result.status,
      rolledBackFrom: currentLive?.id,
      rolledBackTo: deploymentId,
      durationMs: result.durationMs,
    },
  });
});
