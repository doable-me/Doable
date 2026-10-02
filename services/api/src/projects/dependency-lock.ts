/** Package managers rewrite the same manifest, lockfile and dependency tree.
 * Serialize mutations per project, including callers from different AI tools.
 * This is process-local, matching the current single API process deployment. */
const pending = new Map<string, Promise<void>>();
export async function withDependencyLock<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
  const previous = pending.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  pending.set(projectId, current);
  try {
    await previous;
    return await operation();
  } finally {
    release();
    if (pending.get(projectId) === current) pending.delete(projectId);
  }
}
