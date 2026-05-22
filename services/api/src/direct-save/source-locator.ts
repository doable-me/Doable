/**
 * Source Locator
 *
 * Uses ts-morph to find the JSX element at a given (line, col) in a TSX file.
 * Walks up the AST from the position to locate the nearest JSX opening or
 * self-closing element.
 */

import {
  Project,
  SourceFile,
  Node,
  SyntaxKind,
  JsxOpeningElement,
  JsxSelfClosingElement,
  JsxElement,
} from "ts-morph";
import type { SourceLocation } from "./types.js";

export interface LocatedElement {
  /** The JsxOpeningElement or JsxSelfClosingElement at the position */
  element: JsxOpeningElement | JsxSelfClosingElement;
  /** The parent JsxElement (for opening elements) or the self-closing element itself */
  parent: JsxElement | JsxSelfClosingElement;
  /** The source file containing the element */
  sourceFile: SourceFile;
  /** The ts-morph Project (caller must save when done) */
  project: Project;
}

/**
 * Create a ts-morph Project configured for TSX/JSX files.
 */
export function createProject(): Project {
  return new Project({
    compilerOptions: {
      jsx: 2, // JsxEmit.React
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
    },
    useInMemoryFileSystem: false,
  });
}

/**
 * Find the JSX element at the given source location.
 *
 * Walks up from the node at (line, col) until it finds a JsxOpeningElement
 * or JsxSelfClosingElement. Returns both the element and its parent so
 * callers can inspect children, attributes, etc.
 */
export function locateElement(
  project: Project,
  filePath: string,
  location: SourceLocation,
): LocatedElement {
  const sourceFile = project.addSourceFileAtPath(filePath);

  // ts-morph uses 1-based lines; convert (line, col) to a 0-based position offset
  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(
    location.line - 1,
    location.col,
  );

  // Get the most specific (deepest) node at this position
  const nodeAtPos = sourceFile.getDescendantAtPos(pos);
  if (!nodeAtPos) {
    throw new Error(
      `No AST node found at ${location.file}:${location.line}:${location.col}`,
    );
  }

  // Walk up to find the nearest JSX element
  let current: Node | undefined = nodeAtPos;
  while (current) {
    if (Node.isJsxOpeningElement(current)) {
      const parent = current.getParent();
      if (parent && Node.isJsxElement(parent)) {
        return { element: current, parent, sourceFile, project };
      }
    }
    if (Node.isJsxSelfClosingElement(current)) {
      return { element: current, parent: current, sourceFile, project };
    }
    // Also check if we're inside a JsxElement (e.g. on a text child)
    if (Node.isJsxElement(current)) {
      const opening = current.getOpeningElement();
      return { element: opening, parent: current, sourceFile, project };
    }
    current = current.getParent();
  }

  throw new Error(
    `No JSX element found at or near ${location.file}:${location.line}:${location.col}`,
  );
}
