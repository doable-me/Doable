/**
 * Registry of packages whose REQUIRED transitive deps are flaky to install in
 * the per-project sandbox, and therefore go missing/corrupt and blank the
 * preview. Keyed by the parent package; the value lists deps that MUST be
 * present + valid whenever the parent is installed.
 *
 * Why this exists (recharts → react-is, the motivating case):
 *   recharts imports `react-is` at module-evaluation time. recharts declares
 *   react-is as a PEER dependency, so a `npm install` of recharts does NOT pull
 *   it automatically, and the sandbox's follow-up install of react-is is flaky
 *   (offline registry / peer-dep conflict vs React 19). When react-is ends up
 *   missing or corrupt, Vite's optimizeDeps of recharts fails (the dep request
 *   504s), the `import … from "recharts"` throws at module load, React never
 *   mounts, and the user sees a permanent blank preview — with no Vite overlay
 *   and the app's ErrorBoundary unable to catch a load-time error.
 *
 * GENERIC by design: add an entry here for ANY package with the same problem;
 * the normalizer (ensureFlakyPeerDeps) and the optimizeDeps pre-warm both read
 * from this single registry, so no per-package code is needed.
 */
export const FLAKY_PEER_DEPS: Record<string, string[]> = {
  recharts: ["react-is"],
  // Other libraries that drag in react-is as a peer (same failure mode):
  "react-redux": ["react-is"],
  "react-beautiful-dnd": ["react-is"],
};

/**
 * Flat, de-duplicated list of every parent + peer in the registry. Used to
 * pre-warm Vite's optimizeDeps so the heavy/flaky libs are bundled at server
 * start (no lazy first-load 504 race) — intersected with the project's actual
 * dependencies before use, so absent packages are never force-included.
 */
export const FLAKY_PREBUNDLE_TARGETS: string[] = Array.from(
  new Set(
    Object.entries(FLAKY_PEER_DEPS).flatMap(([parent, peers]) => [parent, ...peers]),
  ),
);

/** All peers required by the parents present in a project's dependency set. */
export function requiredPeersForDeps(deps: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const [parent, peers] of Object.entries(FLAKY_PEER_DEPS)) {
    if (deps[parent] !== undefined) {
      for (const p of peers) out.add(p);
    }
  }
  return [...out];
}

/** Subset of FLAKY_PREBUNDLE_TARGETS that the project actually depends on. */
export function presentPrewarmTargets(deps: Record<string, unknown>): string[] {
  return FLAKY_PREBUNDLE_TARGETS.filter((t) => deps[t] !== undefined);
}
