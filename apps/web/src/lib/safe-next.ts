/**
 * Validate a post-auth redirect target ("next" / "returnTo") down to a safe,
 * same-origin absolute path. Returns `fallback` for anything it cannot prove
 * is a clean local path.
 *
 * Rejects, in order: empty/non-absolute, scheme-relative `//host`, any control
 * character or backslash (some browsers normalize `\`→`/`, enabling
 * `/\host` host-smuggling), and any input that resolves to a different origin.
 * This is the single source of truth for redirect-target validation — prefer
 * it over inline `startsWith("/")` checks so a future hardening can't be
 * applied to one call site and forgotten at another.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    // Reject control chars (< 0x20) and backslash (0x5C) anywhere in the path.
    if (c < 0x20 || c === 0x5c) return fallback;
  }
  try {
    // Resolve against a sentinel origin; if it escapes, it wasn't a local path.
    const u = new URL(raw, "https://x.invalid");
    if (u.origin !== "https://x.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
