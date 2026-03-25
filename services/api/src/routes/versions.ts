import { Hono } from "hono";
import {
  createVersion,
  getVersions,
  getVersion,
  restoreVersion,
  bookmarkVersion,
  diffVersions,
  autoVersion,
} from "../version-control/manager.js";
import { getProjectPath, isProjectScaffolded } from "../projects/file-manager.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { emitActivity } from "../lib/activity.js";
import { isGitRepo } from "../git/init.js";
import {
  getLog,
  getLogCount,
  autoCommit,
  findCommitBySessionId,
  type GitLogEntry,
} from "../git/commits.js";
import {
  revertToCommit,
  diffCommits as gitDiffCommits,
} from "../git/operations.js";

export const versionRoutes = new Hono<AuthEnv>();

// ─── Helper: Format git log entries as version entries ─────
function formatGitLogAsVersions(
  entries: GitLogEntry[],
  _bookmarks: Set<string> = new Set(),
  offset = 0
) {
  return entries.map((entry, i) => ({
    id: entry.sha,
    project_id: "",
    version_number: offset + i + 1,
    description: entry.message,
    bookmarked: _bookmarks.has(entry.sha),
    created_by: entry.author.name,
    created_at: entry.timestamp,
    sha: entry.sha,
    shortSha: entry.shortSha,
    type: entry.type || undefined,
    filesChanged: entry.filesChanged,
    insertions: entry.insertions,
    deletions: entry.deletions,
  }));
}

// ─── Require authentication for all version routes ───────
versionRoutes.use("/:projectId/*", authMiddleware);

