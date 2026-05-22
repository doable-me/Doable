import type { BundleManifest, ConnectorItem } from "./manifest.js";

/**
 * Coarse-grained permission categories surfaced in the install dialog.
 * These are intentionally human-readable — the goal is informed consent,
 * not enforcement (which happens at runtime via connector sandboxing).
 */
export type PermissionScope =
  | "skills.read"
  | "rules.read"
  | "knowledge.read"
  | "connectors.network"
  | "connectors.filesystem"
  | "connectors.shell"
  | "connectors.thirdParty"
  | "credentials.required";

export interface PermissionEntry {
  scope: PermissionScope;
  /** Brief, sentence-cased label shown in the dialog. */
  label: string;
  /** Source items contributing to this entry (for "see details"). */
  sources: string[];
  /** "info" | "warn" | "danger" — drives badge colour. */
  severity: "info" | "warn" | "danger";
}

const NETWORK_TYPES = new Set(["http", "fetch", "github", "linear", "slack", "notion", "stripe"]);
const FS_TYPES = new Set(["filesystem", "fs", "git"]);
const SHELL_TYPES = new Set(["shell", "bash", "exec", "process"]);

function classifyConnector(c: ConnectorItem): PermissionScope[] {
  const scopes = new Set<PermissionScope>();
  const t = c.type.toLowerCase();

  if (c.transport === "http" || c.transport === "sse" || NETWORK_TYPES.has(t)) {
    scopes.add("connectors.network");
  }
  if (FS_TYPES.has(t)) scopes.add("connectors.filesystem");
  if (SHELL_TYPES.has(t)) scopes.add("connectors.shell");

  // Anything not classifiable is treated as third-party (yellow flag).
  if (scopes.size === 0) scopes.add("connectors.thirdParty");

  if (c.requires.some((r) => r.required)) scopes.add("credentials.required");
  return Array.from(scopes);
}

/**
 * Compute a human-readable permission summary for a bundle. Pure function —
 * safe to run in the browser before installing.
 */
export function computePermissions(manifest: BundleManifest): PermissionEntry[] {
  const entries = new Map<PermissionScope, PermissionEntry>();

  function push(scope: PermissionScope, label: string, severity: PermissionEntry["severity"], source: string) {
    const existing = entries.get(scope);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      return;
    }
    entries.set(scope, { scope, label, severity, sources: [source] });
  }

  if (manifest.skills.length > 0) {
    push(
      "skills.read",
      `Add ${manifest.skills.length} skill${manifest.skills.length === 1 ? "" : "s"} to your AI`,
      "info",
      "skills"
    );
  }
  if (manifest.rules.length > 0) {
    push(
      "rules.read",
      `Add ${manifest.rules.length} rule${manifest.rules.length === 1 ? "" : "s"} that auto-attach to matching files`,
      "info",
      "rules"
    );
  }
  if (manifest.knowledge.length > 0) {
    push(
      "knowledge.read",
      `Add ${manifest.knowledge.length} knowledge file${manifest.knowledge.length === 1 ? "" : "s"} to your context`,
      "info",
      "knowledge"
    );
  }

  for (const c of manifest.connectors) {
    for (const scope of classifyConnector(c)) {
      const label =
        scope === "connectors.network"
          ? `Network access via "${c.name}"`
          : scope === "connectors.filesystem"
            ? `Filesystem access via "${c.name}"`
            : scope === "connectors.shell"
              ? `Shell command execution via "${c.name}"`
              : scope === "credentials.required"
                ? `You'll be asked to provide credentials for "${c.name}"`
                : `Third-party connector "${c.name}" (${c.type})`;
      const severity: PermissionEntry["severity"] =
        scope === "connectors.shell"
          ? "danger"
          : scope === "connectors.thirdParty" || scope === "credentials.required"
            ? "warn"
            : "info";
      push(scope, label, severity, c.name);
    }
  }

  // Sort: danger → warn → info, then alphabetical
  const order = { danger: 0, warn: 1, info: 2 } as const;
  return Array.from(entries.values()).sort((a, b) => {
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return a.label.localeCompare(b.label);
  });
}

/**
 * Returns true iff a bundle includes anything that requires admin review.
 * The marketplace flow uses this to gate "List" → "Pending review" automatically.
 */
export function requiresModeration(manifest: BundleManifest): boolean {
  if (manifest.connectors.length === 0) return false;
  // Any connector that isn't a known first-party type goes to review.
  const FIRST_PARTY = new Set(["filesystem", "github", "linear", "slack"]);
  return manifest.connectors.some((c) => !FIRST_PARTY.has(c.type.toLowerCase()));
}
