/**
 * docore event types
 *
 * Structured events emitted by the DoCore engine. These mirror the Copilot SDK's
 * session events but are normalized into a flat, serializable format suitable for
 * consumption by a Vite frontend over IPC, WebSocket, or direct import.
 */

// ============================================================================
// Session lifecycle
// ============================================================================

export interface SessionStartEvent {
  kind: "session.start";
  sessionId: string;
  timestamp: string;
  model?: string;
  reasoningEffort?: string;
  cwd?: string;
  gitRoot?: string;
  repository?: string;
  branch?: string;
}

export interface SessionResumeEvent {
  kind: "session.resume";
  timestamp: string;
  eventCount: number;
  model?: string;
}

export interface SessionIdleEvent {
  kind: "session.idle";
  timestamp: string;
  aborted?: boolean;
}

export interface SessionErrorEvent {
  kind: "session.error";
  timestamp: string;
  errorType: string;
  message: string;
  stack?: string;
  statusCode?: number;
}

export interface SessionShutdownEvent {
  kind: "session.shutdown";
  timestamp: string;
  shutdownType: "routine" | "error";
  errorReason?: string;
  totalPremiumRequests: number;
  totalApiDurationMs: number;
  linesAdded: number;
  linesRemoved: number;
  filesModified: string[];
}

export interface SessionInfoEvent {
  kind: "session.info";
  timestamp: string;
  infoType: string;
  message: string;
  url?: string;
}

export interface SessionWarningEvent {
  kind: "session.warning";
  timestamp: string;
  warningType: string;
  message: string;
  url?: string;
}

export interface SessionTitleChangedEvent {
  kind: "session.title_changed";
  timestamp: string;
  title: string;
}

export interface SessionModelChangeEvent {
  kind: "session.model_change";
  timestamp: string;
  previousModel?: string;
  newModel: string;
  reasoningEffort?: string;
}

export interface SessionModeChangedEvent {
  kind: "session.mode_changed";
  timestamp: string;
  previousMode: string;
  newMode: string;
}

export interface SessionTaskCompleteEvent {
  kind: "session.task_complete";
  timestamp: string;
  summary?: string;
  success?: boolean;
}

// ============================================================================
// Context window management
// ============================================================================

export interface SessionUsageInfoEvent {
  kind: "session.usage_info";
  timestamp: string;
  tokenLimit: number;
  currentTokens: number;
  messagesLength: number;
  systemTokens?: number;
  conversationTokens?: number;
  toolDefinitionsTokens?: number;
}

export interface SessionCompactionStartEvent {
  kind: "session.compaction_start";
  timestamp: string;
  systemTokens?: number;
  conversationTokens?: number;
  toolDefinitionsTokens?: number;
}

export interface SessionCompactionCompleteEvent {
  kind: "session.compaction_complete";
  timestamp: string;
  success: boolean;
  error?: string;
  preCompactionTokens?: number;
  postCompactionTokens?: number;
  tokensRemoved?: number;
  summaryContent?: string;
}

export interface SessionTruncationEvent {
  kind: "session.truncation";
  timestamp: string;
  tokenLimit: number;
  tokensRemovedDuringTruncation: number;
  messagesRemovedDuringTruncation: number;
}

// ============================================================================
// User messages
// ============================================================================

export interface UserMessageEvent {
  kind: "user.message";
  timestamp: string;
  content: string;
  agentMode?: string;
  attachmentCount: number;
}

// ============================================================================
// Assistant response streaming
// ============================================================================

export interface AssistantTurnStartEvent {
  kind: "assistant.turn_start";
  timestamp: string;
  turnId: string;
}

export interface AssistantTurnEndEvent {
  kind: "assistant.turn_end";
  timestamp: string;
  turnId: string;
}

export interface AssistantMessageDeltaEvent {
  kind: "assistant.message_delta";
  timestamp: string;
  messageId: string;
  deltaContent: string;
  parentToolCallId?: string;
}

export interface AssistantMessageEvent {
  kind: "assistant.message";
  timestamp: string;
  messageId: string;
  content: string;
  toolRequestCount: number;
  parentToolCallId?: string;
}

export interface AssistantReasoningDeltaEvent {
  kind: "assistant.reasoning_delta";
  timestamp: string;
  reasoningId: string;
  deltaContent: string;
}

export interface AssistantReasoningEvent {
  kind: "assistant.reasoning";
  timestamp: string;
  reasoningId: string;
  content: string;
}

export interface AssistantIntentEvent {
  kind: "assistant.intent";
  timestamp: string;
  intent: string;
}

export interface AssistantUsageEvent {
  kind: "assistant.usage";
  timestamp: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost?: number;
  durationMs?: number;
  ttftMs?: number;
}

