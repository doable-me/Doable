/**
 * docore event bus
 *
 * A typed EventEmitter for DoCoreEvents. Supports wildcard and per-kind subscriptions.
 * Fully serializable: every event is a plain object suitable for JSON.stringify().
 */

import type { DoCoreEvent, DoCoreEventKind, DoCoreEventOf } from "./events.js";

export type WildcardHandler = (event: DoCoreEvent) => void;
export type TypedHandler<K extends DoCoreEventKind> = (event: DoCoreEventOf<K>) => void;

export class EventBus {
  private wildcardHandlers = new Set<WildcardHandler>();
  private typedHandlers = new Map<DoCoreEventKind, Set<(event: DoCoreEvent) => void>>();

  /** Subscribe to ALL events */
  onAny(handler: WildcardHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => { this.wildcardHandlers.delete(handler); };
  }

  /** Subscribe to a specific event kind (type-safe) */
  on<K extends DoCoreEventKind>(kind: K, handler: TypedHandler<K>): () => void {
    if (!this.typedHandlers.has(kind)) {
      this.typedHandlers.set(kind, new Set());
    }
    const stored = handler as (event: DoCoreEvent) => void;
    this.typedHandlers.get(kind)!.add(stored);
    return () => { this.typedHandlers.get(kind)?.delete(stored); };
  }

  /** Emit an event to all matching subscribers */
  emit(event: DoCoreEvent): void {
    // typed handlers first
    const typed = this.typedHandlers.get(event.kind);
    if (typed) {
      for (const h of typed) {
        try { h(event); } catch { /* swallow handler errors */ }
      }
    }
    // wildcard handlers
    for (const h of this.wildcardHandlers) {
      try { h(event); } catch { /* swallow handler errors */ }
    }
  }

  /** Remove all handlers */
  clear(): void {
    this.wildcardHandlers.clear();
    this.typedHandlers.clear();
  }
}
