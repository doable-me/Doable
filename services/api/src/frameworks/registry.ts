/**
 * Framework registry.
 *
 * Maps a frameworkId (e.g. "vite-react") to a `{ pack, adapter }` pair.
 * Code paths that need to spawn or query a framework go through here —
 * they NEVER infer framework from disk shape. The single source of truth
 * is `projects.framework_id`; the registry resolves it.
 *
 * See devframeworkPRD/02-framework-abstraction.md §6.4 for the registration
 * mismatch checks.
 */

import {
  FrameworkAdapterError,
  type FrameworkAdapter,
  type FrameworkPack,
} from "./types.js";

// ─── Types ───────────────────────────────────────────────

export interface RegisteredFramework {
  pack: FrameworkPack;
  adapter: FrameworkAdapter;
}

// ─── Registry class ──────────────────────────────────────

export class FrameworkRegistry {
  private readonly entries = new Map<string, RegisteredFramework>();

  /**
   * Register a framework. The adapter and pack must agree on `id` and
   * `family`; mismatches throw immediately so misconfiguration surfaces
   * at boot, not at first project create.
   */
  register(pack: FrameworkPack, adapter: FrameworkAdapter): void {
    if (adapter.id !== pack.id) {
      throw new FrameworkAdapterError(
        "unsupported-capability",
        `Framework registration mismatch: adapter.id="${adapter.id}" but pack.id="${pack.id}"`,
      );
    }
    if (adapter.family !== pack.family) {
      throw new FrameworkAdapterError(
        "unsupported-capability",
        `Framework registration mismatch for "${pack.id}": adapter.family="${adapter.family}" but pack.family="${pack.family}"`,
      );
    }
    this.entries.set(pack.id, { pack, adapter });
  }

  /**
   * Look up a registered framework. Returns undefined when missing — for
   * the throwing variant use `getAdapter`.
   */
  get(id: string): RegisteredFramework | undefined {
    return this.entries.get(id);
  }

  /**
   * Resolve to the adapter or throw `framework-not-found`. Most call sites
   * want this — they have a `projects.framework_id` and assume it's valid.
   */
  getAdapter(id: string): FrameworkAdapter {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new FrameworkAdapterError(
        "framework-not-found",
        `No framework registered with id "${id}"`,
      );
    }
    return entry.adapter;
  }

  /**
   * Returns every registered pack. Order is insertion order.
   */
  list(): FrameworkPack[] {
    return Array.from(this.entries.values()).map((e) => e.pack);
  }

  /**
   * True iff a framework with the given id has been registered.
   */
  has(id: string): boolean {
    return this.entries.has(id);
  }
}

// ─── Singleton ───────────────────────────────────────────

/**
 * Process-wide default registry. Adapters register into this on import
 * (see `./adapters/index.ts`). The registry boots empty; the next agent
 * wires up `vite-react`.
 */
export const defaultRegistry = new FrameworkRegistry();
