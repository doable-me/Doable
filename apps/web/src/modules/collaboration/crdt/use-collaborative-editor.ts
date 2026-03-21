"use client";

import { useEffect, useRef, useCallback } from "react";
import type { YjsWsProvider } from "./yjs-provider";

/**
 * Hook that binds a Yjs Y.Text to a Monaco editor for collaborative editing.
 * Uses y-monaco for the binding with awareness support for cursors.
 */
export function useCollaborativeEditor(
  yjsProvider: YjsWsProvider | null,
  editorInstance: any, // Monaco IStandaloneCodeEditor
  filePath: string | null,
  initialContent: string | null,
  isCollaborating: boolean,
) {
  const bindingRef = useRef<any>(null);
  const prevFileRef = useRef<string | null>(null);

  useEffect(() => {
    if (!yjsProvider || !editorInstance || !filePath || !isCollaborating) {
      // Clean up any existing binding
      bindingRef.current?.destroy();
      bindingRef.current = null;
      return;
    }

    // Clean up previous binding if file changed
    if (prevFileRef.current !== filePath) {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    }
    prevFileRef.current = filePath;

    // Request file sync from server, then set up binding
    const setup = async () => {
      try {
        // Sync the specific file from server (loads content from disk if needed)
        await yjsProvider.syncFile(filePath);

        // Seed the Y.Text with file content if still empty after sync
        if (initialContent !== null) {
          yjsProvider.initFileContent(filePath, initialContent);
        }

        // Create Monaco binding using y-monaco
        const yText = yjsProvider.getFileText(filePath);

        const { MonacoBinding } = await import("y-monaco");

        if (!editorInstance || bindingRef.current) return;

        const model = editorInstance.getModel();
        if (!model) return;

        bindingRef.current = new MonacoBinding(
          yText,
          model,
          new Set([editorInstance]),
          // Awareness will be added when y-monaco supports it
          // For now, cursor sync is handled by our custom cursor system
        );
      } catch (err) {
        console.warn("[yjs] Failed to create Monaco binding:", err);
      }
    };

    setup();

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [yjsProvider, editorInstance, filePath, initialContent, isCollaborating]);
}

/**
 * Hook to check if a file is being collaboratively edited
 * and whether changes should go through CRDT.
 */
export function useIsCollaborativeFile(
  yjsProvider: YjsWsProvider | null,
  filePath: string | null,
): boolean {
  return yjsProvider !== null && filePath !== null;
}
