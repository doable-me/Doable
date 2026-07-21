import { Hono } from "hono";
import * as githubClient from "../../github/client.js";
import * as githubSync from "../../github/sync.js";
import { processWebhook } from "../../github/webhook.js";
import { sql } from "../../db/index.js";
import { githubQueries } from "@doable/db/queries/github.js";
import { type AuthEnv } from "../../middleware/auth.js";
import { authMiddlewareWithRls as authMiddleware } from "../../middleware/rls.js";
import { getProjectPath } from "../../ai/project-files.js";
import { requireProjectAccess } from "../projects/helpers.js";

const db = githubQueries(sql);

export const githubProjectRoutes = new Hono<AuthEnv>({ strict: false });

// Protect project-level routes (not webhook)
githubProjectRoutes.use("/:projectId/github/*", authMiddleware);

// ─── Project-membership guard ───────────────────────────────
// BUG-CORPUS-GH-001: prior to this guard, `/:projectId/github/*` only
// required auth; any signed-in user could read another tenant's
// repoOwner / repoName / repoUrl / lastCommitSha via /github/status and
// enumerate projects via /github/commits. We now hide existence (404) for
// any caller that is not a workspace member, project collaborator, or
// platform admin — same semantics as `/projects/:id`.
githubProjectRoutes.use("/:projectId/github/*", async (c, next) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");
  if (!projectId || !userId) {
    return c.json({ error: "Project not found" }, 404);
  }
  const access = await requireProjectAccess(userId, projectId);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }
  await next();
});

