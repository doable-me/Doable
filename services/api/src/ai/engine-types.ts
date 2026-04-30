/**
 * Shared type definitions for the AI engine layer.
 *
 * These types are used across engine.ts, doable-tools.ts, tool-loader.ts,
 * and the chat routes. Extracted here to avoid circular dependencies.
 */

import type {
  SessionEvent,
  Tool,
  PermissionHandler,
} from "@github/copilot-sdk";

export interface CopilotEngineConfig {
  /** Path to copilot CLI binary (optional, auto-detected if on PATH) */
  cliPath?: string;
  /** Connect to an existing Copilot CLI server instead of spawning one */
  cliUrl?: string;
  /** Default model to use */
  model?: string;
  /** GitHub OAuth token — when set, authenticates as this user instead of gh CLI */
  githubToken?: string;
}

/** BYOK provider configuration — passed directly to the Copilot SDK */
export interface ByokProviderConfig {
  type?: "openai" | "azure" | "anthropic";
  wireApi?: "completions" | "responses";
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  azure?: { apiVersion?: string };
}

/** Callback for tool lifecycle hooks — called via RPC, separate from event stream */
export interface ToolProgressCallback {
  onToolStart?: (toolName: string, args: unknown) => void;
  onToolEnd?: (toolName: string, args: unknown, result: unknown) => void;
  onSessionEnd?: (reason: string, error?: string) => void;
  onError?: (error: string, context: string) => void;
}

export interface CopilotSessionConfig {
  /** Project ID for context */
  projectId: string;
  /** User ID for tracking */
  userId: string;
  /** Custom tools to register with the session */
  tools?: Tool[];
  /** Model override for this session */
  model?: string;
  /** BYOK provider config — when set, uses user's own API key instead of Copilot subscription */
  provider?: ByokProviderConfig;
  /** Working directory for the session — file tools operate relative to this */
  workingDirectory?: string;
  /** System prompt to prepend */
  systemPrompt?: string;
  /** Permission handler — REQUIRED. No fallback to approveAll. */
  onPermissionRequest?: PermissionHandler;
  /** Handler for when the agent needs user input */
  onUserInput?: (question: string) => Promise<string>;
  /** Handler for streaming events */
  onEvent?: (event: SessionEvent) => void;
  /** Tool progress callbacks — separate RPC channel from event stream */
  toolProgress?: ToolProgressCallback;
  /**
   * Absolute paths to directories containing SDK-style skill folders
   * (each subfolder = one skill with SKILL.md). Forwarded directly to the
   * Copilot SDK as `skillDirectories`. Built per-session by the skills
   * materializer from the workspace/project/user-scoped DB rows.
   */
  skillDirectories?: string[];
}