export interface AbortEvent {
  kind: "abort";
  timestamp: string;
  reason: string;
}

// ============================================================================
// Tool execution
// ============================================================================

export interface ToolExecutionStartEvent {
  kind: "tool.execution_start";
  timestamp: string;
  toolCallId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  mcpServerName?: string;
  parentToolCallId?: string;
}

export interface ToolExecutionPartialResultEvent {
  kind: "tool.execution_partial_result";
  timestamp: string;
  toolCallId: string;
  partialOutput: string;
}

export interface ToolExecutionProgressEvent {
  kind: "tool.execution_progress";
  timestamp: string;
  toolCallId: string;
  progressMessage: string;
}

export interface ToolExecutionCompleteEvent {
  kind: "tool.execution_complete";
  timestamp: string;
  toolCallId: string;
  success: boolean;
  resultContent?: string;
  detailedContent?: string;
  errorMessage?: string;
  errorCode?: string;
  parentToolCallId?: string;
}

// ============================================================================
// Permissions
// ============================================================================

export interface PermissionRequestedEvent {
  kind: "permission.requested";
  timestamp: string;
  requestId: string;
  permissionKind: string;
  toolCallId?: string;
  /** Human readable summary; contents vary by kind */
  summary: string;
}

export interface PermissionCompletedEvent {
  kind: "permission.completed";
  timestamp: string;
  requestId: string;
  resultKind: string;
}

// ============================================================================
// Sub-agents
// ============================================================================

export interface SubagentStartedEvent {
  kind: "subagent.started";
  timestamp: string;
  toolCallId: string;
  agentName: string;
  agentDisplayName: string;
  agentDescription: string;
}

export interface SubagentCompletedEvent {
  kind: "subagent.completed";
  timestamp: string;
  toolCallId: string;
  agentName: string;
  agentDisplayName: string;
  model?: string;
  totalToolCalls?: number;
  totalTokens?: number;
  durationMs?: number;
}

export interface SubagentFailedEvent {
  kind: "subagent.failed";
  timestamp: string;
  toolCallId: string;
  agentName: string;
  agentDisplayName: string;
  error: string;
}

// ============================================================================
// Hooks
// ============================================================================

export interface HookStartEvent {
  kind: "hook.start";
  timestamp: string;
  hookInvocationId: string;
  hookType: string;
}

export interface HookEndEvent {
  kind: "hook.end";
  timestamp: string;
  hookInvocationId: string;
  hookType: string;
  success: boolean;
  errorMessage?: string;
}

// ============================================================================
// Skills
// ============================================================================

export interface SkillInvokedEvent {
  kind: "skill.invoked";
  timestamp: string;
  name: string;
  path: string;
  description?: string;
}

// ============================================================================
// User input & elicitation
// ============================================================================

export interface UserInputRequestedEvent {
  kind: "user_input.requested";
  timestamp: string;
  requestId: string;
  question: string;
  choices?: string[];
  allowFreeform?: boolean;
}

export interface ElicitationRequestedEvent {
  kind: "elicitation.requested";
  timestamp: string;
  requestId: string;
  message: string;
  mode?: "form" | "url";
  elicitationSource?: string;
}

// ============================================================================
// Plan mode
// ============================================================================

export interface ExitPlanModeRequestedEvent {
  kind: "exit_plan_mode.requested";
  timestamp: string;
  requestId: string;
  summary: string;
  planContent: string;
  actions: string[];
  recommendedAction: string;
}

// ============================================================================
// System
// ============================================================================

export interface SystemNotificationEvent {
  kind: "system.notification";
  timestamp: string;
  content: string;
  notificationType: string;
}

// ============================================================================
// Workspace & Plan file changes
// ============================================================================

export interface SessionPlanChangedEvent {
  kind: "session.plan_changed";
  timestamp: string;
  operation: "create" | "update" | "delete";
}

export interface SessionWorkspaceFileChangedEvent {
  kind: "session.workspace_file_changed";
  timestamp: string;
  path: string;
  operation: "create" | "update";
}

// ============================================================================
// Internal engine meta-events (not from SDK, emitted by docore itself)
// ============================================================================

export interface EngineReadyEvent {
  kind: "engine.ready";
  timestamp: string;
}

export interface EngineConnectingEvent {
  kind: "engine.connecting";
  timestamp: string;
}

export interface EngineDisconnectedEvent {
  kind: "engine.disconnected";
  timestamp: string;
  reason?: string;
}

// ============================================================================
// Session handoff & context
// ============================================================================

