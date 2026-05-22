/**
 * docore policy persistence backends
 *
 * Pluggable storage for persisting policy data across server restarts.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SerializedPolicies } from "./types.js";

// ============================================================================
// Interface
// ============================================================================

export interface PolicyPersistence {
  save(data: SerializedPolicies): Promise<void>;
  load(): Promise<SerializedPolicies | null>;
}

// ============================================================================
// File persistence (JSON on disk)
// ============================================================================

export class FilePersistence implements PolicyPersistence {
  private filePath: string;

  constructor(dirOrPath: string) {
    this.filePath = dirOrPath.endsWith(".json")
      ? dirOrPath
      : path.join(dirOrPath, "policies.json");
  }

  async save(data: SerializedPolicies): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const json = JSON.stringify(data, null, 2);
    // Atomic write: write to temp, then rename
    const tmp = this.filePath + ".tmp";
    await fs.writeFile(tmp, json, "utf-8");
    await fs.rename(tmp, this.filePath);
  }

  async load(): Promise<SerializedPolicies | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1) return parsed as SerializedPolicies;
      return null;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Memory persistence (no disk, for tests)
// ============================================================================

export class MemoryPersistence implements PolicyPersistence {
  private data: SerializedPolicies | null = null;

  async save(data: SerializedPolicies): Promise<void> {
    this.data = structuredClone(data);
  }

  async load(): Promise<SerializedPolicies | null> {
    return this.data ? structuredClone(this.data) : null;
  }
}
