/**
 * App end-user admin helpers (platform `app_end_users` table).
 */

import { sql } from "../../db/index.js";
import type { AuthUser } from "@doable/runtime";

async function ensureDisabledCol(): Promise<void> {
  await sql`ALTER TABLE app_end_users ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false`;
}

export async function listAppUsers(
  projectId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<AuthUser[]> {
  await ensureDisabledCol();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const rows = await sql<
    Array<{
      id: string;
      email: string;
      name: string | null;
      is_admin: boolean;
      disabled: boolean;
    }>
  >`
    SELECT id, email, name, is_admin, disabled
    FROM app_end_users
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    isAdmin: r.is_admin,
    disabled: r.disabled,
  }));
}

export async function getAppUser(
  projectId: string,
  id: string,
): Promise<AuthUser | null> {
  await ensureDisabledCol();
  const [r] = await sql<
    Array<{
      id: string;
      email: string;
      name: string | null;
      is_admin: boolean;
      disabled: boolean;
    }>
  >`
    SELECT id, email, name, is_admin, disabled
    FROM app_end_users
    WHERE project_id = ${projectId} AND id = ${id}
    LIMIT 1
  `;
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    isAdmin: r.is_admin,
    disabled: r.disabled,
  };
}

export async function updateAppUser(
  projectId: string,
  id: string,
  patch: Partial<{ name: string; email: string }>,
): Promise<AuthUser | null> {
  if (patch.name !== undefined) {
    await sql`
      UPDATE app_end_users SET name = ${patch.name}
      WHERE project_id = ${projectId} AND id = ${id}
    `;
  }
  if (patch.email !== undefined) {
    await sql`
      UPDATE app_end_users SET email = ${patch.email}
      WHERE project_id = ${projectId} AND id = ${id}
    `;
  }
  return getAppUser(projectId, id);
}

export async function setAppUserAdmin(
  projectId: string,
  id: string,
  isAdmin: boolean,
): Promise<void> {
  await sql`
    UPDATE app_end_users SET is_admin = ${isAdmin}
    WHERE project_id = ${projectId} AND id = ${id}
  `;
}

export async function setAppUserDisabled(
  projectId: string,
  id: string,
  disabled: boolean,
): Promise<void> {
  await ensureDisabledCol();
  await sql`
    UPDATE app_end_users SET disabled = ${disabled}
    WHERE project_id = ${projectId} AND id = ${id}
  `;
}
