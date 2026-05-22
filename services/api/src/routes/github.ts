import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth.js";
import { githubOAuthRoutes } from "./github/oauth-routes.js";
import { githubAccountRoutes } from "./github/account-routes.js";
import { githubProjectRoutes } from "./github/project-routes.js";

export const githubRoutes = new Hono<AuthEnv>({ strict: false });

githubRoutes.route("/", githubOAuthRoutes);
githubRoutes.route("/", githubAccountRoutes);
githubRoutes.route("/", githubProjectRoutes);

// BUG-GH-003 / TC-GH-COMMITS-001: clients expect `/projects/:id/github/*`
// but legacy mount uses bare `/:id/github/*`. Re-export ONLY the project
// scoped routes so we can mount them under the `/projects` prefix in
// routes.ts without exposing OAuth / account routes at `/projects/...`.
export { githubProjectRoutes };
