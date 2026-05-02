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
  modules: [],
  app: {
    baseURL: process.env.DOABLE_BASE_PATH ?? "/",
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
  <div class="p-8">
    <h1 class="text-3xl">Welcome to Nuxt</h1>
    <NuxtPage />
  </div>
</template>
`;

const PAGES_INDEX_VUE = `<template>
  <section class="mt-6 space-y-4">
    <p class="text-lg opacity-80">
      Edit <code>pages/index.vue</code> and the AI will build features on top
      of this scaffold.
    </p>
    <p class="text-sm opacity-60">
      File-based routing is enabled: drop a new file under
      <code>pages/</code> to add a route. Server routes live under
      <code>server/api/</code>.
    </p>
    <p>
      <NuxtLink to="/about" class="underline">Visit /about</NuxtLink>
    </p>
  </section>
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
