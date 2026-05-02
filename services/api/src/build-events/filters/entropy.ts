/**
 * Generic high-entropy redactor — ALWAYS ON. Per PRD 04 §3.6.
 *
 * Any "word" of length >= 32 whose Shannon entropy is > 4.0 bits/char
 * AND which does NOT contain a path separator (`/` or `\`) is
 * replaced with `<REDACTED:high-entropy>`.
 *
 * False positives are acceptable; the audit counters surface
 * over-redaction at the dashboard level so we can tune without
 * seeing payloads.
 */

import type { LogFilter } from "./types.js";

const TOKEN = "<REDACTED:high-entropy>";
const ENTROPY_THRESHOLD_BITS_PER_CHAR = 4.0;
const MIN_WORD_LENGTH = 32;
const MAX_WORD_LENGTH = 256;

// Bounded quantifier prevents ReDoS. Includes URL-safe base64 alphabet.
const WORD_RE = new RegExp(
  `\\b[A-Za-z0-9_\\-+/=]{${MIN_WORD_LENGTH},${MAX_WORD_LENGTH}}\\b`,
  "g",
);

function shannonBitsPerChar(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function buildEntropyRedactor(): LogFilter {
  return {
    id: "entropy",
    alwaysOn: true,
    apply(line) {
      return line.replace(WORD_RE, (m) => {
        // Skip path-y matches — the path filter handles those.
        if (m.includes("/") || m.includes("\\")) return m;
        return shannonBitsPerChar(m) > ENTROPY_THRESHOLD_BITS_PER_CHAR
          ? TOKEN
          : m;
      });
    },
  };
}
