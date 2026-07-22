/**
 * Warm-pin API for the data-worker pool — skip idle eviction while a project
 * has live topic subscribers or pending workflow runs.
 */

const pinReasons = new Map<string, Set<string>>();

export function pinProject(projectId: string, reason: string): void {
  let set = pinReasons.get(projectId);
  if (!set) {
    set = new Set();
    pinReasons.set(projectId, set);
  }
  set.add(reason);
}

export function unpinProject(projectId: string, reason: string): void {
  const set = pinReasons.get(projectId);
  if (!set) return;
  set.delete(reason);
  if (set.size === 0) pinReasons.delete(projectId);
}

export function isProjectPinned(projectId: string): boolean {
  const set = pinReasons.get(projectId);
  return !!set && set.size > 0;
}

export function getPinReasons(projectId: string): string[] {
  return [...(pinReasons.get(projectId) ?? [])];
}

/** Test helper. */
export function __resetPins(): void {
  pinReasons.clear();
}
