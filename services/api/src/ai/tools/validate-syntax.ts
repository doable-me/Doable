/**
 * Lightweight syntax validation for files written by the AI via
 * `create_file` / `edit_file`. Catches common LLM mistakes (unbalanced
 * braces, bare JSX outside a function, malformed JSON) BEFORE the file
 * hits disk and the Vite dev server, so the model gets immediate
 * feedback in the same tool call instead of waiting for the post-stream
 * preview-error auto-fix loop.
 *
 * Uses the TypeScript compiler API (already a dep) — no new packages.
 */

import ts from "typescript";

export interface SyntaxCheckResult {
  ok: boolean;
  /** Human-readable error message (only set when ok=false). */
  message?: string;
}

/** File extensions we know how to validate. */
const TS_LIKE = new Set([".ts", ".tsx", ".mts", ".cts"]);
const JS_LIKE = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const JSON_LIKE = new Set([".json"]);

function getExt(path: string): string {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
}

/**
 * Validate the given file content. Returns `{ ok: true }` for unsupported
 * file types so unrelated content (markdown, css, html, binary) passes
 * through unchanged.
 */
export function validateFileSyntax(path: string, content: string): SyntaxCheckResult {
  // Skip empty files — valid by definition.
  if (content.length === 0) return { ok: true };

  // Cap on size — don't spend CPU parsing megabyte-scale generated files.
  if (content.length > 512 * 1024) return { ok: true };

  const ext = getExt(path);

  if (JSON_LIKE.has(ext)) {
    try {
      JSON.parse(content);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: `Invalid JSON: ${(err as Error).message}`,
      };
    }
  }

  if (TS_LIKE.has(ext) || JS_LIKE.has(ext)) {
    const isTsx = ext === ".tsx";
    const isJsx = ext === ".jsx";
    const scriptKind = isTsx
      ? ts.ScriptKind.TSX
      : isJsx
        ? ts.ScriptKind.JSX
        : TS_LIKE.has(ext)
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS;

    const sourceFile = ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      scriptKind,
    );

    // `parseDiagnostics` is internal but stable — exposed via the
    // SourceFile object. Cast through unknown to access it.
    const diagnostics = (sourceFile as unknown as { parseDiagnostics?: ts.DiagnosticWithLocation[] })
      .parseDiagnostics;

    if (diagnostics && diagnostics.length > 0) {
      // Surface the first diagnostic — that's almost always the
      // actionable one. Subsequent diagnostics tend to be cascading.
      const first = diagnostics[0]!;
      const message = ts.flattenDiagnosticMessageText(first.messageText, "\n");
      const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, first.start ?? 0);
      return {
        ok: false,
        message: `${message} (line ${line + 1}, col ${character + 1})`,
      };
    }

    // TypeScript's parser is lenient about constructs that are technically
    // legal in a script context but always wrong in a project source file
    // (which is module-scoped). Catch the most common LLM mistake: a bare
    // `return (...)` JSX expression at the top level instead of inside a
    // function component.
    for (const stmt of sourceFile.statements) {
      if (stmt.kind === ts.SyntaxKind.ReturnStatement) {
        const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, stmt.getStart(sourceFile));
        return {
          ok: false,
          message:
            `Top-level 'return' statement is not allowed. ` +
            `Wrap it in a function (e.g. 'export default function App() { return ... }'). ` +
            `(line ${line + 1}, col ${character + 1})`,
        };
      }
    }

    return { ok: true };
  }

  // Unknown extension — pass through.
  return { ok: true };
}