export interface SessionHandoffEvent {
  kind: "session.handoff";
  timestamp: string;
  sourceType: "remote" | "local";
  repository?: { owner: string; name: string; branch?: string };
  summary?: string;
  remoteSessionId?: string;
}

export interface SessionContextChangedEvent {
  kind: "session.context_changed";
  timestamp: string;
  cwd: string;
  gitRoot?: string;
  repository?: string;
  branch?: string;
}

export interface SessionSnapshotRewindEvent {
  kind: "session.snapshot_rewind";
  timestamp: string;
  upToEventId: string;
  eventsRemoved: number;
}

export interface SessionRemoteSteerableChangedEvent {
  kind: "session.remote_steerable_changed";
  timestamp: string;
  remoteSteerable: boolean;
}

// ============================================================================
// Background tasks tracking (critical for "truly done" detection)
// ============================================================================

export interface SessionBackgroundTasksChangedEvent {
  kind: "session.background_tasks_changed";
  timestamp: string;
  /** Number of background subagents currently tracked as running */
  runningAgents: number;
}

// ============================================================================
// Configuration loading events
// ============================================================================

export interface SessionSkillsLoadedEvent {
  kind: "session.skills_loaded";
  timestamp: string;
  skills: Array<{
    name: string;
    description: string;
    source: string;
    enabled: boolean;
  }>;
}

export interface SessionCustomAgentsUpdatedEvent {
  kind: "session.custom_agents_updated";
  timestamp: string;
  agents: Array<{
    name: string;
    displayName: string;
    description: string;
    source: string;
  }>;
  warnings: string[];
  errors: string[];
}

export interface SessionMcpServersLoadedEvent {
  kind: "session.mcp_servers_loaded";
  timestamp: string;
  servers: Array<{
    name: string;
    status: "connected" | "failed" | "needs-auth" | "pending" | "disabled" | "not_configured";
    source?: string;
    error?: string;
  }>;
}

export interface SessionMcpServerStatusChangedEvent {
  kind: "session.mcp_server_status_changed";
  timestamp: string;
  serverName: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled" | "not_configured";
}

export interface SessionExtensionsLoadedEvent {
  kind: "session.extensions_loaded";
  timestamp: string;
  extensions: Array<{
    id: string;
    name: string;
    source: "project" | "user";
    status: "running" | "disabled" | "failed" | "starting";
  }>;
}

export interface SessionToolsUpdatedEvent {
  kind: "session.tools_updated";
  timestamp: string;
  model: string;
}

// ============================================================================
// MCP OAuth
// ============================================================================

export interface McpOAuthRequiredEvent {
  kind: "mcp.oauth_required";
  timestamp: string;
  requestId: string;
  serverName: string;
  serverUrl: string;
}

export interface McpOAuthCompletedEvent {
  kind: "mcp.oauth_completed";
  timestamp: string;
  requestId: string;
}

// ============================================================================
// Sampling (MCP server requests LLM completion)
// ============================================================================

export interface SamplingRequestedEvent {
  kind: "sampling.requested";
  timestamp: string;
  requestId: string;
  serverName: string;
}

export interface SamplingCompletedEvent {
  kind: "sampling.completed";
  timestamp: string;
  requestId: string;
}

// ============================================================================
// Subagent selection
// ============================================================================

export interface SubagentSelectedEvent {
  kind: "subagent.selected";
  timestamp: string;
  agentName: string;
  agentDisplayName: string;
  tools: string[] | null;
}

export interface SubagentDeselectedEvent {
  kind: "subagent.deselected";
  timestamp: string;
}

// ============================================================================
// Tool user-requested
// ============================================================================

