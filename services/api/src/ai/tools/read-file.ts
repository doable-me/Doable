import type { Tool } from "./index.js";
import { readProjectFile } from "../project-files.js";

export const readFileTool: Tool = {
  name: "read_file",
  description:
    "Read the contents of a file. Returns the full file content with line numbers.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path from project root",
      },
      start_line: {
        type: "number",
        description: "Starting line number (1-based, optional)",
      },
      end_line: {
        type: "number",
        description: "Ending line number (inclusive, optional)",
      },
    },
    required: ["path"],
  },

  async execute(params, ctx) {
    const path = String(params.path);
    const startLine = params.start_line ? Number(params.start_line) : undefined;
    const endLine = params.end_line ? Number(params.end_line) : undefined;

    const content = await readProjectFile(ctx.projectId, path);
    const lines = content.split("\n");

    const start = startLine ? Math.max(1, startLine) : 1;
    const end = endLine ? Math.min(lines.length, endLine) : lines.length;

    const selectedLines = lines.slice(start - 1, end);
    const numbered = selectedLines
      .map((line, i) => `${String(start + i).padStart(4)} | ${line}`)
      .join("\n");

    return {
      success: true,
      output: numbered,
      metadata: {
        path,
        totalLines: lines.length,
        startLine: start,
        endLine: end,
      },
    };
  },
};
