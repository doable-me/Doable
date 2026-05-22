/**
 * AST Transformer
 *
 * The orchestrator for direct-save. Takes a file path, source location,
 * and array of changes, then applies them precisely using ts-morph AST
 * manipulation. Text changes use the text-resolver, style changes use
 * the class-modifier.
 */

import { join } from "node:path";
import { createProject, locateElement } from "./source-locator.js";
import { resolveText, applyTextChange } from "./text-resolver.js";
import { modifyClasses } from "./class-modifier.js";
import type {
  SourceLocation,
  DirectSaveChange,
  ChangeResult,
  DirectSaveResponse,
} from "./types.js";

/**
 * Apply a set of direct-save changes to a source file.
 *
 * @param projectPath - Absolute path to the project root
 * @param location    - Source file + line/col identifying the JSX element
 * @param changes     - Array of text and/or style changes to apply
 * @returns           - Results for each change (success/failure with reasons)
 */
export async function applyDirectSave(
  projectPath: string,
  location: SourceLocation,
  changes: DirectSaveChange[],
): Promise<DirectSaveResponse> {
  const filePath = join(projectPath, location.file);
  const results: ChangeResult[] = [];

  // Create a ts-morph project and locate the element once
  const project = createProject();
  let locatedElement;
  try {
    locatedElement = locateElement(project, filePath, location);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // All changes fail if we can't locate the element
    for (const change of changes) {
      results.push({
        type: change.type,
        property: change.property,
        success: false,
        reason: `Element location failed: ${reason}`,
      });
    }
    return {
      success: false,
      file: location.file,
      applied: results,
      failedCount: changes.length,
    };
  }

  const { element, parent, sourceFile } = locatedElement;

  // Apply each change
  for (const change of changes) {
    try {
      if (change.type === "text") {
        const result = applyTextChangeToElement(change, parent, sourceFile);
        results.push(result);
      } else if (change.type === "style") {
        const result = applyStyleChangeToElement(change, element);
        results.push(result);
      } else {
        results.push({
          type: change.type,
          success: false,
          reason: `Unknown change type: ${change.type}`,
        });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      results.push({
        type: change.type,
        property: change.property,
        success: false,
        reason,
      });
    }
  }

  // Save the file (ts-morph preserves formatting)
  const hasAnySuccess = results.some((r) => r.success);
  if (hasAnySuccess) {
    await sourceFile.save();
  }

  const failedCount = results.filter((r) => !r.success).length;

  return {
    success: failedCount === 0,
    file: location.file,
    applied: results,
    failedCount,
  };
}

// ─── Internal Helpers ──────────────────────────────────────

/**
 * Apply a text change to the located JSX element.
 */
function applyTextChangeToElement(
  change: DirectSaveChange,
  parent: ReturnType<typeof locateElement>["parent"],
  sourceFile: ReturnType<typeof locateElement>["sourceFile"],
): ChangeResult {
  if (!change.oldText || !change.newText) {
    return {
      type: "text",
      success: false,
      reason: "Text changes require both oldText and newText",
    };
  }

  if (change.oldText === change.newText) {
    return {
      type: "text",
      success: true,
      reason: "No change needed (old and new text are identical)",
    };
  }

  const resolved = resolveText(parent, change.oldText, sourceFile);
  if (!resolved) {
    return {
      type: "text",
      success: false,
      reason: `Could not find text "${change.oldText}" in the JSX element`,
    };
  }

  applyTextChange(resolved, change.oldText, change.newText);

  return {
    type: "text",
    success: true,
  };
}

/**
 * Apply a style change to the located JSX element.
 */
function applyStyleChangeToElement(
  change: DirectSaveChange,
  element: ReturnType<typeof locateElement>["element"],
): ChangeResult {
  if (!change.property || !change.value) {
    return {
      type: "style",
      property: change.property,
      success: false,
      reason: "Style changes require both property and value",
    };
  }

  const result = modifyClasses(element, change.property, change.value);

  return {
    type: "style",
    property: change.property,
    success: result.success,
    reason: result.reason,
  };
}
