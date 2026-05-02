/**
 * Framework registry bootstrap.
 *
 * `initFrameworks()` registers every shipped FrameworkAdapter into the
 * process-wide `defaultRegistry`. Call this from the API entry point BEFORE
 * any code path that resolves a framework by id (project create, dev start,
 * build, AI file tools, etc.). Idempotent — safe to call more than once.
 */

import {
  astroAdapter,
  astroPack,
  djangoAdapter,
  djangoPack,
  fastapiAdapter,
  fastapiPack,
  honoAdapter,
  honoPack,
  nextjsAppAdapter,
  nextjsAppPack,
  nuxtAdapter,
  nuxtPack,
  sveltekitAdapter,
  sveltekitPack,
  viteReactAdapter,
  viteReactPack,
} from "./adapters/index.js";
import { defaultRegistry } from "./registry.js";

let initialized = false;

export function initFrameworks(): void {
  if (initialized) return;
  defaultRegistry.register(viteReactPack, viteReactAdapter);
  defaultRegistry.register(nextjsAppPack, nextjsAppAdapter);
  defaultRegistry.register(nuxtPack, nuxtAdapter);
  defaultRegistry.register(sveltekitPack, sveltekitAdapter);
  defaultRegistry.register(astroPack, astroAdapter);
  defaultRegistry.register(djangoPack, djangoAdapter);
  defaultRegistry.register(fastapiPack, fastapiAdapter);
  defaultRegistry.register(honoPack, honoAdapter);
  initialized = true;
}
