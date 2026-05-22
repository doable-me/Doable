/**
 * docore public API
 *
 * Everything a Vite frontend (or any consumer) needs.
 */

// Engine
export { DoCoreEngine, type DoCoreEngineOptions, type EngineState } from "./engine.js";
export { mapSdkEvent, type MapperContext } from "./event-mapper.js";

// Tracer
export { Tracer, noopTracer, type Span, type TracerSink, type SpanHandle } from "./tracer.js";

// Pool / User Manager / Worker Pool
export { DoCorePool, type DoCorePoolOptions } from "./pool.js";
export { DoCoreUserManager, type DoCoreUserManagerOptions, type UserAcquireOptions } from "./user-manager.js";
export { WorkerPool, RequestQueue, type WorkerPoolOptions, type WorkerPoolEvent, type PoolRequest, type PoolResponse } from "./worker-pool.js";

// Server
export { DoCoreServer, type DoCoreServerOptions } from "./docore-server.js";

// Sandbox
export { createSandboxedPermissionHandler, createPolicySandbox, type SandboxOptions, type SandboxAuditEntry } from "./sandbox.js";

// Isolation
export { ProcessIsolator, type IsolatorOptions, type IsolatorEvent, type IsolatedProcess } from "./isolator.js";
export type { IsolationBackend, SpawnContext, ResourceLimits, BackendConfig } from "./backends/types.js";
export { NsjailBackend, type NsjailConfig } from "./backends/nsjail.js";
export { SystemdBackend, type SystemdConfig } from "./backends/systemd.js";
export { JobObjectBackend } from "./backends/jobobject.js";
export { DirectBackend } from "./backends/direct.js";

// Policy
export { PolicyStore, type PolicyStoreOptions } from "./policy/store.js";
export { PolicyAdmin, type PolicyScope } from "./policy/admin.js";
export { FilePersistence, MemoryPersistence, type PolicyPersistence } from "./policy/persistence.js";
export { POLICY_DEFAULTS, DEFAULT_SAFE_COMMANDS, DEFAULT_DANGEROUS_COMMANDS, DEFAULT_TRAVERSAL_PATTERNS, DEFAULT_URL_ALLOWLIST } from "./policy/defaults.js";
export { mergePolicy, mergeStringArray } from "./policy/merge.js";
export type {
  PolicyMap,
  PolicyKey,
  PolicyValue,
  SetPolicy,
  McpServerPolicy,
  CustomToolDef,
  PolicyAgentConfig,
  UserOverrideValue,
  PolicyChange,
  SerializedPolicies,
} from "./policy/types.js";

// Events
export { EventBus, type WildcardHandler, type TypedHandler } from "./event-bus.js";
export type {
  DoCoreEvent,
  DoCoreEventKind,
  DoCoreEventOf,
  // Session lifecycle
  SessionStartEvent,
  SessionResumeEvent,
  SessionIdleEvent,
  SessionErrorEvent,
  SessionShutdownEvent,
  SessionInfoEvent,
  SessionWarningEvent,
  SessionTitleChangedEvent,
  SessionModelChangeEvent,
  SessionModeChangedEvent,
  SessionTaskCompleteEvent,
  SessionHandoffEvent,
  SessionContextChangedEvent,
  SessionSnapshotRewindEvent,
  SessionRemoteSteerableChangedEvent,
  SessionBackgroundTasksChangedEvent,
  // Context window
  SessionUsageInfoEvent,
  SessionCompactionStartEvent,
  SessionCompactionCompleteEvent,
  SessionTruncationEvent,
  // Config loading
  SessionSkillsLoadedEvent,
  SessionCustomAgentsUpdatedEvent,
  SessionMcpServersLoadedEvent,
  SessionMcpServerStatusChangedEvent,
  SessionExtensionsLoadedEvent,
  SessionToolsUpdatedEvent,
  // User
  UserMessageEvent,
  // Assistant
  AssistantTurnStartEvent,
  AssistantTurnEndEvent,
  AssistantMessageDeltaEvent,
  AssistantMessageEvent,
  AssistantReasoningDeltaEvent,
  AssistantReasoningEvent,
  AssistantIntentEvent,
  AssistantUsageEvent,
  AssistantStreamingDeltaEvent,
  AbortEvent,
  // Tools
  ToolExecutionStartEvent,
  ToolExecutionPartialResultEvent,
  ToolExecutionProgressEvent,
  ToolExecutionCompleteEvent,
  ToolUserRequestedEvent,
  // External tools
  ExternalToolRequestedEvent,
  ExternalToolCompletedEvent,
  // Permissions
  PermissionRequestedEvent,
  PermissionCompletedEvent,
  // Subagents
  SubagentStartedEvent,
  SubagentCompletedEvent,
  SubagentFailedEvent,
  SubagentSelectedEvent,
  SubagentDeselectedEvent,
  // Hooks
  HookStartEvent,
  HookEndEvent,
  // Skills
  SkillInvokedEvent,
  // User input & elicitation
  UserInputRequestedEvent,
  UserInputCompletedEvent,
  ElicitationRequestedEvent,
  ElicitationCompletedEvent,
  // Plan
  ExitPlanModeRequestedEvent,
  ExitPlanModeCompletedEvent,
  // System
  SystemMessageEvent,
  SystemNotificationEvent,
  // MCP
  McpOAuthRequiredEvent,
  McpOAuthCompletedEvent,
  SamplingRequestedEvent,
  SamplingCompletedEvent,
  // Commands
  CommandQueuedEvent,
  CommandCompletedEvent,
  CommandsChangedEvent,
  // Workspace
  SessionPlanChangedEvent,
  SessionWorkspaceFileChangedEvent,
  // Capabilities & pending
  CapabilitiesChangedEvent,
  PendingMessagesModifiedEvent,
  // Engine meta
  EngineReadyEvent,
  EngineConnectingEvent,
  EngineDisconnectedEvent,
} from "./events.js";

// Re-export useful SDK types so consumers don't need to depend on the SDK directly
export { approveAll } from "@github/copilot-sdk";
export type {
  SessionConfig,
  CopilotClientOptions,
  PermissionHandler,
  PermissionRequest,
  Tool,
  MCPServerConfig,
  CustomAgentConfig,
} from "@github/copilot-sdk";
