import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth.js";
import { githubOAuthRoutes } from "./github/oauth-routes.js";
import { githubAccountRoutes } from "./github/account-routes.js";
import { githubProjectRoutes } from "./github/project-routes.js";

export const githubRoutes = new Hono<AuthEnv>();

githubRoutes.route("/", githubOAuthRoutes);
githubRoutes.route("/", githubAccountRoutes);
githubRoutes.route("/", githubProjectRoutes);
