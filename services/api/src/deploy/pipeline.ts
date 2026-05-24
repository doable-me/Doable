import path from "node:path";
import { sql } from "../db/index.js";
import { deploymentQueries } from "@doable/db/queries/deployments";
import { projectQueries } from "@doable/db/queries/projects";
import { workspaceQueries } from "@doable/db/queries/workspaces";
import {
  platformSettingQueries,
  PLATFORM_SETTING_KEYS,
  parseDnsMode,
} from "@doable/db";
import { runBuild, type BuildLogCallback, type BuildErrorCode } from "./builder.js";
import type { DeployAdapter } from "./adapter.js";
import {
  DoableCloudAdapter,
  generateSubdomain,
  registerCloudflareDns,
  SitesDirUnwritableError,
} from "./adapters/doable-cloud.js";
import { DoablePathAdapter } from "./adapters/doable-path.js";
import {
  resolvePublishTopology,
  computePublishLocation,
  adapterNameForTopology,
} from "./topology.js";
import { defaultRegistry } from "../frameworks/registry.js";
import { nodeStandaloneAdapter } from "../runtime/adapters/node-standalone.js";
import { pythonAsgiAdapter } from "../runtime/adapters/python-asgi.js";
import { staticFilesAdapter } from "../runtime/adapters/static-files.js";
import { allocateProcessPort } from "../runtime/port-allocator.js";
import { getEffectiveCfApiToken } from "../lib/cloudflare-token.js";
import { addProcessRoute, caddyAdminAvailable } from "../runtime/caddy-admin.js";
import type { RuntimeAdapter, RuntimeContext } from "../runtime/types.js";
import { getProjectPath } from "../ai/project-files.js";
import { ensurePublishKey, injectDataToken } from "./auto-api-key.js";
import { linkDoableSdk } from "../projects/link-sdk.js";

const deployments = deploymentQueries(sql);
const projects = projectQueries(sql);
const workspaces = workspaceQueries(sql);
const platformSettings = platformSettingQueries(sql);

/**
 * Resolve the configured DNS mode. Returns "per_publish" if the
 * platform_settings table is missing or no value is set, so behaviour is
 * unchanged on installs that haven't opted in.
 */
async function getDnsMode(): Promise<"per_publish" | "wildcard"> {
  const raw = await platformSettings.get(PLATFORM_SETTING_KEYS.DNS_MODE);
  return parseDnsMode(raw);
}

