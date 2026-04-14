// ---- Events for cross-component communication ----
export const DASHBOARD_EVENTS = {
  NAVIGATE_FILTER: "dashboard:navigate-filter",
  NAVIGATE_FOLDER: "dashboard:navigate-folder",
  SEARCH_FOCUS: "dashboard:search-focus",
  FOLDERS_CHANGED: "dashboard:folders-changed",
  PROJECTS_CHANGED: "dashboard:projects-changed",
  MOVE_PROJECT_TO_FOLDER: "dashboard:move-project-to-folder",
  IMPORT_GITHUB: "dashboard:import-github",
  WORKSPACE_CHANGED: "dashboard:workspace-changed",
} as const;

export const PROJECT_DRAG_TYPE = "application/x-doable-project";

export type DashboardFilter = "all" | "starred" | "created-by-me" | "shared";

export function emitDashboardEvent(event: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(event, { detail }));
}
