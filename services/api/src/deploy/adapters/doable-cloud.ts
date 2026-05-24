import { mkdir, cp, rm, readdir, stat, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import type { DeployAdapter, DeployInput, DeployResult } from "../adapter.js";
import { getEffectiveCfApiToken } from "../../lib/cloudflare-token.js";

/**
 * Sentinel error thrown when SITES_DIR is unreachable/unwritable from the
 * API process. Distinct from a build failure or a user-content problem —
 * always indicates server misconfiguration (e.g. `SITES_DIR` in `.env`
 * disagrees with `ReadWritePaths=` in the systemd unit so mkdir hits a
 * read-only filesystem). The trigger route maps this to a 503 with a
 * clear, non-leaky message; the original ENOENT/EACCES is logged but
 * never surfaced to the end user.
 *
 * Root cause for BUG-2026-05-14-publish-001 / BUG-PUB-004 follow-up:
 * dev was provisioned with SITES_DIR=/var/lib/doable-sites but the
 * doable.service unit's ReadWritePaths= only allowlists /data/sites.
 * Under ProtectSystem=strict, writes outside ReadWritePaths surface as
 * ENOENT (not EACCES) when the kernel mounts the path read-only —
 * pre-flighting catches both modes uniformly.
 */
export class SitesDirUnwritableError extends Error {
  readonly sitesDir: string;
  readonly cause?: Error;
  constructor(sitesDir: string, cause?: Error) {
    super(
      `SITES_DIR is not writable from the API process: ${sitesDir}. ` +
        `Either the directory does not exist or it is not listed in the ` +
        `doable.service ReadWritePaths= directive. Operators: align the ` +
        `SITES_DIR env var with the systemd ReadWritePaths= list, run ` +
        `\`mkdir -p $SITES_DIR && chown doable:doable $SITES_DIR\` on the ` +
        `host, then \`systemctl daemon-reload && systemctl restart doable\`.`,
    );
    this.name = "SitesDirUnwritableError";
    this.sitesDir = sitesDir;
    this.cause = cause;
  }
}

/**
 * Probe whether SITES_DIR exists and is writable from this process. Used
 * before any per-publish work so we fail fast with a clear actionable
 * error instead of a confusing mid-pipeline mkdir ENOENT that leaks the
 * full filesystem path to the user (BUG-2026-05-14-publish-001).
 *
 * Strategy: try to create + remove a probe directory under SITES_DIR. We
 * don't trust existsSync(SITES_DIR) alone because systemd's
 * ProtectSystem=strict can mount the parent read-only while the directory
 * itself exists (mkdir of a child still fails). A real mkdir attempt is
 * the only reliable signal.
 */
export async function assertSitesDirWritable(sitesDir: string): Promise<void> {
  const probe = path.join(
    sitesDir,
    `.writable-probe-${process.pid}-${Date.now().toString(36)}`,
  );
  try {
    await mkdir(sitesDir, { recursive: true });
    await access(sitesDir, fsConstants.W_OK);
    await mkdir(probe, { recursive: true });
  } catch (err) {
    throw new SitesDirUnwritableError(
      sitesDir,
      err instanceof Error ? err : new Error(String(err)),
    );
  } finally {
    // Best-effort cleanup — if probe creation failed there's nothing to remove,
    // and if removal fails we don't want to mask the real error.
    await rm(probe, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Sites directory: where published static sites are served from.
 *   - Production: /data/sites (served by Caddy/Nginx)
 *   - Dev (Windows): ./data/sites/ relative to cwd
 */
export const SITES_DIR =
  process.env.SITES_DIR ??
  (process.platform === "win32"
    ? path.join(process.cwd(), "data", "sites")
    : "/data/sites");

/**
 * Projects directory: where per-project source trees and runtime layouts
 * live. Mirrors services/api/src/deploy/pipeline.ts so process-kind
 * runtimes (Next.js standalone) can stage `dist-server/` next to the
 * project source.
 */
const PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? "/data/projects";

const DOMAIN = process.env.DOABLE_DOMAIN ?? "doable.me";

/**
 * Optional prefix prepended to every published subdomain on this server.
 * Used on the dev environment so dev publishes land at e.g.
 * `dev-{slug}.doable.me` (single-label, covered by Cloudflare Universal
 * SSL wildcard `*.doable.me`) instead of `{slug}.dev.doable.me` (two-level,
 * NOT covered). On production this stays empty so URLs are `{slug}.doable.me`.
 */
const SUBDOMAIN_PREFIX = process.env.PUBLISH_SUBDOMAIN_PREFIX ?? "";

/** Compute the public URL and base path for a deployed site. */
export function computeSitePublishLocation(
  subdomain: string,
  environment: "preview" | "production",
): { url: string; basePath: string; siteSubdomain: string; hostname: string } {
  const envPrefix = environment === "preview" ? "p-" : "";
  const siteSubdomain = `${SUBDOMAIN_PREFIX}${envPrefix}${subdomain}`;
  const hostname = `${siteSubdomain}.${DOMAIN}`;
  return {
    url: `https://${hostname}`,
    basePath: "/",
    siteSubdomain,
    hostname,
  };
}

/**
 * Default deploy adapter: copies build output to a local directory
 * and generates a *.doable.me URL.
 *
 * Directory structure:
 *   /data/sites/[slug]/live/   - production deployment
 *   /data/sites/[slug]/test/   - preview/test deployment
 *
 * Subdomains are short and user-friendly (e.g. "portfolio-page-x7k2m").
 * The subdomain is generated once and stored in the project record,
 * then reused for every subsequent publish.
 */
export class DoableCloudAdapter implements DeployAdapter {
  readonly name = "doable-cloud";

  async deploy(input: DeployInput): Promise<DeployResult> {
    const { projectId, buildOutputDir, environment, subdomain } = input;

    if (!subdomain) {
      throw new Error("subdomain is required for doable-cloud adapter");
    }

    // Validate build output exists and contains files
    if (!existsSync(buildOutputDir)) {
      throw new Error(
        `Build output directory not found: ${buildOutputDir}. ` +
          `The Vite build may have failed or output to a different location.`
      );
    }

    let buildFiles: string[];
    try {
      buildFiles = await readdir(buildOutputDir);
    } catch (err) {
      throw new Error(
        `Cannot read build output directory: ${buildOutputDir}. ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (buildFiles.length === 0) {
      throw new Error(
        `Build output directory is empty: ${buildOutputDir}. ` +
          `The Vite build likely produced no output.`
      );
    }

    // Directory structure: /data/sites/[siteSubdomain]/live/
    // We key off siteSubdomain (which already includes SUBDOMAIN_PREFIX + envPrefix)
    // so each environment gets its own directory — production lands at
    // staging-<slug>/live/, preview lands at staging-p-<slug>/live/. That
    // lets Caddy's single wildcard regex map any request Host directly
    // to <SITES_DIR>/<first-host-label>/live/ without having to know about
    // env prefixes or pick between live/test subdirectories.
    const envDir = "live";
    const { siteSubdomain } = computeSitePublishLocation(subdomain, environment);
    const siteDir = path.join(SITES_DIR, siteSubdomain);
    const targetDir = path.join(siteDir, envDir);

    // Pre-flight: ensure SITES_DIR is reachable + writable from the API
    // process. Catches systemd ProtectSystem=strict / ReadWritePaths drift
    // before we leak a half-baked ENOENT path string to the user.
    // BUG-2026-05-14-publish-001 / BUG-PUB-004 (deeper root cause).
    await assertSitesDirWritable(SITES_DIR);

    try {
      // Ensure site directory exists
      await mkdir(siteDir, { recursive: true });

      // Remove old deployment for this environment
      if (existsSync(targetDir)) {
        await rm(targetDir, { recursive: true, force: true });
      }

      // Create target and copy build output
      await mkdir(targetDir, { recursive: true });
      await cp(buildOutputDir, targetDir, { recursive: true });

      // Verify copy succeeded
      const copiedFiles = await readdir(targetDir);
      if (copiedFiles.length === 0) {
        throw new Error("Copy completed but target directory is empty");
      }

      // Process-kind output (Next.js `output: "standalone"`): the
      // standalone tree at .next/standalone/server.js is self-contained
      // for code, but Next.js does NOT copy `.next/static/` or `public/`
      // into it — see https://nextjs.org/docs/app/api-reference/next-config-js/output
      // ("Automatically Copying Traced Files"). Stage the runtime layout
      // at {projectDir}/dist-server/ so the node-standalone runtime
      // adapter can point WorkingDirectory + ExecStart at it.
      const standaloneDir = path.join(buildOutputDir, "standalone");
      if (existsSync(path.join(standaloneDir, "server.js"))) {
        const distServer = path.join(PROJECTS_ROOT, projectId, "dist-server");
        await rm(distServer, { recursive: true, force: true });
        await mkdir(distServer, { recursive: true });
        // Copy standalone tree as-is (package.json + node_modules +
        // server.js + .next/server/ etc).
        await cp(standaloneDir, distServer, { recursive: true });

        // Copy static assets next to the standalone server.
        const staticDir = path.join(buildOutputDir, "static");
        if (existsSync(staticDir)) {
          await cp(staticDir, path.join(distServer, ".next", "static"), {
            recursive: true,
          });
        }

        // Copy project public/ if present.
        const publicDir = path.join(PROJECTS_ROOT, projectId, "public");
        if (existsSync(publicDir)) {
          await cp(publicDir, path.join(distServer, "public"), {
            recursive: true,
          });
        }

        setupProjectUser(distServer, input.projectSlug);
        console.log(
          `[doable-cloud] Staged Next.js standalone layout at ${distServer} ` +
            `for project ${projectId}`
        );
      }

      // Nuxt nitro output (.output/server/index.mjs + .output/public/).
      // The build adapter's outputDir is the project root for Nuxt; the
      // canonical layout is .output/{server,public}. Stage to dist-server/
      // so node-standalone can ExecStart at dist-server/index.mjs.
      const nuxtOutput = path.join(PROJECTS_ROOT, projectId, ".output");
      const nuxtServer = path.join(nuxtOutput, "server", "index.mjs");
      if (existsSync(nuxtServer)) {
        const distServer = path.join(PROJECTS_ROOT, projectId, "dist-server");
        await rm(distServer, { recursive: true, force: true });
        await mkdir(distServer, { recursive: true });
        await cp(path.join(nuxtOutput, "server"), distServer, {
          recursive: true,
        });
        const nuxtPublic = path.join(nuxtOutput, "public");
        if (existsSync(nuxtPublic)) {
          await cp(nuxtPublic, path.join(distServer, "public"), {
            recursive: true,
          });
        }
        setupProjectUser(distServer, input.projectSlug);
        console.log(
          `[doable-cloud] Staged Nuxt nitro layout at ${distServer} ` +
            `for project ${projectId}`
        );
      }

      // SvelteKit @sveltejs/adapter-node output (build/index.js +
      // build/client/ + build/server/). The whole `build/` tree is
      // self-contained — copy as-is.
      const svelteBuild = path.join(PROJECTS_ROOT, projectId, "build");
      const svelteEntry = path.join(svelteBuild, "index.js");
      if (existsSync(svelteEntry)) {
        const distServer = path.join(PROJECTS_ROOT, projectId, "dist-server");
        await rm(distServer, { recursive: true, force: true });
        await mkdir(distServer, { recursive: true });
        await cp(svelteBuild, distServer, { recursive: true });
        setupProjectUser(distServer, input.projectSlug);
        console.log(
          `[doable-cloud] Staged SvelteKit adapter-node layout at ${distServer} ` +
            `for project ${projectId}`
        );
      }

      // Astro SSR output (dist/server/entry.mjs + dist/client/). Static-only
      // Astro builds (no SSR adapter) skip this branch — they fall through
      // to the existing static-spa copy above.
      const astroDist = path.join(PROJECTS_ROOT, projectId, "dist");
      const astroEntry = path.join(astroDist, "server", "entry.mjs");
      if (existsSync(astroEntry)) {
        const distServer = path.join(PROJECTS_ROOT, projectId, "dist-server");
        await rm(distServer, { recursive: true, force: true });
        await mkdir(distServer, { recursive: true });
        await cp(path.join(astroDist, "server"), distServer, {
          recursive: true,
        });
        const astroClient = path.join(astroDist, "client");
        if (existsSync(astroClient)) {
          await cp(astroClient, path.join(distServer, "client"), {
            recursive: true,
          });
        }
        setupProjectUser(distServer, input.projectSlug);
        console.log(
          `[doable-cloud] Staged Astro SSR layout at ${distServer} ` +
            `for project ${projectId}`
        );
      }

      // Hono node-build output: tsc emits dist/index.js (and any dependent
      // .js + .d.ts). Stage to dist-server/ so node-standalone ExecStarts at
      // dist-server/index.js (auto-detected via Wave 13 priority list).
      const honoDist = path.join(PROJECTS_ROOT, projectId, "dist");
      const honoEntry = path.join(honoDist, "index.js");
      if (existsSync(honoEntry)) {
        const distServer = path.join(PROJECTS_ROOT, projectId, "dist-server");
        await rm(distServer, { recursive: true, force: true });
        await mkdir(distServer, { recursive: true });
        await cp(honoDist, distServer, { recursive: true });

        // Production node_modules — seed package.json + lockfile then
        // `npm install --production` inside dist-server. Drops devDependencies
        // (typescript, tsx, @types/*) so the deployed bundle is much smaller
        // than copying the full project node_modules tree.
        const projectPkg = path.join(PROJECTS_ROOT, projectId, "package.json");
        const projectLock = path.join(PROJECTS_ROOT, projectId, "package-lock.json");
        if (existsSync(projectPkg)) {
          await cp(projectPkg, path.join(distServer, "package.json"));
        }
        if (existsSync(projectLock)) {
          await cp(projectLock, path.join(distServer, "package-lock.json"));
        }
        installNodeProductionDeps(distServer, projectId);

        setupProjectUser(distServer, input.projectSlug);
        console.log(
          `[doable-cloud] Staged Hono node-build layout at ${distServer} ` +
            `for project ${projectId}`
        );
      }

      // FastAPI / Django: Python source IS the artifact. We can't `cp` the
      // project dir directly into projectDir/dist-server because Node's
      // fs.cp refuses to copy a directory into a subdirectory of itself
      // (EINVAL, even with a filter). So instead we read the project's
      // top-level entries and copy each non-excluded one into dist-server.
      const PYTHON_EXCLUDES = new Set([
        "node_modules", ".venv", "venv", "__pycache__", "dist-server",
        ".git", ".pytest_cache", "staticfiles",
      ]);

      async function stagePythonSource(distServer: string): Promise<void> {
        await rm(distServer, { recursive: true, force: true });
        await mkdir(distServer, { recursive: true });
        const projectRoot = path.join(PROJECTS_ROOT, projectId);
        const entries = await readdir(projectRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (PYTHON_EXCLUDES.has(entry.name)) continue;
          const src = path.join(projectRoot, entry.name);
          const dest = path.join(distServer, entry.name);
          await cp(src, dest, { recursive: true });
        }
      }

      const fastapiMain = path.join(PROJECTS_ROOT, projectId, "main.py");
      const fastapiReqs = path.join(PROJECTS_ROOT, projectId, "requirements.txt");
      if (existsSync(fastapiMain) && existsSync(fastapiReqs)) {
        const distServer = path.join(PROJECTS_ROOT, projectId, "dist-server");
        await stagePythonSource(distServer);
        // python-asgi runtime expects ${distServer}/.venv/bin/uvicorn (or
        // /usr/bin/python3 fallback). Materialise the venv + install deps
        // here so the systemd unit can ExecStart cleanly.
        setupPythonVenv(distServer, projectId);
        setupProjectUser(distServer, input.projectSlug);
        console.log(
          `[doable-cloud] Staged FastAPI source layout at ${distServer} ` +
            `for project ${projectId}`
        );
      }

      const djangoManage = path.join(PROJECTS_ROOT, projectId, "manage.py");
      if (existsSync(djangoManage)) {
        const distServer = path.join(PROJECTS_ROOT, projectId, "dist-server");
        await stagePythonSource(distServer);
        // Also include collectstatic output if it exists.
        const staticDir = path.join(PROJECTS_ROOT, projectId, "staticfiles");
        if (existsSync(staticDir)) {
          await cp(staticDir, path.join(distServer, "staticfiles"), {
            recursive: true,
          });
        }
        // python-asgi runtime expects ${distServer}/.venv/bin/gunicorn.
        // Same setup as FastAPI — pip install requirements (including
        // gunicorn if listed) inside the staged venv.
        setupPythonVenv(distServer, projectId);
        setupProjectUser(distServer, input.projectSlug);
        console.log(
          `[doable-cloud] Staged Django source layout at ${distServer} ` +
            `for project ${projectId}`
        );
      }

      // Collect file artifacts for tracking
      const files = await collectFileInfo(targetDir, targetDir);
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      console.log(
        `[doable-cloud] Deployed ${files.length} files (${formatBytes(totalSize)}) ` +
          `for project ${projectId} (${environment}) to ${targetDir}`
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes("Copy completed")) {
        throw err;
      }
      throw new Error(
        `Failed to deploy to ${targetDir}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // URL: {prefix}{subdomain}.doable.me. On dev, prefix="dev-" so the
    // single-label wildcard SSL covers it. Defaults to no prefix on prod.
    // Reuse the siteSubdomain computed earlier for the directory name —
    // recomputing here would just shadow the same value.
    const { url, hostname } = computeSitePublishLocation(
      subdomain,
      environment,
    );

    // Register a DNS CNAME for this hostname on the configured Cloudflare
    // tunnel via the Cloudflare API. Runs on every server that sets
    // CLOUDFLARED_TUNNEL_ID + CF_API_TOKEN + CF_ZONE_ID, so each
    // environment's published sites resolve to its own tunnel.
    // Errors are non-fatal — the file copy already succeeded.
    // Skipped when the pipeline tells us a wildcard CNAME is in play.
    const cfToken = await getEffectiveCfApiToken();
    if (
      !input.skipDnsRegistration &&
      process.env.CLOUDFLARED_TUNNEL_ID &&
      cfToken
    ) {
      await registerCloudflareDns(
        process.env.CLOUDFLARED_TUNNEL_ID,
        hostname,
      ).catch((err) => {
        console.warn(
          `[doable-cloud] DNS registration failed for ${hostname}:`,
          err instanceof Error ? err.message : err,
        );
      });
    }

    // Collect file info for artifact tracking
    const files = await collectFileInfo(targetDir, targetDir);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    return {
      url,
      adapter: this.name,
      totalSize,
      files,
      metadata: {
        targetDir,
        subdomain: siteSubdomain,
        domain: DOMAIN,
        envDir,
        sitesDir: SITES_DIR,
      },
    };
  }

  async teardown(projectId: string, environment: string): Promise<void> {
    console.log(
      `[doable-cloud] Teardown requested for project=${projectId} env=${environment}`
    );

    // We would need the subdomain to find the directory.
    // In a real implementation, we'd look it up from the database.
    // For now, log the request.
    try {
      if (!existsSync(SITES_DIR)) return;

      const entries = await readdir(SITES_DIR);
      for (const entry of entries) {
        const dirPath = path.join(SITES_DIR, entry);
        console.log(`[doable-cloud] Found deployment dir: ${dirPath}`);
      }
    } catch (err) {
      console.warn(
        `[doable-cloud] Teardown error for project=${projectId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

// ── File collection ──────────────────────────────────────

interface FileInfo {
  path: string;
  size: number;
  hash: string;
}

/**
 * Recursively collect file info (relative path, size, content hash)
 * for all files in a directory.
 */
export async function collectFileInfo(
  dir: string,
  baseDir: string
): Promise<FileInfo[]> {
  const results: FileInfo[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectFileInfo(fullPath, baseDir);
      results.push(...subFiles);
    } else {
      const fileStat = await stat(fullPath);
      const hash = await hashFile(fullPath);
      results.push({
        path: path.relative(baseDir, fullPath).replace(/\\/g, "/"),
        size: fileStat.size,
        hash,
      });
    }
  }

  return results;
}

/**
 * Compute SHA-256 hash of a file.
 */
function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Add a per-publish DNS CNAME via the Cloudflare API so the published
 * hostname resolves to our tunnel. Idempotent — if a record with the
 * same name already exists, it is updated in place.
 *
 * Requires env vars: CF_API_TOKEN, CF_ZONE_ID, CLOUDFLARED_TUNNEL_ID.
 */
export async function registerCloudflareDns(
  tunnelId: string,
  hostname: string,
): Promise<void> {
  const apiToken = await getEffectiveCfApiToken();
  const zoneId = process.env.CF_ZONE_ID;
  if (!apiToken || !zoneId) {
    throw new Error("CF_API_TOKEN and CF_ZONE_ID are required for DNS registration");
  }

  const target = `${tunnelId}.cfargotunnel.com`;
  const base = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  // Check if record already exists
  const search = await fetch(`${base}?type=CNAME&name=${hostname}`, { headers });
  const searchData = (await search.json()) as { result?: { id: string; content: string }[] };
  const existing = searchData.result?.[0];

  if (existing) {
    // Update if target changed
    if (existing.content !== target) {
      const resp = await fetch(`${base}/${existing.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ content: target, proxied: true }),
      });
      if (!resp.ok) {
        throw new Error(`CF API PATCH failed (${resp.status}): ${await resp.text()}`);
      }
    }
    return;
  }

  // Create new record
  const resp = await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "CNAME",
      name: hostname,
      content: target,
      proxied: true,
      ttl: 1,
    }),
  });
  if (!resp.ok) {
    throw new Error(`CF API POST failed (${resp.status}): ${await resp.text()}`);
  }
}

