import { writeFile, unlink, access } from "node:fs/promises";
import { join, basename } from "node:path";
import type { AuditEntry, ConfigGuardOptions, ConfigTemplate } from "./types.js";
import type { Tracer } from "./tracer.js";

// ═══════════════════════════════════════════════════════════════════════════
// Per-framework safe config template sets
//
// Each entry maps a frameworkId to:
//   - templates: canonical filename -> safe file content (will be written)
//   - variants:  alternative filenames that could shadow a canonical
//                (will be deleted before canonical is written)
//
// The "vite-react" entry preserves the historical default templates used by
// ConfigGuard before per-framework support was added. Do not change those
// literals without coordinating with services/api callers — see project_doable
// network/security rules in CLAUDE.md.
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfigTemplateSet {
  /** Canonical filename -> safe file content. */
  templates: Record<string, string>;
  /** Alternative filenames to delete (shadow-attack prevention). */
  variants?: string[];
}

export const CONFIG_TEMPLATE_SETS: Record<string, ConfigTemplateSet> = {
  "vite-react": {
    templates: {
      "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
      "postcss.config.js": `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
      "tailwind.config.ts": `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
`,
    },
    variants: [
      "vite.config.js",
      "vite.config.mjs",
      "vite.config.cjs",
      "postcss.config.mjs",
      "postcss.config.cjs",
      "postcss.config.ts",
      ".postcssrc.js",
      ".postcssrc.cjs",
      ".postcssrc.mjs",
      ".postcssrc",
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
    ],
  },

  "nextjs-app": {
    templates: {
      "next.config.ts": `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
`,
      "postcss.config.js": `export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
`,
    },
    variants: [
      "next.config.js",
      "next.config.mjs",
      "next.config.cjs",
      "postcss.config.mjs",
      "postcss.config.cjs",
      "postcss.config.ts",
      ".postcssrc.js",
      ".postcssrc.cjs",
      ".postcssrc.mjs",
      ".postcssrc",
    ],
  },

  nuxt: {
    templates: {
      "nuxt.config.ts": `export default defineNuxtConfig({});
`,
    },
    variants: [
      "nuxt.config.js",
      "nuxt.config.mjs",
      "nuxt.config.cjs",
    ],
  },

  sveltekit: {
    templates: {
      "svelte.config.js": `import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
  },
};
`,
      "vite.config.ts": `import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
});
`,
    },
    variants: [
      "svelte.config.ts",
      "svelte.config.mjs",
      "svelte.config.cjs",
      "vite.config.js",
      "vite.config.mjs",
      "vite.config.cjs",
    ],
  },

  astro: {
    templates: {
      "astro.config.mjs": `import { defineConfig } from "astro/config";

