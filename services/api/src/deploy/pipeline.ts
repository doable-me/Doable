import path from "node:path";
import { sql } from "../db/index.js";
import { deploymentQueries } from "@doable/db/queries/deployments";
import { projectQueries } from "@doable/db/queries/projects";
import { workspaceQueries } from "@doable/db/queries/workspaces";
import { runBuild } from "./builder.js";
import type { DeployAdapter } from "./adapter.js";
import { DoableCloudAdapter } from "./adapters/doable-cloud.js";

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
}

export interface PipelineResult {
  deploymentId: string;
  url: string;
  status: "live" | "failed";
  buildLog: string;
  durationMs: number;
  error?: string;
}

/**
 * Orchestrates the full deploy pipeline:
 * 1. Create deployment record (queued)
 * 2. Run Vite build
 * 3. Copy to serving directory via adapter
 * 4. Update deployment status
 * 5. Update project published URL
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { projectId, userId, environment, adapterName = "doable-cloud" } = input;
  const start = Date.now();

  // Validate project exists
  const project = await projects.findById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const workspace = await workspaces.findById(project.workspace_id);
  if (!workspace) {
    throw new Error(`Workspace not found: ${project.workspace_id}`);
  }

  const adapter = getAdapter(adapterName);

  // 1. Create deployment record
  const deployment = await deployments.create({
    projectId,
    environment,
    adapter: adapterName,
    deployedBy: userId,
  });

  try {
    // 2. Update status to building
    await deployments.updateStatus(deployment.id, "building");

    // 3. Run build
    const projectDir = path.join(PROJECTS_ROOT, projectId);
    const buildResult = await runBuild(projectDir);

    if (!buildResult.success) {
      await deployments.updateStatus(deployment.id, "failed", {
        buildLog: buildResult.log,
        errorMessage: buildResult.error,
      });

      return {
        deploymentId: deployment.id,
        url: "",
        status: "failed",
        buildLog: buildResult.log,
        durationMs: Date.now() - start,
        error: buildResult.error,
      };
    }

    // 4. Deploy via adapter
    await deployments.updateStatus(deployment.id, "deploying");

    const deployResult = await adapter.deploy({
      projectId,
      projectSlug: project.slug,
      workspaceSlug: workspace.slug,
      buildOutputDir: buildResult.outputDir,
      environment,
    });

    // 5. Update deployment to live
    await deployments.updateStatus(deployment.id, "live", {
      url: deployResult.url,
      buildLog: buildResult.log,
    });

    // 6. Update project published URL (production only)
    if (environment === "production") {
      await projects.update(projectId, {
        publishedUrl: deployResult.url,
        status: "published",
      });
    }

    return {
      deploymentId: deployment.id,
      url: deployResult.url,
      status: "live",
      buildLog: buildResult.log,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await deployments.updateStatus(deployment.id, "failed", {
      errorMessage,
    });

    return {
      deploymentId: deployment.id,
      url: "",
      status: "failed",
      buildLog: "",
      durationMs: Date.now() - start,
      error: errorMessage,
    };
  }
}
