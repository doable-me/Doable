/**
 * Lightweight RBAC over PGlite `_doable_roles` / `_doable_role_members`.
 */

import type { RoleRecord } from "@doable/runtime";
import { runOnProject } from "../../data-worker/pool.js";
import { ensureRuntimeAppTables } from "../cdc/outbox.js";

export async function listRoles(projectId: string): Promise<RoleRecord[]> {
  await ensureRuntimeAppTables(projectId);
  const resp = await runOnProject(projectId, {
    op: "query",
    sql: `SELECT id::text, name, permissions FROM _doable_roles ORDER BY name`,
  });
  if (!resp.ok) return [];
  return (resp.rows ?? []).map((r) => {
    const row = r as { id: string; name: string; permissions: unknown };
    const perms = Array.isArray(row.permissions)
      ? (row.permissions as string[])
      : typeof row.permissions === "string"
        ? (JSON.parse(row.permissions) as string[])
        : [];
    return { id: row.id, name: row.name, permissions: perms };
  });
}

export async function createRole(
  projectId: string,
  name: string,
  permissions: string[] = [],
): Promise<RoleRecord> {
  await ensureRuntimeAppTables(projectId);
  const resp = await runOnProject(projectId, {
    op: "query",
    sql: `INSERT INTO _doable_roles (name, permissions)
          VALUES ($1, $2::jsonb)
          RETURNING id::text, name, permissions`,
    params: [name, JSON.stringify(permissions)],
  });
  if (!resp.ok || !resp.rows?.[0]) {
    throw new Error(resp.ok ? "createRole failed" : resp.error.message);
  }
  const row = resp.rows[0] as { id: string; name: string; permissions: unknown };
  const perms = Array.isArray(row.permissions)
    ? (row.permissions as string[])
    : (JSON.parse(String(row.permissions)) as string[]);
  return { id: row.id, name: row.name, permissions: perms };
}

async function roleIdByName(projectId: string, roleName: string): Promise<string | null> {
  const resp = await runOnProject(projectId, {
    op: "query",
    sql: `SELECT id::text FROM _doable_roles WHERE name = $1 LIMIT 1`,
    params: [roleName],
  });
  if (!resp.ok || !resp.rows?.[0]) return null;
  return (resp.rows[0] as { id: string }).id;
}

export async function assignRole(
  projectId: string,
  userId: string,
  roleName: string,
): Promise<void> {
  await ensureRuntimeAppTables(projectId);
  const roleId = await roleIdByName(projectId, roleName);
  if (!roleId) throw new Error(`Unknown role: ${roleName}`);
  await runOnProject(projectId, {
    op: "query",
    sql: `INSERT INTO _doable_role_members (user_id, role_id)
          VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`,
    params: [userId, roleId],
  });
}

export async function revokeRole(
  projectId: string,
  userId: string,
  roleName: string,
): Promise<void> {
  await ensureRuntimeAppTables(projectId);
  const roleId = await roleIdByName(projectId, roleName);
  if (!roleId) return;
  await runOnProject(projectId, {
    op: "query",
    sql: `DELETE FROM _doable_role_members WHERE user_id = $1 AND role_id = $2::uuid`,
    params: [userId, roleId],
  });
}

export async function hasPermission(
  projectId: string,
  userId: string,
  permission: string,
): Promise<boolean> {
  await ensureRuntimeAppTables(projectId);
  const resp = await runOnProject(projectId, {
    op: "query",
    sql: `SELECT r.permissions
          FROM _doable_role_members m
          JOIN _doable_roles r ON r.id = m.role_id
          WHERE m.user_id = $1`,
    params: [userId],
  });
  if (!resp.ok) return false;
  for (const row of resp.rows ?? []) {
    const permsRaw = (row as { permissions: unknown }).permissions;
    const perms = Array.isArray(permsRaw)
      ? (permsRaw as string[])
      : typeof permsRaw === "string"
        ? (JSON.parse(permsRaw) as string[])
        : [];
    if (perms.includes("*") || perms.includes(permission)) return true;
  }
  return false;
}
