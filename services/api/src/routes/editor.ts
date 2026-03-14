import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

export const editorRoutes = new Hono();

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
      const part = parts[i];
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
  const store = getProjectStore(projectId);
  const file = store.get(decodedPath);

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
  const body = await c.req.json<{ content: string }>();

  if (typeof body.content !== "string") {
    return c.json({ error: "Content must be a string" }, 400);
  }

  const store = getProjectStore(projectId);
  const file: ProjectFile = {
    path: decodedPath,
    content: body.content,
    updatedAt: new Date().toISOString(),
  };
  store.set(decodedPath, file);

  return c.json({
    data: {
      path: file.path,
      updatedAt: file.updatedAt,
    },
  });
});

// ─── POST /projects/:id/files ─ Create file ─────────────────
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

    const store = getProjectStore(projectId);

    if (store.has(filePath)) {
      return c.json({ error: "File already exists" }, 409);
    }

    const file: ProjectFile = {
      path: filePath,
      content,
      updatedAt: new Date().toISOString(),
    };
    store.set(filePath, file);

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
  const store = getProjectStore(projectId);

  if (!store.has(decodedPath)) {
    return c.json({ error: "File not found" }, 404);
  }

  store.delete(decodedPath);
  return c.json({ data: { deleted: true } });
});
