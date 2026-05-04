/**
 * Heuristic framework detection from a free-form user prompt.
 *
 * Used when the user creates a project via the dashboard prompt box and does
 * NOT explicitly pick a framework. Currently returns either "nextjs-app" or
 * "vite-react" (or null = use admin default), matching the only two
 * registered frameworks. The 6 disabled frameworks (sveltekit, nuxt, astro,
 * django, fastapi, hono) were removed; if a prompt mentions one of them, we
 * return null so the picker / admin default decides.
 *
 * Returns null when:
 *   - the prompt has no clear framework signal, OR
 *   - two strong signals from different frameworks both appear (e.g.
 *     "Next.js or Vite — your call") — ambiguous, defer to admin default.
 */

interface FrameworkPattern {
  id: string;
  /** Word-bounded regex; case-insensitive flag is added centrally. */
  patterns: RegExp[];
}

// Order matters within strong signals only insofar as it guards which IDs
// "count" toward the conflict check — see detectFrameworkFromPrompt below.
const STRONG: FrameworkPattern[] = [
  {
    id: "nextjs-app",
    patterns: [
      /\bnext\.?js\b/i,
      /\bnext\s*1[3-9]\b/i,
      /\bapp\s+router\b/i,
      /\bserver\s+actions?\b/i,
      /\bserver\s+components?\b/i,
    ],
  },
  {
    id: "vite-react",
    // Only the explicit phrase "vite" — bare "react" is too ambiguous (it
    // could mean Next.js, Vite-React, or just the React library).
    patterns: [/\bvite\b/i, /\bvite\s*\+?\s*react\b/i],
  },
];

// Weaker signals only consulted if NO strong signal matched. Currently
// none — when only vite-react and nextjs-app are registered, there's
// no useful weak signal that can disambiguate them. Keep the array empty
// rather than deleting the whole branch so re-enabling a framework is a
// matter of pushing entries here.
const WEAK: FrameworkPattern[] = [];

export function detectFrameworkFromPrompt(prompt: string): string | null {
  if (!prompt || typeof prompt !== "string") return null;
  const text = prompt;

  // Find every STRONG framework that has at least one matching pattern.
  const matched = new Set<string>();
  for (const group of STRONG) {
    if (group.patterns.some((re) => re.test(text))) matched.add(group.id);
  }

  if (matched.size === 1) {
    return [...matched][0] ?? null;
  }
  if (matched.size > 1) {
    // Ambiguous prompt names two different frameworks — let the admin
    // default (or vite-react fallback) decide instead of guessing.
    return null;
  }

  // No strong match — try weak signals. Same conflict rule.
  const weakMatched = new Set<string>();
  for (const group of WEAK) {
    if (group.patterns.some((re) => re.test(text))) weakMatched.add(group.id);
  }
  if (weakMatched.size === 1) {
    return [...weakMatched][0] ?? null;
  }
  return null;
}
