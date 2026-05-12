/**
 * Shared constants for sandbox profile catalog.
 *
 * Security lists (syscall denies, network floors, blocked packages,
 * profile network allowlists) are now stored in the
 * `sandbox_system_rules` table (Migration 080) and loaded via
 * `../system-rules.ts`. Manage them through `doable admin` CLI/TUI.
 *
 * This file retains only non-security constants (unit helpers, paths).
 */

export const MB = 1024 * 1024;
export const GB = 1024 * MB;

export const NPM_CACHE_DIR = process.env.NPM_CACHE_DIR ?? "/var/cache/doable/npm";
