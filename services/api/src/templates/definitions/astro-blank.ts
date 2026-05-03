import type { TemplateDefinition } from "../registry.js";

/**
 * Astro 4 blank starter.
 *
 * Pairs with the `astro` framework adapter. The agent prompt for
 * `framework_id: "astro"` documents Astro conventions (file-based routing
 * under src/pages/, .astro components with frontmatter, layouts under
 * src/layouts/, the PUBLIC_* env prefix, optional integrations for
 * islands).
 *
 * Minimum viable shape: package.json + astro.config.mjs + tsconfig.json +
 * src/pages/index.astro + src/layouts/Layout.astro. Enough for `astro dev`
 * to boot, render a starter page, and let the AI build features on top.
 */

const PACKAGE_JSON = JSON.stringify(
  {
    name: "doable-astro-project",
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "astro dev",
      build: "astro build",
      preview: "astro preview",
      astro: "astro",
    },
    dependencies: {
      astro: "^4.0.0",
      "@astrojs/tailwind": "^5.1.0",
      tailwindcss: "^3.4.0",
    },
    devDependencies: {
      typescript: "^5.7.2",
    },
  },
  null,
  2,
);

const ASTRO_CONFIG_MJS = `import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind()],
});
`;

const TSCONFIG = JSON.stringify(
  {
    extends: "astro/tsconfigs/strict",
  },
  null,
  2,
);

const LAYOUT_ASTRO = `---
interface Props {
  title?: string;
}

const { title = "Doable App" } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <title>{title}</title>
  </head>
  <body class="font-[Inter,system-ui,sans-serif] antialiased bg-[var(--background)] text-[var(--foreground)]">
    <slot />
  </body>
</html>

<style is:global>
  :root {
    --background: #ffffff;
    --foreground: #171717;
  }
  .dark {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
  @keyframes pulse-dot {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.2); }
  }
</style>
`;

const PAGES_INDEX_ASTRO = `---
import Layout from "../layouts/Layout.astro";
---

<Layout title="Doable App">
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
        <p class="text-lg text-[#F97316] font-medium" id="tagline">
          Dream it. Build it.
        </p>
      </div>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        Your project is ready \u2014 start chatting to build
      </p>
      <div class="flex justify-center pt-2">
        <div class="flex gap-1.5">
          <div class="w-1.5 h-1.5 rounded-full bg-[#F97316]" style="animation: pulse-dot 1.4s ease-in-out 0s infinite;"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-[#F97316]" style="animation: pulse-dot 1.4s ease-in-out 0.2s infinite;"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-[#F97316]" style="animation: pulse-dot 1.4s ease-in-out 0.4s infinite;"></div>
        </div>
      </div>
    </div>
  </div>
</Layout>

<script>
  const phrases = [
    "Dream it. Build it.",
    "Ideas become reality here.",
    "Your canvas awaits.",
    "Let's create something amazing.",
    "From zero to wow.",
  ];
  let index = 0;
  const el = document.getElementById("tagline");
  if (el) {
    setInterval(() => {
      el.style.opacity = "0";
      setTimeout(() => {
        index = (index + 1) % phrases.length;
        el.textContent = phrases[index];
        el.style.opacity = "1";
      }, 400);
    }, 3500);
  }
</script>

<style>
  #tagline {
    transition: opacity 400ms;
  }
</style>
`;

const GITIGNORE = `# Astro build artifacts
.astro
dist

# Dependencies
node_modules

# Misc
.DS_Store
*.log

# Local env files
.env
.env.local
.env*.local
`;

export const astroBlankTemplate: TemplateDefinition = {
  id: "astro-blank",
  name: "Astro",
  description:
    "Astro 4 + TypeScript starter. File-based routing, content-first by default, and optional islands via integrations.",
  category: "starter",
  tags: ["astro", "typescript", "ssg", "ssr", "starter"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "astro",

  codeFiles: {
    "package.json": PACKAGE_JSON,
    "astro.config.mjs": ASTRO_CONFIG_MJS,
    "tsconfig.json": TSCONFIG,
    "src/layouts/Layout.astro": LAYOUT_ASTRO,
    "src/pages/index.astro": PAGES_INDEX_ASTRO,
    ".gitignore": GITIGNORE,
  },
};
