/**
 * Synthetic verification of doable-cloud's deploy pipeline.
 *
 * For each of the 4 process-kind frameworks, materialize a fake project
 * tree matching the layout doable-cloud's existsSync detection branches
 * look for, run the deploy adapter, and assert the staged dist-server/
 * contains the expected entry file (per the Wave 13 priority list:
 * server.js, index.mjs, index.js, entry.mjs).
 *
 * Run from repo root:
 *   cd services/api && npx tsx scripts/verify-publish.ts
 *
 * Exit code: 0 on all-pass, 1 if any framework's staged layout is wrong.
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// IMPORTANT: doable-cloud.ts reads PROJECTS_ROOT and SITES_DIR at module
// import time, so we set them BEFORE the dynamic import below. The script
// is deliberately a single async main() to keep the env-set + import order
// intact.

interface Fixture {
  name: string;
  projectId: string;
  files: Record<string, string>;
  buildOutputDir: string;
  expectedEntry: string;
}

async function setupFixture(projectsRoot: string, fx: Fixture): Promise<void> {
  for (const [rel, content] of Object.entries(fx.files)) {
    const full = path.join(projectsRoot, fx.projectId, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf-8");
  }
}

async function main(): Promise<void> {
  const root = path.join(tmpdir(), `doable-verify-${Date.now()}`);
  const projectsRoot = path.join(root, "projects");
  const sitesDir = path.join(root, "sites");
  process.env.PROJECTS_ROOT = projectsRoot;
  process.env.SITES_DIR = sitesDir;

  await mkdir(projectsRoot, { recursive: true });
  await mkdir(sitesDir, { recursive: true });

  // Dynamic import AFTER env vars are set so doable-cloud's module-level
  // `PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? "/data/projects"` picks
  // up our temp paths.
  const { DoableCloudAdapter } = await import("../src/deploy/adapters/doable-cloud.js");
  const doableCloudAdapter = new DoableCloudAdapter();

  const fixtures: Fixture[] = [
    {
      name: "Next.js standalone",
      projectId: "next-test",
      files: {
        ".next/standalone/server.js": 'console.log("next");\n',
        ".next/standalone/package.json": '{"name":"next-test"}\n',
        ".next/static/file.txt": "static asset",
        "public/favicon.ico": "fake-ico",
      },
      buildOutputDir: path.join(projectsRoot, "next-test", ".next"),
      expectedEntry: "server.js",
    },
    {
      name: "Nuxt nitro",
      projectId: "nuxt-test",
      files: {
        ".output/server/index.mjs": 'console.log("nuxt");\n',
        ".output/server/handler.mjs": 'export default {};\n',
        ".output/public/index.html": "<html></html>",
      },
      buildOutputDir: path.join(projectsRoot, "nuxt-test", ".output"),
      expectedEntry: "index.mjs",
    },
    {
      name: "SvelteKit adapter-node",
      projectId: "svelte-test",
      files: {
        "build/index.js": 'console.log("svelte");\n',
        "build/handler.js": 'export default {};\n',
      },
      buildOutputDir: path.join(projectsRoot, "svelte-test", "build"),
      expectedEntry: "index.js",
    },
    {
      name: "Hono node-build",
      projectId: "hono-test",
      files: {
        "dist/index.js": 'console.log("hono");\n',
        "package.json": '{"name":"hono-test","version":"0.1.0","dependencies":{}}\n',
      },
      buildOutputDir: path.join(projectsRoot, "hono-test", "dist"),
      expectedEntry: "index.js",
    },
  ];

  const results: Array<{ name: string; ok: boolean; detail: string }> = [];

  for (const fx of fixtures) {
    try {
      await setupFixture(projectsRoot, fx);

      // The deploy adapter's static-spa copy step needs the buildOutputDir
      // to exist as a real directory. All our fixtures already create the
      // build dir via the file paths above, so this is satisfied.
      await doableCloudAdapter.deploy({
        projectId: fx.projectId,
        projectSlug: fx.projectId,
        workspaceSlug: "verify",
        subdomain: fx.projectId,
        buildOutputDir: fx.buildOutputDir,
        environment: "preview",
      });

      const stagedEntry = path.join(
        projectsRoot,
        fx.projectId,
        "dist-server",
        fx.expectedEntry,
      );
      const ok = existsSync(stagedEntry);
      results.push({
        name: fx.name,
        ok,
        detail: ok
          ? `dist-server/${fx.expectedEntry} present`
          : `MISSING: ${stagedEntry}`,
      });
    } catch (err) {
      results.push({
        name: fx.name,
        ok: false,
        detail: `EXCEPTION: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  console.log("\n=== verify-publish results ===");
  let allOk = true;
  for (const r of results) {
    const flag = r.ok ? "PASS" : "FAIL";
    console.log(`  [${flag}] ${r.name.padEnd(28)} — ${r.detail}`);
    if (!r.ok) allOk = false;
  }
  console.log(`=== ${allOk ? "ALL PASS" : "FAIL"} ===\n`);

  await rm(root, { recursive: true, force: true });
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("verify-publish crashed:", err);
  process.exit(2);
});
