"use client";

import { useRef, useCallback, useEffect } from "react";
import type { MonacoEditorWrapperProps } from "./monaco-editor-wrapper";
import { useCollaboration } from "@/modules/collaboration/collaboration-context";
import { RemoteCursorManager } from "@/modules/collaboration/cursors";

/**
 * Wraps MonacoEditorWrapper with live cursor sharing.
 * Must be rendered inside a CollaborationProvider.
 */
export interface CollaborativeMonacoWrapperProps extends MonacoEditorWrapperProps {
  /** The underlying MonacoEditorWrapper component (pass the dynamic import) */
  EditorComponent: React.ComponentType<MonacoEditorWrapperProps>;
}

export function CollaborativeMonacoWrapper({
  EditorComponent,
  filePath,
  ...rest
}: CollaborativeMonacoWrapperProps) {
  const { cursors, sendCursorMove } = useCollaboration();
  const cursorManagerRef = useRef<RemoteCursorManager | null>(null);

  const handleEditorMount = useCallback(
    (editor: any) => {
      cursorManagerRef.current?.dispose();
      cursorManagerRef.current = new RemoteCursorManager(editor);
      // Also call any parent onEditorMount
      rest.onEditorMount?.(editor);
    },
    [rest.onEditorMount]
  );

  const handleCursorChange = useCallback(
    (line: number, column: number) => {
      if (filePath) {
        sendCursorMove(filePath, line, column);
      }
      // Also call any parent onCursorChange
      rest.onCursorChange?.(line, column);
    },
    [filePath, sendCursorMove, rest.onCursorChange]
  );

  // Update remote cursor decorations when cursors or active file change
  useEffect(() => {
    if (cursorManagerRef.current && filePath) {
      cursorManagerRef.current.updateCursors(cursors, filePath);
    }
  }, [cursors, filePath]);

  // Clean up cursor manager on unmount
  useEffect(() => {
    return () => {
      cursorManagerRef.current?.dispose();
    };
  }, []);

  return (
    <EditorComponent
      {...rest}
      filePath={filePath}
      onEditorMount={handleEditorMount}
      onCursorChange={handleCursorChange}
    />
  );
}
