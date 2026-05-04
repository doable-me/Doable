import { Hono } from "hono";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { projectListRoutes } from "./projects/list-routes.js";
import { projectItemRoutes } from "./projects/item-routes.js";
import { projectApiKeyRoutes } from "./projects/api-keys.js";

export const projectRoutes = new Hono<AuthEnv>();

// All project routes require authentication
projectRoutes.use("*", authMiddleware);

// Mount list/create routes first (must precede /:id param routes)
projectRoutes.route("/", projectListRoutes);
projectRoutes.route("/", projectItemRoutes);
projectRoutes.route("/", projectApiKeyRoutes);
