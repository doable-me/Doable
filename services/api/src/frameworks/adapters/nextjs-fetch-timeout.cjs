/**
 * Preload script for Next.js dev servers in Doable sandbox.
 * Patches globalThis.fetch with a 15-second timeout to prevent SSR from
 * hanging indefinitely when env vars are misconfigured (e.g. SUPABASE_URL
 * is undefined → fetch("undefined/...") hangs on DNS forever).
 *
 * Loaded via NODE_OPTIONS="--require <this-file>" in the Next.js adapter.
 */
"use strict";

const DEFAULT_TIMEOUT_MS = 15_000;

const originalFetch = globalThis.fetch;

if (typeof originalFetch === "function") {
  globalThis.fetch = function patchedFetch(input, init) {
    // If the caller already set a signal, don't override it.
    if (init?.signal) {
      return originalFetch(input, init);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    return originalFetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer);
    });
  };
}
