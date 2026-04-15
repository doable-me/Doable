import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { modeToolQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";

const modeTools = modeToolQueries(sql);

export const adminToolsRoutes = new Hono<AuthEnv>();

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

// GET /admin/tools/modes — list all mode configs + known tools catalog
adminToolsRoutes.get("/tools/modes", async (c) => {
  try {
    const modes = await modeTools.list();
    return c.json({ modes, knownTools: KNOWN_TOOLS });
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
