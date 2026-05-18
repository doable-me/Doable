import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { modeToolQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";

const modeTools = modeToolQueries(sql);

export const adminToolsRoutes = new Hono<AuthEnv>({ strict: false });

adminToolsRoutes.use("*", authMiddleware);
adminToolsRoutes.use("*", platformAdminMiddleware);

// All known tools (Doable + SDK built-in)
const KNOWN_TOOLS = [
  { name: "create_file", category: "doable", description: "Create a new file with content" },
  { name: "edit_file", category: "doable", description: "Replace entire file content" },
  { name: "read_file", category: "doable", description: "Read full file contents" },
  { name: "list_files", category: "doable", description: "List all files in project" },
  { name: "install_package", category: "doable", description: "Run npm install for packages" },
  { name: "deploy_preview", category: "doable", description: "Deploy to preview URL" },
  { name: "ask_clarification", category: "doable", description: "Ask user clarifying questions" },
  { name: "create_plan", category: "doable", description: "Create step-by-step plan" },
  { name: "mark_step_complete", category: "doable", description: "Mark a plan step as completed" },
  { name: "provision_supabase", category: "doable", description: "Provision Supabase project" },
  { name: "request_integration", category: "doable", description: "Request third-party integration" },
  { name: "search_files", category: "doable", description: "Search for files by pattern" },
  { name: "view", category: "sdk", description: "SDK: View file contents" },
  { name: "grep", category: "sdk", description: "SDK: Search file contents" },
  { name: "glob", category: "sdk", description: "SDK: Find files by glob pattern" },
  { name: "ask_user", category: "sdk", description: "SDK: Ask user a question" },
  { name: "report_intent", category: "sdk", description: "SDK: Report planned action" },
  { name: "bash", category: "sdk", description: "SDK: Execute shell commands" },
  { name: "edit", category: "sdk", description: "SDK: Edit file (built-in)" },
];

// Default mode definitions — mirrored from filterToolsForMode's hardcoded
// fallback in routes/chat/session-manager.ts. The chat handler will use these
// when no DB row exists for a mode, so the admin UI must show them as the
// "live" config rather than a confusing empty list. Each default has
// `is_default: true` so the UI can render "(default — click Customize to
// override)" instead of acting like the admin has to wire tools from scratch
// before chat works. The `agent` mode allows every known tool except the
// three plan-only ones; `plan` mirrors PLAN_MODE_ALLOWED_DEFAULT.
const PLAN_ONLY_TOOL_NAMES = ["ask_clarification", "create_plan", "mark_step_complete"];
const PLAN_DEFAULT_ALLOWED = [
  "read_file", "list_files", "search_files",
  "ask_clarification", "create_plan", "mark_step_complete",
];
const DEFAULT_MODES = [
  {
    mode: "agent",
    allowed_tools: KNOWN_TOOLS.map((t) => t.name).filter((n) => !PLAN_ONLY_TOOL_NAMES.includes(n)),
    description: "Build mode — full file creation, editing, install, and deploy tools.",
    updated_by: null,
    updated_at: new Date(0).toISOString(),
    is_default: true,
  },
  {
    mode: "plan",
    allowed_tools: PLAN_DEFAULT_ALLOWED,
    description: "Strategize / plan mode — read-only analysis tools plus plan creation.",
    updated_by: null,
    updated_at: new Date(0).toISOString(),
    is_default: true,
  },
] as const;

// GET /admin/tools/modes — list all mode configs + known tools catalog.
// Merges DB-customized rows over the built-in DEFAULT_MODES so the admin
// UI always shows the active config (not an empty list on a fresh install).
adminToolsRoutes.get("/tools/modes", async (c) => {
  try {
    const dbModes = await modeTools.list();
    const dbModeNames = new Set(dbModes.map((m: { mode: string }) => m.mode));
    const merged = [
      ...dbModes.map((m: object) => ({ ...m, is_default: false })),
      ...DEFAULT_MODES.filter((d) => !dbModeNames.has(d.mode)),
    ];
    return c.json({ modes: merged, knownTools: KNOWN_TOOLS });
  } catch (err) {
    console.error("[admin/tools/modes] Error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// GET /admin/tools/modes/:mode — get single mode config
adminToolsRoutes.get("/tools/modes/:mode", async (c) => {
  const mode = c.req.param("mode");
  const config = await modeTools.get(mode);
  if (!config) return c.json({ error: "Mode not found" }, 404);
  return c.json(config);
});

const upsertModeSchema = z.object({
  allowedTools: z.array(z.string().max(100)).max(200),
  description: z.string().max(500).nullable().optional(),
});

// PUT /admin/tools/modes/:mode — upsert mode tool config
adminToolsRoutes.put("/tools/modes/:mode", async (c) => {
  const mode = c.req.param("mode");
  if (!/^[a-z][a-z0-9_-]{0,49}$/.test(mode)) {
    return c.json({ error: "Invalid mode name" }, 400);
  }
  const body = await c.req.json();
  const parsed = upsertModeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const adminId = c.get("userId");
  const config = await modeTools.upsert({
    mode,
    allowedTools: parsed.data.allowedTools,
    description: parsed.data.description ?? undefined,
    updatedBy: adminId,
  });

  return c.json({ ok: true, config });
});

// DELETE /admin/tools/modes/:mode — delete mode config
adminToolsRoutes.delete("/tools/modes/:mode", async (c) => {
  const mode = c.req.param("mode");
  const deleted = await modeTools.remove(mode);
  if (!deleted) return c.json({ error: "Mode not found" }, 404);
  return c.json({ ok: true });
});
