/**
 * docore sandbox
 *
 * Security layer that constrains what the Copilot agent can do per user.
 * The SDK's permission handler is the ONLY gate between the LLM and the OS.
 *
 * Now PolicyStore-aware: every permission check reads the EFFECTIVE policy
 * for the user (global merged with per-user overrides). Changes take effect
 * on the very next permission check, no handler recreation needed.
 *
 * Backward compatible: the legacy createSandboxedPermissionHandler(userId, options)
 * signature still works by creating an ephemeral PolicyStore internally.
 */

import type { PermissionHandler } from "@github/copilot-sdk";
import * as path from "node:path";
import { PolicyStore } from "./policy/store.js";
import type { Tracer, SpanHandle } from "./tracer.js";

// ============================================================================
// Legacy configuration (backward compat)
// ============================================================================

export interface SandboxOptions {
  allowedRoot: string;
  readOnlyRoots?: string[];
  allowedCommands?: string[];
  blockedCommands?: string[];
  blockAllShell?: boolean;
  blockNetworkCommands?: boolean;
  maxWriteBytes?: number;
  onAudit?: (entry: SandboxAuditEntry) => void;
}

export interface SandboxAuditEntry {
  userId: string;
  timestamp: string;
  kind: string;
  decision: "approved" | "denied";
  reason?: string;
  details: Record<string, unknown>;
}

// ============================================================================
// Rate limiter (per user, sliding window)
// ============================================================================

class RateLimiter {
  private windows = new Map<string, number[]>();

  check(key: string, limit: number, windowMs = 60_000): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    let timestamps = this.windows.get(key);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(key, timestamps);
    }
    while (timestamps.length > 0 && timestamps[0]! < cutoff) timestamps.shift();
    if (timestamps.length >= limit) return false;
    timestamps.push(now);
    return true;
  }
}

// ============================================================================
// Policy-driven sandbox handler
// ============================================================================

/**
 * Create a permission handler that reads rules from a PolicyStore.
 * Every check pulls the EFFECTIVE policy for the user at call time,
 * so runtime policy changes take effect immediately.
 */
