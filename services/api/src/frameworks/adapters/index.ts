import type { FrameworkPack } from "../types.js";
import { viteReactAdapter } from "./vite-react.js";
import { nextjsAppAdapter } from "./nextjs-app.js";

/**
 * Per-adapter framework pack — pure derivation from the adapter's static
 * metadata. Pack and adapter share the same `id`, `family`, `displayName`,
 * `capabilities`, and `defaults` fields by contract (PRD 02 §2 / §4.3), so
 * we synthesize the pack here rather than duplicating the literals in the
 * adapter file. Canonical pattern: each adapter file exports its `*Adapter`
 * constant; this barrel derives the matching `*Pack` alongside.
 */
export const viteReactPack: FrameworkPack = {
  id: viteReactAdapter.id,
  family: viteReactAdapter.family,
  displayName: viteReactAdapter.displayName,
  capabilities: viteReactAdapter.capabilities,
  defaults: viteReactAdapter.defaults,
};

export const nextjsAppPack: FrameworkPack = {
  id: nextjsAppAdapter.id,
  family: nextjsAppAdapter.family,
  displayName: nextjsAppAdapter.displayName,
  capabilities: nextjsAppAdapter.capabilities,
  defaults: nextjsAppAdapter.defaults,
};

export { viteReactAdapter, nextjsAppAdapter };
