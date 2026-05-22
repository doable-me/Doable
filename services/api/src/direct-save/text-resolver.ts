/**
 * Text Resolver
 *
 * Resolves text content inside a JSX element so it can be modified.
 * Handles several patterns:
 *   - Literal JSX text:      <p>Hello world</p>
 *   - String in expression:  <p>{"Hello world"}</p>
 *   - Const variable:        const msg = "Hello"; ... <p>{msg}</p>
 *   - Object property:       const t = { title: "Hi" }; ... <p>{t.title}</p>
 */

import {
  Node,
  SyntaxKind,
  JsxElement,
  JsxSelfClosingElement,
  JsxText,
  StringLiteral,
  NoSubstitutionTemplateLiteral,
  SourceFile,
} from "ts-morph";

export interface ResolvedText {
  /** The AST node whose text value can be replaced */
  node: JsxText | StringLiteral | NoSubstitutionTemplateLiteral;
  /** The current text value (trimmed for JsxText) */
  currentValue: string;
  /** Whether this is a JsxText node (needs whitespace awareness) */
  isJsxText: boolean;
}

/**
 * Find all text-bearing children of a JSX element.
 * Returns an array of resolvable text nodes.
 */
export function findTextNodes(
  parent: JsxElement | JsxSelfClosingElement,
  sourceFile: SourceFile,
): ResolvedText[] {
  // Self-closing elements have no children (e.g. <img />)
  if (Node.isJsxSelfClosingElement(parent)) {
    return [];
  }

  const results: ResolvedText[] = [];
  const children = parent.getJsxChildren();

  for (const child of children) {
    // Case 1: Literal JSX text — <p>Hello world</p>
    if (Node.isJsxText(child)) {
      const text = child.getLiteralText().trim();
      if (text.length > 0) {
        results.push({
          node: child,
          currentValue: text,
          isJsxText: true,
        });
      }
      continue;
    }

    // Case 2: JsxExpression — <p>{"text"}</p> or <p>{variable}</p>
    if (Node.isJsxExpression(child)) {
      const expr = child.getExpression();
      if (!expr) continue;

      // Case 2a: String literal in expression — <p>{"Hello"}</p>
      if (Node.isStringLiteral(expr)) {
        results.push({
          node: expr,
          currentValue: expr.getLiteralValue(),
          isJsxText: false,
        });
        continue;
      }

      // Case 2b: Template literal (no substitutions) — <p>{`Hello`}</p>
      if (Node.isNoSubstitutionTemplateLiteral(expr)) {
        results.push({
          node: expr,
          currentValue: expr.getLiteralValue(),
          isJsxText: false,
        });
        continue;
      }

      // Case 2c: Identifier reference — <p>{msg}</p>
      if (Node.isIdentifier(expr)) {
        const resolved = resolveIdentifierToString(expr, sourceFile);
        if (resolved) {
          results.push(resolved);
        }
        continue;
      }

      // Case 2d: Property access — <p>{t.title}</p>
      if (Node.isPropertyAccessExpression(expr)) {
        const resolved = resolvePropertyAccessToString(expr, sourceFile);
        if (resolved) {
          results.push(resolved);
        }
        continue;
      }
    }
  }

  return results;
}

/**
 * Find the text node that matches `oldText` and return it for modification.
 * Returns null if no matching text is found.
 */
export function resolveText(
  parent: JsxElement | JsxSelfClosingElement,
  oldText: string,
  sourceFile: SourceFile,
): ResolvedText | null {
  const textNodes = findTextNodes(parent, sourceFile);

  // Exact match first
  for (const resolved of textNodes) {
    if (resolved.currentValue === oldText) {
      return resolved;
    }
  }

  // Trimmed match (handles whitespace differences)
  const trimmedOld = oldText.trim();
  for (const resolved of textNodes) {
    if (resolved.currentValue.trim() === trimmedOld) {
      return resolved;
    }
  }

  // Substring/contains match (the element text might include more than the selected text)
  for (const resolved of textNodes) {
    if (resolved.currentValue.includes(trimmedOld)) {
      return resolved;
    }
  }

  // Fallback: return the first text node regardless of text match.
  // The source location is precise (from data-source attribute), so
  // we know we have the right element. The oldText may be stale
  // (DOM text after live edit, or after a previous save).
  if (textNodes.length > 0) {
    return textNodes[0]!;
  }

  return null;
}

