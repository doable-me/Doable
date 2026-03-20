import { mkdir, cp, rm, readdir, stat } from "node:fs/promises";
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

const DOMAIN = process.env.DOABLE_DOMAIN ?? "doable.app";

/**
 * Default deploy adapter: copies build output to a local directory
 * and generates a *.doable.app URL.
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

    // URL: preview gets p- prefix
    const siteSubdomain =
      environment === "preview" ? `p-${subdomain}` : subdomain;
    const url = `https://${siteSubdomain}.${DOMAIN}`;

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
