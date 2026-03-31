// ─── Merged Integration Registry ────────────────────────
//
// Combines hand-curated entries from registry.ts with
// auto-generated entries from generated.ts.
// Curated entries always override generated ones for the same ID.

import type { IntegrationDefinition, IntegrationCategory } from "../types.js";
import { REGISTRY as CURATED_REGISTRY } from "../registry.js";
import { GENERATED_REGISTRY } from "./generated.js";
import { COMMUNICATION_INTEGRATIONS } from "./communication.js";
import { PRODUCTIVITY_INTEGRATIONS } from "./productivity.js";
import { DEVELOPER_TOOLS_INTEGRATIONS } from "./developer-tools.js";
import { AI_ML_INTEGRATIONS } from "./ai-ml.js";
import { CRM_MARKETING_SOCIAL_INTEGRATIONS } from "./crm-marketing-social.js";
import { FINANCE_ECOMMERCE_INTEGRATIONS } from "./finance-ecommerce.js";

// ─── Merged Registry ───────────────────────────────────
// Layer order (later entries override earlier ones for same ID):
//   1. Auto-generated from installed pieces (base)
//   2. Category files (curated by agents)
//   3. Hand-curated entries (highest priority)

export const REGISTRY: Record<string, IntegrationDefinition> = {
  ...GENERATED_REGISTRY,
  ...COMMUNICATION_INTEGRATIONS,
  ...PRODUCTIVITY_INTEGRATIONS,
  ...DEVELOPER_TOOLS_INTEGRATIONS,
  ...AI_ML_INTEGRATIONS,
  ...CRM_MARKETING_SOCIAL_INTEGRATIONS,
  ...FINANCE_ECOMMERCE_INTEGRATIONS,
  ...CURATED_REGISTRY,
};

// ─── Helper Functions ──────────────────────────────────

/**
 * Look up a single integration by ID.
 */
export function getIntegration(id: string): IntegrationDefinition | undefined {
  return REGISTRY[id];
}

/**
 * Return all integrations, optionally filtered by category and/or
 * a free-text search across name, description, and tags.
 */
export function listIntegrations(opts?: {
  category?: IntegrationCategory;
  search?: string;
  tier?: "built_in" | "community";
}): IntegrationDefinition[] {
  let results = Object.values(REGISTRY);

  if (opts?.category) {
    results = results.filter((i) => i.category === opts.category);
  }

  if (opts?.tier) {
    results = results.filter((i) => i.tier === opts.tier);
  }

  if (opts?.search) {
    const q = opts.search.toLowerCase();
    results = results.filter(
      (i) =>
        i.displayName.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  return results;
}

/**
 * Return all distinct categories present in the registry,
 * with a count of integrations in each.
 */
export function getCategories(): Array<{ category: IntegrationCategory; count: number }> {
  const counts = new Map<IntegrationCategory, number>();
  for (const def of Object.values(REGISTRY)) {
    counts.set(def.category, (counts.get(def.category) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Return just the category strings present in the registry.
 */
export function getCategoryList(): IntegrationCategory[] {
  const cats = new Set<IntegrationCategory>();
  for (const def of Object.values(REGISTRY)) {
    cats.add(def.category);
  }
  return [...cats];
}

/**
 * Return total count of integrations in the registry.
 */
export function getIntegrationCount(): number {
  return Object.keys(REGISTRY).length;
}