export interface ToolUserRequestedEvent {
  kind: "tool.user_requested";
  timestamp: string;
  toolCallId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

// ============================================================================
// External tool dispatch
// ============================================================================

export interface ExternalToolRequestedEvent {
  kind: "external_tool.requested";
  timestamp: string;
  requestId: string;
  toolCallId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface ExternalToolCompletedEvent {
  kind: "external_tool.completed";
  timestamp: string;
  requestId: string;
}

// ============================================================================
// Commands
// ============================================================================

export interface CommandQueuedEvent {
  kind: "command.queued";
  timestamp: string;
  requestId: string;
  command: string;
}

export interface CommandCompletedEvent {
  kind: "command.completed";
  timestamp: string;
  requestId: string;
}

export interface CommandsChangedEvent {
  kind: "commands.changed";
  timestamp: string;
  commands: Array<{ name: string; description?: string }>;
}

// ============================================================================
// Completion events for interactive flows
// ============================================================================

export interface ElicitationCompletedEvent {
  kind: "elicitation.completed";
  timestamp: string;
  requestId: string;
  action?: "accept" | "decline" | "cancel";
}

export interface UserInputCompletedEvent {
  kind: "user_input.completed";
  timestamp: string;
  requestId: string;
  answer?: string;
  wasFreeform?: boolean;
}

export interface ExitPlanModeCompletedEvent {
  kind: "exit_plan_mode.completed";
  timestamp: string;
  requestId: string;
  approved?: boolean;
  selectedAction?: string;
}

// ============================================================================
// System message (prompt content)
// ============================================================================

export interface SystemMessageEvent {
  kind: "system.message";
  timestamp: string;
  role: "system" | "developer";
  contentLength: number;
  name?: string;
}

// ============================================================================
// Pending messages
// ============================================================================

export interface PendingMessagesModifiedEvent {
  kind: "pending_messages.modified";
  timestamp: string;
}

// ============================================================================
// Capabilities
// ============================================================================

export interface CapabilitiesChangedEvent {
  kind: "capabilities.changed";
  timestamp: string;
  elicitation?: boolean;
}

// ============================================================================
// Streaming byte progress
// ============================================================================

export interface AssistantStreamingDeltaEvent {
  kind: "assistant.streaming_delta";
  timestamp: string;
  totalResponseSizeBytes: number;
}

// ============================================================================
// Union type
// ============================================================================

export type DoCoreEvent =
  // Session lifecycle
  | SessionStartEvent
  | SessionResumeEvent
  | SessionIdleEvent
  | SessionErrorEvent
  | SessionShutdownEvent
  | SessionInfoEvent
  | SessionWarningEvent
  | SessionTitleChangedEvent
  | SessionModelChangeEvent
  | SessionModeChangedEvent
  | SessionTaskCompleteEvent
  | SessionHandoffEvent
  | SessionContextChangedEvent
  | SessionSnapshotRewindEvent
  | SessionRemoteSteerableChangedEvent
  | SessionBackgroundTasksChangedEvent
  // Context window
  | SessionUsageInfoEvent
  | SessionCompactionStartEvent
  | SessionCompactionCompleteEvent
  | SessionTruncationEvent
  // Config loading
  | SessionSkillsLoadedEvent
  | SessionCustomAgentsUpdatedEvent
  | SessionMcpServersLoadedEvent
  | SessionMcpServerStatusChangedEvent
  | SessionExtensionsLoadedEvent
  | SessionToolsUpdatedEvent
  // User
  | UserMessageEvent
  // Assistant
  | AssistantTurnStartEvent
  | AssistantTurnEndEvent
  | AssistantMessageDeltaEvent
  | AssistantMessageEvent
  | AssistantReasoningDeltaEvent
  | AssistantReasoningEvent
  | AssistantIntentEvent
  | AssistantUsageEvent
  | AssistantStreamingDeltaEvent
  | AbortEvent
  // Tools
  | ToolExecutionStartEvent
  | ToolExecutionPartialResultEvent
  | ToolExecutionProgressEvent
  | ToolExecutionCompleteEvent
  | ToolUserRequestedEvent
  // External tools
  | ExternalToolRequestedEvent
  | ExternalToolCompletedEvent
  // Permissions
  | PermissionRequestedEvent
  | PermissionCompletedEvent
  // Subagents
  | SubagentStartedEvent
  | SubagentCompletedEvent
  | SubagentFailedEvent
  | SubagentSelectedEvent
  | SubagentDeselectedEvent
  // Hooks
  | HookStartEvent
  | HookEndEvent
  // Skills
  | SkillInvokedEvent
  // User input & elicitation
  | UserInputRequestedEvent
  | UserInputCompletedEvent
  | ElicitationRequestedEvent
  | ElicitationCompletedEvent
  // Plan
  | ExitPlanModeRequestedEvent
  | ExitPlanModeCompletedEvent
  // System
  | SystemMessageEvent
  | SystemNotificationEvent
  // MCP
  | McpOAuthRequiredEvent
  | McpOAuthCompletedEvent
  | SamplingRequestedEvent
  | SamplingCompletedEvent
  // Commands
  | CommandQueuedEvent
  | CommandCompletedEvent
  | CommandsChangedEvent
  // Workspace
  | SessionPlanChangedEvent
  | SessionWorkspaceFileChangedEvent
  // Capabilities & pending
  | CapabilitiesChangedEvent
  | PendingMessagesModifiedEvent
  // Engine meta
  | EngineReadyEvent
  | EngineConnectingEvent
  | EngineDisconnectedEvent;

export type DoCoreEventKind = DoCoreEvent["kind"];

/** Extract event data type by kind */
export type DoCoreEventOf<K extends DoCoreEventKind> = Extract<DoCoreEvent, { kind: K }>;
