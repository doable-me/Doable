import { Hono } from "hono";
import {
  createVersion,
  getVersions,
  restoreVersion,
  bookmarkVersion,
  diffVersions,
} from "../version-control/manager.js";

export const versionRoutes = new Hono();

// ─── List versions ─────────────────────────────────────────
versionRoutes.get("/:projectId/versions", async (c) => {
  const projectId = c.req.param("projectId");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") ?? "20", 10);

  try {
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

    return c.json({ data: version }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to create version", message }, 500);
  }
});

// ─── Restore version ───────────────────────────────────────
versionRoutes.post("/:projectId/versions/:versionId/restore", async (c) => {
  const projectId = c.req.param("projectId");
  const versionId = c.req.param("versionId");

  const body = await c.req.json<{
    restoredBy: string;
    projectPath: string;
  }>();

  if (!body.restoredBy || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: restoredBy, projectPath" },
      400
    );
  }

  try {
    const newVersion = await restoreVersion(
      projectId,
      versionId,
      body.projectPath,
      body.restoredBy
    );

    return c.json({ data: newVersion }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return c.json({ error: "Failed to restore version", message }, status);
  }
});

// ─── Bookmark version ──────────────────────────────────────
versionRoutes.patch("/:projectId/versions/:versionId/bookmark", async (c) => {
  const versionId = c.req.param("versionId");

  const body = await c.req.json<{ bookmarked: boolean }>();

  if (typeof body.bookmarked !== "boolean") {
    return c.json({ error: "Missing required field: bookmarked (boolean)" }, 400);
  }

  try {
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

// ─── Diff two versions ─────────────────────────────────────
versionRoutes.get(
  "/:projectId/versions/:versionId/diff/:compareId",
  async (c) => {
    const versionId = c.req.param("versionId");
    const compareId = c.req.param("compareId");

    try {
      const diff = await diffVersions(versionId, compareId);
      return c.json({ data: diff });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const status = message.includes("not found") ? 404 : 500;
      return c.json({ error: "Failed to diff versions", message }, status);
    }
  }
);
