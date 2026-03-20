import { blankTemplate } from "./definitions/blank.js";
import { saasDashboardTemplate } from "./definitions/saas-dashboard.js";
import { landingPageTemplate } from "./definitions/landing-page.js";
import { ecommerceStoreTemplate } from "./definitions/ecommerce-store.js";
import { blogTemplate } from "./definitions/blog.js";
import { portfolioTemplate } from "./definitions/portfolio.js";
import { todoAppTemplate } from "./definitions/todo-app.js";

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
]);

/**
 * Get all available templates as summaries (no code).
 */
export function getTemplates(filter?: {
  category?: string;
  search?: string;
}): TemplateSummary[] {
  const templates = Array.from(BUILT_IN_TEMPLATES.values());

  let filtered = templates;

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
