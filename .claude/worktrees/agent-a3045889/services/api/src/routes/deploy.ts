import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { deploymentQueries } from "@doable/db/queries/deployments";
import { projectQueries } from "@doable/db/queries/projects";
import { runPipeline } from "../deploy/pipeline.js";

const deployments = deploymentQueries(sql);
const projects = projectQueries(sql);

export const deployRoutes = new Hono<AuthEnv>();

deployRoutes.use("/*", authMiddleware);

// ─── POST /projects/:id/publish ────────────────────────────
const publishSchema = z.object({
  adapter: z.string().default("doable-cloud"),
});

deployRoutes.post("/:projectId/publish", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = publishSchema.safeParse(body);
  const adapter = parsed.success ? parsed.data.adapter : "doable-cloud";

  const result = await runPipeline({
    projectId,
    userId,
    environment: "production",
    adapterName: adapter,
  });

  if (result.status === "failed") {
    return c.json(
      {
        error: "Deployment failed",
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
      durationMs: result.durationMs,
    },
  });
});

// ─── POST /projects/:id/publish/preview ────────────────────
deployRoutes.post("/:projectId/publish/preview", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = publishSchema.safeParse(body);
  const adapter = parsed.success ? parsed.data.adapter : "doable-cloud";

  const result = await runPipeline({
    projectId,
    userId,
    environment: "preview",
    adapterName: adapter,
  });

  if (result.status === "failed") {
    return c.json(
      {
        error: "Preview deployment failed",
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
      durationMs: result.durationMs,
    },
  });
});

// ─── GET /projects/:id/deployments ─────────────────────────
deployRoutes.get("/:projectId/deployments", async (c) => {
  const projectId = c.req.param("projectId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const page = parseInt(c.req.query("page") ?? "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") ?? "20", 10);
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

// ─── GET /projects/:id/deployments/:deploymentId ───────────
deployRoutes.get("/:projectId/deployments/:deploymentId", async (c) => {
  const deploymentId = c.req.param("deploymentId");

  const deployment = await deployments.findById(deploymentId);
  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404);
  }

  return c.json({ data: deployment });
});
