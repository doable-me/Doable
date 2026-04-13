import { Hono } from "hono";
import { sql } from "../db/index.js";
import type { AuthEnv } from "../middleware/auth.js";
import { listIntegrations, getIntegration, getCategories } from "../integrations/registry/index.js";
import { getIntegrationActions } from "../integrations/runner.js";
import type { IntegrationCategory } from "../integrations/types.js";

export const integrationCatalogRoutes = new Hono<AuthEnv>();

// ─── Catalog (public, no auth) ─────────────────────────────

// GET /integrations/catalog
integrationCatalogRoutes.get("/integrations/catalog", async (c) => {
  const category = c.req.query("category") as IntegrationCategory | undefined;
  const search = c.req.query("search");
  const workspaceId = c.req.query("workspaceId");

  const definitions = listIntegrations({ category, search });
  const categoriesRaw = getCategories();
  // getCategories() returns { category, count }[] — frontend expects string[]
  const categories = Array.isArray(categoriesRaw) && categoriesRaw[0]?.category
    ? categoriesRaw.map((c: any) => c.category)
    : categoriesRaw;

  // If workspaceId provided, enrich with connection status
  let connectedIds = new Set<string>();
  if (workspaceId) {
    try {
      const rows = await sql`
        SELECT DISTINCT integration_id FROM integration_connections
        WHERE workspace_id = ${workspaceId} AND status = 'active'
      `;
      connectedIds = new Set(rows.map((r: any) => r.integration_id));
    } catch {
      // Table may not exist yet — ignore
    }
  }

  const data = definitions.map((def) => ({
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

  return c.json({ data, categories });
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
