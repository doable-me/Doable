/**
 * Class Modifier
 *
 * Modifies className / Tailwind classes on a JSX element.
 * Handles several patterns for className values:
 *   - String literal:     className="flex items-center"
 *   - Template literal:   className={`flex ${dynamic}`}
 *   - cn() call:          className={cn("flex items-center", props.className)}
 *   - Ternary:            className={active ? "bg-blue-500" : "bg-gray-500"}
 */

import {
  Node,
  SyntaxKind,
  JsxOpeningElement,
  JsxSelfClosingElement,
  JsxAttribute,
  StringLiteral,
} from "ts-morph";
import { cssToTailwind, getTailwindPropertyGroup } from "./tailwind-mapper.js";

export interface ClassModifyResult {
  success: boolean;
  reason?: string;
  oldClasses?: string;
  newClasses?: string;
}

/**
 * Apply a style change to a JSX element by modifying its Tailwind classes.
 *
 * Given a CSS property (camelCase) and a target value, this function:
 * 1. Converts the CSS property+value to a Tailwind class via tailwind-mapper
 * 2. Finds the className attribute on the element
 * 3. Removes any existing classes for the same property group
 * 4. Adds the new Tailwind class
 */
export function modifyClasses(
  element: JsxOpeningElement | JsxSelfClosingElement,
  property: string,
  value: string,
): ClassModifyResult {
  // Convert CSS property + value to a Tailwind class
  const tailwindClass = cssToTailwind(property, value);
  if (!tailwindClass) {
    return {
      success: false,
      reason: `Cannot convert CSS property "${property}: ${value}" to a Tailwind class`,
    };
  }

  // Get the property group so we can replace conflicting classes
  const propertyGroup = getTailwindPropertyGroup(property);

  // Find the className attribute
  const classAttr = findClassNameAttribute(element);

  if (!classAttr) {
    // No className attribute exists — add one
    addClassNameAttribute(element, tailwindClass);
    return {
      success: true,
      oldClasses: "",
      newClasses: tailwindClass,
    };
  }

  // Get the initializer (the value part of className="...")
  const initializer = classAttr.getInitializer();

  if (!initializer) {
    // className with no value — replace with our class
    classAttr.setInitializer(`"${tailwindClass}"`);
    return {
      success: true,
      oldClasses: "",
      newClasses: tailwindClass,
    };
  }

  // Case 1: String literal — className="flex items-center gap-2"
  if (Node.isStringLiteral(initializer)) {
    return modifyStringLiteralClasses(initializer, tailwindClass, propertyGroup);
  }

  // Case 2: JsxExpression — className={...}
  if (Node.isJsxExpression(initializer)) {
    const expr = initializer.getExpression();
    if (!expr) {
      return { success: false, reason: "Empty className expression" };
    }

    // Case 2a: Template literal — className={`flex ${var}`}
    if (Node.isTemplateExpression(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
      return modifyTemplateLiteralClasses(expr, tailwindClass, propertyGroup);
    }

    // Case 2b: String literal inside expression — className={"flex items-center"}
    if (Node.isStringLiteral(expr)) {
      return modifyStringLiteralClasses(expr, tailwindClass, propertyGroup);
    }

    // Case 2c: Call expression — className={cn("flex", props.className)}
    if (Node.isCallExpression(expr)) {
      const args = expr.getArguments();
      if (args.length > 0) {
        const firstArg = args[0]!;
        // If the first argument is a string literal, modify it
        if (Node.isStringLiteral(firstArg)) {
          return modifyStringLiteralClasses(
            firstArg as StringLiteral,
            tailwindClass,
            propertyGroup,
          );
        }
      }
      // Can't safely modify complex call expression arguments
      return {
        success: false,
        reason: "Cannot modify complex className expression (non-string cn() argument)",
      };
    }

    // Case 2d: Conditional/ternary — too complex to safely modify
    return {
      success: false,
      reason: `Cannot modify className expression of kind: ${expr.getKindName()}`,
    };
  }

  return {
    success: false,
    reason: `Unsupported className initializer kind: ${initializer.getKindName()}`,
  };
}

// ─── Internal Helpers ──────────────────────────────────────

/**
 * Find the className or class attribute on a JSX element.
 */
function findClassNameAttribute(
  element: JsxOpeningElement | JsxSelfClosingElement,
): JsxAttribute | undefined {
  const attributes = element.getAttributes();
  for (const attr of attributes) {
    if (Node.isJsxAttribute(attr)) {
      const name = attr.getNameNode().getText();
      if (name === "className" || name === "class") {
        return attr;
      }
    }
  }
  return undefined;
}

/**
 * Add a className attribute to an element that doesn't have one.
 */
function addClassNameAttribute(
  element: JsxOpeningElement | JsxSelfClosingElement,
  className: string,
): void {
  element.addAttribute({
    name: "className",
    initializer: `"${className}"`,
  });
}

/**
 * Modify classes in a string literal (the most common case).
 * Replaces classes in the same property group, then appends the new class.
 */
function modifyStringLiteralClasses(
  node: StringLiteral,
  newClass: string,
  propertyGroup: string,
): ClassModifyResult {
  const oldValue = node.getLiteralValue();
  const classes = parseClasses(oldValue);

  // Remove classes that belong to the same property group
  const filtered = classes.filter(
    (cls) => !classMatchesGroup(cls, propertyGroup),
  );

  // Add the new class
  filtered.push(newClass);

  const newValue = filtered.join(" ");
  node.setLiteralValue(newValue);

  return {
    success: true,
    oldClasses: oldValue,
    newClasses: newValue,
  };
}

/**
 * Modify classes in a template literal.
 * Only handles no-substitution template literals and the head of template expressions.
 */
function modifyTemplateLiteralClasses(
  node: Node,
  newClass: string,
  propertyGroup: string,
): ClassModifyResult {
  if (Node.isNoSubstitutionTemplateLiteral(node)) {
    const oldValue = node.getLiteralValue();
    const classes = parseClasses(oldValue);
    const filtered = classes.filter(
      (cls) => !classMatchesGroup(cls, propertyGroup),
    );
    filtered.push(newClass);
    const newValue = filtered.join(" ");
    node.replaceWithText("`" + newValue + "`");
    return {
      success: true,
      oldClasses: oldValue,
      newClasses: newValue,
    };
  }

  if (Node.isTemplateExpression(node)) {
    // Modify only the head (static part before first ${...})
    const head = node.getHead();
    const headText = head.getLiteralText();
    const classes = parseClasses(headText);
    const filtered = classes.filter(
      (cls) => !classMatchesGroup(cls, propertyGroup),
    );
    filtered.push(newClass);
    const newValue = filtered.join(" ") + " ";

    // Replace the head text, preserving the template structure
    const fullText = node.getFullText();
    const headRawText = head.getFullText();
    // The head looks like: `text${  — we need to replace just the text part
    const updatedHead = "`" + newValue + "${";
    const rest = fullText.slice(headRawText.length);
    node.replaceWithText(updatedHead + rest);

    return {
      success: true,
      oldClasses: headText,
      newClasses: newValue.trim(),
    };
  }

  return {
    success: false,
    reason: "Unsupported template literal structure",
  };
}

/**
 * Parse a className string into individual class names.
 */
function parseClasses(classString: string): string[] {
  return classString
    .split(/\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Check if a Tailwind class belongs to a property group.
 *
 * Property groups are arrays of Tailwind prefix patterns. For example,
 * the "color" group might contain ["text-"]. A class like "text-red-500"
 * matches because it starts with "text-".
 *
 * Also handles exact matches for classes without a prefix value
 * (e.g., "flex", "block", "hidden").
 */
function classMatchesGroup(cls: string, group: string): boolean {
  const pattern = group;
  // Exact match
  if (cls === pattern) return true;
  // Prefix match (pattern ends with a dash like "text-")
  if (pattern.endsWith("-") && cls.startsWith(pattern)) return true;
  // Handle responsive/state prefixes: "md:text-red-500" -> strip prefix
  const withoutPrefix = cls.replace(/^[a-z]+:/, "");
  if (withoutPrefix === pattern) return true;
  if (pattern.endsWith("-") && withoutPrefix.startsWith(pattern)) return true;
  return false;
}
