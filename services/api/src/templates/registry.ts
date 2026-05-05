import { blankTemplate } from "./definitions/blank.js";
import { saasDashboardTemplate } from "./definitions/saas-dashboard.js";
import { landingPageTemplate } from "./definitions/landing-page.js";
import { ecommerceStoreTemplate } from "./definitions/ecommerce-store.js";
import { blogTemplate } from "./definitions/blog.js";
import { portfolioTemplate } from "./definitions/portfolio.js";
import { todoAppTemplate } from "./definitions/todo-app.js";
import { pwaAppTemplate } from "./definitions/pwa-app.js";
import { nextjsBlankTemplate } from "./definitions/nextjs-blank.js";
import { nextjsTodoAppTemplate } from "./definitions/nextjs-todo-app.js";
import { getEnabledFrameworkIds } from "../frameworks/init.js";
// Templates for the 6 disabled frameworks (nuxt, sveltekit, astro, django,
// fastapi, hono) were removed alongside their adapters and AI prompt files.
// Backups live at ~/Documents/doable-disabled-frameworks-backup-<date>/.

// ─── Types ──────────────────────────────────────────────────

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  previewImageUrl: string | null;
  isOfficial: boolean;
  /** File path -> file content */
  codeFiles: Record<string, string>;
  /** Context file overrides (filename -> content) */
  contextOverrides?: Record<string, string>;
  /**
   * Framework adapter id this template targets. Mirrors the
   * `templates.framework_id` DB column added in migration 060. Drives
   * scaffold/dev/build behaviour through `defaultRegistry.getAdapter()`.
   */
  framework_id: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  previewImageUrl: string | null;
  isOfficial: boolean;
  fileCount: number;
}

// ─── Registry ───────────────────────────────────────────────

/** All built-in template definitions, keyed by ID */
const BUILT_IN_TEMPLATES = new Map<string, TemplateDefinition>([
  [blankTemplate.id, blankTemplate],
  [saasDashboardTemplate.id, saasDashboardTemplate],
  [landingPageTemplate.id, landingPageTemplate],
  [ecommerceStoreTemplate.id, ecommerceStoreTemplate],
  [blogTemplate.id, blogTemplate],
  [portfolioTemplate.id, portfolioTemplate],
  [todoAppTemplate.id, todoAppTemplate],
  [pwaAppTemplate.id, pwaAppTemplate],
  [nextjsBlankTemplate.id, nextjsBlankTemplate],
  [nextjsTodoAppTemplate.id, nextjsTodoAppTemplate],
]);

/**
 * Get all available templates as summaries (no code).
 *
 * Templates whose `framework_id` isn't in the enabled framework set
 * (controlled by `DOABLE_ENABLED_FRAMEWORKS` — see frameworks/init.ts)
 * are filtered out so the UI picker stays consistent with what the
 * backend actually runs. Default ships only vite-react + nextjs-app.
 */
export function getTemplates(filter?: {
  category?: string;
  search?: string;
}): TemplateSummary[] {
  const templates = Array.from(BUILT_IN_TEMPLATES.values());
  const enabled = getEnabledFrameworkIds();

  let filtered = templates.filter((t) => enabled.has(t.framework_id));

  if (filter?.category) {
    filtered = filtered.filter((t) => t.category === filter.category);
  }

  if (filter?.search) {
    const q = filter.search.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }

  return filtered.map(toSummary);
}

/**
 * Get a single template by ID with full code files.
 */
export function getTemplate(id: string): TemplateDefinition | undefined {
  return BUILT_IN_TEMPLATES.get(id);
}

/**
 * Get all unique categories.
 */
export function getCategories(): string[] {
  const cats = new Set<string>();
  for (const t of BUILT_IN_TEMPLATES.values()) {
    cats.add(t.category);
  }
  return Array.from(cats).sort();
}

// ─── Helpers ────────────────────────────────────────────────

function toSummary(t: TemplateDefinition): TemplateSummary {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    tags: t.tags,
    previewImageUrl: t.previewImageUrl,
    isOfficial: t.isOfficial,
    fileCount: Object.keys(t.codeFiles).length,
  };
}
