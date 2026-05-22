/**
 * docore policy admin API
 *
 * Typed convenience methods for reading and modifying policies at runtime.
 * This is what server code (Express routes, WebSocket handlers, admin CLIs)
 * uses to control the policy system.
 *
 * Every method is a thin wrapper around PolicyStore.setGlobal / setUser.
 * All changes are immediate, reactive, and auto-persisted.
 */

import { PolicyStore } from "./store.js";
import type {
  PolicyKey,
  PolicyValue,
  McpServerPolicy,
  PolicyAgentConfig,
  SetPolicy,
  UserOverrideValue,
} from "./types.js";

export interface PolicyScope {
  userId?: string;
}

export class PolicyAdmin {
  constructor(private store: PolicyStore) {}

  // --------------------------------------------------------------------------
  // Generic get/set
  // --------------------------------------------------------------------------

  get<K extends PolicyKey>(key: K, scope?: PolicyScope): PolicyValue<K> {
    return scope?.userId
      ? this.store.getEffective(scope.userId, key)
      : this.store.getGlobal(key);
  }

  set<K extends PolicyKey>(key: K, value: PolicyValue<K>, scope?: PolicyScope): void {
    if (scope?.userId) {
      this.store.setUser(scope.userId, key, value as UserOverrideValue<K>);
    } else {
      this.store.setGlobal(key, value);
    }
  }

  // --------------------------------------------------------------------------
  // Commands
  // --------------------------------------------------------------------------

  allowCommand(cmd: string, scope?: PolicyScope): void {
    if (scope?.userId) {
      const current = this.store.getUser(scope.userId, "sandbox.commands.allowed");
      const override: SetPolicy = (current && !Array.isArray(current))
        ? { ...current, add: [...(current.add ?? []), cmd] }
        : { mode: "extend", add: [cmd] };
      this.store.setUser(scope.userId, "sandbox.commands.allowed", override);
    } else {
      const global = this.store.getGlobal("sandbox.commands.allowed");
      if (!global.includes(cmd.toLowerCase())) {
        this.store.setGlobal("sandbox.commands.allowed", [...global, cmd.toLowerCase()]);
      }
    }
  }

  blockCommand(cmd: string, scope?: PolicyScope): void {
    if (scope?.userId) {
      const current = this.store.getUser(scope.userId, "sandbox.commands.blocked");
      const override: SetPolicy = (current && !Array.isArray(current))
        ? { ...current, add: [...(current.add ?? []), cmd] }
        : { mode: "extend", add: [cmd] };
      this.store.setUser(scope.userId, "sandbox.commands.blocked", override);
    } else {
      const global = this.store.getGlobal("sandbox.commands.blocked");
      if (!global.includes(cmd.toLowerCase())) {
        this.store.setGlobal("sandbox.commands.blocked", [...global, cmd.toLowerCase()]);
      }
    }
  }

  removeCommandRule(cmd: string, scope?: PolicyScope): void {
    if (scope?.userId) {
      // Remove from both allowed and blocked user overrides
      for (const key of ["sandbox.commands.allowed", "sandbox.commands.blocked"] as const) {
        const current = this.store.getUser(scope.userId, key);
        if (current && !Array.isArray(current)) {
          const updated: SetPolicy = { ...current };
          if (updated.add) updated.add = updated.add.filter(c => c.toLowerCase() !== cmd.toLowerCase());
          if (updated.remove) updated.remove = updated.remove.filter(c => c.toLowerCase() !== cmd.toLowerCase());
          if (!updated.add?.length && !updated.remove?.length) {
            this.store.clearUser(scope.userId, key);
          } else {
            this.store.setUser(scope.userId, key, updated);
          }
        }
      }
    } else {
      for (const key of ["sandbox.commands.allowed", "sandbox.commands.blocked"] as const) {
        const global = this.store.getGlobal(key);
        this.store.setGlobal(key, global.filter(c => c.toLowerCase() !== cmd.toLowerCase()));
      }
    }
  }

  // --------------------------------------------------------------------------
  // URLs
  // --------------------------------------------------------------------------

  allowUrl(pattern: string, scope?: PolicyScope): void {
    this.appendToStringArray("sandbox.urls.allowlist", pattern, scope);
  }

  blockUrl(pattern: string, scope?: PolicyScope): void {
    this.appendToStringArray("sandbox.urls.denylist", pattern, scope);
  }

  // --------------------------------------------------------------------------
  // File limits
  // --------------------------------------------------------------------------

  setMaxWriteBytes(bytes: number, scope?: PolicyScope): void {
    this.set("sandbox.files.maxWriteBytes", bytes, scope);
  }

  setAllowedExtensions(exts: string[], scope?: PolicyScope): void {
    this.set("sandbox.files.allowedExtensions", exts, scope);
  }

  setBlockedExtensions(exts: string[], scope?: PolicyScope): void {
    this.set("sandbox.files.blockedExtensions", exts, scope);
  }

  // --------------------------------------------------------------------------
  // Resource limits
  // --------------------------------------------------------------------------

