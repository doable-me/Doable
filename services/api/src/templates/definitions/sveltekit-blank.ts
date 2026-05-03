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
      "@tailwindcss/vite": "^4.0.0",
      svelte: "^4.0.0",
      tailwindcss: "^4.0.0",
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
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
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
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`;

const APP_CSS = `@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: "Inter", system-ui, sans-serif;
}

:root {
  --background: #ffffff;
  --foreground: #171717;
}

.dark {
  --background: #0a0a0a;
  --foreground: #ededed;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

@keyframes pulse-dot {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.2); }
}
`;

const ROOT_LAYOUT = `<script>
  import "../app.css";
</script>

<slot />
`;

const ROOT_PAGE = `<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  const phrases = [
    "Dream it. Build it.",
    "Ideas become reality here.",
    "Your canvas awaits.",
    "Let's create something amazing.",
    "From zero to wow.",
  ];

  let phraseIndex = 0;
  let opacity = 1;
  let interval: ReturnType<typeof setInterval>;

  onMount(() => {
    interval = setInterval(() => {
      opacity = 0;
      setTimeout(() => {
        phraseIndex = (phraseIndex + 1) % phrases.length;
        opacity = 1;
      }, 400);
    }, 3500);
  });

  onDestroy(() => clearInterval(interval));
</script>

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-50 via-stone-100 to-white dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
  <div class="text-center space-y-6">
    <div class="flex justify-center">
      <svg viewBox="0 0 40 40" fill="none" class="w-16 h-16 drop-shadow-lg">
        <rect width="40" height="40" rx="10" fill="#F97316">
          <animate attributeName="rx" values="10;14;10" dur="3s" repeatCount="indefinite" />
        </rect>
        <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" style="font-size: 22px; font-weight: 700; font-family: system-ui">D</text>
      </svg>
    </div>
    <div class="space-y-2">
      <h1 class="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
        Doable
      </h1>
      <p
        class="text-lg text-[#F97316] font-medium transition-opacity"
        style="opacity: {opacity}; transition-duration: 400ms;"
      >
        {phrases[phraseIndex]}
      </p>
    </div>
    <p class="text-sm text-neutral-500 dark:text-neutral-400">
      Your project is ready — start chatting to build
    </p>
    <div class="flex justify-center pt-2">
      <div class="flex gap-1.5">
        {#each [0, 1, 2] as i}
          <div
            class="w-1.5 h-1.5 rounded-full bg-[#F97316]"
            style="animation: pulse-dot 1.4s ease-in-out {i * 0.2}s infinite;"
          />
        {/each}
      </div>
    </div>
  </div>
</div>
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
    "src/app.css": APP_CSS,
    "src/routes/+layout.svelte": ROOT_LAYOUT,
    "src/routes/+page.svelte": ROOT_PAGE,
    ".gitignore": GITIGNORE,
  },
};
