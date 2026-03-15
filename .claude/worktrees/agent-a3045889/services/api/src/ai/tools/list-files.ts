import type { Tool } from "./index.js";
import { listProjectFiles } from "../project-files.js";

export const listFilesTool: Tool = {
  name: "list_files",
  description:
    "List files in the project directory. Returns a tree of file paths relative to the project root.",
  parameters: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "Subdirectory to list (default: project root)",
        default: ".",
      },
      recursive: {
        type: "boolean",
        description: "List files recursively (default: true)",
        default: true,
      },
    },
    required: [],
  },

  async execute(params, ctx) {
    const directory = String(params.directory ?? ".");
    const recursive = params.recursive !== false;

    const files = await listProjectFiles(ctx.projectId, directory, {
      recursive,
    });

    if (files.length === 0) {
      return {
        success: true,
        output: `No files found in ${directory === "." ? "project root" : directory}`,
        metadata: { count: 0 },
      };
    }

    const output = files.join("\n");

    return {
      success: true,
      output: `${files.length} files:\n${output}`,
      metadata: { count: files.length },
    };
  },
};