  setMemoryLimit(limit: string, scope?: PolicyScope): void {
    this.set("isolation.memory.max", limit, scope);
  }

  setCpuQuota(quota: string, scope?: PolicyScope): void {
    this.set("isolation.cpu.quota", quota, scope);
  }

  setTasksMax(max: number, scope?: PolicyScope): void {
    this.set("isolation.tasks.max", max, scope);
  }

  // --------------------------------------------------------------------------
  // MCP Tools
  // --------------------------------------------------------------------------

  enableMcp(scope?: PolicyScope): void {
    this.set("sandbox.mcp.enabled", true, scope);
    this.set("tools.mcp.globalBlock", false, scope);
  }

  disableMcp(scope?: PolicyScope): void {
    this.set("sandbox.mcp.enabled", false, scope);
    this.set("tools.mcp.globalBlock", true, scope);
  }

  addMcpServer(config: McpServerPolicy, scope?: PolicyScope): void {
    const key = "tools.mcp.servers" as const;
    const current = this.get(key, scope);
    const filtered = current.filter(s => s.name !== config.name);
    this.set(key, [...filtered, config], scope);
  }

  removeMcpServer(name: string, scope?: PolicyScope): void {
    const key = "tools.mcp.servers" as const;
    const current = this.get(key, scope);
    this.set(key, current.filter(s => s.name !== name), scope);
  }

  // --------------------------------------------------------------------------
  // Custom Tools
  // --------------------------------------------------------------------------

  enableCustomTools(scope?: PolicyScope): void {
    this.set("sandbox.customTools.enabled", true, scope);
    this.set("tools.custom.globalBlock", false, scope);
  }

  disableCustomTools(scope?: PolicyScope): void {
    this.set("sandbox.customTools.enabled", false, scope);
    this.set("tools.custom.globalBlock", true, scope);
  }

  // --------------------------------------------------------------------------
  // Agents
  // --------------------------------------------------------------------------

  addAgent(config: PolicyAgentConfig, scope?: PolicyScope): void {
    const key = "tools.agents.available" as const;
    const current = this.get(key, scope);
    const filtered = current.filter(a => a.name !== config.name);
    this.set(key, [...filtered, config], scope);
  }

  removeAgent(name: string, scope?: PolicyScope): void {
    const key = "tools.agents.available" as const;
    const current = this.get(key, scope);
    this.set(key, current.filter(a => a.name !== name), scope);
  }

  setDefaultAgent(name: string | null, scope?: PolicyScope): void {
    this.set("tools.agents.default", name, scope);
  }

  // --------------------------------------------------------------------------
  // Rate limits
  // --------------------------------------------------------------------------

  setCommandRateLimit(perMinute: number, scope?: PolicyScope): void {
    this.set("sandbox.rateLimit.commandsPerMinute", perMinute, scope);
  }

  setWriteRateLimit(perMinute: number, scope?: PolicyScope): void {
    this.set("sandbox.rateLimit.writesPerMinute", perMinute, scope);
  }

  // --------------------------------------------------------------------------
  // Bulk / user management
  // --------------------------------------------------------------------------

  getUserOverrides(userId: string): Partial<Record<PolicyKey, unknown>> {
    const result: Partial<Record<PolicyKey, unknown>> = {};
    const exported = this.store.exportAll();
    const userOverrides = exported.users[userId];
    if (userOverrides) Object.assign(result, userOverrides);
    return result;
  }

  clearUserOverrides(userId: string): void {
    this.store.clearAllUser(userId);
  }

  exportPolicies(): ReturnType<PolicyStore["exportAll"]> {
    return this.store.exportAll();
  }

  importPolicies(data: Parameters<PolicyStore["importAll"]>[0]): void {
    this.store.importAll(data);
  }

  // --------------------------------------------------------------------------
  // Kill switches
  // --------------------------------------------------------------------------

  suspendUser(userId: string, reason: string): void {
    this.store.setUser(userId, "user.suspended", true);
    this.store.setUser(userId, "user.suspendReason", reason);
  }

  unsuspendUser(userId: string): void {
    this.store.setUser(userId, "user.suspended", false);
    this.store.setUser(userId, "user.suspendReason", null);
  }

  blockAllShellGlobal(block: boolean): void {
    this.store.setGlobal("sandbox.commands.blockAll", block);
  }

  blockAllUrlsGlobal(block: boolean): void {
    this.store.setGlobal("sandbox.urls.blockAll", block);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private appendToStringArray(
    key: "sandbox.urls.allowlist" | "sandbox.urls.denylist",
    value: string,
    scope?: PolicyScope,
  ): void {
    if (scope?.userId) {
      const current = this.store.getUser(scope.userId, key);
      const override: SetPolicy = (current && !Array.isArray(current))
        ? { ...current, add: [...(current.add ?? []), value] }
        : { mode: "extend", add: [value] };
      this.store.setUser(scope.userId, key, override);
    } else {
      const global = this.store.getGlobal(key);
      if (!global.includes(value)) {
        this.store.setGlobal(key, [...global, value]);
      }
    }
  }
}