export function createPolicySandbox(
  userId: string,
  allowedRoot: string,
  store: PolicyStore,
  onAudit?: (entry: SandboxAuditEntry) => void,
  tracer?: Tracer,
): PermissionHandler {
  const resolvedRoot = path.resolve(allowedRoot);
  const rateLimiter = new RateLimiter();

  function log(kind: string, decision: "approved" | "denied", reason: string | undefined, details: Record<string, unknown>) {
    if (store.getEffective(userId, "audit.log.permissions")) {
      onAudit?.({
        userId,
        timestamp: new Date().toISOString(),
        kind,
        decision,
        reason,
        details,
      });
    }
  }

  function trace(kind: string, decision: "approved" | "denied", reason: string | undefined, details: Record<string, unknown>) {
    if (!tracer) return;
    const span = tracer.start(`sandbox.${kind}`, { userId, decision, ...details });
    if (decision === "denied") {
      span.fail(reason ?? "denied", { reason });
    } else {
      span.end({ reason });
    }
  }

  // On Windows paths are case-insensitive; normalize for comparison
  const normalize = process.platform === "win32"
    ? (p: string) => p.toLowerCase()
    : (p: string) => p;
  const normalRoot = normalize(resolvedRoot);

  function isInsideSandbox(filePath: string): boolean {
    const resolved = normalize(path.resolve(filePath));
    return resolved.startsWith(normalRoot + path.sep) || resolved === normalRoot;
  }

  function isReadable(filePath: string): boolean {
    if (isInsideSandbox(filePath)) return true;
    const resolved = normalize(path.resolve(filePath));
    const readOnlyRoots = store.getEffective(userId, "sandbox.paths.readOnlyRoots");
    return readOnlyRoots.some((root) => {
      const absRoot = normalize(path.resolve(root));
      return resolved.startsWith(absRoot + path.sep) || resolved === absRoot;
    });
  }

  function checkExtension(fileName: string): { allowed: boolean; reason?: string } {
    const ext = path.extname(fileName).toLowerCase();
    if (!ext) return { allowed: true };
    const blockedExts = store.getEffective(userId, "sandbox.files.blockedExtensions");
    if (blockedExts && blockedExts.includes(ext)) {
      return { allowed: false, reason: `file extension ${ext} is blocked` };
    }
    const allowedExts = store.getEffective(userId, "sandbox.files.allowedExtensions");
    if (allowedExts && !allowedExts.includes(ext)) {
      return { allowed: false, reason: `file extension ${ext} is not in the allowed list` };
    }
    return { allowed: true };
  }

  return async (request) => {
    // Suspended users get nothing
    if (store.getEffective(userId, "user.suspended")) {
      log(request.kind, "denied", "user suspended", { request: { kind: request.kind } });
      trace(request.kind, "denied", "user suspended", {});
      return { kind: "denied-interactively-by-user", feedback: "Your account is suspended." };
    }

    const kind = request.kind;

    // -- File write ----------------------------------------------------------
    if (kind === "write") {
      const fileName = (request as Record<string, unknown>).fileName as string;
      if (!fileName) {
        log("write", "denied", "no fileName", { request: { kind } });
        trace("write", "denied", "no fileName", {});
        return { kind: "denied-interactively-by-user", feedback: "Write blocked: no file path specified." };
      }
      if (!isInsideSandbox(fileName)) {
        log("write", "denied", "outside sandbox", { fileName, allowedRoot: resolvedRoot });
        trace("write", "denied", "outside sandbox", { fileName });
        return { kind: "denied-interactively-by-user", feedback: "Write blocked: path is outside your project directory." };
      }
      const extCheck = checkExtension(fileName);
      if (!extCheck.allowed) {
        log("write", "denied", extCheck.reason!, { fileName });
        trace("write", "denied", extCheck.reason!, { fileName });
        return { kind: "denied-interactively-by-user", feedback: `Write blocked: ${extCheck.reason}.` };
      }
      const maxWriteBytes = store.getEffective(userId, "sandbox.files.maxWriteBytes");
      const contents = (request as Record<string, unknown>).newFileContents as string | undefined;
      if (maxWriteBytes > 0 && contents && contents.length > maxWriteBytes) {
        log("write", "denied", "file too large", { fileName, size: contents.length, max: maxWriteBytes });
        trace("write", "denied", "file too large", { fileName, size: contents.length, max: maxWriteBytes });
        return { kind: "denied-interactively-by-user", feedback: "Write blocked: file exceeds size limit." };
      }
      const writeLimit = store.getEffective(userId, "sandbox.rateLimit.writesPerMinute");
      if (!rateLimiter.check(`write:${userId}`, writeLimit)) {
        log("write", "denied", "rate limit exceeded", { fileName });
        trace("write", "denied", "rate limit exceeded", { fileName });
        return { kind: "denied-interactively-by-user", feedback: "Write blocked: rate limit exceeded. Try again shortly." };
      }
      log("write", "approved", undefined, { fileName });
      return { kind: "approved" };
    }

    // -- File read -----------------------------------------------------------
    if (kind === "read") {
      const filePath = (request as Record<string, unknown>).path as string;
      if (!filePath) {
        log("read", "denied", "no path", { request: { kind } });
        trace("read", "denied", "no path", {});
        return { kind: "denied-interactively-by-user", feedback: "Read blocked: no path specified." };
      }
      if (!isReadable(filePath)) {
        log("read", "denied", "outside sandbox", { filePath, allowedRoot: resolvedRoot });
        trace("read", "denied", "outside sandbox", { filePath });
        return { kind: "denied-interactively-by-user", feedback: "Read blocked: path is outside your allowed directories." };
      }
      log("read", "approved", undefined, { filePath });
      return { kind: "approved" };
    }

    // -- Shell command -------------------------------------------------------
    if (kind === "shell") {
      const fullCommand = (request as Record<string, unknown>).fullCommandText as string ?? "";
      const commands = (request as Record<string, unknown>).commands as Array<{ identifier: string; readOnly: boolean }> ?? [];
      const possiblePaths = (request as Record<string, unknown>).possiblePaths as string[] ?? [];

      const blockAll = store.getEffective(userId, "sandbox.commands.blockAll");
      if (blockAll) {
        log("shell", "denied", "all shell blocked", { fullCommand });
        trace("shell", "denied", "all shell blocked", { fullCommand });
        return { kind: "denied-interactively-by-user", feedback: "Shell commands are disabled." };
      }
      const allowedCmds = new Set(
        store.getEffective(userId, "sandbox.commands.allowed").map(c => c.toLowerCase())
      );
      const blockedCmds = new Set(
        store.getEffective(userId, "sandbox.commands.blocked").map(c => c.toLowerCase())
      );
      for (const cmd of commands) {
        const id = cmd.identifier.toLowerCase();
        // Extract the base command name (first token) — the SDK sends the full
        // command string as the identifier (e.g. "npm install react") but the
        // allowlist stores short names ("npm").
        const baseCmd = id.split(/\s+/)[0].replace(/^.*[\\/]/, "");
        if (blockedCmds.has(id) || blockedCmds.has(baseCmd)) {
          log("shell", "denied", `blocked command: ${id}`, { fullCommand });
          trace("shell", "denied", `blocked command: ${id}`, { fullCommand, command: id });
          return { kind: "denied-interactively-by-user", feedback: `Command "${baseCmd}" is not allowed.` };
        }
        if (!allowedCmds.has(id) && !allowedCmds.has(baseCmd)) {
          log("shell", "denied", `unknown command: ${id}`, { fullCommand });
          trace("shell", "denied", `unknown command: ${id}`, { fullCommand, command: id });
          return { kind: "denied-interactively-by-user", feedback: `Command "${baseCmd}" is not in the allowed list.` };
        }
      }
      const blockNetwork = store.getEffective(userId, "sandbox.commands.blockNetwork");
      if (blockNetwork) {
        const networkCmds = ["curl", "wget", "nc", "ncat", "netcat", "socat", "ssh", "scp", "sftp", "rsync", "telnet", "ftp"];
        for (const cmd of commands) {
          const baseCmdNet = cmd.identifier.toLowerCase().split(/\s+/)[0].replace(/^.*[\\/]/, "");
          if (networkCmds.includes(baseCmdNet)) {
            log("shell", "denied", `network command: ${cmd.identifier}`, { fullCommand });
            trace("shell", "denied", `network command: ${cmd.identifier}`, { fullCommand, command: cmd.identifier });
            return { kind: "denied-interactively-by-user", feedback: `Network command "${baseCmdNet}" is not allowed.` };
          }
        }
      }
      const traversalPatterns = store.getEffective(userId, "sandbox.paths.traversalPatterns");
      // Strip the working directory from the command before testing traversal
      // patterns — otherwise the project's own path (e.g. C:\Users\...) triggers
      // false-positive blocks.
      const sanitisedCommand = fullCommand
        .replaceAll(resolvedRoot, "<sandbox>")
        .replaceAll(resolvedRoot.replace(/\\/g, "/"), "<sandbox>");
      for (const patternStr of traversalPatterns) {
        const pattern = new RegExp(patternStr, "i");
        if (pattern.test(sanitisedCommand)) {
          log("shell", "denied", `path traversal pattern: ${patternStr}`, { fullCommand, sanitisedCommand, matchedPattern: patternStr });
          trace("shell", "denied", `path traversal pattern: ${patternStr}`, { fullCommand, sanitisedCommand, matchedPattern: patternStr });
          return { kind: "denied-interactively-by-user", feedback: "Command blocked: contains suspicious path patterns." };
        }
      }
      for (const p of possiblePaths) {
        if (!isInsideSandbox(p) && !isReadable(p)) {
          log("shell", "denied", `path outside sandbox: ${p}`, { fullCommand, possiblePaths });
          trace("shell", "denied", `path outside sandbox: ${p}`, { fullCommand, path: p });
          return { kind: "denied-interactively-by-user", feedback: "Command blocked: references path outside your project." };
        }
      }
      const cmdLimit = store.getEffective(userId, "sandbox.rateLimit.commandsPerMinute");
      if (!rateLimiter.check(`cmd:${userId}`, cmdLimit)) {
        log("shell", "denied", "rate limit exceeded", { fullCommand });
        trace("shell", "denied", "rate limit exceeded", { fullCommand });
        return { kind: "denied-interactively-by-user", feedback: "Command blocked: rate limit exceeded. Try again shortly." };
      }
      log("shell", "approved", undefined, { fullCommand, commands: commands.map(c => c.identifier) });
      return { kind: "approved" };
    }

    // -- URL access ----------------------------------------------------------
    if (kind === "url") {
      const url = (request as Record<string, unknown>).url as string ?? "";
      const blockAllUrls = store.getEffective(userId, "sandbox.urls.blockAll");
      if (blockAllUrls) {
        log("url", "denied", "all URLs blocked", { url });
        trace("url", "denied", "all URLs blocked", { url });
        return { kind: "denied-interactively-by-user", feedback: "URL access is disabled." };
      }
      const denylist = store.getEffective(userId, "sandbox.urls.denylist");
      for (const pattern of denylist) {
        if (new RegExp(pattern, "i").test(url)) {
          log("url", "denied", "url in denylist", { url, pattern });
          trace("url", "denied", "url in denylist", { url, matchedPattern: pattern });
          return { kind: "denied-interactively-by-user", feedback: "URL access blocked: this URL is explicitly denied." };
        }
      }
      const allowlist = store.getEffective(userId, "sandbox.urls.allowlist");
      const urlAllowed = allowlist.some(pattern => new RegExp(pattern, "i").test(url));
      if (!urlAllowed) {
        log("url", "denied", "url not in allowlist", { url });
        trace("url", "denied", "url not in allowlist", { url });
        return { kind: "denied-interactively-by-user", feedback: "URL access blocked: only localhost and common CDNs are allowed." };
      }
      log("url", "approved", undefined, { url });
      return { kind: "approved" };
    }

    // -- MCP tools -----------------------------------------------------------
    if (kind === "mcp") {
      const mcpEnabled = store.getEffective(userId, "sandbox.mcp.enabled");
      if (!mcpEnabled) {
        log("mcp", "denied", "mcp blocked in sandbox", { request: { kind } });
        return { kind: "denied-interactively-by-user", feedback: "MCP tools are disabled in sandbox mode." };
      }
      const serverName = (request as Record<string, unknown>).serverName as string ?? "";
      const toolName = (request as Record<string, unknown>).toolName as string ?? "";
      const allowedServers = store.getEffective(userId, "sandbox.mcp.allowedServers");
      if (allowedServers.length > 0 && !allowedServers.includes(serverName)) {
        log("mcp", "denied", `server not allowed: ${serverName}`, { serverName, toolName });
        return { kind: "denied-interactively-by-user", feedback: `MCP server "${serverName}" is not in the allowed list.` };
      }
      const blockedTools = store.getEffective(userId, "sandbox.mcp.blockedTools");
      const fullToolName = `${serverName}/${toolName}`;
      if (blockedTools.includes(toolName) || blockedTools.includes(fullToolName)) {
        log("mcp", "denied", `tool blocked: ${fullToolName}`, { serverName, toolName });
        return { kind: "denied-interactively-by-user", feedback: `MCP tool "${toolName}" is blocked.` };
      }
      log("mcp", "approved", undefined, { serverName, toolName });
      return { kind: "approved" };
    }

    // -- Custom tools --------------------------------------------------------
    if (kind === "custom-tool") {
      const customEnabled = store.getEffective(userId, "sandbox.customTools.enabled");
      if (!customEnabled) {
        log("custom-tool", "denied", "custom tools blocked in sandbox", { request: { kind } });
        return { kind: "denied-interactively-by-user", feedback: "Custom tools are disabled in sandbox mode." };
      }
      const toolName = (request as Record<string, unknown>).toolName as string ?? "";
      const allowedTools = store.getEffective(userId, "sandbox.customTools.allowed");
      if (allowedTools.length > 0 && !allowedTools.includes(toolName)) {
        log("custom-tool", "denied", `tool not allowed: ${toolName}`, { toolName });
        return { kind: "denied-interactively-by-user", feedback: `Custom tool "${toolName}" is not in the allowed list.` };
      }
      log("custom-tool", "approved", undefined, { toolName });
      return { kind: "approved" };
    }

    // -- Unknown kind: deny by default ---------------------------------------
    log(kind, "denied", "unknown permission kind", { request: { kind } });
    return { kind: "denied-interactively-by-user", feedback: "Permission denied: unknown request type." };
  };
}

// ============================================================================
// Legacy API (backward compatible)
// ============================================================================

/**
 * Legacy factory that creates a sandboxed permission handler from static options.
 * Creates an ephemeral PolicyStore internally. Prefer createPolicySandbox() for
 * runtime-configurable deployments.
 */
export function createSandboxedPermissionHandler(
  userId: string,
  options: SandboxOptions,
): PermissionHandler {
  const store = new PolicyStore();

  if (options.allowedCommands) store.setGlobal("sandbox.commands.allowed", options.allowedCommands);
  if (options.blockedCommands) store.setGlobal("sandbox.commands.blocked", options.blockedCommands);
  if (options.blockAllShell !== undefined) store.setGlobal("sandbox.commands.blockAll", options.blockAllShell);
  if (options.blockNetworkCommands !== undefined) store.setGlobal("sandbox.commands.blockNetwork", options.blockNetworkCommands);
  if (options.readOnlyRoots) store.setGlobal("sandbox.paths.readOnlyRoots", options.readOnlyRoots);
  if (options.maxWriteBytes !== undefined) store.setGlobal("sandbox.files.maxWriteBytes", options.maxWriteBytes);

  return createPolicySandbox(userId, options.allowedRoot, store, options.onAudit);
}
