/**
 * Admin Framework Management API
 *
 * GET  /admin/frameworks       — List all frameworks with enabled status
 * PUT  /admin/frameworks       — Update enabled frameworks list
 * GET  /frameworks             — Public: get enabled frameworks for project creation
 */
import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { setCachedEnabledFrameworks } from "../frameworks/init.js";

// All available frameworks (superset — can never be expanded without code changes)
const ALL_FRAMEWORKS = [
  { id: "vite-react", name: "React (Vite)", description: "Client-side SPA", category: "Frontend" },
  { id: "nextjs-app", name: "Next.js", description: "Full-stack React", category: "Full-Stack" },
] as const;

// ─── Helpers ────────────────────────────────────────────

async function getEnabledFrameworksFromDb(): Promise<string[]> {
  const [row] = await sql<{ value: unknown }[]>`
    SELECT value FROM platform_config WHERE key = 'enabled_frameworks'
  `;
  if (row?.value) {
    // Handle both correct jsonb array and legacy double-encoded string
    let parsed = row.value;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { /* ignore */ }
    }
    if (Array.isArray(parsed)) {
      return (parsed as string[]).filter((id) => ALL_FRAMEWORKS.some((f) => f.id === id));
    }
  }
  // Fallback to env var. Default ships with only vite-react enabled so
  // fresh installs don't expose Next.js full-stack until the admin
  // explicitly opts in via /admin → DNS / Frameworks. (Next.js standalone
  // mode requires per-project process supervision + the SSR runtime
  // adapters; better to start minimal and let admins flip it on.)
  const env = process.env.DOABLE_ENABLED_FRAMEWORKS ?? "vite-react";
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

async function getDefaultFrameworkFromDb(): Promise<string> {
  const [row] = await sql<{ value: unknown }[]>`
    SELECT value FROM platform_config WHERE key = 'default_framework'
  `;
  if (row?.value) {
    // Handle both correct jsonb string and legacy double-encoded string
    let parsed = row.value;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { /* use as-is */ }
    }
    if (typeof parsed === "string") return parsed;
  }
  return "vite-react";
}

// ─── Admin Routes ───────────────────────────────────────

export const adminFrameworkRoutes = new Hono<AuthEnv>({ strict: false });

adminFrameworkRoutes.use("*", authMiddleware);
adminFrameworkRoutes.use("*", platformAdminMiddleware);

// List all frameworks with their enabled state
adminFrameworkRoutes.get("/frameworks", async (c) => {
  const enabled = await getEnabledFrameworksFromDb();
  const defaultFw = await getDefaultFrameworkFromDb();
  const frameworks = ALL_FRAMEWORKS.map((fw) => ({
    ...fw,
    enabled: enabled.includes(fw.id),
    isDefault: fw.id === defaultFw,
  }));
  return c.json({ frameworks, defaultFramework: defaultFw });
});

// Update enabled frameworks + default
const updateSchema = z.object({
  enabledFrameworks: z.array(z.string()).min(1, "At least one framework must be enabled"),
  defaultFramework: z.string().optional(),
});

adminFrameworkRoutes.put("/frameworks", async (c) => {
  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { enabledFrameworks, defaultFramework } = parsed.data;

  // Validate framework IDs
  const validIds: string[] = ALL_FRAMEWORKS.map((f) => f.id);
  const invalid = enabledFrameworks.filter((id) => !validIds.includes(id));
  if (invalid.length > 0) {
    return c.json({ error: `Invalid framework IDs: ${invalid.join(", ")}` }, 400);
  }

  // Default must be in enabled list
  const effectiveDefault = defaultFramework && enabledFrameworks.includes(defaultFramework)
    ? defaultFramework
    : enabledFrameworks[0]!;

  const userId = c.get("userId");

  await sql`
    INSERT INTO platform_config (key, value, updated_at, updated_by)
    VALUES ('enabled_frameworks', ${sql.json(enabledFrameworks)}, now(), ${userId})
    ON CONFLICT (key) DO UPDATE SET value = ${sql.json(enabledFrameworks)}, updated_at = now(), updated_by = ${userId}
  `;

  await sql`
    INSERT INTO platform_config (key, value, updated_at, updated_by)
    VALUES ('default_framework', ${sql.json(effectiveDefault)}, now(), ${userId})
    ON CONFLICT (key) DO UPDATE SET value = ${sql.json(effectiveDefault)}, updated_at = now(), updated_by = ${userId}
  `;

  // Update the in-memory cache used by getEnabledFrameworkIds
  setCachedEnabledFrameworks(new Set(enabledFrameworks));

  return c.json({ ok: true, enabledFrameworks, defaultFramework: effectiveDefault });
});

// ─── Public Route (for project creation dialog) ─────────

export const publicFrameworkRoutes = new Hono<AuthEnv>({ strict: false });
// Scope authMiddleware to the only path this sub-router actually handles.
// `use("*", …)` on a router mounted at "/" in routes.ts fired as a
// wildcard for every path that didn't match a more-specific earlier
// handler — including the /oauth/github/* paths added in PR #50, which
// 401'd before their inline app.get handlers ran. Pinning the middleware
// to /frameworks closes that whole class of accidental interception
// without changing the public behavior of /frameworks.
publicFrameworkRoutes.use("/frameworks", authMiddleware);

publicFrameworkRoutes.get("/frameworks", async (c) => {
  const enabled = await getEnabledFrameworksFromDb();
  const defaultFw = await getDefaultFrameworkFromDb();
  const frameworks = ALL_FRAMEWORKS
    .filter((fw) => enabled.includes(fw.id))
    .map((fw) => ({
      ...fw,
      isDefault: fw.id === defaultFw,
    }));
  return c.json({ frameworks, defaultFramework: defaultFw });
});

/** Refresh cache from DB — called at startup */
export async function refreshFrameworkCache(): Promise<void> {
  try {
    const enabled = await getEnabledFrameworksFromDb();
    setCachedEnabledFrameworks(new Set(enabled));
  } catch {
    // Table may not exist yet (first run before migration)
  }
}
