import { Hono } from "hono";
import { checkDbHealth } from "../db/index.js";

export const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  const start = Date.now();
  const dbHealthy = await checkDbHealth();
  const latencyMs = Date.now() - start;

  const status = dbHealthy ? "healthy" : "degraded";
  const statusCode = dbHealthy ? 200 : 503;

  return c.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
      uptime: process.uptime(),
      checks: {
        database: {
          status: dbHealthy ? "up" : "down",
          latencyMs,
        },
      },
    },
    statusCode
  );
});

healthRoutes.get("/live", (c) => {
  return c.json({ status: "alive" });
});

healthRoutes.get("/ready", async (c) => {
  const dbHealthy = await checkDbHealth();

  if (!dbHealthy) {
    return c.json({ status: "not ready", reason: "database unavailable" }, 503);
  }

  return c.json({ status: "ready" });
});
