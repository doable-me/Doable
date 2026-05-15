import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth.js";
import { integrationCatalogRoutes } from "./integrations-catalog.js";
import { integrationConnectionRoutes } from "./integrations-connections.js";
import { integrationOAuthRoutes } from "./integrations-oauth.js";
import { integrationEnhancedAuthRoutes } from "./integrations-enhanced-auth.js";
import { integrationAdminRoutes } from "./integrations-admin.js";

export const integrationRoutes = new Hono<AuthEnv>({ strict: false });

integrationRoutes.route("/", integrationCatalogRoutes);
integrationRoutes.route("/", integrationConnectionRoutes);
integrationRoutes.route("/", integrationOAuthRoutes);
integrationRoutes.route("/", integrationEnhancedAuthRoutes);
integrationRoutes.route("/", integrationAdminRoutes);