// ─── Undo AI changes (git-based) ──────────────────────────
versionRoutes.post("/:projectId/versions/undo", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json<{ messageId: string }>();

  if (!body.messageId) {
    return c.json({ error: "Missing required field: messageId" }, 400);
  }

  if (!isProjectScaffolded(projectId)) {
    return c.json({ error: "Project not scaffolded" }, 400);
  }

  const projectPath = getProjectPath(projectId);
  if (!isGitRepo(projectPath)) {
    return c.json({ error: "Project does not have git history" }, 400);
  }

  try {
    // Find the commit associated with this AI message
    const commit = await findCommitBySessionId(projectPath, body.messageId);
    if (!commit) {
      return c.json({ error: "No version found for this message" }, 404);
    }

    // Revert to the commit BEFORE this one (its parent)
    const parentSha = commit.sha + "~1";
    const newCommit = await revertToCommit(projectPath, parentSha);

    return c.json({
      data: {
        undone: true,
        revertedCommit: commit.sha,
        newCommit: newCommit.sha,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to undo changes", message }, 500);
  }
});

// ─── List versions (dual-path: git or legacy DB) ──────────
versionRoutes.get("/:projectId/versions", async (c) => {
  const projectId = c.req.param("projectId");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") ?? "20", 10);

  try {
    // Check if project uses git-based versioning
    const projectPath = isProjectScaffolded(projectId)
      ? getProjectPath(projectId)
      : null;
    const useGit = projectPath && isGitRepo(projectPath);

    if (useGit) {
      const offset = (page - 1) * pageSize;
      const [entries, total] = await Promise.all([
        getLog(projectPath, { limit: pageSize, offset }),
        getLogCount(projectPath),
      ]);

      // Load bookmarks from DB
      const bookmarkRows = await sql<Array<{ commit_sha: string }>>`
        SELECT commit_sha FROM version_bookmarks
        WHERE project_id = ${projectId}
      `;
      const bookmarks = new Set(bookmarkRows.map((r) => r.commit_sha));

      return c.json({
        data: formatGitLogAsVersions(entries, bookmarks, offset),
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    }

    // Legacy DB path
    const result = await getVersions(projectId, { page, pageSize });

    return c.json({
      data: result.versions,
      pagination: {
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to list versions", message }, 500);
  }
});

// ─── Create version ────────────────────────────────────────
versionRoutes.post("/:projectId/versions", async (c) => {
  const projectId = c.req.param("projectId");

  const body = await c.req.json<{
    description?: string;
    createdBy: string;
    projectPath: string;
  }>();

  if (!body.createdBy || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: createdBy, projectPath" },
      400
    );
  }

  try {
    const version = await createVersion(projectId, body.projectPath, {
      description: body.description,
      createdBy: body.createdBy,
    });

    emitActivity(sql, {
      projectId,
      userId: c.get("userId"),
      eventType: "version_create",
      summary: "created a version snapshot",
    });

    return c.json({ data: version }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to create version", message }, 500);
  }
});

// ─── Get single version ───────────────────────────────────
versionRoutes.get("/:projectId/versions/:versionId", async (c) => {
  const versionId = c.req.param("versionId");

  try {
    const version = await getVersion(versionId);

    if (!version) {
      return c.json({ error: "Version not found" }, 404);
    }

    return c.json({ data: version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to get version", message }, 500);
  }
});

// ─── Auto-create version (called after AI finishes generating code) ──
versionRoutes.post("/:projectId/versions/auto", async (c) => {
  const projectId = c.req.param("projectId");

  const body = await c.req.json<{
    description?: string;
    createdBy: string;
  }>();

  if (!body.createdBy) {
    return c.json({ error: "Missing required field: createdBy" }, 400);
  }

  // Resolve project path from project ID
  if (!isProjectScaffolded(projectId)) {
    return c.json({ error: "Project not scaffolded yet" }, 400);
  }

  const projectPath = getProjectPath(projectId);

  try {
    const version = await autoVersion(
      projectId,
      projectPath,
      body.description ?? "AI-generated changes",
      body.createdBy
    );

    emitActivity(sql, {
      projectId,
      userId: c.get("userId"),
      eventType: "version_create",
      summary: "created a version snapshot",
    });

    return c.json({ data: version }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to auto-create version", message }, 500);
  }
});

// ─── Restore version (git or legacy) ───────────────────────
versionRoutes.post("/:projectId/versions/:versionId/restore", async (c) => {
  const projectId = c.req.param("projectId");
  const versionId = c.req.param("versionId");

  const body = await c.req.json<{
    restoredBy: string;
    projectPath?: string;
  }>();

  try {
    const projectPath = isProjectScaffolded(projectId)
      ? getProjectPath(projectId)
      : null;
    const useGit = projectPath && isGitRepo(projectPath);

    if (useGit && versionId.match(/^[0-9a-f]{7,40}$/i)) {
      // Git-based restore using commit SHA
      const newCommit = await revertToCommit(projectPath, versionId);
      return c.json({
        data: {
          id: newCommit.sha,
          message: newCommit.message,
          sha: newCommit.sha,
          restored: true,
        },
      }, 201);
    }

    // Legacy DB-based restore
    if (!body.restoredBy) {
      return c.json({ error: "Missing required field: restoredBy" }, 400);
    }

    const resolvedPath = body.projectPath || (projectPath ?? "");
    const newVersion = await restoreVersion(
      projectId,
      versionId,
      resolvedPath,
      body.restoredBy
    );

    return c.json({ data: newVersion }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return c.json({ error: "Failed to restore version", message }, status);
  }
});

// ─── Bookmark version (git SHA or legacy DB ID) ───────────
versionRoutes.patch("/:projectId/versions/:versionId/bookmark", async (c) => {
  const projectId = c.req.param("projectId");
  const versionId = c.req.param("versionId");

  const body = await c.req.json<{ bookmarked: boolean }>();

  if (typeof body.bookmarked !== "boolean") {
    return c.json({ error: "Missing required field: bookmarked (boolean)" }, 400);
  }

  try {
    // Check if this looks like a git SHA
    if (versionId.match(/^[0-9a-f]{7,40}$/i)) {
      if (body.bookmarked) {
        await sql`
          INSERT INTO version_bookmarks (project_id, commit_sha)
          VALUES (${projectId}, ${versionId})
          ON CONFLICT DO NOTHING
        `;
      } else {
        await sql`
          DELETE FROM version_bookmarks
          WHERE project_id = ${projectId} AND commit_sha = ${versionId}
        `;
      }
      return c.json({
        data: { id: versionId, bookmarked: body.bookmarked },
      });
    }

    // Legacy DB bookmark
    const version = await bookmarkVersion(versionId, body.bookmarked);
    if (!version) {
      return c.json({ error: "Version not found" }, 404);
    }
    return c.json({ data: version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to update bookmark", message }, 500);
  }
});

// ─── Diff two versions (git or legacy) ─────────────────────
versionRoutes.get(
  "/:projectId/versions/:versionId/diff/:compareId",
  async (c) => {
    const projectId = c.req.param("projectId");
    const versionId = c.req.param("versionId");
    const compareId = c.req.param("compareId");

    try {
      const projectPath = isProjectScaffolded(projectId)
        ? getProjectPath(projectId)
        : null;
      const useGit = projectPath && isGitRepo(projectPath);

      // Git-based diff if both IDs look like SHAs
      if (
        useGit &&
        versionId.match(/^[0-9a-f]{7,40}$/i) &&
        compareId.match(/^[0-9a-f]{7,40}$/i)
      ) {
        const diff = await gitDiffCommits(projectPath, versionId, compareId);
        return c.json({ data: diff });
      }

      // Legacy DB diff
      const diff = await diffVersions(versionId, compareId);
      return c.json({ data: diff });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const status = message.includes("not found") ? 404 : 500;
      return c.json({ error: "Failed to diff versions", message }, status);
    }
  }
);
