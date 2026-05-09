import { Hono } from "hono";
import { z } from "zod";
import { streamSSE } from "hono/streaming";
import type { AuthEnv } from "../../middleware/auth.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sql } from "../../db/index.js";
import { projectQueries } from "@doable/db/queries/projects";
import { deploymentQueries } from "@doable/db/queries/deployments";
import { runPipeline } from "../../deploy/pipeline.js";
import { emitActivity } from "../../lib/activity.js";

const projects = projectQueries(sql);
const deployments = deploymentQueries(sql);

export const deployTriggerRoutes = new Hono<AuthEnv>();

deployTriggerRoutes.use("/*", authMiddleware);

const deploySchema = z.object({
  adapter: z.string().default("doable-cloud"),
  environment: z
    .enum(["production", "preview"])
    .default("production"),
});

// ─── POST /deploy/:projectId ────────────────────────────────
deployTriggerRoutes.post("/:projectId", async (c) => {
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

  // Bug-112: Prevent concurrent deploys to the same project
  const existing = await deployments.findInProgress(projectId);
  if (existing) {
    return c.json(
      { error: "A deployment is already in progress for this project", deploymentId: existing.id },
      409,
    );
  }

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
        errorCode: result.errorCode,
        data: {
          deploymentId: result.deploymentId,
          buildLog: result.buildLog,
          errorMessage: result.error,
          errorCode: result.errorCode,
          buildTimeMs: result.buildTimeMs,
          deployTimeMs: result.deployTimeMs,
          durationMs: result.durationMs,
        },
      },
      500
    );
  }

  emitActivity(sql, {
    projectId,
    userId,
    eventType: "publish",
    summary: `published to ${result.url}`,
    metadata: { url: result.url, environment },
  });

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
deployTriggerRoutes.post("/:projectId/stream", async (c) => {
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
          errorCode: result.errorCode,
          buildTimeMs: result.buildTimeMs,
          durationMs: result.durationMs,
        });
      } else {
        emitActivity(sql, {
          projectId,
          userId,
          eventType: "publish",
          summary: `published to ${result.url}`,
          metadata: { url: result.url, environment },
        });

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
deployTriggerRoutes.post("/:projectId/publish", async (c) => {
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
        errorCode: result.errorCode,
        data: {
          deploymentId: result.deploymentId,
          buildLog: result.buildLog,
          errorMessage: result.error,
          errorCode: result.errorCode,
          durationMs: result.durationMs,
        },
      },
      500
    );
  }

  emitActivity(sql, {
    projectId,
    userId,
    eventType: "publish",
    summary: `published to ${result.url}`,
    metadata: { url: result.url, environment: "production" },
  });

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
deployTriggerRoutes.post("/:projectId/publish/preview", async (c) => {
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
        errorCode: result.errorCode,
        data: {
          deploymentId: result.deploymentId,
          buildLog: result.buildLog,
          errorMessage: result.error,
          errorCode: result.errorCode,
          durationMs: result.durationMs,
        },
      },
      500
    );
  }

  emitActivity(sql, {
    projectId,
    userId,
    eventType: "publish",
    summary: `published preview to ${result.url}`,
    metadata: { url: result.url, environment: "preview" },
  });

  return c.json({
    data: {
      deploymentId: result.deploymentId,
      url: result.url,
      status: result.status,
      durationMs: result.durationMs,
    },
  });
});
