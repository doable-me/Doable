import { Hono } from "hono";
import { type AuthEnv } from "../middleware/auth.js";
import { authMiddlewareWithRls } from "../middleware/rls.js";
import { projectListRoutes } from "./projects/list-routes.js";
import { projectItemRoutes } from "./projects/item-routes.js";
import { projectApiKeyRoutes } from "./projects/api-keys.js";

export const projectRoutes = new Hono<AuthEnv>({ strict: false });

// Auth + per-request RLS context. Verifies the JWT and sets
// `doable.current_user_id` so migration 045/076 policies apply to every
// query in this router (projects, project_api_keys, users joins).
projectRoutes.use("*", authMiddlewareWithRls);

// Mount list/create routes first (must precede /:id param routes)
projectRoutes.route("/", projectListRoutes);
projectRoutes.route("/", projectItemRoutes);
projectRoutes.route("/", projectApiKeyRoutes);
