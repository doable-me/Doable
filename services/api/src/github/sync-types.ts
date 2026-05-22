/**
 * GitHub sync shared types and database access.
 */

import { sql } from "../db/index.js";
import { githubQueries } from "@doable/db/queries/github.js";

export const db = githubQueries(sql);

// ─── Types ──────────────────────────────────────────────────

export type SyncDirection = "push" | "pull";
export type SyncStatusType =
  | "synced"
  | "ahead"
  | "behind"
  | "diverged"
  | "conflict"
  | "disconnected";

export interface SyncResult {
  direction: SyncDirection;
  commitSha: string;
  message: string;
  filesChanged: number;
}

export interface SyncStatus {
  connected: boolean;
  status: SyncStatusType;
  lastSyncedAt: string | null;
  repoUrl: string | null;
  branch: string;
  repoOwner: string | null;
  repoName: string | null;
  lastCommitSha: string | null;
  ahead?: number;
  behind?: number;
}

export interface ConflictInfo {
  hasConflict: boolean;
  conflictedFiles: string[];
  message: string;
}
