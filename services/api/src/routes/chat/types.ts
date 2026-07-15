/**
 * Shared types for the decomposed chat route modules.
 */
import type { TraceCollector } from "../../ai/trace-collector.js";
import type { createUsageCollector } from "../../ai/usage-collector.js";
import type { ByokProviderConfig } from "../../ai/providers/copilot.js";
import type { SSEStreamingApi } from "hono/streaming";

/** Mutable state bag shared across all stream phases. */
export interface ChatStreamState {
  assistantContent: string;
  assistantThinking: string;
  hadToolCalls: boolean;
  sawToolDelta: boolean;
  versionSha: string | undefined;
  pendingToolNames: string[];
  toolCallIdMap: Map<string, string>;
  lastCapturedMsgId: string | undefined;
  lastMsgIdSepEmitted: boolean;
  msgIdDeltaStart: number;
  assistantMessageId: string | undefined;
  lastFlushLen: number;
  /** Track last thinking_content flush length — mirrors lastFlushLen so a
   * crash mid-stream still leaves the thinking transcript visible on
   * /chat/history. Without this, agent-loop runs that keep all reasoning
   * in the leading-text buffer (then hit a server crash / dropped
   * connection before finalSave runs) lost the entire turn. */
  lastThinkingFlushLen: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assistantToolCalls: any[];
  usageCollector: ReturnType<typeof createUsageCollector> | null;
  traceCollector: TraceCollector | null;
  sseFrameCount: number;
  lastSseEmitAt: number;
  lastRealEventAt: number;
  lastToolName: string | undefined;
  friendlyLastTool: string | undefined;
  /** Buffered session.error message — emitted only if auto-continue doesn't recover. */
  deferredError: string | undefined;
  /** True if an MCP interactive widget was shown — auto-continue must NOT fire. */
  awaitingMcpWidget: boolean;
  /**
   * True once `provision_supabase` opened the Connect-Supabase dialog this turn.
   * The DB connection does not exist until the user completes that dialog, so
   * auto-continue must NOT fire — otherwise the nudged model races ahead and,
   * finding Supabase still unconnected, falls back to the per-app PGlite DB
   * (`@doable/data`) and builds the whole app there. The turn must end and wait
   * for the editor's "Supabase provisioning complete" re-prompt instead.
   */
  awaitingSupabaseProvision: boolean;
  /**
   * True once `request_integration` opened the Connect-integration dialog this
   * turn. The credential does not exist until the user completes that dialog,
   * so auto-continue must NOT fire — otherwise the model races ahead against
   * an empty <connected-integrations> block and guesses actionNames (e.g.
   * `text_to_speech` instead of `elevenlabs-text-to-speech`). The turn must end
   * and the fresh manifest is picked up on the next user message.
   */
  awaitingIntegrationConnect: boolean;
  /** Artifacts produced by a tool, keyed by toolName, awaiting attachment to the next tool_result for that tool. */
  pendingArtifacts: Map<string, Array<{ url: string; fileName: string; mimeType: string; sizeBytes: number }>>;
  /** Buffer for detecting untagged reasoning at the start of model output. */
  leadingTextBuffer: string;
  /** Whether the leading-text reasoning check has completed (tool call seen or clear text emitted). */
  leadingTextFlushed: boolean;
}

/** Resolved AI configuration passed to stream phases. */
export interface ResolvedAiConfig {
  model: string | undefined;
  provider: ByokProviderConfig | undefined;
  githubToken: string | undefined;
  modelSource: string;
  providerSource: string;
}

/** Context for the SSE stream handler. */
export interface ChatContext {
  stream: SSEStreamingApi;
  state: ChatStreamState;
  projectId: string;
  userId: string;
  mode: string;
  sessionKey: string;
  messageId: string;
  content: string;
  augmentedContent: string;
  fileAttachments: Array<{ type: "file"; path: string; displayName?: string }>;
  aiConfig: ResolvedAiConfig;
  workspaceId: string | undefined;
  dbSessionId: string | undefined;
  systemPrompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionTools: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  allTools: any[];
  projectPath: string;
}

export function createInitialState(): ChatStreamState {
  return {
    assistantContent: "",
    assistantThinking: "",
    hadToolCalls: false,
    sawToolDelta: false,
    versionSha: undefined,
    pendingToolNames: [],
    toolCallIdMap: new Map(),
    lastCapturedMsgId: undefined,
    lastMsgIdSepEmitted: false,
    msgIdDeltaStart: 0,
    assistantMessageId: undefined,
    lastFlushLen: 0,
    lastThinkingFlushLen: 0,
    assistantToolCalls: [],
    usageCollector: null,
    traceCollector: null,
    sseFrameCount: 0,
    lastSseEmitAt: Date.now(),
    lastRealEventAt: Date.now(),
    lastToolName: undefined,
    friendlyLastTool: undefined,
    deferredError: undefined,
    awaitingMcpWidget: false,
    awaitingSupabaseProvision: false,
    awaitingIntegrationConnect: false,
    pendingArtifacts: new Map(),
    leadingTextBuffer: "",
    leadingTextFlushed: false,
  };
}
