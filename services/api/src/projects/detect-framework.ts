/**
 * Heuristic framework detection from a free-form user prompt.
 *
 * Used when the user creates a project via the dashboard prompt box and does
 * NOT explicitly pick a framework. Lets a prompt like "build me a Django blog"
 * land on the django adapter without forcing the user through a picker.
 *
 * Returns null when:
 *   - the prompt has no clear framework signal, OR
 *   - two strong signals from different frameworks both appear (e.g.
 *     "Next.js or Nuxt — your call") — ambiguous, defer to admin default.
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
    id: "sveltekit",
    patterns: [/\bsvelte[\s-]?kit\b/i],
  },
  {
    id: "nuxt",
    patterns: [/\bnuxt(?:\s*[34])?\b/i],
  },
  {
    id: "astro",
    patterns: [/\bastro\b/i],
  },
  {
    id: "django",
    patterns: [/\bdjango\b/i],
  },
  {
    id: "fastapi",
    patterns: [/\bfast[\s-]?api\b/i],
  },
  {
    id: "hono",
    patterns: [/\bhono\b/i],
  },
  {
    id: "vite-react",
    // Only the explicit phrase "vite" — bare "react" is too ambiguous (it
    // could mean Next.js, Vite-React, or just the React library).
    patterns: [/\bvite\b/i, /\bvite\s*\+?\s*react\b/i],
  },
];

// Weaker signals only consulted if NO strong signal matched. Keep tight.
const WEAK: FrameworkPattern[] = [
  // "vue" / "vue.js" tilts toward Nuxt by default — Vue without a framework
  // is rare for a "build me an app" prompt.
  { id: "nuxt", patterns: [/\bvue(?:\.js)?\b/i] },
  // Bare "svelte" (without "kit") still tilts toward SvelteKit because
  // standalone Svelte is an unusual "build a full app" choice.
  { id: "sveltekit", patterns: [/\bsvelte\b(?!\s*[\s-]?kit)/i] },
];

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
