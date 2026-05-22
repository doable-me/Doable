/**
 * Real-build end-to-end smoke test for the 3 remaining process-kind
 * frameworks: Nuxt, SvelteKit, Astro. Each phase materialises a real
 * minimal source tree, runs the framework's actual build, deploys via
 * doable-cloud, starts via node-standalone, HTTP-probes, then tears down.
 *
 * Linux + systemd only. Each phase takes 1-3 minutes for npm install +
 * build, so the whole script can run 5-10 minutes.
 *
 * Run: cd services/api && set -a; source ../../.env; set +a;
 *      ./node_modules/.bin/tsx scripts/verify-e2e-frameworks.ts
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? "/data/projects";

interface StepResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: StepResult[] = [];

function step(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name.padEnd(48)} — ${detail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function probeTcp(host: string, port: number): Promise<{ ok: boolean; body: string }> {
  return new Promise((resolve) => {
    const sock = connect({ host, port });
    let body = "";
    sock.setTimeout(3000);
    sock.on("connect", () => {
      sock.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    });
    sock.on("data", (d) => { body += d.toString(); });
    sock.on("end", () => resolve({ ok: body.length > 0, body }));
    sock.on("error", (e) => resolve({ ok: false, body: e.message }));
    sock.on("timeout", () => {
      sock.destroy();
      resolve({ ok: false, body: "timeout" });
    });
  });
}

interface FrameworkSpec {
  prefix: string;        // step name prefix, e.g. "nuxt"
  fixtureName: string;
  fixtureFiles: Record<string, string>;
  buildCmd: { cmd: string; args: string[] };
  expectedBuildEntry: string;       // relative to project dir
  expectedStagedEntry: string;      // relative to dist-server/
  buildOutputDirRel: string;        // relative to project dir, passed to deploy
  expectedBodyMatch: string;
}

async function runFrameworkPhase(spec: FrameworkSpec): Promise<void> {
  const slug = `e2e-${spec.prefix}-${Date.now().toString(36)}`;
  const projectDir = path.join(PROJECTS_ROOT, slug);
  const port = 39000 + Math.floor(Math.random() * 1000);

  // 1. Materialise the fixture tree.
  for (const [rel, content] of Object.entries(spec.fixtureFiles)) {
    const full = path.join(projectDir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf-8");
  }
  step(`${spec.prefix}:fixture-create`, true, `${Object.keys(spec.fixtureFiles).length} files`);

  // 2. npm install.
  console.log(`[${spec.prefix}] npm install (this can take 1-3 min)...`);
  const installRes = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    timeout: 300_000,
  });
  step(
    `${spec.prefix}:npm-install`,
    installRes.status === 0,
    installRes.status === 0
      ? "ok"
      : `exit ${installRes.status}: ${(installRes.stderr ?? installRes.stdout)?.toString().slice(-200) ?? ""}`,
  );
  if (installRes.status !== 0) return;

  // 3. Real build.
  console.log(`[${spec.prefix}] ${spec.buildCmd.cmd} ${spec.buildCmd.args.join(" ")} ...`);
  const buildRes = spawnSync(spec.buildCmd.cmd, spec.buildCmd.args, {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    timeout: 300_000,
  });
  step(
    `${spec.prefix}:build`,
    buildRes.status === 0,
    buildRes.status === 0 ? "ok" : `exit ${buildRes.status}: ${(buildRes.stderr ?? buildRes.stdout)?.toString().slice(-300) ?? ""}`,
  );
  if (buildRes.status !== 0) return;

  step(
    `${spec.prefix}:build-output`,
    existsSync(path.join(projectDir, spec.expectedBuildEntry)),
    spec.expectedBuildEntry,
  );

  // 4. doable-cloud deploy.
  process.env.PROJECTS_ROOT = PROJECTS_ROOT;
  const { DoableCloudAdapter } = await import(
    path.resolve(HERE, "../src/deploy/adapters/doable-cloud.js")
  );
  const adapter = new DoableCloudAdapter();
  try {
    await adapter.deploy({
      projectId: slug,
      projectSlug: slug,
      workspaceSlug: "e2e",
      subdomain: slug,
      buildOutputDir: path.join(projectDir, spec.buildOutputDirRel),
      environment: "preview",
    });
  } catch (err) {
    step(`${spec.prefix}:deploy-stage`, false, err instanceof Error ? err.message : String(err));
    return;
  }
  const stagedFull = path.join(projectDir, "dist-server", spec.expectedStagedEntry);
  step(
    `${spec.prefix}:deploy-stage`,
    existsSync(stagedFull),
    existsSync(stagedFull) ? `dist-server/${spec.expectedStagedEntry} present` : `MISSING ${stagedFull}`,
  );
  if (!existsSync(stagedFull)) return;

  // 5. Runtime start.
  const { nodeStandaloneAdapter } = await import(
    path.resolve(HERE, "../src/runtime/adapters/node-standalone.js")
  );
  const handle = await nodeStandaloneAdapter.start({
    projectId: slug,
    projectSlug: slug,
    workspaceSlug: "e2e",
    siteDir: path.join("/data/sites", slug),
    projectDir,
    framework: { id: spec.prefix === "nuxt" ? "nuxt" : spec.prefix === "svelte" ? "sveltekit" : "astro" },
    env: {},
    listen: { kind: "tcp-port", host: "127.0.0.1", port },
    userId: null,
  });
  step(`${spec.prefix}:runtime-start`, true, `addr=${handle.listenAddr}`);

  // 6. HTTP probe.
  let probed = { ok: false, body: "no-attempt" };
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    probed = await probeTcp("127.0.0.1", port);
    if (probed.ok) break;
  }
  const bodyMatch = probed.body.includes(spec.expectedBodyMatch);
  step(
    `${spec.prefix}:tcp-probe`,
    probed.ok && bodyMatch,
    probed.ok ? `200 OK${bodyMatch ? "" : ` (body did NOT match "${spec.expectedBodyMatch}"): ${probed.body.slice(0, 200)}`}` : `probe failed: ${probed.body.slice(0, 80)}`,
  );

  // 7. systemd show.
  const sd = spawnSync(
    "systemctl",
    ["show", `doable-app@${slug}.service`, "--property=ActiveState", "--property=ExecMainStatus", "--no-pager"],
    { encoding: "utf-8" },
  );
  step(`${spec.prefix}:systemd-show`, sd.status === 0, sd.stdout?.replace(/\n/g, " ").trim() ?? `error: ${sd.stderr?.trim()}`);

  // 8. Teardown.
  await nodeStandaloneAdapter.stop(handle);
  await sleep(500);
  const post = await probeTcp("127.0.0.1", port);
  step(`${spec.prefix}:runtime-stop`, !post.ok, post.ok ? "port still accepting" : "port closed");

  await rm(projectDir, { recursive: true, force: true });
}

const NUXT_FIXTURE: FrameworkSpec = {
  prefix: "nuxt",
  fixtureName: "Nuxt 3",
  fixtureFiles: {
    "package.json": JSON.stringify(
      {
        name: "e2e-nuxt-test",
        private: true,
        type: "module",
        dependencies: { nuxt: "^3.13.0" },
      },
      null,
      2,
    ),
    "nuxt.config.ts": `export default defineNuxtConfig({ devtools: { enabled: false } });\n`,
    "app.vue": `<template>
  <div>e2e nuxt ok {{ slug }}</div>
</template>
<script setup lang="ts">
const slug = "e2e-nuxt";
</script>
`,
  },
  buildCmd: { cmd: "npx", args: ["nuxi", "build"] },
  expectedBuildEntry: ".output/server/index.mjs",
  expectedStagedEntry: "index.mjs",
  buildOutputDirRel: ".output",
  expectedBodyMatch: "e2e nuxt ok",
};

const SVELTE_FIXTURE: FrameworkSpec = {
  prefix: "svelte",
  fixtureName: "SvelteKit + adapter-node",
  fixtureFiles: {
    "package.json": JSON.stringify(
      {
        name: "e2e-sveltekit-test",
        private: true,
        type: "module",
        scripts: { build: "vite build" },
        devDependencies: {
          "@sveltejs/adapter-node": "^5.2.0",
          "@sveltejs/kit": "^2.0.0",
          "@sveltejs/vite-plugin-svelte": "^4.0.0",
          svelte: "^5.0.0",
          vite: "^5.4.0",
          typescript: "^5.0.0",
        },
      },
      null,
      2,
    ),
    "svelte.config.js": `import adapter from "@sveltejs/adapter-node";
export default { kit: { adapter: adapter() } };
`,
    "vite.config.js": `import { sveltekit } from "@sveltejs/kit/vite";
export default { plugins: [sveltekit()] };
`,
    "src/routes/+page.svelte": `<script>
  const slug = "e2e-sveltekit";
</script>
<h1>e2e sveltekit ok {slug}</h1>
`,
    "src/app.html": `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body><div>%sveltekit.body%</div></body>
</html>
`,
  },
  buildCmd: { cmd: "npx", args: ["vite", "build"] },
  expectedBuildEntry: "build/index.js",
  expectedStagedEntry: "index.js",
  buildOutputDirRel: "build",
  expectedBodyMatch: "e2e sveltekit ok",
};

const ASTRO_FIXTURE: FrameworkSpec = {
  prefix: "astro",
  fixtureName: "Astro SSR + @astrojs/node",
  fixtureFiles: {
    "package.json": JSON.stringify(
      {
        name: "e2e-astro-test",
        private: true,
        type: "module",
        scripts: { build: "astro build" },
        // @astrojs/node@9 requires astro@5; pin both to compatible majors.
        dependencies: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" },
      },
      null,
      2,
    ),
    "astro.config.mjs": `import { defineConfig } from "astro/config";
import node from "@astrojs/node";
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
});
`,
    "src/pages/index.astro": `---
const slug = "e2e-astro";
---
<html>
  <body>
    <h1>e2e astro ok {slug}</h1>
  </body>
</html>
`,
  },
  buildCmd: { cmd: "npx", args: ["astro", "build"] },
  expectedBuildEntry: "dist/server/entry.mjs",
  expectedStagedEntry: "entry.mjs",
  buildOutputDirRel: "dist",
  expectedBodyMatch: "e2e astro ok",
};

async function main(): Promise<void> {
  if (process.platform !== "linux") {
    console.error("This script requires Linux + systemd. Aborting.");
    process.exit(1);
  }

  const which = process.argv[2] ?? "all";
  const phases: FrameworkSpec[] =
    which === "nuxt" ? [NUXT_FIXTURE]
    : which === "svelte" ? [SVELTE_FIXTURE]
    : which === "astro" ? [ASTRO_FIXTURE]
    : [NUXT_FIXTURE, SVELTE_FIXTURE, ASTRO_FIXTURE];

  for (const spec of phases) {
    console.log("");
    console.log(`=== Phase: ${spec.fixtureName} ===`);
    await runFrameworkPhase(spec);
  }

  console.log("");
  const allOk = results.every((r) => r.ok);
  console.log(`=== ${allOk ? "ALL STEPS PASS" : "FAIL"} ===`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("verify-e2e-frameworks crashed:", err);
  process.exit(2);
});
