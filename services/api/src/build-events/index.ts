/**
 * Build-events package barrel.
 * Per devframeworkPRD/03-build-event-protocol.md.
 */

export type {
  BuildEvent,
  BuildEventBase,
  BuildEventInput,
  BuildLog,
  BuildPhaseStarted,
  BuildPhaseCompleted,
  BuildRoute,
  BuildError,
  BuildWarning,
  BuildProgress,
  BuildArtifact,
  BuildSummary,
  BuildEta,
  KeepAlive,
  PhaseId,
} from "./types.js";

export {
  getOrCreateBuffer,
  clearBuffer,
  pushEvent,
  type ProjectBuildBuffer,
} from "./buffer.js";

export { BuildEventPublisher, subscribe } from "./publisher.js";

export {
  LogFilterChain,
  buildDefaultFilters,
  type LogFilter,
  type FilterContext,
} from "./filters/index.js";

export {
  loadWorkspaceFilters,
  clearWorkspaceFilterCache,
} from "./filters/workspace-filters.js";
