import * as Y from "yjs";

/**
 * Manages a Yjs document that syncs over the existing WebSocket connection.
 * No separate y-websocket server needed.
 */
export class YjsWsProvider {
  readonly doc: Y.Doc;
  private files: Y.Map<Y.Text>;
  private send: (msg: Record<string, unknown>) => void;
  private unsubscribe: (() => void) | null = null;
  private synced = false;

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
        Y.applyUpdate(this.doc, update);
        this.synced = true;
      }
      if (msg.type === "yjs:update") {
        const update = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0));
        Y.applyUpdate(this.doc, update);
      }
    });

    // Send local updates to server
    this.doc.on("update", (update: Uint8Array, origin: any) => {
      if (origin === "remote") return; // Don't echo back remote updates
      const encoded = btoa(String.fromCharCode(...update));
      this.send({ type: "yjs:update", data: encoded });
    });

    // Request initial sync
    this.send({ type: "yjs:sync-request" });
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
      yText.insert(0, content);
    }
  }

  get isSynced(): boolean {
    return this.synced;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.doc.destroy();
  }
}
