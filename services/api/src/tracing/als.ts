// AsyncLocalStorage-backed request context. Carries trace_id, user_id, etc.
// across async hops without threading them through every function call.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestContext } from "./types.js";

const als = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

/** Run `fn` with the given request context; nested calls inherit it. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/** Generate a request id (used when no upstream traceparent provided one). */
export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Update fields on the current request context in-place. Caller must already
 * be inside `runWithRequestContext`. Returns the mutated context for chaining.
 */
export function setRequestContextFields(patch: Partial<RequestContext>): RequestContext | undefined {
  const cur = als.getStore();
  if (!cur) return undefined;
  Object.assign(cur, patch);
  return cur;
}

/** Convenience for short-lived helpers that just want a partial snapshot. */
export function snapshotRequestContext(): RequestContext | undefined {
  const c = als.getStore();
  return c ? { ...c } : undefined;
}
