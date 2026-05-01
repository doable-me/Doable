/**
 * Framework registry bootstrap.
 *
 * `initFrameworks()` registers every shipped FrameworkAdapter into the
 * process-wide `defaultRegistry`. Call this from the API entry point BEFORE
 * any code path that resolves a framework by id (project create, dev start,
 * build, AI file tools, etc.). Idempotent — safe to call more than once.
 */

import { viteReactAdapter, viteReactPack } from "./adapters/index.js";
import { defaultRegistry } from "./registry.js";

let initialized = false;

export function initFrameworks(): void {
  if (initialized) return;
  defaultRegistry.register(viteReactPack, viteReactAdapter);
  initialized = true;
}
