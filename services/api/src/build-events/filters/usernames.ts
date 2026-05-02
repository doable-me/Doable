/**
 * Username redactor. Per PRD 04 §3.4.
 *
 * Replaces literal occurrences of OS usernames provided by
 * `ctx.osUsernames`. Word-boundary matching avoids accidentally
 * redacting substrings inside unrelated identifiers (e.g. the
 * literal "gj" inside "package.json" or "registry").
 */

import type { LogFilter } from "./types.js";

const TOKEN = "<REDACTED:user>";
const MIN_USERNAME_LENGTH = 3;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildUsernameRedactor(): LogFilter {
  return {
    id: "username",
    apply(line, ctx) {
      let out = line;
      for (const u of ctx.osUsernames) {
        if (!u || u.length < MIN_USERNAME_LENGTH) continue;
        const re = new RegExp(`\\b${escapeRegExp(u)}\\b`, "g");
        out = out.replace(re, TOKEN);
      }
      return out;
    },
  };
}
