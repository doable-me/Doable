/**
 * Auto-provision a scoped API key on first publish.
 *
 * On publish, this module:
 * 1. Checks if a client-tier API key already exists for the project
 * 2. If not, scans the project source for MCP tool calls to determine which tools are used
 * 3. Creates a client-tier key scoped to exactly those tools + the published origin
 * 4. Stores the key as VITE_DOABLE_PROJECT_KEY env var so future builds include it
 *
 * This makes the whole security flow (tool-scoping, origin-binding) work
 * seamlessly without the project owner needing to manually configure anything.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "../db/index.js";
import { generateProjectApiKey } from "../routes/connector-proxy.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";

/**
 * Scan project source files for MCP tool calls and return list of tool names used.
 * Looks for patterns like:
 *   doable.mcp.call("mcp_hpca_mcp_get_custodians", ...)
 *   doable.mcp.call('mcp_hpca_mcp_get_custodians', ...)
 */
export async function detectUsedTools(projectDir: string): Promise<string[]> {
  const tools = new Set<string>();
  const srcDir = path.join(projectDir, "src");

  try {
    await scanDirectory(srcDir, tools);
  } catch {
    // src/ doesn't exist — scan root
    try {
      await scanDirectory(projectDir, tools);
    } catch {
      // no files to scan
    }
  }

  return Array.from(tools);
}

async function scanDirectory(dir: string, tools: Set<string>, depth = 0): Promise<void> {
  if (depth > 5) return; // prevent unbounded recursion

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(fullPath, tools, depth + 1);
    } else if (/\.(tsx?|jsx?|vue|svelte)$/.test(entry.name)) {
      try {
        const content = await readFile(fullPath, "utf-8");
        // Match doable.mcp.call("tool_name" or 'tool_name'
        const mcpCallRegex = /\.mcp\.call\(\s*["'`]([^"'`]+)["'`]/g;
        let match;
        while ((match = mcpCallRegex.exec(content)) !== null) {
          tools.add(match[1]!);
        }
        // Also match integrations.run("integration_id", "action_name")
        const intRegex = /\.integrations\.run\(\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g;
        while ((match = intRegex.exec(content)) !== null) {
          tools.add(`${match[1]!}/${match[2]!}`);
        }
        // Per-app database: reached via `import { db } from "@doable/data"` +
        // db.query()/db.schema(), NOT via .mcp.call(), so the patterns above miss
        // it. Without this a published app that uses BOTH the inbuilt DB and any
        // MCP/integration tool would get a key scoped to that tool only, and its
        // db.query() calls would be rejected (403 TOOL_NOT_ALLOWED). Grant the
        // data-plane query/schema tools whenever the app touches @doable/data.
        // (data.exec/migrate stay out — they're server-tier/MCP-only by design.)
        if (/@doable\/data/.test(content) || /\bdb\.(?:query|schema)\s*\(/.test(content)) {
          tools.add("data.query");
          tools.add("data.schema");
        }
      } catch {
        // skip unreadable files
      }
    }
  }
}

/**
 * Auto-provision a client API key for a published project.
 * Returns the key if created, or null if one already exists.
 */
export async function autoProvisionApiKey(opts: {
  projectId: string;
  userId: string;
  projectDir: string;
  publishedUrl: string;
}): Promise<{ key: string; allowedTools: string[] | null } | null> {
  const { projectId, userId, projectDir, publishedUrl } = opts;

  // Check if a client key already exists
  const existing = await sql`
    SELECT id FROM project_api_keys
    WHERE project_id = ${projectId} AND tier = 'client' AND revoked_at IS NULL
    LIMIT 1
  `;
  if (existing.length > 0) {
    return null; // already has a key
  }

  // Detect which tools the app uses
  const usedTools = await detectUsedTools(projectDir);
  const allowedTools = usedTools.length > 0 ? usedTools : null; // null = unrestricted

  // Determine origin from published URL
  let allowedOrigins: string[] | null = null;
  try {
    const url = new URL(publishedUrl);
    allowedOrigins = [url.origin];
    // Also allow *.doable.me for subdomains
    if (url.hostname.endsWith(".doable.me")) {
      allowedOrigins.push("https://*.doable.me");
    }
  } catch {
    // invalid URL — skip origin binding
  }

  // Generate the key
  const { key, hash, prefix } = generateProjectApiKey("client");

  await sql`
    INSERT INTO project_api_keys (project_id, key_hash, key_prefix, tier, label, created_by, allowed_tools, allowed_origins)
    VALUES (
      ${projectId},
      ${hash},
      ${prefix},
      'client',
      'Auto-provisioned on publish',
      ${userId},
      ${allowedTools ? JSON.stringify(allowedTools) : null}::jsonb,
      ${allowedOrigins ? JSON.stringify(allowedOrigins) : null}::jsonb
    )
  `;

  // Store VITE_DOABLE_PROJECT_KEY as a project env var so future builds include it.
  // Look up workspace_id for the project.
  const [project] = await sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
  if (project) {
    // Upsert: delete existing + insert (env_vars has no ON CONFLICT for this combo)
    await sql`
      DELETE FROM env_vars
      WHERE project_id = ${projectId} AND key = 'VITE_DOABLE_PROJECT_KEY' AND target = 'production'
    `;
    await sql`
      INSERT INTO env_vars (workspace_id, project_id, scope, key, value_encrypted, is_secret, target, description, created_by)
      VALUES (
        ${project.workspace_id},
        ${projectId},
        'project',
        'VITE_DOABLE_PROJECT_KEY',
        pgp_sym_encrypt(${key}, ${ENCRYPTION_KEY}),
        true,
        'production',
        'Auto-provisioned API key for published app',
        ${userId}
      )
    `;

    // Also store VITE_DOABLE_API_URL so the SDK knows where to send requests.
    // Published sites are on a different domain from the API, so same-origin
    // relative paths won't work.
    const publicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "";
    if (publicApiUrl) {
      await sql`
        DELETE FROM env_vars
        WHERE project_id = ${projectId} AND key = 'VITE_DOABLE_API_URL' AND target = 'production'
      `;
      await sql`
        INSERT INTO env_vars (workspace_id, project_id, scope, key, value_encrypted, is_secret, target, description, created_by)
        VALUES (
          ${project.workspace_id},
          ${projectId},
          'project',
          'VITE_DOABLE_API_URL',
          pgp_sym_encrypt(${publicApiUrl}, ${ENCRYPTION_KEY}),
          false,
          'production',
          'API base URL for published app SDK calls',
          ${userId}
        )
      `;
    }
  }

  console.log(
    `[auto-api-key] Provisioned client key for project ${projectId}: ${prefix}*** (${usedTools.length} tools scoped, origins: ${allowedOrigins?.join(", ") ?? "any"})`,
  );

  return { key, allowedTools };
}
