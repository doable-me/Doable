import { Hono } from "hono";
import { coreAuthRoutes } from "./auth/core.js";
import { oauthRoutes } from "./auth/oauth.js";
import { mfaRoutes } from "./auth/mfa.js";

export const authRoutes = new Hono({ strict: false });
authRoutes.route("/", coreAuthRoutes);
authRoutes.route("/", oauthRoutes);
authRoutes.route("/", mfaRoutes);
