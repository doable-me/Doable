import type { Tool } from "./index.js";
import { readProjectFile, writeProjectFile } from "../project-files.js";
import { editFileThroughYjs } from "../yjs-bridge.js";
import { validateFileSyntax } from "./validate-syntax.js";

export const editFileTool: Tool = {
  name: "edit_file",
  description:
    "Edit an existing file by replacing an exact string match with new content. " +
    "The old_string must match exactly (including whitespace). " +
    "Use replace_all to replace all occurrences.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path from project root",
      },
      old_string: {
        type: "string",
        description: "The exact text to find and replace",
      },
      new_string: {
        type: "string",
        description: "The replacement text",
      },
      replace_all: {
        type: "boolean",
        description: "Replace all occurrences (default: false)",
        default: false,
      },
    },
    required: ["path", "old_string", "new_string"],
  },

  async execute(params, ctx) {
    const path = String(params.path);
    const oldString = String(params.old_string);
    const newString = String(params.new_string);
    const replaceAll = Boolean(params.replace_all ?? false);

    const content = await readProjectFile(ctx.projectId, path);

    if (!content.includes(oldString)) {
      // Provide helpful context
      const lines = content.split("\n");
      const preview = lines.slice(0, 20).join("\n");
      return {
        success: false,
        output: "",
        error:
          `old_string not found in ${path}. ` +
          `File has ${lines.length} lines. First 20 lines:\n${preview}`,
      };
    }

    // Count occurrences
    const occurrences = content.split(oldString).length - 1;

    if (occurrences > 1 && !replaceAll) {
      return {
        success: false,
        output: "",
        error:
          `Found ${occurrences} occurrences of old_string in ${path}. ` +
          `Provide more context to make it unique, or set replace_all=true.`,
      };
    }

    // Compute the projected final content and run a syntax check BEFORE
    // writing — for either the Yjs or the direct path. Catches malformed
    // JS/TS/JSX/TSX/JSON in the same tool call so the model can retry
    // without waiting for the post-stream auto-fix loop.
    const updated = replaceAll
      ? content.replaceAll(oldString, newString)
      : content.replace(oldString, newString);

    const validation = validateFileSyntax(path, updated);
    if (!validation.ok) {
      return {
        success: false,
        output: "",
        error:
          `Syntax error in ${path} after edit: ${validation.message}\n` +
          `File was NOT modified. Re-read the file and try a different edit.`,
      };
    }

    // Try to edit through Yjs CRDT if collaboration is active
    try {
      const yjsResult = await editFileThroughYjs(
        ctx.projectId,
        path,
        oldString,
        newString,
        replaceAll,
      );
      if (yjsResult.handled && yjsResult.success) {
        return {
          success: true,
          output: `Edited ${path}: replaced ${yjsResult.occurrences ?? 1} occurrence(s) [via CRDT]`,
          metadata: { path, occurrences: yjsResult.occurrences ?? 1 },
        };
      }
    } catch {
      // Fall through to direct write
    }

    // Direct filesystem edit
    await writeProjectFile(ctx.projectId, path, updated);

    return {
      success: true,
      output: `Edited ${path}: replaced ${replaceAll ? occurrences : 1} occurrence(s)`,
      metadata: { path, occurrences: replaceAll ? occurrences : 1 },
    };
  },
};
