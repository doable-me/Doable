// Secret pattern detection — last line of defense before spans/logs leave the SDK.
// Runs on every string attribute and log message body when redaction is enabled.

interface SecretPattern {
  name: string;
  re: RegExp;
  action?: "redact" | "hash";
}

export const SECRET_PATTERNS: SecretPattern[] = [
  { name: "aws_access_key",      re: /AKIA[0-9A-Z]{16}/g },
  { name: "bearer_token",        re: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}=*/gi },
  { name: "jwt",                 re: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g },
  { name: "github_pat",          re: /ghp_[A-Za-z0-9]{36}/g },
  { name: "github_fine_grained", re: /github_pat_[A-Za-z0-9_]{82}/g },
  { name: "gitlab_pat",          re: /glpat-[A-Za-z0-9\-_]{20}/g },
  { name: "stripe_live",         re: /sk_live_[A-Za-z0-9]{24,}/g },
  { name: "stripe_test",         re: /sk_test_[A-Za-z0-9]{24,}/g },
  { name: "slack_token",         re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "google_api_key",      re: /AIza[0-9A-Za-z_\-]{35}/g },
  { name: "openai_key",          re: /sk-[A-Za-z0-9]{32,}/g },
  { name: "anthropic_key",       re: /sk-ant-[A-Za-z0-9_\-]{32,}/g },
  { name: "private_key_pem",     re: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g },
];

/** Replace secret-like substrings with a labeled placeholder. */
export function scrubSecrets(input: string): string {
  if (!input || typeof input !== "string") return input;
  let out = input;
  for (const p of SECRET_PATTERNS) {
    out = out.replace(p.re, `[REDACTED:${p.name}]`);
  }
  return out;
}

/** Returns true if `input` contains any pattern that should never appear in a trace. */
export function containsSecret(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  for (const p of SECRET_PATTERNS) {
    if (p.re.test(input)) {
      // RegExp.test mutates lastIndex on /g — reset for next caller.
      p.re.lastIndex = 0;
      return true;
    }
  }
  return false;
}

/** Span attribute keys that should always be removed/redacted regardless of value. */
export const ALWAYS_REDACT_KEYS = new Set<string>([
  "http.request.header.authorization",
  "http.request.header.cookie",
  "http.request.header.x-api-key",
  "http.response.header.set-cookie",
  "db.statement.parameters",
  "oauth.code",
  "oauth.state",
  "oauth.access_token",
  "oauth.refresh_token",
  "oauth.id_token",
]);

/** Attribute key prefixes whose values are deny-by-default (size-only). */
export const DENY_BY_DEFAULT_PREFIXES = [
  "http.request.body",
  "http.response.body",
  "ai.message.content",
  "ai.tool.args",
  "ai.tool.result",
  "yjs.update.payload",
  "file.content",
];