// ─── Connect project to GitHub ─────────────────────────────
githubProjectRoutes.post("/:projectId/github/connect", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const body = await c.req.json<{
    token?: string;
    repoOwner: string;
    repoName: string;
    branch?: string;
    projectPath?: string;
    createNew?: boolean;
    isPrivate?: boolean;
    description?: string;
  }>();

  // Get token from body, header, or user's stored token
  let token = body.token ?? c.req.header("X-GitHub-Token");
  if (!token) {
    const userToken = await db.findUserToken(userId);
    if (userToken) {
      token = userToken.access_token;
    }
  }

  if (!token || !body.repoOwner || !body.repoName) {
    return c.json(
      { error: "Missing required fields: repoOwner, repoName (and a GitHub token)" },
      400
    );
  }

  try {
    // Validate token
    await githubClient.authenticate(token);

    const projectPath = getProjectPath(projectId);

    const result = await githubSync.initialPush(projectId, projectPath, {
      token,
      repoOwner: body.repoOwner,
      repoName: body.repoName,
      branch: body.branch,
      userId,
      createNew: body.createNew,
      isPrivate: body.isPrivate,
      description: body.description,
    });

    // Update project's github_repo_url
    await sql`
      UPDATE projects
      SET github_repo_url = ${`https://github.com/${body.repoOwner}/${body.repoName}`}
      WHERE id = ${projectId}
    `;

    return c.json({ data: result }, 201);
  } catch (err) {
    console.error(`[GitHub] connect error for ${projectId}: ${err instanceof Error ? err.message : err}`);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to connect GitHub", message }, 500);
  }
});

// ─── Push to GitHub ─────────────────────────────────────────
githubProjectRoutes.post("/:projectId/github/push", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const body = await c.req.json<{
    message: string;
    projectPath: string;
    force?: boolean;
  }>();

  if (!body.message || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: message, projectPath" },
      400
    );
  }

  try {
    const projectPath = getProjectPath(projectId);
    const pushFn = body.force
      ? githubSync.forcePushToGitHub
      : githubSync.pushToGitHub;

    const result = await pushFn(
      projectId,
      projectPath,
      body.message,
      userId
    );

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isConflict = message.includes("Conflict detected");
    return c.json(
      { error: isConflict ? "Conflict detected" : "Failed to push to GitHub", message },
      isConflict ? 409 : 500
    );
  }
});

// ─── Pull from GitHub ───────────────────────────────────────
githubProjectRoutes.post("/:projectId/github/pull", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const body = await c.req.json<{
    projectPath: string;
  }>();

  if (!body.projectPath) {
    return c.json(
      { error: "Missing required field: projectPath" },
      400
    );
  }

  try {
    const projectPath = getProjectPath(projectId);
    const result = await githubSync.pullFromGitHub(
      projectId,
      projectPath,
      userId
    );

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to pull from GitHub", message }, 500);
  }
});

// ─── Sync status (project-level) ────────────────────────────
githubProjectRoutes.get("/:projectId/github/status", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const status = await githubSync.syncStatus(projectId);
    return c.json({ data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to get sync status", message }, 500);
  }
});

// ─── Commit history ─────────────────────────────────────────
githubProjectRoutes.get("/:projectId/github/commits", async (c) => {
  const projectId = c.req.param("projectId");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const pageSize = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "20", 10) || 20, 1), 100);

  try {
    const result = await githubSync.getCommitHistory(projectId, { page, pageSize });
    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to get commit history", message }, 500);
  }
});

// ─── Import from GitHub (clone existing repo) ───────────────
githubProjectRoutes.post("/:projectId/github/import", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const body = await c.req.json<{
    repoOwner: string;
    repoName: string;
    branch?: string;
  }>();

  if (!body.repoOwner || !body.repoName) {
    return c.json(
      { error: "Missing required fields: repoOwner, repoName" },
      400
    );
  }

  // Get token from user's stored token
  let token: string | undefined;
  const userToken = await db.findUserToken(userId);
  if (userToken) {
    token = userToken.access_token;
  }

  if (!token) {
    return c.json({ error: "No GitHub token available. Connect GitHub first." }, 401);
  }

  try {
    const projectPath = getProjectPath(projectId);
    const result = await githubSync.importFromGitHub(
      projectId,
      projectPath,
      {
        token,
        repoOwner: body.repoOwner,
        repoName: body.repoName,
        branch: body.branch,
        userId,
      }
    );

    // Gap #7 — Supabase import auto-connect. If the imported app talks to
    // Supabase (VITE_SUPABASE_* / @supabase/supabase-js / process.env.SUPABASE_*)
    // but THIS project has no PROJECT-SCOPED Supabase connection, tell the
    // frontend to prompt the user to connect Supabase. Connecting creates a
    // project-scoped connection whose env reaches the sandboxed dev server on
    // EVERY start path (gap #4) — instead of the app silently rendering
    // "Supabase is not configured".
    //
    // We deliberately require a PROJECT-scoped connection, not merely any
    // effective (user/workspace-scoped) one: a user-scoped connection only
    // resolves when the dev server is started with that userId (the editor
    // path), NOT on the lazy preview-proxy auto-start that has no userId — so an
    // import on an account that already connected Supabase elsewhere would get
    // neither a prompt nor working creds (it would render "not configured" after
    // any lazy restart). Prompting binds a project-scoped connection that always
    // resolves. Best-effort: never fail the import if detection/lookup throws.
    let supabaseSetupRequired = false;
    try {
      const { detectSupabaseUsage } = await import(
        "../../projects/detect-supabase-usage.js"
      );
      if (await detectSupabaseUsage(projectPath)) {
        const projConn = await sql`
          SELECT 1 FROM integration_connections
          WHERE integration_id = 'supabase'
            AND scope = 'project'
            AND project_id = ${projectId}
            AND status = 'active'
          LIMIT 1
        `;
        supabaseSetupRequired = projConn.length === 0;
      }
    } catch (err) {
      console.warn(
        `[github-import] Supabase usage detection failed for ${projectId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    // Lovable chatbot persona preservation.
    //
    // Doable's /api/chat bridge (commit 81491c3) routes AROUND the imported
    // src/routes/api/chat.ts file — the persona Lovable hard-codes there as
    // `streamText({ system: "You are Ember, the virtual barista..." })` is
    // therefore never read at runtime, and imported chatbots answer as generic
    // assistants. Extract that string once, at import time, and seed it into
    // project_ai_settings.system_prompt_override — which ai-proxy.ts:768–775
    // prepends to every subsequent chat request server-side, restoring the
    // persona without any user action or source edit.
    //
    // Best-effort; never fail the import if extraction / DB write throws. The
    // upsert uses COALESCE so an owner who has already customised the field
    // in the Doable AI settings tab is never clobbered on re-import.
    //
    // See PRD: doableinfo/LOVABLE_CHATBOT_PERSONA_PRESERVATION.md
    try {
      const { extractLovableSystemPrompt } = await import(
        "../../projects/extract-lovable-system-prompt.js"
      );
      const persona = await extractLovableSystemPrompt(projectPath);
      if (persona) {
        await sql`
          INSERT INTO project_ai_settings
            (project_id, workspace_id, system_prompt_override, updated_by)
          VALUES (
            ${projectId},
            (SELECT workspace_id FROM projects WHERE id = ${projectId}),
            ${persona},
            ${userId}
          )
          ON CONFLICT (project_id) DO UPDATE
            SET system_prompt_override =
                  COALESCE(project_ai_settings.system_prompt_override, EXCLUDED.system_prompt_override),
                updated_by = EXCLUDED.updated_by
        `;
        // Log the length, not the content — persona strings can contain
        // owner-specific brand voice notes we don't want in server logs.
        console.log(
          `[github-import] seeded system_prompt_override (${persona.length} chars) for ${projectId}`,
        );
      }
    } catch (err) {
      console.warn(
        `[github-import] Lovable system prompt extraction failed for ${projectId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    return c.json({ data: result, supabaseSetupRequired }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to import from GitHub", message }, 500);
  }
});

// ─── Resolve merge conflicts ─────────────────────────────────
githubProjectRoutes.post("/:projectId/github/resolve", async (c) => {
  const projectId = c.req.param("projectId");

  const body = await c.req.json<{
    strategy: "ours" | "theirs";
    projectPath: string;
  }>();

  if (!body.strategy || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: strategy, projectPath" },
      400
    );
  }

  try {
    await githubSync.resolveConflicts(body.projectPath, body.strategy);

    // Update sync status
    await sql`
      UPDATE github_connections SET sync_status = 'synced', last_synced_at = NOW()
      WHERE project_id = ${projectId}
    `;

    return c.json({ data: { resolved: true, strategy: body.strategy } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to resolve conflicts", message }, 500);
  }
});

// ─── Abort merge ─────────────────────────────────────────────
githubProjectRoutes.post("/:projectId/github/abort-merge", async (c) => {
  const body = await c.req.json<{ projectPath: string }>();

  if (!body.projectPath) {
    return c.json({ error: "Missing required field: projectPath" }, 400);
  }

  try {
    await githubSync.abortMerge(body.projectPath);
    return c.json({ data: { aborted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to abort merge", message }, 500);
  }
});

// ─── Disconnect project from GitHub ─────────────────────────
githubProjectRoutes.delete("/:projectId/github/connect", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const deleted = await githubSync.disconnectGitHub(projectId);
    return c.json({ data: { disconnected: deleted } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to disconnect GitHub", message }, 500);
  }
});

// ─── Webhook ────────────────────────────────────────────────
githubProjectRoutes.post("/github/webhook", async (c) => {
  const event = c.req.header("X-GitHub-Event");
  const signature = c.req.header("X-Hub-Signature-256");

  if (!event) {
    return c.json({ error: "Missing X-GitHub-Event header" }, 400);
  }

  try {
    const rawBody = await c.req.text();
    const result = await processWebhook(event, rawBody, signature ?? undefined);

    return c.json({ data: result }, result.handled ? 200 : 202);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Webhook processing failed", message }, 500);
  }
});
