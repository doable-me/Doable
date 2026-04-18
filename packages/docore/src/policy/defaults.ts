/**
 * docore policy defaults
 *
 * Single source of truth for all built-in default values.
 * These are the values used when no global or per-user override is set.
 * Moved here from hardcoded constants in sandbox.ts, isolator.ts, etc.
 */

import type { PolicyMap } from "./types.js";

/** Safe commands for building Vite websites */
export const DEFAULT_SAFE_COMMANDS: string[] = [
  "node", "npm", "npx", "yarn", "pnpm", "bun", "bunx",
  "git",
  "cat", "head", "tail", "less", "more", "wc",
  "ls", "dir", "find", "grep", "rg", "fd", "tree",
  "cp", "mv", "mkdir", "touch",
  "echo", "printf", "tee",
  "diff", "patch",
  "sort", "uniq", "sed", "awk", "cut", "tr",
  "which", "where", "type",
  "pwd", "cd", "pushd", "popd",
  "true", "false", "test",
  "get-childitem", "get-content", "set-content", "new-item",
  "copy-item", "move-item", "remove-item", "test-path",
  "select-string", "get-location", "set-location",
];

/** Commands that should never be run in a multi-tenant environment */
export const DEFAULT_DANGEROUS_COMMANDS: string[] = [
  "sudo", "su", "doas", "pkexec", "runas",
  "rm", "rmdir", "del", "format", "mkfs", "dd", "shred",
  "kill", "killall", "pkill", "systemctl", "service", "sc",
  "useradd", "userdel", "usermod", "passwd", "chown", "chmod", "chgrp", "icacls", "cacls",
  "curl", "wget", "nc", "ncat", "netcat", "socat", "ssh", "scp", "sftp", "rsync",
  "telnet", "ftp", "nmap", "dig", "nslookup", "host",
  "apt", "apt-get", "yum", "dnf", "pacman", "brew", "snap", "flatpak",
  "pip", "pip3", "gem", "cargo", "go",
  "docker", "podman", "kubectl", "containerd", "ctr", "crictl",
  "mount", "umount", "fdisk", "lsblk",
  "crontab", "at", "schtasks",
  "gcc", "g++", "cc", "make", "cmake", "ld",
  "python", "python3", "ruby", "perl", "lua", "php",
  "env", "printenv", "export", "set",
  "powershell", "pwsh", "cmd", "reg", "wmic", "net", "netsh",
];

/** Path traversal patterns stored as regex source strings (serializable) */
export const DEFAULT_TRAVERSAL_PATTERNS: string[] = [
  "\\.\\.\\/",
  "\\.\\.\\\\",
  "~\\/",
  "\\/etc\\/",
  "\\/proc\\/",
  "\\/sys\\/",
  "\\/dev\\/",
  "\\/tmp\\/",
  "\\/var\\/",
  "\\/root\\/",
  "\\/home\\/",
  "C:\\\\Windows\\\\System32",
  "\\$HOME",
  "\\$\\(",
  "`[^`]+`",
  ">\\s*\\/",
  ">\\s*\\.\\.",
];

/** URL patterns (regex source strings) allowed by default */
export const DEFAULT_URL_ALLOWLIST: string[] = [
  ".",  // Allow all URLs — web access is essential for development
];

/** Complete policy defaults */
export const POLICY_DEFAULTS: PolicyMap = {
  // Sandbox: commands
  "sandbox.commands.allowed": DEFAULT_SAFE_COMMANDS,
  "sandbox.commands.blocked": DEFAULT_DANGEROUS_COMMANDS,
  "sandbox.commands.blockAll": false,
  "sandbox.commands.blockNetwork": true,

  // Sandbox: paths
  "sandbox.paths.traversalPatterns": DEFAULT_TRAVERSAL_PATTERNS,
  "sandbox.paths.readOnlyRoots": [],

  // Sandbox: files
  "sandbox.files.maxWriteBytes": 10_000_000,
  "sandbox.files.allowedExtensions": null,
  "sandbox.files.blockedExtensions": null,

  // Sandbox: URLs
  "sandbox.urls.allowlist": DEFAULT_URL_ALLOWLIST,
  "sandbox.urls.denylist": [],
  "sandbox.urls.blockAll": false,

  // Sandbox: MCP
  "sandbox.mcp.enabled": false,
  "sandbox.mcp.allowedServers": [],
  "sandbox.mcp.blockedTools": [],

  // Sandbox: custom tools
  "sandbox.customTools.enabled": false,
  "sandbox.customTools.allowed": [],

  // Sandbox: rate limits
  "sandbox.rateLimit.commandsPerMinute": 60,
  "sandbox.rateLimit.writesPerMinute": 120,

  // Isolation: resources
  "isolation.memory.max": "200M",
  "isolation.cpu.quota": "50%",
  "isolation.cpu.affinity": null,
  "isolation.tasks.max": 64,
  "isolation.time.limitSec": 0,
  "isolation.files.maxSize": 50_000_000,
  "isolation.io.weight": 100,
  "isolation.network.enabled": false,
  "isolation.network.allowedPorts": [],
  "isolation.backend.preferred": "auto",
  "isolation.backend.config": {},

  // Tools: built-in
  "tools.builtin.blocked": [],

  // Tools: MCP
  "tools.mcp.servers": [],
  "tools.mcp.globalBlock": true,

  // Tools: custom
  "tools.custom.definitions": [],
  "tools.custom.globalBlock": true,

  // Tools: agents
  "tools.agents.available": [],
  "tools.agents.default": null,

  // Audit
  "audit.log.permissions": true,
  "audit.log.commands": true,
  "audit.log.fileAccess": false,
  "audit.log.toolUse": true,
  "audit.log.policyChanges": true,
  "audit.alert.deniedBurst": 10,
  "audit.rateLimit.action": "warn",
  "audit.retention.maxEntries": 10000,

  // User state
  "user.suspended": false,
  "user.suspendReason": null,
  "user.priority": "free",
};
