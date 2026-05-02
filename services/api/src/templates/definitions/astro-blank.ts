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
    },
    devDependencies: {
      typescript: "^5.7.2",
    },
  },
  null,
  2,
);

const ASTRO_CONFIG_MJS = `import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({});
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
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
`;

const PAGES_INDEX_ASTRO = `---
import Layout from "../layouts/Layout.astro";
---

<Layout title="Welcome to Astro">
  <main style="padding: 2rem; font-family: system-ui, sans-serif;">
    <h1 style="font-size: 2rem; font-weight: bold;">Welcome to Astro</h1>
    <p style="margin-top: 1rem; opacity: 0.8;">
      Edit <code>src/pages/index.astro</code> and the AI will build features
      on top of this scaffold.
    </p>
    <p style="margin-top: 0.5rem; font-size: 0.875rem; opacity: 0.6;">
      File-based routing lives under <code>src/pages/</code>. Use the
      <code>PUBLIC_*</code> env prefix for browser-safe values. Add
      integrations (React, Vue, Svelte, MDX) via <code>astro.config.mjs</code>
      to enable islands.
    </p>
  </main>
</Layout>
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
