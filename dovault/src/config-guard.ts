import { writeFile, unlink, access } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import type { AuditEntry, ConfigGuardOptions, ConfigTemplate } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// Safe config templates
//
// These are the ONLY files that run server-side when Vite starts.
// Everything else (src/*.tsx, etc.) is transpiled and sent to the browser.
// Each template is minimal, importing only known-safe packages.
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_TEMPLATES: ConfigTemplate[] = [
  {
    canonical: "vite.config.ts",
    variants: [
      "vite.config.js",
      "vite.config.mjs",
      "vite.config.cjs",
    ],
    content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
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
    content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
  },
  {
    canonical: "tailwind.config.ts",
    variants: [
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
    ],
    content: `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Config Guard
// ═══════════════════════════════════════════════════════════════════════════

export class ConfigGuard {
  private templates: ConfigTemplate[];
  private onAudit?: (entry: AuditEntry) => void;

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
   */
  async lock(projectPath: string): Promise<string[]> {
    const modified: string[] = [];

    for (const template of this.templates) {
      // Delete variants that could shadow our canonical file.
      // Vite loads configs by priority: .js > .mjs > .ts > .cjs
      // If we lock vite.config.ts but vite.config.js exists, Vite loads .js instead.
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

    return modified;
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
    return this.templates.some(
      (t) => t.canonical === base || t.variants.includes(base),
    );
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
