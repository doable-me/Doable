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
 *
 * Currently shipping: vite-react, nextjs-app. The 6 other adapters
 * (nuxt, sveltekit, astro, django, fastapi, hono) were deleted along with
 * their templates and AI prompt files; see
 * `~/Documents/doable-disabled-frameworks-backup-<date>/` for the
 * removed sources if you ever need to bring them back.
 */
function packFromAdapter(adapter: { id: string; family: FrameworkPack["family"]; displayName: string; capabilities: FrameworkPack["capabilities"]; defaults: FrameworkPack["defaults"] }): FrameworkPack {
  return {
    id: adapter.id,
    family: adapter.family,
    displayName: adapter.displayName,
    capabilities: adapter.capabilities,
    defaults: adapter.defaults,
  };
}

export const viteReactPack: FrameworkPack = packFromAdapter(viteReactAdapter);
export const nextjsAppPack: FrameworkPack = packFromAdapter(nextjsAppAdapter);

export {
  viteReactAdapter,
  nextjsAppAdapter,
};
