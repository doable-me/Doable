/**
 * Supabase platform-managed provisioning routes (Phase 2A).
 *
 * Barrel file that mounts sub-routers for listing orgs/projects
 * and provisioning new Supabase projects.
 */
import { Hono } from "hono";
import type { AuthEnv } from "../../../middleware/auth.js";
import { provisionListRoutes } from "./provision-list.js";
import { provisionCreateRoutes } from "./provision-create.js";

export const supabaseProvisionRoutes = new Hono<AuthEnv>({ strict: false });

supabaseProvisionRoutes.route("/", provisionListRoutes);
supabaseProvisionRoutes.route("/", provisionCreateRoutes);
