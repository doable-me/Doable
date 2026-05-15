/**
 * Direct Save API Route
 *
 * POST /projects/:id/direct-save
 *
 * Receives a source location and a set of changes from the visual editor,
 * applies them to the project source files using AST transformation,
 * and returns the results.
 */

import { Hono } from "hono";
import { getProjectPath } from "../projects/file-manager.js";
import { applyDirectSave } from "./ast-transformer.js";
import type { DirectSaveRequest, DirectSaveResponse } from "./types.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { requireProjectAccess } from "../middleware/project-access.js";

export const directSaveRoutes = new Hono<AuthEnv>({ strict: false });

directSaveRoutes.post(
  "/projects/:id/direct-save",
  authMiddleware,
  requireProjectAccess({ allowPublic: false }),
  async (c) => {
  const projectId = c.req.param("id");

  // ── Parse and validate request body ──
  let body: DirectSaveRequest;
  try {
    body = await c.req.json<DirectSaveRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate sourceLocation
  if (!body.sourceLocation) {
    return c.json({ error: "Missing sourceLocation" }, 400);
  }
  const { file, line, col } = body.sourceLocation;
  if (typeof file !== "string" || !file.trim()) {
    return c.json({ error: "sourceLocation.file must be a non-empty string" }, 400);
  }
  if (typeof line !== "number" || line < 1 || !Number.isInteger(line)) {
    return c.json({ error: "sourceLocation.line must be a positive integer" }, 400);
  }
  if (typeof col !== "number" || col < 0 || !Number.isInteger(col)) {
    return c.json({ error: "sourceLocation.col must be a non-negative integer" }, 400);
  }

  // Validate changes
  if (!Array.isArray(body.changes) || body.changes.length === 0) {
    return c.json({ error: "changes must be a non-empty array" }, 400);
  }

  for (let i = 0; i < body.changes.length; i++) {
    const change = body.changes[i]!;
    if (change.type !== "text" && change.type !== "style") {
      return c.json(
        { error: `changes[${i}].type must be "text" or "style"` },
        400,
      );
    }
    if (change.type === "text") {
      if (typeof change.oldText !== "string") {
        return c.json(
          { error: `changes[${i}].oldText is required for text changes` },
          400,
        );
      }
      if (typeof change.newText !== "string") {
        return c.json(
          { error: `changes[${i}].newText is required for text changes` },
          400,
        );
      }
    }
    if (change.type === "style") {
      if (typeof change.property !== "string" || !change.property.trim()) {
        return c.json(
          { error: `changes[${i}].property is required for style changes` },
          400,
        );
      }
      if (typeof change.value !== "string") {
        return c.json(
          { error: `changes[${i}].value is required for style changes` },
          400,
        );
      }
    }
  }

  // ── Prevent path traversal in source file ──
  if (
    file.includes("..") ||
    file.startsWith("/") ||
    file.startsWith("\\") ||
    file.includes("node_modules")
  ) {
    return c.json({ error: "Invalid source file path" }, 400);
  }

  // ── Resolve project path ──
  const projectPath = getProjectPath(projectId);

  // ── Apply changes via AST transformer ──
  try {
    const result: DirectSaveResponse = await applyDirectSave(
      projectPath,
      body.sourceLocation,
      body.changes,
    );

    const status = result.success ? 200 : 207; // 207 Multi-Status if partial
    return c.json({ data: result }, status);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DirectSave] Error for project ${projectId}:`, message);
    return c.json(
      {
        error: "Direct save failed",
        message:
          process.env.NODE_ENV === "development" ? message : undefined,
      },
      500,
    );
  }
  },
);
