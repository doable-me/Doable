// ─── Per-Project Mutex ───────────────────────────────────────
// In-memory Map<string, Promise> that serializes git operations per project.
// Prevents race conditions when AI + user act on the same project simultaneously.

const locks = new Map<string, Promise<unknown>>();

export async function withProjectLock<T>(
  projectId: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = locks.get(projectId) ?? Promise.resolve();

  let resolve!: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(projectId, next);

  try {
    // Wait for any previous operation on this project to finish
    await prev;
    return await fn();
  } finally {
    resolve();
    // Clean up if nothing else is queued
    if (locks.get(projectId) === next) {
      locks.delete(projectId);
    }
  }
}
