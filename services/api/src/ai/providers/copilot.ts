/**
 * Barrel re-export — backwards-compatible entry point.
 *
 * The copilot provider has been split into modular files:
 *  - engine-types.ts: shared type definitions
 *  - copilot-engine.ts: CopilotEngine class + singleton
 *  - copilot-tools.ts: built-in Doable tools (file ops, plan mode, etc.)
 *  - copilot-tool-loader.ts: createAllTools + MCP/integration loading
 */

// Types
export type {
  CopilotEngineConfig,
  ByokProviderConfig,
  ToolProgressCallback,
  CopilotSessionConfig,
} from "../engine-types.js";

// Engine
export { CopilotEngine, getCopilotEngine } from "./copilot-engine.js";

// Tools
export { createDoableTools, onToolEvent } from "./copilot-tools.js";
export { createAllTools } from "./copilot-tool-loader.js";
