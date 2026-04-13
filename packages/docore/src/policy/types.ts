/**
 * docore policy types
 *
 * Central type definitions for the policy system. Every configurable
 * rule, limit, and toggle is a typed PolicyKey with a corresponding value shape.
 */

// ============================================================================
// SetPolicy: configuring sets of strings (commands, extensions, etc.)
// ============================================================================

export interface SetPolicy {
  mode: "extend" | "replace";
  /** Items to add to the base set (only when mode = "extend") */
  add?: string[];
  /** Items to remove from the base set (only when mode = "extend") */
  remove?: string[];
  /** Complete replacement set (only when mode = "replace") */
  values?: string[];
}

// ============================================================================
// MCP server policy
// ============================================================================

export interface McpServerPolicy {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  allowedTools?: string[];
  blockedTools?: string[];
  enabled: boolean;
}

// ============================================================================
// Custom tool definition
// ============================================================================

export interface CustomToolDef {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
}

// ============================================================================
// Custom agent config (mirrors SDK)
// ============================================================================

export interface PolicyAgentConfig {
  name: string;
  displayName?: string;
  description?: string;
  instructions?: string;
  model?: string;
}

// ============================================================================
// Policy key/value map (the master registry)
// ============================================================================

export interface PolicyMap {
  // Sandbox: commands
  "sandbox.commands.allowed": string[];
  "sandbox.commands.blocked": string[];
  "sandbox.commands.blockAll": boolean;
  "sandbox.commands.blockNetwork": boolean;

  // Sandbox: paths
  "sandbox.paths.traversalPatterns": string[];
  "sandbox.paths.readOnlyRoots": string[];

  // Sandbox: files
  "sandbox.files.maxWriteBytes": number;
  "sandbox.files.allowedExtensions": string[] | null;
  "sandbox.files.blockedExtensions": string[] | null;

  // Sandbox: URLs
  "sandbox.urls.allowlist": string[];
  "sandbox.urls.denylist": string[];
  "sandbox.urls.blockAll": boolean;

  // Sandbox: MCP
  "sandbox.mcp.enabled": boolean;
  "sandbox.mcp.allowedServers": string[];
  "sandbox.mcp.blockedTools": string[];

  // Sandbox: custom tools
  "sandbox.customTools.enabled": boolean;
  "sandbox.customTools.allowed": string[];

  // Sandbox: rate limits
  "sandbox.rateLimit.commandsPerMinute": number;
  "sandbox.rateLimit.writesPerMinute": number;

  // Isolation: resources
  "isolation.memory.max": string;
  "isolation.cpu.quota": string;
  "isolation.cpu.affinity": number[] | null;
  "isolation.tasks.max": number;
  "isolation.time.limitSec": number;
  "isolation.files.maxSize": number;
  "isolation.io.weight": number;
  "isolation.network.enabled": boolean;
  "isolation.network.allowedPorts": number[];
  "isolation.backend.preferred": string;
  "isolation.backend.config": Record<string, unknown>;

  // Tools: built-in
  "tools.builtin.blocked": string[];

  // Tools: MCP
  "tools.mcp.servers": McpServerPolicy[];
  "tools.mcp.globalBlock": boolean;

  // Tools: custom
  "tools.custom.definitions": CustomToolDef[];
  "tools.custom.globalBlock": boolean;

  // Tools: agents
  "tools.agents.available": PolicyAgentConfig[];
  "tools.agents.default": string | null;

  // Audit
  "audit.log.permissions": boolean;
  "audit.log.commands": boolean;
  "audit.log.fileAccess": boolean;
  "audit.log.toolUse": boolean;
  "audit.log.policyChanges": boolean;
  "audit.alert.deniedBurst": number;
  "audit.rateLimit.action": "warn" | "throttle" | "suspend";
  "audit.retention.maxEntries": number;

  // User state
  "user.suspended": boolean;
  "user.suspendReason": string | null;
  "user.priority": "free" | "paid" | "admin";
}

export type PolicyKey = keyof PolicyMap;
export type PolicyValue<K extends PolicyKey> = PolicyMap[K];

// ============================================================================
// Per-user override: can use SetPolicy for set-based keys
// ============================================================================

export type UserOverrideValue<K extends PolicyKey> =
  PolicyMap[K] extends string[]
    ? SetPolicy | string[]
    : PolicyMap[K];

// ============================================================================
// Change event
// ============================================================================

export interface PolicyChange {
  key: PolicyKey;
  scope: "global" | "user";
  userId?: string;
  previousValue: unknown;
  newValue: unknown;
  timestamp: string;
}

// ============================================================================
// Serialized form (for persistence)
// ============================================================================

export interface SerializedPolicies {
  version: 1;
  global: Partial<Record<PolicyKey, unknown>>;
  users: Record<string, Partial<Record<PolicyKey, unknown>>>;
}
