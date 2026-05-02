import type { TemplateDefinition } from "../registry.js";

/**
 * SvelteKit blank starter.
 *
 * Pairs with the `sveltekit` framework adapter. The agent prompt for
 * `framework_id: "sveltekit"` documents SvelteKit conventions (filesystem
 * routing under src/routes/, +page.svelte / +layout.svelte / +page.server.ts,
 * load functions, form actions, the PUBLIC_* env prefix).
 *
 * Minimum viable shape: package.json + svelte.config.js + vite.config.ts +
 * tsconfig.json + src/app.html + a root layout + index page. Enough for
 * `vite dev` to boot, render a starter page, and let the AI build features
 * on top.
 */

const PACKAGE_JSON = JSON.stringify(
  {
    name: "doable-sveltekit-project",
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "vite dev",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      "@sveltejs/kit": "^2.0.0",
      "@sveltejs/adapter-node": "^5.0.0",
    },
    devDependencies: {
      "@sveltejs/vite-plugin-svelte": "^3.0.0",
      svelte: "^4.0.0",
      vite: "^5.0.0",
      typescript: "^5.7.2",
    },
  },
  null,
  2,
);

const SVELTE_CONFIG_JS = `import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: "build" }),
  },
};

export default config;
`;

const VITE_CONFIG_TS = `import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
});
`;

const TSCONFIG = JSON.stringify(
  {
    extends: "./.svelte-kit/tsconfig.json",
    compilerOptions: {
      allowJs: true,
      checkJs: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      sourceMap: true,
      strict: true,
      moduleResolution: "bundler",
    },
  },
  null,
  2,
);

const APP_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`;

const ROOT_LAYOUT = `<slot />
`;

const ROOT_PAGE = `<script lang="ts">
  // Doable starter for SvelteKit. Edit src/routes/+page.svelte and the AI
  // will build features on top of this scaffold.
</script>

<main style="padding: 2rem; font-family: system-ui, sans-serif;">
  <h1 style="font-size: 2rem; font-weight: bold;">Welcome to SvelteKit</h1>
  <p style="margin-top: 1rem; opacity: 0.8;">
    Edit <code>src/routes/+page.svelte</code> to get started.
  </p>
  <p style="margin-top: 0.5rem; font-size: 0.875rem; opacity: 0.6;">
    File-based routing lives under <code>src/routes/</code>. Use
    <code>+page.server.ts</code> for server-only load functions and form
    actions. The <code>PUBLIC_*</code> env prefix exposes values to the
    browser.
  </p>
</main>
`;

const GITIGNORE = `# SvelteKit build artifacts
.svelte-kit
build

# Dependencies
node_modules

# Misc
.DS_Store
*.log

# Local env files
.env
.env.local
.env*.local

# Vite
vite.config.js.timestamp-*
vite.config.ts.timestamp-*
`;

export const sveltekitBlankTemplate: TemplateDefinition = {
  id: "sveltekit-blank",
  name: "SvelteKit",
  description:
    "SvelteKit 2 + Svelte 4 + TypeScript starter with the Node adapter. Filesystem routing, server load functions, and form actions ready out of the box.",
  category: "starter",
  tags: ["sveltekit", "svelte", "typescript", "ssr", "starter"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "sveltekit",

  codeFiles: {
    "package.json": PACKAGE_JSON,
    "svelte.config.js": SVELTE_CONFIG_JS,
    "vite.config.ts": VITE_CONFIG_TS,
    "tsconfig.json": TSCONFIG,
    "src/app.html": APP_HTML,
    "src/routes/+layout.svelte": ROOT_LAYOUT,
    "src/routes/+page.svelte": ROOT_PAGE,
    ".gitignore": GITIGNORE,
  },
};
