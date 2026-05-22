import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth.js";
import {
  createProject,
  isProjectScaffolded,
  ensureDependencies,
  ProjectExistsError,
} from "../../projects/file-manager.js";
import {
  startDevServer,
  getDevServerInternalUrl,
} from "../../projects/dev-server.js";
import { sql } from "../../db/index.js";
import { getTemplate } from "../../templates/registry.js";

export const scaffoldRoutes = new Hono<AuthEnv>({ strict: false });

// In-flight scaffold locks — prevents two concurrent scaffold calls from
// double-creating a project (e.g. frontend mount + chat auto-scaffold).
// The value is a promise that resolves when the first caller finishes.
const scaffoldLocks = new Map<string, Promise<void>>();

// ─── POST /projects/:id/scaffold ─ Create project scaffold ──

scaffoldRoutes.post("/projects/:id/scaffold", async (c) => {
  const projectId = c.req.param("id");

  // BUG-R14-COLLAB-REJOIN: refuse to scaffold a project whose DB row does
  // not exist. Previously the access middleware in routes/project-files.ts
  // let POST /scaffold fall through for missing projects so the row could
  // be lazily created — but that auto-creation used the *caller's*
  // workspace, allowing project-id hijack. Project rows must be created
  // via explicit POST /projects before scaffold can be invoked.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectId} AND deleted_at IS NULL
    `;
    if (!row) {
      return c.json({ error: "Project not found" }, 404);
    }
  }

  // If a scaffold is already in-flight for this project, wait for it to
  // finish and then handle this request normally (which will hit the
  // ProjectExistsError path and just start the dev server).
  const existingLock = scaffoldLocks.get(projectId);
  if (existingLock) {
    try {
      await existingLock;
    } catch {
      // Previous scaffold failed — we'll try again below
    }
  }

  // Create a lock for this scaffold operation
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  scaffoldLocks.set(projectId, lockPromise);

  try {
    // Check if this project has a template_id — if so, use template files.
    // Also check the project_files table for pre-scaffolded files (written by
    // POST /templates/:id/use before the filesystem scaffold runs).
    let templateFiles: Record<string, string> | undefined;
    let scaffoldFrameworkId: string | undefined;
    try {
      const [project] = await sql<{ template_id: string | null; framework_id: string | null }[]>`
        SELECT template_id, framework_id FROM projects WHERE id = ${projectId}
      `;
      // Use the project's framework_id as default (set at creation time)
      if (project?.framework_id) {
        scaffoldFrameworkId = project.framework_id;
      }
      if (project?.template_id) {
        const template = getTemplate(project.template_id);
        if (template) {
          templateFiles = template.codeFiles;
          scaffoldFrameworkId = template.framework_id;
          // Persist the framework choice on the project row so dev-server,
          // build, proxy, and AI prompt all resolve the right adapter.
          await sql`
            UPDATE projects SET framework_id = ${template.framework_id}
            WHERE id = ${projectId}
          `;
          console.log(
            `[Scaffold] Using template "${template.id}" (framework=${template.framework_id}) for project ${projectId}`,
          );
        }
      }

      // If no template_id match, check project_files table for pre-scaffolded
      // files (e.g. from POST /templates/:id/use which writes to DB first)
      if (!templateFiles) {
        const dbFiles = await sql<{ file_path: string; content: string }[]>`
          SELECT file_path, content FROM project_files
          WHERE project_id = ${projectId}
            AND file_path NOT LIKE '.doable/%'
        `;
        if (dbFiles.length > 0) {
          templateFiles = {};
          for (const f of dbFiles) {
            templateFiles[f.file_path] = f.content;
          }
          console.log(`[Scaffold] Using ${dbFiles.length} pre-scaffolded files from project_files for ${projectId}`);
        }
      }
    } catch {
      // DB lookup failed — fall back to blank scaffold
    }

    const result = await createProject(projectId, templateFiles, scaffoldFrameworkId);

    // Resolve userId early so vault-backed integration credentials get injected
    // into the Vite dev server (Phase 1C of integration↔AI chat bridge).
    const userId = c.get("userId");

    // Start the dev server after scaffolding
    let devServer: { url: string; port: number } | null = null;
    try {
      devServer = await startDevServer(projectId, userId ? { userId } : undefined);
    } catch (err) {
      console.error(
        `[Scaffold] Dev server failed to start for ${projectId}:`,
        err,
      );
    }

    // Ensure a project record exists in the database so the dashboard can list it
    await ensureProjectDbRecord(projectId, userId);

    // Auto-capture thumbnail for template-based projects (they have real content from the start)
    if (templateFiles && devServer) {
      const internalUrl = getDevServerInternalUrl(projectId);
      if (internalUrl) {
        const previewForCapture = `${internalUrl}/preview/${projectId}/`;
        // Delay longer (8s) for template projects to let Vite fully build
        setTimeout(() => {
          import("../../thumbnails/capture.js")
            .then(({ captureProjectThumbnail }) =>
              captureProjectThumbnail(projectId, previewForCapture, { retries: 2, retryDelayMs: 5000, triggeredBy: "auto" })
            )
            .then(async (filePath) => {
              if (filePath) {
                const thumbnailUrl = `/thumbnails/${projectId}.png`;
                await sql`UPDATE projects SET thumbnail_url = ${thumbnailUrl}, updated_at = NOW() WHERE id = ${projectId}`;
                console.log(`[Thumbnail] Auto-captured for template project ${projectId}`);
              }
            })
            .catch((err) => console.warn(`[Thumbnail] Template capture failed for ${projectId}:`, err));
        }, 8000);
      }
    }

    return c.json(
      {
        data: {
          projectId,
          files: result.files,
          previewUrl: devServer?.url ?? null,
          devServerPort: devServer?.port ?? null,
        },
      },
      201,
    );
  } catch (err) {
    if (err instanceof ProjectExistsError) {
      // Project already exists — ensure deps installed, then start dev server
      const existingUserId = c.get("userId");
      let devServer: { url: string; port: number } | null = null;
      try {
        await ensureDependencies(projectId);
        devServer = await startDevServer(projectId, existingUserId ? { userId: existingUserId } : undefined);
      } catch (devErr) {
        console.error(
          `[Scaffold] Dev server failed for existing project ${projectId}:`,
          devErr,
        );
      }

      // Also ensure DB record exists for previously-scaffolded projects
      await ensureProjectDbRecord(projectId, existingUserId);

      // Catch-up thumbnail: if project has no thumbnail but dev server is running, try to capture one
      if (devServer) {
        try {
          const [proj] = await sql<{ thumbnail_url: string | null }[]>`
            SELECT thumbnail_url FROM projects WHERE id = ${projectId}
          `;
          if (!proj?.thumbnail_url) {
            const internalUrl = getDevServerInternalUrl(projectId);
            if (internalUrl) {
              const previewForCapture = `${internalUrl}/preview/${projectId}/`;
              setTimeout(() => {
                import("../../thumbnails/capture.js")
                  .then(({ captureProjectThumbnail }) =>
                    captureProjectThumbnail(projectId, previewForCapture, { retries: 1, retryDelayMs: 5000, triggeredBy: "auto" })
                  )
                  .then(async (filePath) => {
                    if (filePath) {
                      const thumbnailUrl = `/thumbnails/${projectId}.png`;
                      await sql`UPDATE projects SET thumbnail_url = ${thumbnailUrl}, updated_at = NOW() WHERE id = ${projectId}`;
                      console.log(`[Thumbnail] Catch-up capture for ${projectId}`);
                    }
                  })
                  .catch((err) => console.warn(`[Thumbnail] Catch-up failed for ${projectId}:`, err));
              }, 5000);
            }
          }
        } catch {
          // Non-critical — don't block scaffold response
        }
      }

      return c.json({
        data: {
          projectId,
          files: [],
          previewUrl: devServer?.url ?? null,
          devServerPort: devServer?.port ?? null,
          alreadyExists: true,
        },
      });
    }
    throw err;
  } finally {
    releaseLock!();
    scaffoldLocks.delete(projectId);
  }
});

// ─── Helpers ─────────────────────────────────────────────

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Verify the project row exists in DB. If it does, no-op. If it does NOT,
 * log a warning — but DO NOT auto-create. Creating a project row from the
 * scaffold path is unsafe: it lets any caller who visits /editor/<missingId>
 * recreate a deleted (or never-existed) project under THEIR workspace,
 * effectively hijacking the project id (BUG-R14-COLLAB-REJOIN).
 *
 * Project rows must be created via explicit endpoints — `POST /projects`
 * (`projects.create` in list-routes.ts), template instantiation, or
 * the chat `createIfMissing` flow that has its own opt-in gate.
 *
 * Only works for UUID project IDs (the projects table has a uuid primary
 * key). Non-UUID IDs (e.g. "proj-1234567890") are skipped since they
 * come from the editor's "new project" flow and will get a proper DB
 * record via the explicit POST /projects path.
 */
async function ensureProjectDbRecord(projectId: string, _userId?: string): Promise<void> {
  try {
    if (!isValidUuid(projectId)) {
      console.log(`[Scaffold] Skipping DB record check for non-UUID projectId: ${projectId}`);
      return;
    }

    const existing = await sql`SELECT id FROM projects WHERE id = ${projectId}`;
    if (existing.length > 0) return;

    // BUG-R14-COLLAB-REJOIN: never auto-INSERT a project row from the
    // scaffold path. Doing so allowed any user who hit
    // POST /projects/<id>/scaffold for a deleted-or-missing project to
    // recreate it under their OWN workspace with a UUID-as-name placeholder,
    // hijacking the project id from its original owner.
    //
    // If we got here, the access middleware in routes/project-files.ts
    // already let the scaffold POST through — that branch only fires when
    // the project row is missing entirely, in which case the *correct*
    // behavior is to refuse the scaffold (not silently recreate).
    console.warn(
      `[Scaffold] Refusing to auto-create DB row for missing project ${projectId} — ` +
      `project must be created via POST /projects first. ` +
      `(BUG-R14-COLLAB-REJOIN safeguard)`
    );
  } catch (err) {
    // Don't let DB errors break the scaffold flow — the project still works on disk
    console.warn(`[Scaffold] Project existence check failed for ${projectId}:`, err);
  }
}
