/**
 * App runtime route aggregator + lifecycle.
 */

import { Hono } from "hono";
import { DOABLE_APP_RUNTIME_ENABLED } from "./config.js";
import { queriesRoutes, crudRoutes } from "./http/queries-routes.js";
import { workflowRoutes } from "./http/workflow-routes.js";
import { topicsRoutes } from "./http/topics-routes.js";
import { hooksRoutes } from "./http/hooks-routes.js";
import { startScheduler, stopScheduler } from "./schedules/ticker.js";

export { DOABLE_APP_RUNTIME_ENABLED } from "./config.js";
export { appBus } from "./bus.js";
export { pinProject, unpinProject, isProjectPinned } from "./pin.js";
export { emitCdcIfMutation } from "./cdc/emit.js";
export { startScheduler, stopScheduler };

export const appRuntimeRoutes = new Hono({ strict: false });

if (DOABLE_APP_RUNTIME_ENABLED) {
  appRuntimeRoutes.route("/", queriesRoutes);
  appRuntimeRoutes.route("/", crudRoutes);
  appRuntimeRoutes.route("/", workflowRoutes);
  appRuntimeRoutes.route("/", topicsRoutes);
  appRuntimeRoutes.route("/", hooksRoutes);
}

/** Call once from API boot when runtime is enabled. */
export function startAppRuntime(): void {
  if (!DOABLE_APP_RUNTIME_ENABLED) return;
  startScheduler();
}

export function stopAppRuntime(): void {
  stopScheduler();
}