/**
 * Apply a text replacement to the resolved text node.
 */
export function applyTextChange(
  resolved: ResolvedText,
  oldText: string,
  newText: string,
): void {
  if (resolved.isJsxText) {
    // For JsxText nodes, preserve surrounding whitespace
    const jsxText = resolved.node as JsxText;
    const fullText = jsxText.getFullText();
    // Preserve leading/trailing whitespace, replace all text content
    const leadingWs = fullText.match(/^(\s*)/)?.[1] ?? "";
    const trailingWs = fullText.match(/(\s*)$/)?.[1] ?? "";
    jsxText.replaceWithText(leadingWs + newText + trailingWs);
  } else if (Node.isStringLiteral(resolved.node)) {
    // For string literals, set the literal value directly to newText
    resolved.node.setLiteralValue(newText);
  } else if (Node.isNoSubstitutionTemplateLiteral(resolved.node)) {
    // For template literals, replace the text in the full source
    const current = resolved.node.getLiteralValue();
    const trimmedOld = oldText.trim();
    if (current.includes(trimmedOld)) {
      const updated = current.replace(trimmedOld, newText);
      resolved.node.replaceWithText("`" + updated + "`");
    } else {
      resolved.node.replaceWithText("`" + newText + "`");
    }
  }
}

// ─── Internal Helpers ──────────────────────────────────────

/**
 * Resolve an identifier to a string literal in its declaration.
 * Handles: const msg = "Hello";
 */
function resolveIdentifierToString(
  identifier: Node,
  sourceFile: SourceFile,
): ResolvedText | null {
  if (!Node.isIdentifier(identifier)) return null;

  const definitions = identifier.getDefinitionNodes();
  for (const def of definitions) {
    // Variable declaration: const msg = "Hello"
    if (Node.isVariableDeclaration(def)) {
      const initializer = def.getInitializer();
      if (initializer && Node.isStringLiteral(initializer)) {
        return {
          node: initializer,
          currentValue: initializer.getLiteralValue(),
          isJsxText: false,
        };
      }
      if (initializer && Node.isNoSubstitutionTemplateLiteral(initializer)) {
        return {
          node: initializer,
          currentValue: initializer.getLiteralValue(),
          isJsxText: false,
        };
      }
    }
  }

  return null;
}

/**
 * Resolve a property access expression to a string literal.
 * Handles: const t = { title: "Hi" }; ... {t.title}
 */
function resolvePropertyAccessToString(
  propAccess: Node,
  sourceFile: SourceFile,
): ResolvedText | null {
  if (!Node.isPropertyAccessExpression(propAccess)) return null;

  const propName = propAccess.getName();
  const objectExpr = propAccess.getExpression();

  if (!Node.isIdentifier(objectExpr)) return null;

  const definitions = objectExpr.getDefinitionNodes();
  for (const def of definitions) {
    if (Node.isVariableDeclaration(def)) {
      const initializer = def.getInitializer();
      if (initializer && Node.isObjectLiteralExpression(initializer)) {
        const prop = initializer.getProperty(propName);
        if (prop && Node.isPropertyAssignment(prop)) {
          const value = prop.getInitializer();
          if (value && Node.isStringLiteral(value)) {
            return {
              node: value,
              currentValue: value.getLiteralValue(),
              isJsxText: false,
            };
          }
          if (value && Node.isNoSubstitutionTemplateLiteral(value)) {
            return {
              node: value,
              currentValue: value.getLiteralValue(),
              isJsxText: false,
            };
          }
        }
      }
    }
  }

  return null;
}
