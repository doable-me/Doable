"use client";

import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount, type OnChange } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useDarkMode } from "@/hooks/use-dark-mode";

// ─── Language mapping ────────────────────────────────────────
function toMonacoLanguage(language: string): string {
  const map: Record<string, string> = {
    typescript: "typescript",
    tsx: "typescript",
    javascript: "javascript",
    jsx: "javascript",
    css: "css",
    html: "html",
    json: "json",
    markdown: "markdown",
    yaml: "yaml",
    python: "python",
    sql: "sql",
    shell: "shell",
    env: "plaintext",
    plaintext: "plaintext",
  };
  return map[language] ?? "plaintext";
}

// ─── Props ───────────────────────────────────────────────────
export interface MonacoEditorWrapperProps {
  value: string;
  language: string;
  filePath?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  showMinimap?: boolean;
  onEditorMount?: (editor: MonacoEditor.IStandaloneCodeEditor) => void;
  onCursorChange?: (line: number, column: number) => void;
}

export function MonacoEditorWrapper({
  value,
  language,
  filePath,
  readOnly = false,
  onChange,
  onSave,
  showMinimap = false,
  onEditorMount,
  onCursorChange,
}: MonacoEditorWrapperProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const valueRef = useRef(value);
  const { isDark } = useDarkMode();

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      // Configure TypeScript/JSX support
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.Latest,
        allowNonTsExtensions: true,
        moduleResolution:
          monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
        allowJs: true,
        esModuleInterop: true,
        strict: true,
      });

      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });

      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.Latest,
        allowNonTsExtensions: true,
        jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
        allowJs: true,
      });

      // Ctrl+S / Cmd+S to save
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSave?.(editor.getValue());
      });

      // Expose the editor instance to parent
      onEditorMount?.(editor);

      // Notify parent of cursor position changes
      editor.onDidChangeCursorPosition((e: any) => {
        onCursorChange?.(e.position.lineNumber, e.position.column);
      });

      // Focus the editor
      editor.focus();
    },
    [onSave, onEditorMount, onCursorChange],
  );

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (newValue !== undefined) {
        valueRef.current = newValue;
        onChange?.(newValue);
      }
    },
    [onChange],
  );

  const monacoLanguage = toMonacoLanguage(language);

  // Determine the file URI path for Monaco model association
  const path = filePath
    ? filePath.replace(/\\/g, "/")
    : undefined;

  return (
    <Editor
      height="100%"
      language={monacoLanguage}
      value={value}
      path={path}
      theme={isDark ? "vs-dark" : "vs"}
      onChange={handleChange}
      onMount={handleMount}
      options={{
        readOnly,
        minimap: { enabled: showMinimap },
        fontSize: 13,
        lineHeight: 20,
        fontFamily:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
        fontLigatures: true,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: "off",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
        autoClosingBrackets: "always",
        autoClosingQuotes: "always",
        autoIndent: "full",
        formatOnPaste: true,
        formatOnType: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        padding: { top: 8, bottom: 8 },
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
          useShadows: false,
        },
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        renderLineHighlight: "line",
        contextmenu: true,
        mouseWheelZoom: true,
      }}
      loading={
        <div className="flex h-full items-center justify-center bg-card">
          <div className="flex flex-col items-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-brand-400" />
            <span className="text-xs text-muted-foreground">Loading editor...</span>
          </div>
        </div>
      }
    />
  );
}
