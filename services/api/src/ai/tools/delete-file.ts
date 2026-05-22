import type { Tool } from "./index.js";
import { deleteProjectFile } from "../project-files.js";

export const deleteFileTool: Tool = {
  name: "delete_file",
  description: "Delete a file from the project.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path from project root",
      },
    },
    required: ["path"],
  },

  async execute(params, ctx) {
    const path = String(params.path);

    await deleteProjectFile(ctx.projectId, path);

    return {
      success: true,
      output: `Deleted file: ${path}`,
      metadata: { path },
    };
  },
};
