import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * No-op backend. Spawns the process directly without resource limits.
 * Always available — used as the final fallback.
 */
export class DirectBackend implements ResourceBackend {
  readonly name = "direct";
  readonly priority = 0;
  readonly description = "No resource limits (direct spawn)";

  available(): boolean {
    return true;
  }

  wrapSpawn(command: string, args: string[]): WrapResult {
    return { command, args };
  }
}
