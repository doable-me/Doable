/**
 * Vite Dev Server Manager
 *
 * Spawns and manages Vite dev servers for each project.
 * Each project gets a unique port in the range 3100-3200.
 * The preview iframe in the editor points to these dev servers.
 *
 * Key invariant: each project ID maps to exactly ONE dev server
 * on a unique port, serving files from that project's directory.
 */

export type { StartDevServerOptions } from "./dev-server-core.js";
export { startDevServer } from "./dev-server-start.js";
export {
  stopDevServer,
  getDevServerUrl,
  getDevServerInternalUrl,
  getDevServerInternalUrlWhenReady,
  isRunning,
  getRunningServers,
  restartDevServer,
  stopAllDevServers,
} from "./dev-server-ops.js";
