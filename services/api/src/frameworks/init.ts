/**
 * Framework registry bootstrap.
 *
 * Currently ships only `vite-react` and `nextjs-app`. Six other adapters
 * (nuxt, sveltekit, astro, django, fastapi, hono) were removed along with
 * their templates and AI prompt files — see
 * `~/Documents/doable-disabled-frameworks-backup-<date>/` for the
 * removed sources. To bring them back: restore the files, re-add the
 * imports + register() calls below, and add their entries to the dialog
 * in `apps/web/src/modules/dashboard/components/create-project-dialog.tsx`.
 *
 * `DOABLE_ENABLED_FRAMEWORKS` env (comma-separated ids) further gates
 * which of the registered adapters are actually exposed to the UI. Default
 * matches the shipped set, so leaving it unset is the right behaviour.
 *
 * Templates whose `framework_id` isn't in the enabled set are also
 * filtered out by `templates/registry.ts:getEnabledFrameworkIds`, so the
 * picker stays consistent with what the backend will actually run.
 */

import {
  nextjsAppAdapter,
  nextjsAppPack,
  viteReactAdapter,
  viteReactPack,
} from "./adapters/index.js";
import type { FrameworkAdapter, FrameworkPack } from "./types.js";
import { defaultRegistry } from "./registry.js";

let initialized = false;

const DEFAULT_ENABLED = "vite-react,nextjs-app";

/** Parse the env into a Set of enabled framework ids. Exported so the
 *  template registry can apply the same filter. */
export function getEnabledFrameworkIds(): Set<string> {
  const raw = (process.env.DOABLE_ENABLED_FRAMEWORKS ?? DEFAULT_ENABLED).trim();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function initFrameworks(): void {
  if (initialized) return;
  const enabled = getEnabledFrameworkIds();

  const candidates: Array<[FrameworkPack, FrameworkAdapter]> = [
    [viteReactPack, viteReactAdapter],
    [nextjsAppPack, nextjsAppAdapter],
  ];

  const registered: string[] = [];
  for (const [pack, adapter] of candidates) {
    if (!enabled.has(pack.id)) continue;
    defaultRegistry.register(pack, adapter);
    registered.push(pack.id);
  }
  console.log(
    `[frameworks] registered ${registered.length}/${candidates.length} adapter(s): ${registered.join(", ")}`,
  );
  initialized = true;
}
