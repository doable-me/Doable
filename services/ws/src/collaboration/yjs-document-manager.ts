import * as Y from "yjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, normalize } from "node:path";
import { existsSync } from "node:fs";

const PROJECTS_ROOT = process.env.DOABLE_PROJECTS_DIR ?? join(process.cwd(), "projects");
const PERSIST_DEBOUNCE_MS = 500;
const GC_GRACE_PERIOD_MS = 30_000;

interface ManagedDoc {
  yText: Y.Text;
  dirty: boolean;
  persistTimer: ReturnType<typeof setTimeout> | null;
  lastAccess: number;
  initialContentLoaded: boolean;
}

/**
 * Manages one Y.Doc per project, with separate Y.Text per file.
 * Handles filesystem loading, debounced persistence, and GC.
 */
export class YjsDocumentManager {
  private doc: Y.Doc;
  private files: Y.Map<Y.Text>;
  private managedFiles = new Map<string, ManagedDoc>();
  private pendingLoads = new Map<string, Promise<Y.Text>>();
  private gcTimer: ReturnType<typeof setTimeout> | null = null;
  private projectId: string;
  private onUpdate: ((filePath: string, update: Uint8Array) => void) | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.doc = new Y.Doc();
    this.files = this.doc.getMap("files");

    // Listen for updates to propagate to clients
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "remote-client" || origin === "ai-bridge") {
        // Find which file was updated by checking dirty flags
        for (const [filePath, managed] of this.managedFiles) {
          this.schedulePersist(filePath, managed);
        }
        // Broadcast update to connected clients
        if (this.onUpdate) {
          for (const [filePath] of this.managedFiles) {
            this.onUpdate(filePath, update);
          }
        }
      }
    });
  }

  /**
   * Set the callback for outgoing updates (broadcast to clients).
   */
  setUpdateCallback(cb: (filePath: string, update: Uint8Array) => void): void {
    this.onUpdate = cb;
  }

  /**
   * Get the Y.Doc (for encoding full state).
   */
  getDoc(): Y.Doc {
    return this.doc;
  }

  /**
   * Get full state as update (for sync).
   */
  getState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Get state vector (for incremental sync).
   */
  getStateVector(): Uint8Array {
    return Y.encodeStateVector(this.doc);
  }

  /**
   * Encode state as update from a given state vector.
   */
  encodeStateAsUpdate(stateVector?: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, stateVector);
  }

  /**
   * Apply a Yjs update from a remote client.
   */
  applyUpdate(update: Uint8Array, origin: string = "remote-client"): void {
    Y.applyUpdate(this.doc, update, origin);

    // Mark all managed files as potentially dirty and schedule persist
    for (const [filePath, managed] of this.managedFiles) {
      managed.dirty = true;
      managed.lastAccess = Date.now();
      this.schedulePersist(filePath, managed);
    }
  }

  /**
   * Get or load a file's Y.Text. Loads content from filesystem on first access.
   * Uses a pending-load map to prevent duplicate concurrent loads.
   */
  async getFileText(filePath: string): Promise<Y.Text> {
    const existing = this.managedFiles.get(filePath);
    if (existing) {
      existing.lastAccess = Date.now();
      return existing.yText;
    }

    // If another call is already loading this file, wait for it
    const pending = this.pendingLoads.get(filePath);
    if (pending) return pending;

    const loadPromise = this.loadFileText(filePath);
    this.pendingLoads.set(filePath, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.pendingLoads.delete(filePath);
    }
  }

  private async loadFileText(filePath: string): Promise<Y.Text> {
    // Create Y.Text for this file
    let yText = this.files.get(filePath);
    if (!yText) {
      yText = new Y.Text();
      this.files.set(filePath, yText);
    }

    const managed: ManagedDoc = {
      yText,
      dirty: false,
      persistTimer: null,
      lastAccess: Date.now(),
      initialContentLoaded: false,
    };
    this.managedFiles.set(filePath, managed);

    // Load content from filesystem if Y.Text is empty
    if (yText.length === 0) {
      const content = await this.readFileFromDisk(filePath);
      if (content !== null && content.length > 0) {
        this.doc.transact(() => {
          yText!.insert(0, content);
        }, "filesystem-load");
        managed.initialContentLoaded = true;
      }
    } else {
      managed.initialContentLoaded = true;
    }

    return yText;
  }

  /**
   * Check if a file is loaded in the CRDT.
   */
  hasFile(filePath: string): boolean {
    return this.managedFiles.has(filePath);
  }

  /**
   * Get file content as string (from Y.Text).
   */
  getFileContent(filePath: string): string | null {
    const managed = this.managedFiles.get(filePath);
    if (!managed) return null;
    return managed.yText.toString();
  }

  /**
   * Write file content through CRDT (used by AI bridge).
   * Replaces the entire file content atomically.
   */
  async writeFileThroughCrdt(filePath: string, content: string): Promise<void> {
    const yText = await this.getFileText(filePath);

    this.doc.transact(() => {
      // Delete all existing content
      if (yText.length > 0) {
        yText.delete(0, yText.length);
      }
      // Insert new content
      if (content.length > 0) {
        yText.insert(0, content);
      }
    }, "ai-bridge");

    // Mark dirty and schedule persist
    const managed = this.managedFiles.get(filePath);
    if (managed) {
      managed.dirty = true;
      managed.lastAccess = Date.now();
      this.schedulePersist(filePath, managed);
    }
  }

  /**
   * Apply an edit (old_string → new_string) through CRDT.
   */
  async editFileThroughCrdt(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll: boolean = false,
  ): Promise<{ success: boolean; occurrences: number }> {
    const yText = await this.getFileText(filePath);
    const content = yText.toString();

    if (!content.includes(oldString)) {
      return { success: false, occurrences: 0 };
    }

    const occurrences = content.split(oldString).length - 1;
    if (occurrences > 1 && !replaceAll) {
      return { success: false, occurrences };
    }

    this.doc.transact(() => {
      let currentContent = yText.toString();
      const count = replaceAll ? occurrences : 1;

      for (let i = 0; i < count; i++) {
        const idx = currentContent.indexOf(oldString);
        if (idx === -1) break;

        yText.delete(idx, oldString.length);
        if (newString.length > 0) {
          yText.insert(idx, newString);
        }
        currentContent = yText.toString();
      }
    }, "ai-bridge");

    const managed = this.managedFiles.get(filePath);
    if (managed) {
      managed.dirty = true;
      managed.lastAccess = Date.now();
      this.schedulePersist(filePath, managed);
    }

    return { success: true, occurrences: replaceAll ? occurrences : 1 };
  }

  /**
   * Delete a file from CRDT tracking.
   */
  removeFile(filePath: string): void {
    const managed = this.managedFiles.get(filePath);
    if (managed) {
      if (managed.persistTimer) clearTimeout(managed.persistTimer);
      this.managedFiles.delete(filePath);
    }
    if (this.files.has(filePath)) {
      this.files.delete(filePath);
    }
  }

  /**
   * Persist all dirty files immediately (called before GC).
   */
  async persistAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [filePath, managed] of this.managedFiles) {
      if (managed.dirty) {
        if (managed.persistTimer) {
          clearTimeout(managed.persistTimer);
          managed.persistTimer = null;
        }
        promises.push(this.persistFile(filePath, managed));
      }
    }
    await Promise.all(promises);
  }

  /**
   * Start GC timer. After grace period, persist all and destroy.
   */
  startGracePeriod(onDestroy: () => void): void {
    if (this.gcTimer) return;
    this.gcTimer = setTimeout(async () => {
      await this.persistAll();
      this.destroy();
      onDestroy();
    }, GC_GRACE_PERIOD_MS);
  }

  /**
   * Cancel GC timer (user reconnected).
   */
  cancelGracePeriod(): void {
    if (this.gcTimer) {
      clearTimeout(this.gcTimer);
      this.gcTimer = null;
    }
  }

  /**
   * Destroy the manager and clean up resources.
   */
  destroy(): void {
    for (const [, managed] of this.managedFiles) {
      if (managed.persistTimer) clearTimeout(managed.persistTimer);
    }
    if (this.gcTimer) clearTimeout(this.gcTimer);
    this.managedFiles.clear();
    this.doc.destroy();
  }

  // ─── Private ──────────────────────────────────────────────

  private schedulePersist(filePath: string, managed: ManagedDoc): void {
    if (managed.persistTimer) return; // Already scheduled
    managed.persistTimer = setTimeout(() => {
      managed.persistTimer = null;
      this.persistFile(filePath, managed).catch((err) => {
        console.error(`[yjs] Failed to persist ${filePath}:`, err);
      });
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persistFile(filePath: string, managed: ManagedDoc): Promise<void> {
    if (!managed.dirty) return;
    const content = managed.yText.toString();
    await this.writeFileToDisk(filePath, content);
    managed.dirty = false;
  }

  private resolveProjectPath(filePath: string): string {
    const projectRoot = normalize(join(PROJECTS_ROOT, this.projectId));
    const fullPath = normalize(join(projectRoot, filePath));
    // Prevent path traversal (e.g. ../../etc/passwd)
    if (!fullPath.startsWith(projectRoot)) {
      throw new Error(`[yjs] Path traversal blocked: ${filePath}`);
    }
    return fullPath;
  }

  private async readFileFromDisk(filePath: string): Promise<string | null> {
    const fullPath = this.resolveProjectPath(filePath);
    try {
      return await readFile(fullPath, "utf-8");
    } catch {
      return null;
    }
  }

  private async writeFileToDisk(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolveProjectPath(filePath);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(fullPath, content, "utf-8");
  }
}
