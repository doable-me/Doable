import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth.js";
import { trackingRoutes } from "./analytics/tracking.js";
import { dashboardRoutes } from "./analytics/dashboard.js";

export const analyticsRoutes = new Hono<AuthEnv>({ strict: false });

analyticsRoutes.route("/", trackingRoutes);
analyticsRoutes.route("/", dashboardRoutes);
