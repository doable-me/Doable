import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { validatePathSafe } from "../projects/path-safety.js";

export const editorRoutes = new Hono<AuthEnv>({ strict: false });

// All editor routes require authentication
editorRoutes.use("/projects/:id/*", authMiddleware);
editorRoutes.use("/projects/:id/files", authMiddleware);

// ─── In-memory file storage (replace with real storage in production) ────
interface ProjectFile {
  path: string;
  content: string;
  updatedAt: string;
}

const projectFiles = new Map<string, Map<string, ProjectFile>>();

function getProjectStore(projectId: string): Map<string, ProjectFile> {
  if (!projectFiles.has(projectId)) {
    projectFiles.set(projectId, new Map());
  }
  return projectFiles.get(projectId)!;
}

// ─── Types ──────────────────────────────────────────────────
interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

function buildFileTree(files: Map<string, ProjectFile>): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const dirMap = new Map<string, FileTreeNode>();

  // Sort paths for consistent ordering
  const paths = Array.from(files.keys()).sort();

  for (const filePath of paths) {
    const parts = filePath.split("/");
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (isFile) {
        const node: FileTreeNode = {
          name: part,
          path: currentPath,
          type: "file",
        };

        if (parentPath) {
          const parent = dirMap.get(parentPath);
          if (parent) {
            parent.children = parent.children ?? [];
            parent.children.push(node);
          }
        } else {
          root.push(node);
        }
      } else if (!dirMap.has(currentPath)) {
        const dirNode: FileTreeNode = {
          name: part,
          path: currentPath,
          type: "directory",
          children: [],
        };
        dirMap.set(currentPath, dirNode);

        if (parentPath) {
          const parent = dirMap.get(parentPath);
          if (parent) {
            parent.children = parent.children ?? [];
            parent.children.push(dirNode);
          }
        } else {
          root.push(dirNode);
        }
      }
    }
  }

  return root;
}

// ─── GET /projects/:id/files ─ File tree ────────────────────
editorRoutes.get("/projects/:id/files", (c) => {
  const projectId = c.req.param("id");
  const store = getProjectStore(projectId);
  const tree = buildFileTree(store);

  return c.json({ data: tree });
});

// ─── GET /projects/:id/files/* ─ Read file content ──────────
editorRoutes.get("/projects/:id/files/*", (c) => {
  const projectId = c.req.param("id");
  const filePath = c.req.path.replace(
    `/projects/${projectId}/files/`,
    ""
  );

  if (!filePath) {
    return c.json({ error: "File path required" }, 400);
  }

  const decodedPath = decodeURIComponent(filePath);
  const safety = validatePathSafe(decodedPath, projectId);
  if (!safety.ok) {
    return c.json({ error: "invalid_path", message: safety.message }, 400);
  }
  const store = getProjectStore(projectId);
  const file = store.get(safety.normalized!);

  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }

  return c.json({
    data: {
      path: file.path,
      content: file.content,
      updatedAt: file.updatedAt,
    },
  });
});

// ─── PUT /projects/:id/files/* ─ Update file ────────────────
editorRoutes.put("/projects/:id/files/*", async (c) => {
  const projectId = c.req.param("id");
  const filePath = c.req.path.replace(
    `/projects/${projectId}/files/`,
    ""
  );

  if (!filePath) {
    return c.json({ error: "File path required" }, 400);
  }

  const decodedPath = decodeURIComponent(filePath);
  const safety = validatePathSafe(decodedPath, projectId);
  if (!safety.ok) {
    return c.json({ error: "invalid_path", message: safety.message }, 400);
  }
  const safePath = safety.normalized!;
  const body = await c.req.json<{ content: string }>();

  if (typeof body.content !== "string") {
    return c.json({ error: "Content must be a string" }, 400);
  }

  const store = getProjectStore(projectId);
  const file: ProjectFile = {
    path: safePath,
    content: body.content,
    updatedAt: new Date().toISOString(),
  };
  store.set(safePath, file);

  return c.json({
    data: {
      path: file.path,
      updatedAt: file.updatedAt,
    },
  });
});

// ─── POST /projects/:id/files ─ Create file ─────────────────
// Schema validates basic shape; the path-safety check below covers traversal
// rules (../, absolute, drive letters, NUL, backslash, project-dir escape).
// See services/api/src/projects/path-safety.ts and BUG-CORPUS-EDT-002.
const createFileSchema = z.object({
  path: z.string().min(1),
  content: z.string().default(""),
});

editorRoutes.post(
  "/projects/:id/files",
  zValidator("json", createFileSchema),
  async (c) => {
    const projectId = c.req.param("id");
    const { path: filePath, content } = c.req.valid("json");

    const safety = validatePathSafe(filePath, projectId);
    if (!safety.ok) {
      return c.json({ error: "invalid_path", message: safety.message }, 400);
    }
    const safePath = safety.normalized!;

    const store = getProjectStore(projectId);

    if (store.has(safePath)) {
      return c.json({ error: "File already exists" }, 409);
    }

    const file: ProjectFile = {
      path: safePath,
      content,
      updatedAt: new Date().toISOString(),
    };
    store.set(safePath, file);

    return c.json(
      {
        data: {
          path: file.path,
          updatedAt: file.updatedAt,
        },
      },
      201
    );
  }
);

// ─── DELETE /projects/:id/files/* ─ Delete file ──────────────
editorRoutes.delete("/projects/:id/files/*", (c) => {
  const projectId = c.req.param("id");
  const filePath = c.req.path.replace(
    `/projects/${projectId}/files/`,
    ""
  );

  if (!filePath) {
    return c.json({ error: "File path required" }, 400);
  }

  const decodedPath = decodeURIComponent(filePath);
  const safety = validatePathSafe(decodedPath, projectId);
  if (!safety.ok) {
    return c.json({ error: "invalid_path", message: safety.message }, 400);
  }
  const safePath = safety.normalized!;
  const store = getProjectStore(projectId);

  if (!store.has(safePath)) {
    return c.json({ error: "File not found" }, 404);
  }

  store.delete(safePath);
  return c.json({ data: { deleted: true } });
});
