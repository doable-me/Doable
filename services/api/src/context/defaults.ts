export type { ContextFileDefinition } from "./defaults-core.js";
import { DEFAULT_CONTEXT_FILES as CORE_FILES, type ContextFileDefinition } from "./defaults-core.js";
import { EXTENDED_CONTEXT_FILES } from "./defaults-extended.js";

/** Combined context files — all P0 through P3 */  
export const DEFAULT_CONTEXT_FILES = [...CORE_FILES, ...EXTENDED_CONTEXT_FILES];

export const CONTEXT_FILE_MAP = new Map(
  DEFAULT_CONTEXT_FILES.map((f) => [f.filename, f])
);

/** All valid context filenames */
export const VALID_CONTEXT_FILENAMES = DEFAULT_CONTEXT_FILES.map((f) => f.filename);

/** Filenames that are always included in the AI prompt */
export const ALWAYS_INCLUDE_FILES = DEFAULT_CONTEXT_FILES
  .filter((f) => f.alwaysInclude)
  .map((f) => f.filename);

/** File definitions grouped by category */
export const CONTEXT_FILES_BY_CATEGORY = DEFAULT_CONTEXT_FILES.reduce(
  (acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category]!.push(f);
    return acc;
  },
  {} as Record<string, ContextFileDefinition[]>
);