/**
 * Idempotent wildcard CNAME creator. Used by the admin auto-wildcard flow.
 *
 *   - Looks up an existing CNAME with name=wildcardName (e.g. "*.doable.me").
 *   - If absent, POSTs a new CNAME pointing at <tunnelId>.cfargotunnel.com.
 *   - If present with the wrong target, PATCHes it to the correct one.
 *
 * Returns `{created, updated, hostname, target}` so callers can surface
 * whether they actually changed Cloudflare state or just reconfirmed it.
 *
 * Requires env vars: CF_API_TOKEN, CF_ZONE_ID.
 */
export async function ensureWildcardCname(
  tunnelId: string,
  wildcardName: string,
): Promise<{ created: boolean; updated: boolean; hostname: string; target: string }> {
  const apiToken = await getEffectiveCfApiToken();
  const zoneId = process.env.CF_ZONE_ID;
  if (!apiToken || !zoneId) {
    throw new Error("CF_API_TOKEN and CF_ZONE_ID are required for wildcard CNAME creation");
  }

  const target = `${tunnelId}.cfargotunnel.com`;
  const base = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  // Cloudflare's record-name index is case-insensitive but stores the literal
  // input. Encode the asterisk so the URL is unambiguous.
  const search = await fetch(
    `${base}?type=CNAME&name=${encodeURIComponent(wildcardName)}`,
    { headers },
  );
  if (!search.ok) {
    throw new Error(`CF API GET failed (${search.status}): ${await search.text()}`);
  }
  const searchData = (await search.json()) as { result?: { id: string; content: string }[] };
  const existing = searchData.result?.[0];

  if (existing) {
    if (existing.content === target) {
      return { created: false, updated: false, hostname: wildcardName, target };
    }
    const resp = await fetch(`${base}/${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ content: target, proxied: true }),
    });
    if (!resp.ok) {
      throw new Error(`CF API PATCH failed (${resp.status}): ${await resp.text()}`);
    }
    return { created: false, updated: true, hostname: wildcardName, target };
  }

  const resp = await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "CNAME",
      name: wildcardName,
      content: target,
      proxied: true,
      ttl: 1,
    }),
  });
  if (!resp.ok) {
    throw new Error(`CF API POST failed (${resp.status}): ${await resp.text()}`);
  }
  return { created: true, updated: false, hostname: wildcardName, target };
}

/**
 * Look up the currently-configured wildcard CNAME for a given base, if any.
 * Used by the diagnostics endpoint so the admin panel can show "wildcard
 * already exists pointing at <target>" without forcing a write.
 */
export async function lookupWildcardCname(
  wildcardName: string,
): Promise<{ exists: boolean; target: string | null }> {
  const apiToken = await getEffectiveCfApiToken();
  const zoneId = process.env.CF_ZONE_ID;
  if (!apiToken || !zoneId) return { exists: false, target: null };

  const base = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
  const headers = { Authorization: `Bearer ${apiToken}` };
  try {
    const resp = await fetch(
      `${base}?type=CNAME&name=${encodeURIComponent(wildcardName)}`,
      { headers },
    );
    if (!resp.ok) return { exists: false, target: null };
    const data = (await resp.json()) as { result?: { content: string }[] };
    const existing = data.result?.[0];
    if (!existing) return { exists: false, target: null };
    return { exists: true, target: existing.content };
  } catch {
    return { exists: false, target: null };
  }
}

/**
 * Inverse of {@link registerCloudflareDns}: deletes the per-publish CNAME so
 * the published hostname stops resolving. Silently no-ops when the record is
 * absent so unpublish is idempotent (repeated calls don't error).
 *
 * Returns true when an existing record was actually deleted, false when no
 * matching record was found (idempotent no-op). Callers that need to
 * distinguish 404 from 200 (admin delete UI) use the return value; the
 * unpublish path ignores it.
 *
 * Requires env vars: CF_API_TOKEN, CF_ZONE_ID.
 */
export async function deleteCloudflareDns(hostname: string): Promise<boolean> {
  const apiToken = await getEffectiveCfApiToken();
  const zoneId = process.env.CF_ZONE_ID;
  if (!apiToken || !zoneId) return false;

  const base = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  const search = await fetch(`${base}?type=CNAME&name=${encodeURIComponent(hostname)}`, { headers });
  if (!search.ok) {
    throw new Error(`CF API GET failed (${search.status}): ${await search.text()}`);
  }
  const searchData = (await search.json()) as { result?: { id: string }[] };
  const existing = searchData.result?.[0];
  if (!existing) return false;

  const resp = await fetch(`${base}/${existing.id}`, { method: "DELETE", headers });
  if (!resp.ok) {
    throw new Error(`CF API DELETE failed (${resp.status}): ${await resp.text()}`);
  }
  return true;
}

/**
 * Enumerate all wildcard CNAMEs on the configured zone. One CF API call,
 * filters in memory by `name.startsWith('*')`. Used by the admin diagnostics
 * endpoint so the panel can list every wildcard the operator might want to
 * delete (not just the one matching *.${DOABLE_DOMAIN}).
 *
 * Returns an empty array when CF creds are missing or any error occurs —
 * never throws.
 */
export async function listZoneWildcards(): Promise<
  Array<{ hostname: string; target: string; proxied: boolean; modifiedOn: string }>
> {
  const apiToken = await getEffectiveCfApiToken();
  const zoneId = process.env.CF_ZONE_ID;
  if (!apiToken || !zoneId) return [];

  const base = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
  const headers = { Authorization: `Bearer ${apiToken}` };
  try {
    const resp = await fetch(`${base}?type=CNAME&per_page=200`, { headers });
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      result?: { name: string; content: string; proxied: boolean; modified_on: string }[];
    };
    if (!Array.isArray(data.result)) return [];
    return data.result
      .filter((r) => r.name.startsWith("*"))
      .map((r) => ({
        hostname: r.name,
        target: r.content,
        proxied: r.proxied,
        modifiedOn: r.modified_on,
      }));
  } catch {
    return [];
  }
}

/**
 * Resolve the on-disk directory served by Caddy for a given publish.
 * Mirrors the layout produced by {@link DoableCloudAdapter.deploy}.
 */
export function getPublishedSiteDir(
  subdomain: string,
  environment: "production" | "preview",
): string {
  const { siteSubdomain } = computeSitePublishLocation(subdomain, environment);
  return path.join(SITES_DIR, siteSubdomain);
}

// ── Subdomain generation ─────────────────────────────────
const RANDOM_SUFFIX_LEN = 5;

/**
 * Generate a short, human-friendly subdomain from a project name.
 * Example: "Build A Simple Portfolio Page" -> "portfolio-page-x7k2m"
 *
 * Takes the last two meaningful words (more recognizable than the first)
 * and appends a random suffix for uniqueness.
 */
export function generateSubdomain(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Take last 2 meaningful words (or whatever is available)
  const words = slug.slice(-2).join("-") || "app";

  // Random alphanumeric suffix
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < RANDOM_SUFFIX_LEN; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }

  // Keep total under 30 chars for readability
  const base = words.slice(0, 30 - RANDOM_SUFFIX_LEN - 1);
  return `${base}-${suffix}`.replace(/--+/g, "-");
}

const STOP_WORDS = new Set([
  "the",
  "for",
  "and",
  "with",
  "that",
  "this",
  "from",
  "create",
  "build",
  "make",
  "simple",
  "basic",
  "new",
]);

/**
 * Materialise a Python venv inside ${distServer}/.venv/ and pip-install
 * the project's requirements.txt into it. The python-asgi runtime adapter
 * then ExecStarts ${distServer}/.venv/bin/python (or .venv/Scripts/python.exe
 * on Windows) so gunicorn/uvicorn from requirements.txt are on PATH.
 *
 * Best-effort: warns and returns on any failure rather than throwing,
 * because the deploy pipeline can still succeed at the file-staging step
 * even if dependencies fail (the user gets a "started but unhealthy"
 * runtime instead of a hard failure that loses the staged tree).
 */
function setupPythonVenv(distServer: string, projectId: string): void {
  const isWindows = process.platform === "win32";
  const venvDir = path.join(distServer, ".venv");
  const venvPip = isWindows
    ? path.join(venvDir, "Scripts", "pip.exe")
    : path.join(venvDir, "bin", "pip");

  const createVenv = spawnSync("python3", ["-m", "venv", venvDir], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  if (createVenv.status !== 0) {
    console.warn(
      `[doable-cloud] python venv create failed for ${projectId}: ` +
        (createVenv.stderr?.toString() ??
          createVenv.error?.message ??
          "unknown — is python3 on PATH?")
    );
    return;
  }

  const requirements = path.join(distServer, "requirements.txt");
  if (!existsSync(requirements)) return;

  const pipInstall = spawnSync(
    venvPip,
    [
      "install",
      "-r",
      requirements,
      "--quiet",
      "--disable-pip-version-check",
      "--no-cache-dir",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 240_000,
    }
  );
  if (pipInstall.status !== 0) {
    console.warn(
      `[doable-cloud] pip install failed for ${projectId}: ` +
        (pipInstall.stderr?.toString() ??
          pipInstall.error?.message ??
          "unknown")
    );
  }
}

/**
 * Run `npm install --production` (a.k.a. `--omit=dev`) inside dist-server/
 * to install the runtime-only dependencies. Required for Hono and any
 * future Node-family framework that ships JavaScript needing
 * resolved-from-disk node_modules at runtime.
 *
 * Same best-effort policy as setupPythonVenv: warn on failure, don't throw.
 */
function installNodeProductionDeps(distServer: string, projectId: string): void {
  if (!existsSync(path.join(distServer, "package.json"))) return;
  const result = spawnSync(
    "npm",
    [
      "install",
      "--production",
      "--omit=dev",
      "--legacy-peer-deps",
      "--no-audit",
      "--no-fund",
    ],
    {
      cwd: distServer,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      timeout: 240_000,
    }
  );
  if (result.status !== 0) {
    console.warn(
      `[doable-cloud] npm install --production failed for ${projectId}: ` +
        (result.stderr?.toString() ?? result.error?.message ?? "unknown")
    );
  }
}

/**
 * Wave 27: per-project Linux user accounts. Each published project gets
 * its own host UID (`doable-{slug}`) instead of the shared dynamic UID
 * from systemd's DynamicUser=yes (Wave 26). With per-instance UIDs the
 * runtime adapter can pin User=/Group= in the systemd drop-in, giving
 * true filesystem-level isolation between published projects on the
 * same host.
 *
 * Behaviour:
 *   1. Create `doable-{slug}` (truncated to Linux's 32-char username
 *      limit) as a system account with no home and no login shell.
 *      Idempotent — useradd exit 9 ("user already exists") is treated
 *      as success.
 *   2. chown -R the staged dist-server tree to that user so the
 *      systemd unit can read + write it under its own UID/GID.
 *
 * Linux-only: dev hosts (Windows/macOS) skip silently. Best-effort:
 * warn on failure but don't throw — the deploy already succeeded at
 * the file-staging step, the start will fail loudly enough on its own.
 */
function setupProjectUser(distServer: string, projectSlug: string): void {
  if (process.platform !== "linux") return;
  const username = `doable-${projectSlug}`.slice(0, 32); // Linux limit
  // Idempotent useradd: exit 9 means user already exists — treat as success.
  const ua = spawnSync("useradd", ["--system", "--no-create-home", "--shell", "/usr/sbin/nologin", username], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  if (ua.status !== 0 && ua.status !== 9) {
    console.warn(
      `[doable-cloud] useradd ${username} failed: ` +
        (ua.stderr?.toString() ?? ua.error?.message ?? "unknown"),
    );
    return;
  }
  const co = spawnSync("chown", ["-R", `${username}:${username}`, distServer], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  if (co.status !== 0) {
    console.warn(
      `[doable-cloud] chown ${username} ${distServer} failed: ` +
        (co.stderr?.toString() ?? co.error?.message ?? "unknown"),
    );
  }
}
