import { Hono } from "hono";
import { coreAuthRoutes } from "./auth/core.js";
import { oauthRoutes } from "./auth/oauth.js";

export const authRoutes = new Hono();
authRoutes.route("/", coreAuthRoutes);
authRoutes.route("/", oauthRoutes);
