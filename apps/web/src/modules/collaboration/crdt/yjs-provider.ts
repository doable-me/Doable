import * as Y from "yjs";

/**
 * Manages a Yjs document that syncs over the existing WebSocket connection.
 * Supports per-file sync and awareness protocol.
 */
export class YjsWsProvider {
  readonly doc: Y.Doc;
  private files: Y.Map<Y.Text>;
  private send: (msg: Record<string, unknown>) => void;
  private unsubscribe: (() => void) | null = null;
  private synced = false;
  private syncedFiles = new Set<string>();
  private pendingFileCallbacks = new Map<string, Array<() => void>>();

  constructor(
    send: (msg: Record<string, unknown>) => void,
    subscribe: (handler: (msg: any) => void) => () => void,
  ) {
    this.send = send;
    this.doc = new Y.Doc();
    this.files = this.doc.getMap("files");

    // Listen for incoming Yjs messages
    this.unsubscribe = subscribe((msg: any) => {
      if (msg.type === "yjs:sync-response") {
        const update = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0));
        Y.applyUpdate(this.doc, update, "remote");
        this.synced = true;

        // If this was a per-file sync response, mark that file as synced
        if (msg.filePath) {
          this.syncedFiles.add(msg.filePath);
          // Resolve any pending callbacks for this file
          const callbacks = this.pendingFileCallbacks.get(msg.filePath);
          if (callbacks) {
            callbacks.forEach(cb => cb());
            this.pendingFileCallbacks.delete(msg.filePath);
          }
        }
      }
      if (msg.type === "yjs:update") {
        const update = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0));
        Y.applyUpdate(this.doc, update, "remote");
      }
    });

    // Send local updates to server
    this.doc.on("update", (update: Uint8Array, origin: any) => {
      if (origin === "remote") return; // Don't echo back remote updates
      if (origin === "filesystem-load") return; // Don't send filesystem loads
      const encoded = btoa(String.fromCharCode(...update));
      this.send({ type: "yjs:update", data: encoded });
    });

    // Request initial full sync
    this.send({ type: "yjs:sync-request" });
  }

  /**
   * Request sync for a specific file. Returns when the file is synced.
   */
  async syncFile(filePath: string): Promise<void> {
    if (this.syncedFiles.has(filePath)) return;

    return new Promise<void>((resolve) => {
      const callbacks = this.pendingFileCallbacks.get(filePath) ?? [];
      callbacks.push(resolve);
      this.pendingFileCallbacks.set(filePath, callbacks);
      this.send({ type: "yjs:sync-request", filePath });
    });
  }

  getFileText(filePath: string): Y.Text {
    if (!this.files.has(filePath)) {
      this.files.set(filePath, new Y.Text());
    }
    return this.files.get(filePath)!;
  }

  /**
   * Initialize file content in Yjs (only if the Y.Text is empty).
   * This should be called by the first user who opens a file.
   */
  initFileContent(filePath: string, content: string): void {
    const yText = this.getFileText(filePath);
    if (yText.length === 0 && content.length > 0) {
      this.doc.transact(() => {
        yText.insert(0, content);
      }, "init");
    }
  }

  /**
   * Check if a specific file has been synced.
   */
  isFileSynced(filePath: string): boolean {
    return this.syncedFiles.has(filePath);
  }

  get isSynced(): boolean {
    return this.synced;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.pendingFileCallbacks.clear();
    this.syncedFiles.clear();
    this.doc.destroy();
  }
}
