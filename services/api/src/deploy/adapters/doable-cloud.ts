import { mkdir, cp, rm, readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import type { DeployAdapter, DeployInput, DeployResult } from "../adapter.js";

/**
 * Sites directory: where published static sites are served from.
 *   - Production: /data/sites (served by Caddy/Nginx)
 *   - Dev (Windows): ./data/sites/ relative to cwd
 */
const SITES_DIR =
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

    // Directory structure: /data/sites/[slug]/live/ or /data/sites/[slug]/test/
    const envDir = environment === "preview" ? "test" : "live";
    const siteDir = path.join(SITES_DIR, subdomain);
    const targetDir = path.join(siteDir, envDir);

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
        console.log(
          `[doable-cloud] Staged Astro SSR layout at ${distServer} ` +
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
    const { url, siteSubdomain, hostname } = computeSitePublishLocation(
      subdomain,
      environment,
    );

    // Optional: register a specific DNS CNAME for this hostname on the
    // configured Cloudflare tunnel. Only runs when CLOUDFLARED_TUNNEL_ID
    // env var is set (used on dev so dev-{slug}.doable.me overrides the
    // wildcard *.doable.me CNAME that points at the prod tunnel). Errors
    // are non-fatal — the file copy already succeeded.
    if (process.env.CLOUDFLARED_TUNNEL_ID) {
      await registerCloudflaredDns(
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
async function collectFileInfo(
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Add a per-publish DNS CNAME pointing the given hostname at our Cloudflare
 * tunnel. Idempotent — `cloudflared tunnel route dns` updates an existing
 * record in place. Resolves on success, rejects on non-zero exit.
 */
function registerCloudflaredDns(
  tunnelId: string,
  hostname: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("cloudflared", ["tunnel", "route", "dns", tunnelId, hostname], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    proc.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`cloudflared exit ${code}: ${err.trim()}`));
    });
    proc.on("error", reject);
  });
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
