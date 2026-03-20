import { Hono } from "hono";
import { z } from "zod";
import { streamSSE } from "hono/streaming";
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

// ─── POST /deploy/:projectId ────────────────────────────────
// Trigger a deployment (env: test|live via body.environment)
const deploySchema = z.object({
  adapter: z.string().default("doable-cloud"),
  environment: z
    .enum(["production", "preview"])
    .default("production"),
});

deployRoutes.post("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = deploySchema.safeParse(body);
  const adapter = parsed.success ? parsed.data.adapter : "doable-cloud";
  const environment = parsed.success ? parsed.data.environment : "production";

  const result = await runPipeline({
    projectId,
    userId,
    environment,
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
          buildTimeMs: result.buildTimeMs,
          deployTimeMs: result.deployTimeMs,
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
      buildTimeMs: result.buildTimeMs,
      deployTimeMs: result.deployTimeMs,
      durationMs: result.durationMs,
    },
  });
});

// ─── POST /deploy/:projectId/stream ─────────────────────────
// Trigger deployment with streaming build logs via SSE
deployRoutes.post("/:projectId/stream", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = deploySchema.safeParse(body);
  const adapter = parsed.success ? parsed.data.adapter : "doable-cloud";
  const environment = parsed.success ? parsed.data.environment : "production";

  return streamSSE(c, async (stream) => {
    const sendEvent = async (
      event: string,
      payload: Record<string, unknown>
    ) => {
      await stream.writeSSE({
        event,
        data: JSON.stringify(payload),
      });
    };

    await sendEvent("status", { step: "building", message: "Starting build..." });

    try {
      const result = await runPipeline({
        projectId,
        userId,
        environment,
        adapterName: adapter,
        onBuildLog: async (chunk: string) => {
          await sendEvent("log", { text: chunk });
        },
      });

      if (result.status === "failed") {
        await sendEvent("error", {
          deploymentId: result.deploymentId,
          buildLog: result.buildLog,
          errorMessage: result.error,
          buildTimeMs: result.buildTimeMs,
          durationMs: result.durationMs,
        });
      } else {
        await sendEvent("complete", {
          deploymentId: result.deploymentId,
          url: result.url,
          status: result.status,
          buildTimeMs: result.buildTimeMs,
          deployTimeMs: result.deployTimeMs,
          durationMs: result.durationMs,
        });
      }
    } catch (err) {
      await sendEvent("error", {
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }

    await sendEvent("done", {});
  });
});

// ─── Legacy routes (kept for backward compatibility) ─────────

// POST /deploy/:projectId/publish
deployRoutes.post("/:projectId/publish", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = deploySchema.safeParse(body);
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

// POST /deploy/:projectId/publish/preview
deployRoutes.post("/:projectId/publish/preview", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = deploySchema.safeParse(body);
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

// ─── GET /deploy/:projectId/status ──────────────────────────
// Get the latest deployment status for a project
deployRoutes.get("/:projectId/status", async (c) => {
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
// List past deployments
deployRoutes.get("/:projectId/history", async (c) => {
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

// ─── GET /deploy/:projectId/deployments (alias for history) ──
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

// ─── GET /deploy/:projectId/deployments/:deploymentId ────────
deployRoutes.get("/:projectId/deployments/:deploymentId", async (c) => {
  const deploymentId = c.req.param("deploymentId");

  const deployment = await deployments.findById(deploymentId);
  if (!deployment) {
    return c.json({ error: "Deployment not found" }, 404);
  }

  return c.json({ data: deployment });
});

// ─── POST /deploy/:projectId/rollback/:deploymentId ──────────
// Rollback to a previous deployment by re-deploying its artifacts
deployRoutes.post("/:projectId/rollback/:deploymentId", async (c) => {
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

  // Re-deploy by running a fresh pipeline
  // (In a more advanced version, we'd re-use cached build artifacts)
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
