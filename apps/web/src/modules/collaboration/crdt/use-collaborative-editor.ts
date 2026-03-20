"use client";

import { useEffect, useRef } from "react";
import type { YjsWsProvider } from "./yjs-provider";

/**
 * Hook that binds a Yjs Y.Text to a Monaco editor for collaborative editing.
 * Uses y-monaco for the binding.
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

    // Seed the Y.Text with file content if empty
    if (initialContent !== null) {
      yjsProvider.initFileContent(filePath, initialContent);
    }

    // Create Monaco binding using y-monaco
    const yText = yjsProvider.getFileText(filePath);

    // Dynamic import to avoid SSR issues
    import("y-monaco").then(({ MonacoBinding }) => {
      if (!editorInstance || bindingRef.current) return;

      const model = editorInstance.getModel();
      if (!model) return;

      bindingRef.current = new MonacoBinding(
        yText,
        model,
        new Set([editorInstance]),
      );
    }).catch(err => {
      console.warn("[yjs] Failed to create Monaco binding:", err);
    });

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [yjsProvider, editorInstance, filePath, initialContent, isCollaborating]);
}
