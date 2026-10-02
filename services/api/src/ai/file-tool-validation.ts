/** Validate before path normalization, database access or filesystem effects.
 * Keep this protocol independent of user-facing translations. */
export function validateWriteArguments(args: unknown) {
  const value = args as Record<string, unknown> | null;
  if (!value || typeof value.path !== "string" || !value.path.trim() || typeof value.content !== "string") {
    return {
      success: false as const,
      code: "INVALID_FILE_ARGUMENTS" as const,
      effects: "none" as const,
      error: "No file was written. Supply a non-empty path and content as strings. If the previous output was truncated, split the implementation into smaller files and send complete arguments.",
    };
  }
  return null;
}

/** Only our file handlers can certify a rejected invocation had no effects.
 * Never infer safety from translated error messages or missing arguments. */
export function isRejectedFileWrite(name: string, result: unknown): boolean {
  if (name !== "create_file" && name !== "edit_file") return false;
  const matches = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    const r = value as Record<string, unknown>;
    return r.success === false && r.code === "INVALID_FILE_ARGUMENTS" && r.effects === "none";
  };
  if (matches(result)) return true;
  if (!result || typeof result !== "object") return false;
  const envelope = result as Record<string, unknown>;
  for (const payload of [envelope.content, envelope.detailedContent, envelope.textResultForLlm]) {
    if (matches(payload)) return true;
    if (typeof payload === "string") {
      try { if (matches(JSON.parse(payload))) return true; } catch { /* plain tool output */ }
    }
  }
  return false;
}
