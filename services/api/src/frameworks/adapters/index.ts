import type { FrameworkPack } from "../types.js";
import { viteReactAdapter } from "./vite-react.js";
import { nextjsAppAdapter } from "./nextjs-app.js";
import { nuxtAdapter } from "./nuxt.js";
import { sveltekitAdapter } from "./sveltekit.js";
import { astroAdapter } from "./astro.js";

/**
 * Per-adapter framework pack — pure derivation from the adapter's static
 * metadata. Pack and adapter share the same `id`, `family`, `displayName`,
 * `capabilities`, and `defaults` fields by contract (PRD 02 §2 / §4.3), so
 * we synthesize the pack here rather than duplicating the literals in the
 * adapter file. Canonical pattern: each adapter file exports its `*Adapter`
 * constant; this barrel derives the matching `*Pack` alongside.
 */
function packFromAdapter(adapter: typeof viteReactAdapter): FrameworkPack {
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
export const nuxtPack: FrameworkPack = packFromAdapter(nuxtAdapter);
export const sveltekitPack: FrameworkPack = packFromAdapter(sveltekitAdapter);
export const astroPack: FrameworkPack = packFromAdapter(astroAdapter);

export {
  viteReactAdapter,
  nextjsAppAdapter,
  nuxtAdapter,
  sveltekitAdapter,
  astroAdapter,
};