export default defineConfig({});
`,
    },
    variants: [
      "astro.config.js",
      "astro.config.ts",
      "astro.config.cjs",
    ],
  },
};

/** Default frameworkId when callers omit one — preserves historical behavior. */
export const DEFAULT_FRAMEWORK_ID = "vite-react";

// ═══════════════════════════════════════════════════════════════════════════
// Legacy default templates
//
// Retained as the in-constructor default so that callers which never pass a
// frameworkId continue to see byte-identical write/delete behavior. Built
// from the "vite-react" template set above so we maintain a single source
// of truth.
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_TEMPLATES: ConfigTemplate[] = [
  {
    canonical: "vite.config.ts",
    variants: [
      "vite.config.js",
      "vite.config.mjs",
      "vite.config.cjs",
    ],
    content: CONFIG_TEMPLATE_SETS["vite-react"].templates["vite.config.ts"],
  },
  {
    canonical: "postcss.config.js",
    variants: [
      "postcss.config.mjs",
      "postcss.config.cjs",
      "postcss.config.ts",
      ".postcssrc.js",
      ".postcssrc.cjs",
      ".postcssrc.mjs",
      ".postcssrc",
    ],
    content: CONFIG_TEMPLATE_SETS["vite-react"].templates["postcss.config.js"],
  },
  {
    canonical: "tailwind.config.ts",
    variants: [
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
    ],
    content: CONFIG_TEMPLATE_SETS["vite-react"].templates["tailwind.config.ts"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Config Guard
// ═══════════════════════════════════════════════════════════════════════════

export class ConfigGuard {
  private templates: ConfigTemplate[];
  private onAudit?: (entry: AuditEntry) => void;
  private tracer?: Tracer;

  constructor(options?: ConfigGuardOptions) {
    this.templates = DEFAULT_TEMPLATES.map((t) => ({ ...t }));

    // Merge custom templates
    if (options?.templates) {
      for (const [file, content] of Object.entries(options.templates)) {
        const existing = this.templates.find((t) => t.canonical === file);
        if (existing) {
          existing.content = content;
        } else {
          this.templates.push({ canonical: file, variants: [], content });
        }
      }
    }

    // Add extra locked files (locked with empty content — just prevents writes)
    if (options?.extraLockedFiles) {
      for (const file of options.extraLockedFiles) {
        if (!this.templates.some((t) => t.canonical === file)) {
          this.templates.push({ canonical: file, variants: [], content: "" });
        }
      }
    }

    this.onAudit = options?.onAudit;
    this.tracer = options?.tracer;
  }

  /**
   * Lock all config files in a project directory.
   *
   * For each config group:
   *   1. DELETE all variant files (prevents shadowing attacks)
   *   2. WRITE the canonical file with the safe template
   *
   * Returns the list of files that were modified.
   *
   * Call this BEFORE spawning any process that loads these configs.
   *
   * @param projectPath - Absolute path of the project to lock.
   * @param frameworkId - Optional framework template set (e.g. "nextjs-app").
   *                      When omitted, the constructor-configured templates
   *                      are used (vite-react + any custom overrides). When
   *                      provided, the named CONFIG_TEMPLATE_SETS entry is
   *                      used instead — extraLockedFiles still apply.
   */
  async lock(projectPath: string, frameworkId?: string): Promise<string[]> {
    const span = this.tracer?.start("vault.config_lock", { projectPath, frameworkId: frameworkId ?? null });
    const modified: string[] = [];

    const templates = frameworkId
      ? this.templatesForFramework(frameworkId)
      : this.templates;

    for (const template of templates) {
      for (const variant of template.variants) {
        const variantPath = join(projectPath, variant);
        try {
          await access(variantPath);
          await unlink(variantPath);
          modified.push(variant);
          this.audit("config_lock", {
            action: "delete_variant",
            file: variant,
            projectPath,
          });
        } catch {
          // File doesn't exist — safe
        }
      }

      // Write canonical file with safe template
      if (template.content) {
        const canonicalPath = join(projectPath, template.canonical);
        await writeFile(canonicalPath, template.content, "utf-8");
        modified.push(template.canonical);
        this.audit("config_lock", {
          action: "write_safe",
          file: template.canonical,
          projectPath,
        });
      }
    }

    span?.end({ filesModified: modified.length, files: modified });
    return modified;
  }

  /**
   * Build a ConfigTemplate[] for the given frameworkId.
   *
   * Merges the named CONFIG_TEMPLATE_SETS entry with any extraLockedFiles
   * that the constructor was given. Variants from the set are split evenly
   * across canonicals (each canonical also lists every variant) so the
   * existing per-canonical delete loop keeps working without new branches.
   */
  private templatesForFramework(frameworkId: string): ConfigTemplate[] {
    const set = CONFIG_TEMPLATE_SETS[frameworkId];
    if (!set) {
      throw new Error(
        `Unknown frameworkId "${frameworkId}". Known: ${Object.keys(CONFIG_TEMPLATE_SETS).join(", ")}`,
      );
    }

    const canonicals = Object.entries(set.templates);
    const sharedVariants = set.variants ?? [];

    const templates: ConfigTemplate[] = canonicals.map(([canonical, content], idx) => ({
      canonical,
      // Attach variants only to the first canonical so we don't try to
      // unlink the same path multiple times.
      variants: idx === 0 ? [...sharedVariants] : [],
      content,
    }));

    // Carry over extraLockedFiles from the constructor (treated as locked
    // with empty content — just prevents writes via isLocked()).
    for (const t of this.templates) {
      if (!t.content && !templates.some((x) => x.canonical === t.canonical)) {
        templates.push({ canonical: t.canonical, variants: [], content: "" });
      }
    }

    return templates;
  }

  /**
   * Check if a file path is a locked config file.
   *
   * Use this in your file-write tools to reject AI/user modifications:
   *
   *   if (vault.isLockedFile(path)) {
   *     return { success: false, error: "Config files are locked for security" };
   *   }
   */
  isLocked(filePath: string): boolean {
    const base = basename(filePath);
    const locked = this.templates.some(
      (t) => t.canonical === base || t.variants.includes(base),
    );
    if (locked && this.tracer) {
      const span = this.tracer.start("vault.config_check", { filePath, file: base, locked: true });
      span.end();
    }
    return locked;
  }

  /** Get all file names that are considered locked */
  get lockedFileNames(): string[] {
    return this.templates.flatMap((t) => [t.canonical, ...t.variants]);
  }

  private audit(kind: AuditEntry["kind"], details: Record<string, unknown>) {
    this.onAudit?.({
      timestamp: new Date().toISOString(),
      kind,
      details,
    });
  }
}
