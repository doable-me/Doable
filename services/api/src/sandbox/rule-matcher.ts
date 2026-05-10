/**
 * Workspace sandbox rule matcher.
 *
 * Migration 073 introduced workspace-configurable allow/deny rules for
 * AI tool actions. This module evaluates a rule list against a target
 * string (e.g. an install package name, a hostname) and returns the
 * effective action.
 *
 * Pattern semantics (intentionally minimal — we don't want a full
 * regex engine because rules will eventually be authored from a
 * doable-CLI TUI by humans):
 *   - `*`        matches any run of characters (including empty)
 *   - `?`        matches exactly one character
 *   - everything else is matched literally, case-sensitive
 *   - `*` alone is the "match anything" wildcard, useful for
 *     catch-all deny/allow rules.
 *
 * Evaluation order:
 *   1. Sort rules by priority ascending (lower = earlier).
 *   2. First rule whose pattern matches the target wins. Its action
 *      ('allow' | 'deny') is returned.
 *   3. If no rule matches, return the workspace default action.
 *
 * This matches the user-stated semantic from the kickoff prompt:
 *   - "allow everything except X"  → defaultAction='allow' + deny rule for X
 *   - "deny everything except Y"   → defaultAction='deny'  + allow rule for Y
 */

export type SandboxRuleAction = "allow" | "deny";
export type SandboxRuleType = "tool" | "network";

export interface SandboxRule {
  id: string;
  workspace_id: string;
  rule_type: SandboxRuleType;
  pattern: string;
  action: SandboxRuleAction;
  priority: number;
  description?: string | null;
}

export interface SandboxEvaluation {
  action: SandboxRuleAction;
  matchedRuleId: string | null;
  reason: string;
}

/**
 * Convert a glob pattern (* and ?) into a RegExp anchored at both ends.
 * Other regex metacharacters are escaped.
 */
export function globToRegExp(pattern: string): RegExp {
  // Escape regex metacharacters EXCEPT * and ?, which we'll translate
  // ourselves. Escape ordering matters — handle backslash first.
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const translated = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${translated}$`);
}

/**
 * Match a target string against a glob pattern. Pure helper exported
 * for tests; route code should call evaluateSandbox.
 */
export function patternMatches(pattern: string, target: string): boolean {
  if (pattern === "*") return true;            // common case fast-path
  if (pattern === target) return true;         // exact match fast-path
  return globToRegExp(pattern).test(target);
}

/**
 * Evaluate a target against a workspace's rule set. Filters rules to the
 * given rule_type, sorts by priority, returns the first match (or the
 * default action when nothing matches).
 *
 * @param rules All rules for the workspace (any rule_type — the function
 *   filters internally so callers can pass the unfiltered list).
 * @param ruleType Which rule_type to consider for this evaluation.
 * @param defaultAction Workspace default for this rule type.
 * @param target The string to evaluate (e.g. "openai" for an install,
 *   "api.openai.com" for a network call).
 */
export function evaluateSandbox(
  rules: readonly SandboxRule[],
  ruleType: SandboxRuleType,
  defaultAction: SandboxRuleAction,
  target: string,
): SandboxEvaluation {
  const candidates = rules
    .filter((r) => r.rule_type === ruleType)
    .slice()
    .sort((a, b) => a.priority - b.priority);

  for (const rule of candidates) {
    if (patternMatches(rule.pattern, target)) {
      return {
        action: rule.action,
        matchedRuleId: rule.id,
        reason: `Matched rule pattern "${rule.pattern}" (priority ${rule.priority}, action ${rule.action})`,
      };
    }
  }

  return {
    action: defaultAction,
    matchedRuleId: null,
    reason: `No rule matched; workspace default for ${ruleType} is "${defaultAction}"`,
  };
}
