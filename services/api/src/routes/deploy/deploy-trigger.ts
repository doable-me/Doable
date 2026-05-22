import { Hono } from "hono";
import { z } from "zod";
import { streamSSE } from "hono/streaming";
import type { AuthEnv } from "../../middleware/auth.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sql } from "../../db/index.js";
import { projectQueries } from "@doable/db/queries/projects";
import { deploymentQueries } from "@doable/db/queries/deployments";
import { runPipeline } from "../../deploy/pipeline.js";
import {
  computeSitePublishLocation,
  deleteCloudflareDns,
  getPublishedSiteDir,
} from "../../deploy/adapters/doable-cloud.js";
import { rm } from "node:fs/promises";
import { emitActivity } from "../../lib/activity.js";
import {
  platformSettingQueries,
  PLATFORM_SETTING_KEYS,
  parseDnsMode,
} from "@doable/db";

const projects = projectQueries(sql);
const deployments = deploymentQueries(sql);
const platformSettings = platformSettingQueries(sql);

export const deployTriggerRoutes = new Hono<AuthEnv>({ strict: false });

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
    // BUG-API-019: user-input build failures return 422, not 500.
    // BUG-2026-05-14-publish-001: storage-misconfig returns 503 (retriable),
    //   never leaks the raw SITES_DIR path to the end user.
    const isUserError = result.errorCode === "build_failed_compile";
    const isStorageOutage = result.errorCode === "sites_dir_unwritable";
    const httpStatus = isStorageOutage ? 503 : isUserError ? 422 : 500;
    return c.json(
      {
        error: isStorageOutage ? "Publishing temporarily unavailable" : "Deployment failed",
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
      httpStatus,
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

// ─── DELETE /deploy/:projectId/publish ───────────────────────
// Take down a published site. Removes the on-disk Caddy directory, deletes
// the per-publish Cloudflare CNAME (idempotent), and clears the project's
// published_url + status. The `subdomain` column is intentionally NOT
// cleared so a future republish reuses the same URL.
deployTriggerRoutes.delete("/:projectId/publish", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!project.subdomain) {
    return c.json({ error: "Project is not published" }, 409);
  }

  // Block concurrent deploys — unpublish on top of an in-flight build
  // would leave the system in an inconsistent state.
  const inFlight = await deployments.findInProgress(projectId);
  if (inFlight) {
    return c.json(
      { error: "A deployment is in progress; wait for it to finish before unpublishing", deploymentId: inFlight.id },
      409,
    );
  }

  const subdomain = project.subdomain;
  const prodLoc = computeSitePublishLocation(subdomain, "production");
  const previewLoc = computeSitePublishLocation(subdomain, "preview");

  let dnsError: string | null = null;
  let filesError: string | null = null;

  // Resolve the platform's DNS mode. In wildcard mode there is no
  // per-publish CNAME to remove — the admin-managed wildcard CNAME stays
  // in place and the hostname will simply 404 once the on-disk site dir
  // is gone.
  const dnsMode = parseDnsMode(await platformSettings.get(PLATFORM_SETTING_KEYS.DNS_MODE));

  if (dnsMode === "per_publish") {
    // Delete CNAMEs for both production and preview. deleteCloudflareDns
    // silently no-ops if CF env vars are unset or the record is already gone.
    try {
      await Promise.all([
        deleteCloudflareDns(prodLoc.hostname),
        deleteCloudflareDns(previewLoc.hostname),
      ]);
    } catch (err) {
      dnsError = err instanceof Error ? err.message : String(err);
      console.warn(`[unpublish] DNS cleanup failed for ${projectId}:`, dnsError);
    }
  }

  // Remove on-disk site directories. Continue even if one removal fails so
  // the DB state still gets cleared.
  for (const env of ["production", "preview"] as const) {
    try {
      await rm(getPublishedSiteDir(subdomain, env), { recursive: true, force: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[unpublish] Failed to remove ${env} site dir for ${projectId}:`, msg);
      filesError = filesError ? `${filesError}; ${msg}` : msg;
    }
  }

  await projects.update(projectId, { publishedUrl: null, status: "draft" });

  emitActivity(sql, {
    projectId,
    userId,
    eventType: "unpublish",
    summary: `unpublished ${prodLoc.url}`,
    metadata: { previousUrl: prodLoc.url, subdomain },
  });

  return c.json({
    data: {
      subdomain,
      removedHostnames: [prodLoc.hostname, previewLoc.hostname],
      dnsError,
      filesError,
    },
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
    // BUG-API-019: empty/invalid projects produce build failures that are
    // user errors (bad input), not server errors. Return 422 Unprocessable
    // Entity so monitoring doesn't false-alarm on these. Compile failures
    // (`build_failed_compile`) are user-facing — the user's source code or
    // a missing entry file caused the build to fail.
    // BUG-2026-05-14-publish-001: storage-misconfig returns 503.
    const isUserError = result.errorCode === "build_failed_compile";
    const isStorageOutage = result.errorCode === "sites_dir_unwritable";
    const httpStatus = isStorageOutage ? 503 : isUserError ? 422 : 500;
    return c.json(
      {
        error: isStorageOutage ? "Publishing temporarily unavailable" : "Deployment failed",
        errorCode: result.errorCode,
        data: {
          deploymentId: result.deploymentId,
          buildLog: result.buildLog,
          errorMessage: result.error,
          errorCode: result.errorCode,
          durationMs: result.durationMs,
        },
      },
      httpStatus,
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
    // BUG-2026-05-14-publish-001: 503 for storage-misconfig, 422 for user
    // compile failures, 500 otherwise — same mapping as the production path.
    const isUserError = result.errorCode === "build_failed_compile";
    const isStorageOutage = result.errorCode === "sites_dir_unwritable";
    const httpStatus = isStorageOutage ? 503 : isUserError ? 422 : 500;
    return c.json(
      {
        error: isStorageOutage ? "Publishing temporarily unavailable" : "Preview deployment failed",
        errorCode: result.errorCode,
        data: {
          deploymentId: result.deploymentId,
          buildLog: result.buildLog,
          errorMessage: result.error,
          errorCode: result.errorCode,
          durationMs: result.durationMs,
        },
      },
      httpStatus,
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