// ─── Adapter Registry ──────────────────────────────────────
const adapters: Record<string, DeployAdapter> = {
  "doable-cloud": new DoableCloudAdapter(),
  "doable-path": new DoablePathAdapter(),
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

/**
 * Closed-set pipeline-level error codes that aren't build failures. Build
 * errors flow through {@link BuildErrorCode}; deploy/runtime/config failures
 * use these. Keep narrow so the route layer can map each to a stable HTTP
 * status without growing a giant switch.
 */
export type PipelineErrorCode =
  | BuildErrorCode
  | "sites_dir_unwritable";

export interface PipelineResult {
  deploymentId: string;
  url: string;
  status: "live" | "failed";
  buildLog: string;
  buildTimeMs: number;
  deployTimeMs: number;
  durationMs: number;
  error?: string;
  /** Closed-set code surfaced from the build step; absent on success. */
  errorCode?: PipelineErrorCode;
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

  // ── Resolve publish topology (subdomain vs path) ─────────
  // Auto-detects from available infra: subdomain hosting when a Cloudflare
  // Tunnel or an admin-managed wildcard CNAME exists, else path-based hosting
  // (works out-of-the-box on a single-domain install with one cert). Forced
  // by PUBLISH_MODE. The chosen topology drives the URL, the build's --base,
  // and which adapter copies the files.
  const dnsMode = await getDnsMode();
  const topology = resolvePublishTopology({
    publishMode: process.env.PUBLISH_MODE,
    hasTunnel: !!process.env.CLOUDFLARED_TUNNEL_ID,
    dnsMode,
  });
  // The deploy UI and legacy clients hardcode adapterName="doable-cloud" as a
  // default, so we can't treat its presence as an explicit topology choice.
  // Treat both unset AND the legacy "doable-cloud" default as "auto" — let the
  // resolved topology pick the adapter. An explicit NON-default adapter (e.g. a
  // future "cloudflare-pages") is still honored; forcing subdomain on a
  // path-default box is done with PUBLISH_MODE=subdomain.
  const requestedAdapter = input.adapterName;
  const adapterName =
    requestedAdapter && requestedAdapter !== "doable-cloud"
      ? requestedAdapter
      : adapterNameForTopology(topology);
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
    // ── 2b. Ensure publish key + capture data token BEFORE build ─────
    // The @doable/data SDK in the built app authenticates to /__doable/data/*
    // with a client-tier key it reads from globalThis.__DOABLE_DATA_TOKEN. We
    // provision (first publish) or recover (subsequent) that key here — binding
    // the current publish origin so the key isn't origin-rejected when the app
    // moves between topologies — and inject it into the built index.html after
    // the build (see injectDataToken below). Doing this platform-side means a
    // published app reaches its own database even when the generated app didn't
    // wire VITE_DOABLE_PROJECT_KEY itself. Non-fatal: a failure here just leaves
    // the published app without DB access, it doesn't block the deploy.
    let publishDataToken: string | null = null;
    try {
      const publishLoc = computePublishLocation(subdomain, environment, topology);
      const provisioned = await ensurePublishKey({
        projectId,
        userId,
        projectDir: getProjectPath(projectId),
        publishedUrl: publishLoc.url,
      });
      publishDataToken = provisioned?.key ?? null;
    } catch (err) {
      console.warn(
        `[pipeline] Publish key provisioning failed for ${projectId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    // ── 2c. Pre-register DNS BEFORE build ────────────────
    // Create the Cloudflare CNAME now so DNS propagates during the
    // 30-60s build. By the time the user clicks the deploy URL,
    // their ISP will have already resolved the hostname.
    //
    // Skipped when the platform admin has configured DNS_MODE=wildcard:
    // an admin-managed wildcard CNAME (e.g. *.doable.me) is expected to
    // already cover the published hostname, so no per-publish API call
    // is needed (and the CF API token may not even be set). Also skipped
    // entirely under the path topology — there are no per-publish hostnames.
    const cfToken = await getEffectiveCfApiToken();
    if (
      topology === "subdomain" &&
      dnsMode === "per_publish" &&
      process.env.CLOUDFLARED_TUNNEL_ID &&
      cfToken
    ) {
      const earlyLoc = computePublishLocation(subdomain, environment, topology);
      if (earlyLoc.hostname) {
        registerCloudflareDns(
          process.env.CLOUDFLARED_TUNNEL_ID,
          earlyLoc.hostname,
        ).catch((err) => {
          console.warn(
            `[pipeline] Early DNS registration failed for ${earlyLoc.hostname}:`,
            err instanceof Error ? err.message : err,
          );
        });
        // Fire-and-forget — don't await; let it run in parallel with the build
      }
    }

    // ── 3. Build ─────────────────────────────────────────
    await deployments.updateStatus(deployment.id, "building");
    onBuildLog?.("Starting build...\n");

    const buildStart = Date.now();
    const projectDir = getProjectPath(projectId);

    // Ensure latest SDK is linked before build
    try { await linkDoableSdk(projectDir); } catch { /* non-fatal */ }

    // Compute publish URL & base path BEFORE build so Vite emits assets
    // with the correct base href when path-based hosting is enabled.
    const publishLoc = computePublishLocation(subdomain, environment, topology);
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
        errorCode: buildResult.errorCode,
      };
    }

    // ── 3b. Bake the per-app DB token into the built index.html ──────
    // Must run AFTER the build (operates on the emitted index.html) and BEFORE
    // the adapter copies the output to its serving directory. Sets
    // window.__DOABLE_DATA_TOKEN so the @doable/data SDK authenticates from the
    // published origin. No-op for non-SPA output or when no token is available.
    if (publishDataToken) {
      try {
        await injectDataToken(buildResult.outputDir, publishDataToken);
      } catch (err) {
        console.warn(
          `[pipeline] Data-token injection failed for ${projectId}:`,
          err instanceof Error ? err.message : err,
        );
      }
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
      skipDnsRegistration: dnsMode === "wildcard",
    });
    const deployTimeMs = Date.now() - deployStart;

    // ── 4b. Per-project runtime registration (PRD 06 Phase 5) ────
    // Look up the framework adapter for this project; if it requires a
    // long-lived process (Next.js, Nuxt, SvelteKit, etc.), bring up the
    // runtime adapter, register the per-host Caddy reverse_proxy route,
    // and INSERT a project_runtime row. Failures here do NOT roll back
    // the deploy — file copy is still useful for static-export fallback.
    //
    // Subdomain topology only: a per-process runtime is reverse-proxied by
    // public HOSTNAME, which only exists when each app has its own subdomain.
    // Under the path topology v1 we serve static SPA output off the shared
    // domain (no per-host route), so registering one here would wrongly bind
    // the main domain. Process-kind apps need the subdomain topology.
    if (topology === "subdomain") {
      try {
        await registerRuntimeForDeploy({
          projectId,
          projectSlug: subdomain,
          workspaceSlug: workspace.slug,
          siteDir: path.join(process.env.SITES_DIR ?? "/data/sites", subdomain, environment === "preview" ? "test" : "live"),
          projectDir: getProjectPath(projectId),
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
    // SITES_DIR misconfig: don't leak the raw path; bubble a stable
    // error code the route layer maps to 503 + a friendly message.
    // BUG-2026-05-14-publish-001.
    if (err instanceof SitesDirUnwritableError) {
      console.error(
        `[pipeline] SITES_DIR not writable for project ${projectId}: ` +
          `${err.sitesDir} (${err.cause?.message ?? "unknown"})`,
      );
      const safeMessage =
        "Publishing is temporarily unavailable on this server while an " +
        "operator finishes the storage configuration. Please try again in " +
        "a few minutes.";
      onBuildLog?.(`\nERROR: ${safeMessage}\n`);
      await deployments.updateStatus(deployment.id, "failed", {
        // Persist the operator-facing detail server-side for audit, but only
        // surface the safe message to the route caller via PipelineResult.
        errorMessage: `sites_dir_unwritable: ${err.sitesDir}`,
      });
      return {
        deploymentId: deployment.id,
        url: "",
        status: "failed",
        buildLog: "",
        buildTimeMs: 0,
        deployTimeMs: 0,
        durationMs: Date.now() - pipelineStart,
        error: safeMessage,
        errorCode: "sites_dir_unwritable",
      };
    }

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
  const isPython = fwEntry.adapter.capabilities.has("ssr-python");
  // Python frameworks (Django, FastAPI) take priority over the Node default
  // because they need a uvicorn/gunicorn ExecStart, not `node`.
  const runtime: RuntimeAdapter = isPython
    ? pythonAsgiAdapter
    : isProcess
      ? nodeStandaloneAdapter
      : staticFilesAdapter;

  // Wave 21: switched from systemd socket activation to TCP-port mode.
  // Vanilla Next.js/Nuxt/SvelteKit standalone builds listen on PORT and
  // don't speak LISTEN_FDS, so socket activation never woke the service.
  // Now: allocate a stable per-project port, bind on 127.0.0.1:PORT,
  // Caddy reverse_proxies the public hostname to it. Bound localhost-only
  // so the port is not internet-reachable; firewall + Caddy enforce that.
  let allocatedPort: { host: string; port: number; addr: string } | null = null;
  if (isProcess) {
    allocatedPort = await allocateProcessPort(input.projectId);
  }

  const ctx: RuntimeContext = {
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    workspaceSlug: input.workspaceSlug,
    siteDir: input.siteDir,
    projectDir: input.projectDir,
    framework: { id: input.frameworkId },
    env: {},
    listen: allocatedPort
      ? { kind: "tcp-port", host: allocatedPort.host, port: allocatedPort.port }
      : { kind: "tcp-port", host: "127.0.0.1", port: 0 },
    userId: input.userId,
  };

  const handle = await runtime.start(ctx);

  // For process-kind, also insert a per-host Caddy route so traffic to
  // the public hostname reverse-proxies to 127.0.0.1:PORT. Skip silently
  // when the admin API isn't reachable (dev environment, etc.).
  if (isProcess && allocatedPort && (await caddyAdminAvailable())) {
    await addProcessRoute({
      slug: input.projectSlug,
      hostname: input.publicHostname,
      upstream: { kind: "tcp-port", addr: allocatedPort.addr },
    });
  }

  await upsertRuntimeRow({
    projectId: input.projectId,
    frameworkId: input.frameworkId,
    runtimeKind: isProcess ? "process" : "static",
    listenKind: isProcess ? "tcp-port" : null,
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
