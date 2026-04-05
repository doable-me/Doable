import path from "node:path";
import { sql } from "../db/index.js";
import { deploymentQueries } from "@doable/db/queries/deployments";
import { projectQueries } from "@doable/db/queries/projects";
import { workspaceQueries } from "@doable/db/queries/workspaces";
import { runBuild, type BuildLogCallback } from "./builder.js";
import type { DeployAdapter } from "./adapter.js";
import {
  DoableCloudAdapter,
  generateSubdomain,
} from "./adapters/doable-cloud.js";

const deployments = deploymentQueries(sql);
const projects = projectQueries(sql);
const workspaces = workspaceQueries(sql);

const PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? "/data/projects";

// ─── Adapter Registry ──────────────────────────────────────
const adapters: Record<string, DeployAdapter> = {
  "doable-cloud": new DoableCloudAdapter(),
};

export function getAdapter(name: string): DeployAdapter {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Unknown deploy adapter: ${name}`);
  }
  return adapter;
}

export function registerAdapter(adapter: DeployAdapter): void {
  adapters[adapter.name] = adapter;
}

// ─── Deploy Pipeline ───────────────────────────────────────
export interface PipelineInput {
  projectId: string;
  userId: string;
  environment: "preview" | "production";
  adapterName?: string;
  /** Optional callback for streaming build logs to the client */
  onBuildLog?: BuildLogCallback;
}

export interface PipelineResult {
  deploymentId: string;
  url: string;
  status: "live" | "failed";
  buildLog: string;
  buildTimeMs: number;
  deployTimeMs: number;
  durationMs: number;
  error?: string;
}

/**
 * Orchestrates the full deploy pipeline:
 * 1. Validate project exists and has a subdomain (generate if first publish)
 * 2. Create deployment record (queued)
 * 3. Run Vite build
 * 4. Copy to serving directory via adapter
 * 5. Track deployed artifacts
 * 6. Update deployment status and project published URL
 */
export async function runPipeline(
  input: PipelineInput
): Promise<PipelineResult> {
  const {
    projectId,
    userId,
    environment,
    adapterName = "doable-cloud",
    onBuildLog,
  } = input;
  const pipelineStart = Date.now();

  // ── 0. Validate project exists ──────────────────────────
  const project = await projects.findById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const workspace = await workspaces.findById(project.workspace_id);
  if (!workspace) {
    throw new Error(`Workspace not found: ${project.workspace_id}`);
  }

  const adapter = getAdapter(adapterName);

  // ── 1. Ensure subdomain exists (generate on first publish) ──
  let subdomain = project.subdomain;
  if (!subdomain) {
    const MAX_RETRIES = 5;
    for (let i = 0; i < MAX_RETRIES; i++) {
      const candidate = generateSubdomain(project.name);
      const existing = await projects.findBySubdomain(candidate);
      if (!existing) {
        subdomain = candidate;
        break;
      }
    }
    if (!subdomain) {
      // Fallback: use projectId prefix
      subdomain = projectId.slice(0, 8);
    }
    await projects.update(projectId, { subdomain });
  }

  // ── 2. Create deployment record ────────────────────────
  const deployment = await deployments.create({
    projectId,
    environment,
    adapter: adapterName,
    deployedBy: userId,
  });

  try {
    // ── 3. Build ─────────────────────────────────────────
    await deployments.updateStatus(deployment.id, "building");
    onBuildLog?.("Starting build...\n");

    const buildStart = Date.now();
    const projectDir = path.join(PROJECTS_ROOT, projectId);
    const buildResult = await runBuild(projectDir, onBuildLog, { projectId, target: environment as "development" | "preview" | "production" });
    const buildTimeMs = Date.now() - buildStart;

    if (!buildResult.success) {
      await deployments.updateStatus(deployment.id, "failed", {
        buildLog: buildResult.log,
        errorMessage: buildResult.error,
        buildTimeMs,
      });

      return {
        deploymentId: deployment.id,
        url: "",
        status: "failed",
        buildLog: buildResult.log,
        buildTimeMs,
        deployTimeMs: 0,
        durationMs: Date.now() - pipelineStart,
        error: buildResult.error,
      };
    }

    // ── 4. Deploy via adapter ────────────────────────────
    await deployments.updateStatus(deployment.id, "deploying", { buildTimeMs });
    onBuildLog?.("Deploying...\n");

    const deployStart = Date.now();
    const deployResult = await adapter.deploy({
      projectId,
      projectSlug: project.slug,
      workspaceSlug: workspace.slug,
      subdomain,
      buildOutputDir: buildResult.outputDir,
      environment,
    });
    const deployTimeMs = Date.now() - deployStart;

    // ── 5. Track artifacts ───────────────────────────────
    if (deployResult.files && deployResult.files.length > 0) {
      try {
        await deployments.createArtifacts(deployment.id, deployResult.files);
      } catch (err) {
        // Non-fatal: artifact tracking failure should not break deployment
        console.warn(
          `[pipeline] Failed to track artifacts for deployment ${deployment.id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // ── 6. Update deployment to live ─────────────────────
    await deployments.updateStatus(deployment.id, "live", {
      url: deployResult.url,
      buildLog: buildResult.log,
      buildTimeMs,
      deployTimeMs,
    });

    // ── 7. Update project published URL (production only) ─
    if (environment === "production") {
      await projects.update(projectId, {
        publishedUrl: deployResult.url,
        status: "published",
      });
    }

    onBuildLog?.(`\nDeployed to ${deployResult.url}\n`);

    return {
      deploymentId: deployment.id,
      url: deployResult.url,
      status: "live",
      buildLog: buildResult.log,
      buildTimeMs,
      deployTimeMs,
      durationMs: Date.now() - pipelineStart,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    onBuildLog?.(`\nERROR: ${errorMessage}\n`);

    await deployments.updateStatus(deployment.id, "failed", {
      errorMessage,
    });

    return {
      deploymentId: deployment.id,
      url: "",
      status: "failed",
      buildLog: "",
      buildTimeMs: 0,
      deployTimeMs: 0,
      durationMs: Date.now() - pipelineStart,
      error: errorMessage,
    };
  }
}
