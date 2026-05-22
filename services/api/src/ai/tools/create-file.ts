import type { Tool } from "./index.js";
import { writeProjectFile } from "../project-files.js";
import { validateFileSyntax } from "./validate-syntax.js";

export const createFileTool: Tool = {
  name: "create_file",
  description:
    "Create a new file with the given content. Creates parent directories as needed. Fails if the file already exists.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path from project root (e.g. 'src/App.tsx')",
      },
      content: {
        type: "string",
        description: "The file content to write",
      },
    },
    required: ["path", "content"],
  },

  async execute(params, ctx) {
    const path = String(params.path);
    const content = String(params.content);

    // Check if file already exists
    const { readProjectFile } = await import("../project-files.js");
    try {
      await readProjectFile(ctx.projectId, path);
      return {
        success: false,
        output: "",
        error: `File already exists: ${path}. Use edit_file to modify existing files.`,
      };
    } catch {
      // File doesn't exist, proceed with creation
    }

    // Pre-write syntax check — catches malformed JS/TS/JSX/TSX/JSON
    // before it hits disk and breaks the dev server.
    const validation = validateFileSyntax(path, content);
    if (!validation.ok) {
      return {
        success: false,
        output: "",
        error:
          `Syntax error in ${path}: ${validation.message}\n` +
          `File was NOT created. Fix the syntax and call create_file again.`,
      };
    }

    await writeProjectFile(ctx.projectId, path, content);

    return {
      success: true,
      output: `Created file: ${path} (${Buffer.byteLength(content, "utf-8")} bytes)`,
      metadata: { path, size: Buffer.byteLength(content, "utf-8") },
    };
  },
};
