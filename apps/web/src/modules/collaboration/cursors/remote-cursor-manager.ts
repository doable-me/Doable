/**
 * Manages Monaco editor decorations for remote user cursors.
 * Each remote cursor is a colored vertical line with a name label.
 */
export class RemoteCursorManager {
  private editor: any; // Monaco IStandaloneCodeEditor
  private decorationIds: string[] = [];
  private styleEl: HTMLStyleElement | null = null;
  private injectedColors = new Set<string>();

  constructor(editor: any) {
    this.editor = editor;
  }

  updateCursors(
    cursors: Map<
      string,
      {
        userId: string;
        displayName: string;
        color: string;
        filePath: string;
        line: number;
        column: number;
      }
    >,
    currentFilePath: string
  ): void {
    if (!this.editor) return;

    const decorations: any[] = [];

    for (const [, cursor] of cursors) {
      if (cursor.filePath !== currentFilePath) continue;

      const safeId = this.safeCssId(cursor.userId);
      this.ensureColorClass(cursor.color, safeId, cursor.displayName);

      decorations.push({
        range: {
          startLineNumber: cursor.line,
          startColumn: cursor.column,
          endLineNumber: cursor.line,
          endColumn: cursor.column + 1,
        },
        options: {
          className: `remote-cursor-${safeId}`,
          beforeContentClassName: `remote-cursor-label-${safeId}`,
          stickiness: 1, // NeverGrowsWhenTypingAtEdges
        },
      });
    }

    this.decorationIds = this.editor.deltaDecorations(
      this.decorationIds,
      decorations
    );
  }

  private safeCssId(userId: string): string {
    return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private ensureColorClass(
    color: string,
    safeId: string,
    displayName: string
  ): void {
    if (this.injectedColors.has(safeId)) return;
    this.injectedColors.add(safeId);

    if (!this.styleEl) {
      this.styleEl = document.createElement("style");
      this.styleEl.id = "remote-cursors-styles";
      document.head.appendChild(this.styleEl);
    }

    // Escape displayName for CSS content
    const escapedName = displayName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    this.styleEl.textContent += `
      .remote-cursor-${safeId} {
        border-left: 2px solid ${color} !important;
        position: relative;
      }
      .remote-cursor-label-${safeId}::before {
        content: "${escapedName}";
        position: absolute;
        top: -18px;
        left: -2px;
        padding: 1px 4px;
        background: ${color};
        color: #fff;
        font-size: 10px;
        line-height: 14px;
        font-family: sans-serif;
        border-radius: 2px;
        white-space: nowrap;
        pointer-events: none;
        z-index: 100;
      }
    `;
  }

  dispose(): void {
    if (this.editor && this.decorationIds.length) {
      this.editor.deltaDecorations(this.decorationIds, []);
    }
    this.styleEl?.remove();
    this.decorationIds = [];
    this.injectedColors.clear();
  }
}
