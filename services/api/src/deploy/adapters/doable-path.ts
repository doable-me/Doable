import { mkdir, cp, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { DeployAdapter, DeployInput, DeployResult } from "../adapter.js";
import {
  SITES_DIR,
  assertSitesDirWritable,
  collectFileInfo,
  formatBytes,
} from "./doable-cloud.js";
import { computePublishLocation } from "../topology.js";

/**
 * Path-based deploy adapter — the out-of-the-box publish topology.
 *
 * Copies the static build output to `SITES_DIR/<dirKey>/` and serves it from
 * the SAME origin as the app under `<PUBLISH_PATH_PREFIX>/<dirKey>/` (default
 * `/sites/<dirKey>/`). No wildcard DNS, no per-publish certificate, and no
 * Cloudflare API calls — works on any single-domain install with one cert.
 *
 * The Vite build is given `--base=/sites/<dirKey>/` (threaded by the pipeline
 * from {@link computePublishLocation}) so emitted asset URLs resolve under the
 * sub-path. Caddy serves the directory with an SPA fallback to its index.html.
 *
 * Directory layout (flat — no live/test subdir; preview gets a `p-` prefix on
 * dirKey instead, so prod and preview never collide):
 *   SITES_DIR/<dirKey>/index.html
 *   SITES_DIR/<dirKey>/assets/...
 *
 * v1 scope: static SPA output only. Process-kind frameworks (Next.js SSR,
 * Nuxt, etc.) are not served under a sub-path — those need the subdomain
 * topology (which the pipeline auto-selects when tunnel/wildcard infra exists).
 */
export class DoablePathAdapter implements DeployAdapter {
  readonly name = "doable-path";

  async deploy(input: DeployInput): Promise<DeployResult> {
    const { projectId, buildOutputDir, environment, subdomain } = input;

    if (!subdomain) {
      throw new Error("subdomain is required for doable-path adapter");
    }

    if (!existsSync(buildOutputDir)) {
      throw new Error(
        `Build output directory not found: ${buildOutputDir}. ` +
          `The Vite build may have failed or output to a different location.`,
      );
    }

    let buildFiles: string[];
    try {
      buildFiles = await readdir(buildOutputDir);
    } catch (err) {
      throw new Error(
        `Cannot read build output directory: ${buildOutputDir}. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (buildFiles.length === 0) {
      throw new Error(
        `Build output directory is empty: ${buildOutputDir}. ` +
          `The Vite build likely produced no output.`,
      );
    }

    const loc = computePublishLocation(subdomain, environment, "path");
    const targetDir = path.join(SITES_DIR, loc.dirKey);

    // Pre-flight: ensure SITES_DIR is reachable + writable from the API
    // process. Catches volume-mount / permission drift before we leak a
    // half-baked ENOENT path string to the user (BUG-2026-05-14-publish-001).
    await assertSitesDirWritable(SITES_DIR);

    try {
      // Replace any prior deployment for this dirKey atomically-ish: remove
      // then recreate. (dirKey is environment-specific via the `p-` prefix.)
      if (existsSync(targetDir)) {
        await rm(targetDir, { recursive: true, force: true });
      }
      await mkdir(targetDir, { recursive: true });
      await cp(buildOutputDir, targetDir, { recursive: true });

      const copiedFiles = await readdir(targetDir);
      if (copiedFiles.length === 0) {
        throw new Error("Copy completed but target directory is empty");
      }

      const files = await collectFileInfo(targetDir, targetDir);
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      console.log(
        `[doable-path] Deployed ${files.length} files (${formatBytes(totalSize)}) ` +
          `for project ${projectId} (${environment}) to ${targetDir} → ${loc.url}`,
      );

      return {
        url: loc.url,
        adapter: this.name,
        totalSize,
        files,
        metadata: {
          targetDir,
          dirKey: loc.dirKey,
          basePath: loc.basePath,
          topology: "path",
          sitesDir: SITES_DIR,
        },
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes("Copy completed")) {
        throw err;
      }
      throw new Error(
        `Failed to deploy to ${targetDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async teardown(projectId: string, environment: string): Promise<void> {
    // The pipeline doesn't currently pass the subdomain to teardown, so we
    // can't resolve the exact dirKey here. Mirror DoableCloudAdapter's
    // best-effort log-only behaviour; unpublish flows that know the subdomain
    // remove the directory directly via getPublishedSiteDir().
    console.log(
      `[doable-path] Teardown requested for project=${projectId} env=${environment}`,
    );
  }
}
