/**
 * Module-level artifact stash that survives across chat requests.
 *
 * The Copilot SDK caches its `toolProgress` callbacks per-session, so when
 * a project's session is reused for a follow-up chat message, the original
 * tool-callbacks closure (and its `state` reference) remain bound to the
 * SDK. Any per-request state on `ChatStreamState` is therefore not visible
 * across the boundary between tool-callbacks (running with the cached
 * closure's state) and event-processor (running with the new request's
 * state). This module provides a process-global FIFO keyed by toolName
 * so the producer and consumer don't need to share `state`.
 */

export type ArtifactRef = {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type StashEntry = { artifacts: ArtifactRef[]; timestamp: number };

const stash = new Map<string, StashEntry[]>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_QUEUE_PER_TOOL = 8;

function gc() {
  const now = Date.now();
  for (const [key, entries] of stash.entries()) {
    const fresh = entries.filter((e) => now - e.timestamp < TTL_MS);
    if (fresh.length === 0) stash.delete(key);
    else if (fresh.length !== entries.length) stash.set(key, fresh);
  }
}

export function pushArtifacts(toolName: string, artifacts: ArtifactRef[]): void {
  if (!toolName || artifacts.length === 0) return;
  gc();
  const arr = stash.get(toolName) ?? [];
  arr.push({ artifacts, timestamp: Date.now() });
  while (arr.length > MAX_QUEUE_PER_TOOL) arr.shift();
  stash.set(toolName, arr);
}

export function popArtifacts(toolName: string): ArtifactRef[] | undefined {
  if (!toolName) return undefined;
  const arr = stash.get(toolName);
  if (!arr || arr.length === 0) return undefined;
  const entry = arr.shift()!;
  if (arr.length === 0) stash.delete(toolName);
  else stash.set(toolName, arr);
  return entry.artifacts;
}
