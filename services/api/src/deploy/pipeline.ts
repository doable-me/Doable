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
  computeSitePublishLocation,
} from "./adapters/doable-cloud.js";
import { defaultRegistry } from "../frameworks/registry.js";
import { nodeStandaloneAdapter } from "../runtime/adapters/node-standalone.js";
import { staticFilesAdapter } from "../runtime/adapters/static-files.js";
import { addProcessRoute, caddyAdminAvailable } from "../runtime/caddy-admin.js";
import type { RuntimeAdapter, RuntimeContext } from "../runtime/types.js";

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
    // Compute publish URL & base path BEFORE build so Vite emits assets
    // with the correct base href when path-based hosting is enabled.
    const publishLoc = computeSitePublishLocation(subdomain, environment);
    // Pass userId so the build env picks up vault-backed integration
    // credentials for the deploying user (Phase 1C/1D of the integration↔AI
    // chat bridge). User env_vars still override vault values on collision.
    const buildResult = await runBuild(projectDir, onBuildLog, {
      projectId,
      target: environment as "development" | "preview" | "production",
      userId,
      basePath: publishLoc.basePath,
    });
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
      basePath: publishLoc.basePath,
    });
    const deployTimeMs = Date.now() - deployStart;

    // ── 4b. Per-project runtime registration (PRD 06 Phase 5) ────
    // Look up the framework adapter for this project; if it requires a
    // long-lived process (Next.js, Nuxt, SvelteKit, etc.), bring up the
    // runtime adapter, register the per-host Caddy reverse_proxy route,
    // and INSERT a project_runtime row. Failures here do NOT roll back
    // the deploy — file copy is still useful for static-export fallback.
    try {
      await registerRuntimeForDeploy({
        projectId,
        projectSlug: subdomain,
        workspaceSlug: workspace.slug,
        siteDir: path.join(process.env.SITES_DIR ?? "/data/sites", subdomain, environment === "preview" ? "test" : "live"),
        projectDir: path.join(PROJECTS_ROOT, projectId),
        frameworkId: (project as { framework_id?: string }).framework_id ?? "vite-react",
        userId,
        publicHostname: new URL(deployResult.url).hostname,
      });
    } catch (err) {
      console.warn(
        `[pipeline] Runtime registration warning for ${projectId}:`,
        err instanceof Error ? err.message : err,
      );
    }

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

// ─── Runtime registration helper (Phase 5) ────────────────

interface RegisterRuntimeInput {
  projectId: string;
  projectSlug: string;
  workspaceSlug: string;
  siteDir: string;
  projectDir: string;
  frameworkId: string;
  userId: string | null;
  publicHostname: string;
}

/**
 * Bring up the per-project runtime after deploy. Picks the right
 * RuntimeAdapter based on the FrameworkAdapter's capabilities, calls
 * start() to write the systemd drop-in (no-op for static), registers a
 * Caddy reverse_proxy route for process-kind apps, and upserts the
 * project_runtime row.
 *
 * Failures are non-fatal — file copy already succeeded, so the static
 * fallback path still serves something. The supervisor (PRD 06 §4.4
 * follow-up) will reconcile state on next boot.
 */
async function registerRuntimeForDeploy(input: RegisterRuntimeInput): Promise<void> {
  const fwEntry = defaultRegistry.get(input.frameworkId);
  if (!fwEntry) {
    // Unknown framework — fall back to static-files adapter so we still
    // get a project_runtime row, but skip Caddy admin call.
    await upsertRuntimeRow({
      projectId: input.projectId,
      frameworkId: input.frameworkId,
      runtimeKind: "static",
      listenKind: null,
      listenAddr: null,
      systemdUnit: null,
    });
    return;
  }

  const isProcess = fwEntry.adapter.capabilities.has("requires-long-lived-process");
  const runtime: RuntimeAdapter = isProcess ? nodeStandaloneAdapter : staticFilesAdapter;

  const ctx: RuntimeContext = {
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    workspaceSlug: input.workspaceSlug,
    siteDir: input.siteDir,
    projectDir: input.projectDir,
    framework: { id: input.frameworkId },
    env: {},
    listen: isProcess
      ? { kind: "unix-socket", path: `/run/doable/${input.projectSlug}.sock` }
      : { kind: "tcp-port", host: "127.0.0.1", port: 0 },
    userId: input.userId,
  };

  const handle = await runtime.start(ctx);

  // For process-kind, also insert a per-host Caddy route so traffic to
  // the public hostname reverse-proxies to the unix socket. Skip silently
  // when the admin API isn't reachable (dev environment, etc.).
  if (isProcess && (await caddyAdminAvailable())) {
    await addProcessRoute({
      slug: input.projectSlug,
      hostname: input.publicHostname,
      upstream: { kind: "unix-socket", path: handle.listenAddr },
    });
  }

  await upsertRuntimeRow({
    projectId: input.projectId,
    frameworkId: input.frameworkId,
    runtimeKind: isProcess ? "process" : "static",
    listenKind: isProcess ? "unix-socket" : null,
    listenAddr: isProcess ? handle.listenAddr : null,
    systemdUnit: isProcess ? handle.id : null,
  });
}

interface UpsertRuntimeRowInput {
  projectId: string;
  frameworkId: string;
  runtimeKind: "static" | "process";
  listenKind: "unix-socket" | "tcp-port" | null;
  listenAddr: string | null;
  systemdUnit: string | null;
}

async function upsertRuntimeRow(row: UpsertRuntimeRowInput): Promise<void> {
  await sql`
    INSERT INTO project_runtime (
      project_id, framework_id, runtime_kind,
      listen_kind, listen_addr, systemd_unit,
      state, last_started_at, updated_at
    ) VALUES (
      ${row.projectId}, ${row.frameworkId}, ${row.runtimeKind},
      ${row.listenKind}, ${row.listenAddr}, ${row.systemdUnit},
      'running', now(), now()
    )
    ON CONFLICT (project_id) DO UPDATE SET
      framework_id  = EXCLUDED.framework_id,
      runtime_kind  = EXCLUDED.runtime_kind,
      listen_kind   = EXCLUDED.listen_kind,
      listen_addr   = EXCLUDED.listen_addr,
      systemd_unit  = EXCLUDED.systemd_unit,
      state         = 'running',
      last_started_at = now(),
      updated_at      = now()
  `;
}
