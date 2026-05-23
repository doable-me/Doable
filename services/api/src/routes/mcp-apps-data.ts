/**
 * mcp-apps-data.ts
 *
 * Serves the static MCP App UI assets for the built-in per-app database
 * inspector iframes.
 *
 * Route: GET /__doable/mcp-apps/data/:resource
 *
 * Only whitelisted resource names are served.  All others return 404.
 * Every response carries the documented CSP and X-Content-Type-Options headers
 * per PRD 06-mcp-integration.md §"MCP Apps UI".
 *
 * EXPORT ONLY — do not mount here.  The integrator mounts this router in
 * services/api/src/routes.ts.
 */

import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(__dirname, "../mcp/builtin/data/ui");

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";

type ResourceEntry = { path: string; contentType: string };

/**
 * Whitelist of servable resource names (relative to UI_DIR).
 * Any name not in this map gets a 404.
 */
const RESOURCES: Record<string, ResourceEntry> = {
  "schema-inspector.html":  { path: "schema-inspector.html",        contentType: "text/html; charset=utf-8" },
  "schema-inspector.js":    { path: "schema-inspector.js",          contentType: "application/javascript; charset=utf-8" },
  "table-inspector.html":   { path: "table-inspector.html",         contentType: "text/html; charset=utf-8" },
  "table-inspector.js":     { path: "table-inspector.js",           contentType: "application/javascript; charset=utf-8" },
  "shared/host-bridge.js":  { path: "shared/host-bridge.js",        contentType: "application/javascript; charset=utf-8" },
  "shared/styles.css":      { path: "shared/styles.css",            contentType: "text/css; charset=utf-8" },
};

export const mcpAppsDataRoutes = new Hono();

mcpAppsDataRoutes.get("/:resource{.+}", (c) => {
  const resource = c.req.param("resource");

  const entry = RESOURCES[resource];
  if (!entry) {
    return c.text("Not Found", 404);
  }

  let body: string;
  try {
    body = readFileSync(join(UI_DIR, entry.path), "utf-8");
  } catch {
    return c.text("Not Found", 404);
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": entry.contentType,
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
});
