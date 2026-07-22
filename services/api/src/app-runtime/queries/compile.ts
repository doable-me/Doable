/**
 * Mustache-style SQL compiler: {{name}} → $N bind params.
 * Sections {{#name}}…{{/name}} / {{^name}}…{{/name}}.
 * Forbidden: {{{ident}}}, {{@ident}} (no raw identifier interpolation).
 */

import type { CompiledQuery } from "../types.js";

const FORBIDDEN = /\{\{\{\s*[\w.]+\s*\}\}\}|\{\{\s*@[\w.]+\s*\}\}/;
const SECTION_OPEN = /\{\{([#^])\s*([\w.]+)\s*\}\}/;
const SECTION_CLOSE = /\{\{\/\s*([\w.]+)\s*\}\}/;
const VAR = /\{\{\s*([\w.]+)\s*\}\}/g;

function isTruthy(v: unknown): boolean {
  if (v === undefined || v === null || v === false || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function getParam(params: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return params[path];
  const parts = path.split(".");
  let cur: unknown = params;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Expand conditional sections left-to-right (non-greedy innermost-friendly via recursion).
 */
function expandSections(src: string, params: Record<string, unknown>): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const openMatch = SECTION_OPEN.exec(src.slice(i));
    if (!openMatch || openMatch.index == null) {
      out += src.slice(i);
      break;
    }
    const absOpen = i + openMatch.index;
    out += src.slice(i, absOpen);
    const kind = openMatch[1] as "#" | "^";
    const name = openMatch[2]!;
    const afterOpen = absOpen + openMatch[0].length;

    // Find matching close for this name (nesting-aware for same name).
    let depth = 1;
    let j = afterOpen;
    let closeAt = -1;
    let closeLen = 0;
    while (j < src.length) {
      const rest = src.slice(j);
      const nextOpen = SECTION_OPEN.exec(rest);
      const nextClose = SECTION_CLOSE.exec(rest);
      const openIdx = nextOpen?.index ?? Infinity;
      const closeIdx = nextClose?.index ?? Infinity;
      if (closeIdx === Infinity && openIdx === Infinity) break;
      if (openIdx < closeIdx && nextOpen) {
        if (nextOpen[2] === name) depth++;
        j += nextOpen.index! + nextOpen[0].length;
        continue;
      }
      if (nextClose) {
        if (nextClose[1] === name) {
          depth--;
          if (depth === 0) {
            closeAt = j + nextClose.index!;
            closeLen = nextClose[0].length;
            break;
          }
        }
        j += nextClose.index! + nextClose[0].length;
        continue;
      }
      break;
    }
    if (closeAt < 0) {
      throw new Error(`Unclosed section {{${kind}${name}}}`);
    }
    const inner = src.slice(afterOpen, closeAt);
    const present = isTruthy(getParam(params, name));
    const include = kind === "#" ? present : !present;
    if (include) {
      out += expandSections(inner, params);
    }
    i = closeAt + closeLen;
  }
  return out;
}

export function compileMustacheSql(
  source: string,
  params: Record<string, unknown> = {},
): CompiledQuery {
  if (FORBIDDEN.test(source)) {
    throw new Error(
      "Forbidden Mustache form: raw identifier interpolation ({{{x}}} or {{@x}}) is not allowed",
    );
  }

  const expanded = expandSections(source, params);
  const values: unknown[] = [];
  const sqlText = expanded.replace(VAR, (_m, name: string) => {
    // Skip leftover section tags if any (shouldn't happen after expand)
    if (name.startsWith("#") || name.startsWith("^") || name.startsWith("/")) {
      throw new Error(`Unexpected section tag residue: {{${name}}}`);
    }
    values.push(getParam(params, name));
    return `$${values.length}`;
  });

  // Reject any remaining mustache that wasn't a simple var (malformed)
  if (/\{\{/.test(sqlText)) {
    throw new Error("Unparsed Mustache tokens remain in SQL after compile");
  }

  return { sqlText, values };
}

/** Validate that a query source can compile with empty params (syntax only). */
export function validateMustacheSyntax(source: string): { ok: true } | { ok: false; error: string } {
  try {
    if (FORBIDDEN.test(source)) {
      return { ok: false, error: "Forbidden {{{ }}} or {{@ }} forms" };
    }
    // Expand with all-true-ish dummy for required section structure check
    expandSections(source, {});
    // Replace vars with $1 placeholders without needing values
    const stripped = source
      .replace(SECTION_OPEN, "")
      .replace(SECTION_CLOSE, "")
      .replace(VAR, "NULL");
    if (FORBIDDEN.test(stripped)) {
      return { ok: false, error: "Forbidden forms" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
