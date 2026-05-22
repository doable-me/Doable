/**
 * Email + secret-shape redactor — ALWAYS ON. Per PRD 04 §3.5.
 *
 * Each pattern uses bounded quantifiers to avoid catastrophic
 * backtracking. All patterns are module-level constants so they are
 * compiled once.
 */

import type { LogFilter } from "./types.js";

const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Email — RFC 2822-ish (intentionally lax).
  [/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "<REDACTED:email>"],

  // AWS access key prefixes (AKIA, ASIA, AGPA, AIDA, AROA, AIPA, ANPA, ANVA, ASCA).
  [
    /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[0-9A-Z]{16}\b/g,
    "<REDACTED:aws-key>",
  ],

  // GitHub classic / fine-grained tokens.
  [/\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, "<REDACTED:github-token>"],
  [/\bgithub_pat_[A-Za-z0-9_]{82}\b/g, "<REDACTED:github-pat>"],

  // Supabase project key prefix.
  [/\bsbp_[a-z0-9]{40}\b/g, "<REDACTED:supabase-key>"],

  // Slack bot / app / user / refresh / legacy tokens.
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "<REDACTED:slack-token>"],

  // Stripe live / test keys.
  [/\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]{20,}\b/g, "<REDACTED:stripe-key>"],

  // Generic JWT (3 base64url segments).
  [
    /\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g,
    "<REDACTED:jwt>",
  ],

  // Anthropic.
  [/\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g, "<REDACTED:anthropic-key>"],

  // OpenAI (sk- and sk-proj- variants).
  [/\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/g, "<REDACTED:openai-key>"],
];

export function buildShapeRedactor(): LogFilter {
  return {
    id: "shapes",
    alwaysOn: true,
    apply(line) {
      let out = line;
      for (const [re, token] of PATTERNS) {
        out = out.replace(re, token);
      }
      return out;
    },
  };
}
