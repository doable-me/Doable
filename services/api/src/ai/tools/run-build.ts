import type { Tool } from "./index.js";
import { build } from "../build.js";

export const runBuildTool: Tool = {
  name: "run_build",
  description:
    "Run the Vite build for the project. Returns build output including any errors or warnings.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },

  async execute(_params, ctx) {
    const result = await build(ctx.projectId);

    if (!result.success) {
      const errorSummary = result.errors.length > 0
        ? `\n\nErrors:\n${result.errors.join("\n")}`
        : "";
      const warningSummary = result.warnings.length > 0
        ? `\n\nWarnings:\n${result.warnings.join("\n")}`
        : "";

      return {
        success: false,
        output: `Build failed (${result.duration}ms)${errorSummary}${warningSummary}`,
        error: result.errors[0] ?? "Build failed with unknown error",
        metadata: {
          duration: result.duration,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
        },
      };
    }

    const warningSummary = result.warnings.length > 0
      ? `\n\nWarnings:\n${result.warnings.join("\n")}`
      : "";

    return {
      success: true,
      output: `Build succeeded (${result.duration}ms)${warningSummary}`,
      metadata: {
        duration: result.duration,
        warningCount: result.warnings.length,
      },
    };
  },
};
