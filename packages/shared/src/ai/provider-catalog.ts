import type { ProviderPreset } from "./provider-types";
import { CLOUD_MAJOR_PROVIDERS } from "./provider-data-cloud-major";
import { CLOUD_SPECIAL_PROVIDERS } from "./provider-data-cloud-special";
import { CLOUD_REGIONAL_PROVIDERS } from "./provider-data-cloud-regional";
import { LOCAL_PROVIDERS } from "./provider-data-local";

export const PROVIDER_CATALOG = [
  ...CLOUD_MAJOR_PROVIDERS,
  ...CLOUD_SPECIAL_PROVIDERS,
  ...CLOUD_REGIONAL_PROVIDERS,
  ...LOCAL_PROVIDERS,
] as const satisfies readonly ProviderPreset[];

// ─── Derived Lookups (tree-shakeable) ─────────────────────

export type ProviderId = (typeof PROVIDER_CATALOG)[number]["id"];

/** Widened array for runtime helpers (filter, map, etc.) */
const catalog: readonly ProviderPreset[] = PROVIDER_CATALOG;

/** O(1) lookup by provider ID */
export const PROVIDER_BY_ID = Object.fromEntries(
  catalog.map((p) => [p.id, p]),
) as Record<ProviderId, ProviderPreset>;

/** Providers grouped by category */
export const PROVIDERS_BY_CATEGORY = {
  cloud: catalog.filter((p) => p.category === "cloud"),
  local: catalog.filter((p) => p.category === "local"),
  gateway: catalog.filter((p) => p.category === "gateway"),
};

/** Providers grouped by subcategory */
export const PROVIDERS_BY_SUBCATEGORY = {
  major: catalog.filter((p) => p.subcategory === "major"),
  aggregator: catalog.filter((p) => p.subcategory === "aggregator"),
  specialized: catalog.filter((p) => p.subcategory === "specialized"),
  regional: catalog.filter((p) => p.subcategory === "regional"),
  infrastructure: catalog.filter((p) => p.subcategory === "infrastructure"),
  primary: catalog.filter((p) => p.subcategory === "primary"),
  secondary: catalog.filter((p) => p.subcategory === "secondary"),
  frontend: catalog.filter((p) => p.subcategory === "frontend"),
};

/** Only providers with a free tier */
export const FREE_PROVIDERS = catalog.filter((p) => p.freeTier);

/** Provider count for validation */
export const PROVIDER_COUNT = PROVIDER_CATALOG.length;
