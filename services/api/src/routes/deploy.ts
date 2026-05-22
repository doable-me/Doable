import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth.js";
import { deployTriggerRoutes } from "./deploy/deploy-trigger.js";
import { deployQueryRoutes } from "./deploy/deploy-query.js";

export const deployRoutes = new Hono<AuthEnv>({ strict: false });

deployRoutes.route("/", deployTriggerRoutes);
deployRoutes.route("/", deployQueryRoutes);
