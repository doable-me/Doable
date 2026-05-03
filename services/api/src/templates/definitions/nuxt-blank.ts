import type { TemplateDefinition } from "../registry.js";

/**
 * Nuxt 3 blank starter.
 *
 * Pairs with the `nuxt` framework adapter. The agent prompt for
 * `framework_id: "nuxt"` documents Nuxt conventions (file-based routing
 * under pages/, server routes under server/api, auto-imports, the
 * NUXT_PUBLIC_* env prefix for runtimeConfig).
 *
 * Minimum viable shape: package.json + nuxt.config.ts + tsconfig.json +
 * app.vue + a sample page. Enough for `nuxt dev` to boot, render a
 * starter page, and let the AI build features on top.
 */

const PACKAGE_JSON = JSON.stringify(
  {
    name: "doable-nuxt-project",
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "nuxt dev",
      build: "nuxt build",
      preview: "nuxt preview",
      generate: "nuxt generate",
    },
    dependencies: {
      nuxt: "^3.13.0",
      vue: "^3.5.0",
    },
    devDependencies: {
      "@nuxtjs/tailwindcss": "^6.12.0",
      typescript: "^5.7.2",
    },
  },
  null,
  2,
);

const NUXT_CONFIG_TS = `import { defineNuxtConfig } from "nuxt/config";

/**
 * Nuxt config. Doable threads its preview base path via the
 * DOABLE_BASE_PATH env var; surface it as app.baseURL so links resolve
 * correctly under /preview/{projectId}/. In production the runtime
 * supervisor hosts this app at the project's root subdomain and
 * DOABLE_BASE_PATH is empty (default "/").
 */
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ["@nuxtjs/tailwindcss"],
  app: {
    baseURL: process.env.DOABLE_BASE_PATH ?? "/",
    head: {
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
      ],
    },
  },
});
`;

const TSCONFIG = JSON.stringify(
  {
    extends: "./.nuxt/tsconfig.json",
  },
  null,
  2,
);

const APP_VUE = `<template>
  <div>
    <NuxtPage />
  </div>
</template>

<style>
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
  font-family: "Inter", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
@keyframes pulse-dot {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.2); }
}
</style>
`;

const PAGES_INDEX_VUE = `<script setup lang="ts">
const phrases = [
  "Dream it. Build it.",
  "Ideas become reality here.",
  "Your canvas awaits.",
  "Let's create something amazing.",
  "From zero to wow.",
];

const phraseIndex = ref(0);
const opacity = ref(1);

let interval: ReturnType<typeof setInterval>;
onMounted(() => {
  interval = setInterval(() => {
    opacity.value = 0;
    setTimeout(() => {
      phraseIndex.value = (phraseIndex.value + 1) % phrases.length;
      opacity.value = 1;
    }, 400);
  }, 3500);
});
onUnmounted(() => clearInterval(interval));
</script>

<template>
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
          :style="{ opacity, transitionDuration: '400ms' }"
        >
          {{ phrases[phraseIndex] }}
        </p>
      </div>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        Your project is ready — start chatting to build
      </p>
      <div class="flex justify-center pt-2">
        <div class="flex gap-1.5">
          <div
            v-for="i in 3"
            :key="i"
            class="w-1.5 h-1.5 rounded-full bg-[#F97316]"
            :style="{ animation: \\\`pulse-dot 1.4s ease-in-out \${(i - 1) * 0.2}s infinite\\\` }"
          />
        </div>
      </div>
    </div>
  </div>
</template>
`;

const GITIGNORE = `# Nuxt build artifacts
.nuxt
.output

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

export const nuxtBlankTemplate: TemplateDefinition = {
  id: "nuxt-blank",
  name: "Nuxt (Vue 3)",
  description:
    "Nuxt 3 + Vue 3 + TypeScript starter. File-based routing, server API routes, and auto-imports ready out of the box.",
  category: "starter",
  tags: ["nuxt", "vue", "typescript", "ssr", "starter"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "nuxt",

  codeFiles: {
    "package.json": PACKAGE_JSON,
    "nuxt.config.ts": NUXT_CONFIG_TS,
    "tsconfig.json": TSCONFIG,
    "app.vue": APP_VUE,
    "pages/index.vue": PAGES_INDEX_VUE,
    ".gitignore": GITIGNORE,
  },
};
