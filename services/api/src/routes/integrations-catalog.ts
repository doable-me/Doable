import { Hono } from "hono";
import { sql } from "../db/index.js";
import type { AuthEnv } from "../middleware/auth.js";
import { listIntegrations, getIntegration, getCategories } from "../integrations/registry/index.js";
import { getIntegrationActions } from "../integrations/runner.js";
import type { IntegrationCategory } from "../integrations/types.js";

export const integrationCatalogRoutes = new Hono<AuthEnv>({ strict: false });

// ─── Catalog (public, no auth) ─────────────────────────────

// GET /integrations/catalog
//
// Query params:
//   ?category=<IntegrationCategory>  Filter by category slug
//   ?search=<text>                   Free-text search (name/description/tags)
//   ?q=<text>                        Alias for ?search (BUG-MCP-005)
//   ?authType=<oauth2|api_key|...>   Filter by definition.authType
//   ?limit=<n>                       Max results to return (cap 1000)
//   ?offset=<n>                      Skip first n results
//   ?workspaceId=<uuid>              Enrich with connection status + admin enablement
//   ?showAll=true                    Bypass workspace enablement filter (admin only)
integrationCatalogRoutes.get("/integrations/catalog", async (c) => {
  const category = c.req.query("category") as IntegrationCategory | undefined;
  // BUG-MCP-005: clients commonly send ?q= for search; treat both as equivalent.
  const search = c.req.query("search") ?? c.req.query("q");
  const authType = c.req.query("authType");
  const workspaceId = c.req.query("workspaceId");
  const showAll = c.req.query("showAll") === "true"; // admin override

  // Pagination params (clamped — server-side cap to prevent abuse).
  const rawLimit = Number(c.req.query("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : undefined;
  const rawOffset = Number(c.req.query("offset"));
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  const definitions = listIntegrations({ category, search });
  const categoriesRaw = getCategories();
  // getCategories() returns { category, count }[] — frontend expects string[]
  const categories = Array.isArray(categoriesRaw) && categoriesRaw[0]?.category
    ? categoriesRaw.map((c: any) => c.category)
    : categoriesRaw;

  // If workspaceId provided, enrich with connection status
  let connectedIds = new Set<string>();
  let enabledIds: Set<string> | null = null; // null = no filtering (all shown)

  if (workspaceId) {
    try {
      const [connRows, workspaceEnabledRows, platformEnabledRows] = await Promise.all([
        sql`
          SELECT DISTINCT integration_id FROM integration_connections
          WHERE workspace_id = ${workspaceId} AND status = 'active'
        `,
        showAll ? Promise.resolve(null) : sql`
          SELECT integration_id FROM workspace_enabled_integrations
          WHERE workspace_id = ${workspaceId} AND enabled = true
        `,
        showAll ? Promise.resolve(null) : sql`
          SELECT integration_id FROM platform_enabled_integrations
          WHERE enabled = true
        `,
      ]);
      connectedIds = new Set(connRows.map((r: any) => r.integration_id));

      // Merge workspace-level + platform-level enabled integrations
      const wsEnabled = workspaceEnabledRows ? workspaceEnabledRows.map((r: any) => r.integration_id) : [];
      const platformEnabled = platformEnabledRows ? platformEnabledRows.map((r: any) => r.integration_id) : [];
      const allEnabled = [...wsEnabled, ...platformEnabled];

      if (allEnabled.length > 0) {
        enabledIds = new Set(allEnabled);
      }
      // If no rows in either table, show everything (not yet configured by any admin)
    } catch {
      // Table may not exist yet — ignore
    }
  }

  // Filter by enabled integrations (if admin has configured any)
  let filteredDefinitions = enabledIds
    ? definitions.filter((def) => enabledIds!.has(def.id))
    : definitions;

  // BUG-MCP-005 / F2: support ?authType= filter on the catalog.
  if (authType) {
    filteredDefinitions = filteredDefinitions.filter((def) => def.authType === authType);
  }

  // BUG-MCP-005 / F2: cursor-less pagination — capture total before slicing.
  const total = filteredDefinitions.length;
  if (offset > 0) filteredDefinitions = filteredDefinitions.slice(offset);
  if (limit !== undefined) filteredDefinitions = filteredDefinitions.slice(0, limit);

  const data = filteredDefinitions.map((def) => ({
    id: def.id,
    displayName: def.displayName,
    description: def.description,
    logoUrl: def.logoUrl,
    category: def.category,
    authType: def.authType,
    tier: def.tier,
    connected: connectedIds.has(def.id),
    actionCount: def.actions.length,
    // Include custom auth fields so the frontend can render dynamic forms
    ...(def.customAuthFields?.length ? { customAuthFields: def.customAuthFields } : {}),
    // Include enhanced auth config (frontend-safe subset) for easy connect UX
    ...(def.enhancedAuth ? {
      enhancedAuth: {
        providerKey: def.enhancedAuth.providerKey,
        connectLabel: def.enhancedAuth.connectLabel,
        requiresResourceSelection: def.enhancedAuth.requiresResourceSelection,
        resourceLabel: def.enhancedAuth.resourceLabel,
      },
    } : {}),
  }));

  return c.json({ data, categories, total });
});

// BUG-MCP-004: GET /integrations (no /catalog suffix) historically returned
// 404. Clients (test corpora, older SDK calls) expect the catalog at the
// shorter path too. Redirect to /integrations/catalog so the canonical URL
// stays a single source of truth (preserves query string).
integrationCatalogRoutes.get("/integrations", (c) => {
  const url = new URL(c.req.url);
  return c.redirect("/integrations/catalog" + (url.search || ""), 302);
});

// GET /integrations/catalog/:id
integrationCatalogRoutes.get("/integrations/catalog/:id", async (c) => {
  const id = c.req.param("id");
  const def = getIntegration(id);

  if (!def) {
    return c.json({ error: "Integration not found" }, 404);
  }

  return c.json({ data: def });
});

// GET /integrations/catalog/:id/actions
integrationCatalogRoutes.get("/integrations/catalog/:id/actions", async (c) => {
  const id = c.req.param("id");
  const def = getIntegration(id);

  if (!def) {
    return c.json({ error: "Integration not found" }, 404);
  }

  try {
    const actions = await getIntegrationActions(id);
    return c.json({ data: actions });
  } catch (err) {
    return c.json({
      error: `Failed to load actions: ${err instanceof Error ? err.message : String(err)}`,
    }, 500);
  }
});
