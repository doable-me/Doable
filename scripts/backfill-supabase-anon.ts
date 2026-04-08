/**
 * One-time backfill: populate `anonKey` + `serviceRoleKey` on existing
 * Supabase enhanced-auth connections so vault-bridge can map them to
 * VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run from project root:
 *   tsx --env-file=.env scripts/backfill-supabase-anon.ts
 *
 * Idempotent — re-running is a no-op.
 *
 * Strategy:
 *   1. If a long-lived management OAuth access_token is available for the
 *      user (stored as a separate `supabase-mgmt` integration_connections
 *      row), re-fetch both keys from the Supabase Management API.
 *   2. Otherwise, perform an OFFLINE migration based on metadata.keyType:
 *        - keyType === "service_role": copy apiKey -> serviceRoleKey.
 *          (anonKey cannot be recovered without the OAuth token; the user
 *          must reconnect to gain client-side keys.)
 *        - keyType === "anon": copy apiKey -> anonKey.
 *      The connection will be flagged in the summary as "needs reconnect"
 *      if the missing key matters for client-side use.
 *
 * Security: NEVER logs credential values — only counts and connection IDs.
 */

import { sql } from "../services/api/src/db/index.js";
import { credentialVault } from "../services/api/src/integrations/credential-vault.js";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "doable-dev-encryption-key";
const SUPABASE_MGMT_API = "https://api.supabase.com";

interface SupabaseCreds {
  url?: string;
  apiKey?: string;
  anonKey?: string;
  serviceRoleKey?: string;
}

interface ConnectionRow {
  id: string;
  user_id: string;
  workspace_id: string;
  metadata: Record<string, unknown>;
  credentials_decrypted: string;
}

async function fetchKeysFromMgmtApi(
  accessToken: string,
  projectRef: string,
): Promise<{ anonKey?: string; serviceRoleKey?: string } | null> {
  try {
    const res = await fetch(
      `${SUPABASE_MGMT_API}/v1/projects/${projectRef}/api-keys`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      console.warn(
        `  · Management API returned ${res.status} ${res.statusText}`,
      );
      return null;
    }
    const keys = (await res.json()) as Array<{ name: string; api_key: string }>;
    return {
      anonKey: keys.find((k) => k.name === "anon")?.api_key,
      serviceRoleKey: keys.find((k) => k.name === "service_role")?.api_key,
    };
  } catch (err) {
    console.warn(
      `  · Management API fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function lookupMgmtAccessToken(
  userId: string,
  workspaceId: string,
): Promise<string | null> {
  // Defensive: if a `supabase-mgmt` connection row ever gets created
  // (e.g., a future change persists the management OAuth token), use it.
  // Today this query returns nothing — the access_token only lives in a
  // 5-minute in-memory session in routes/integrations.ts.
  const rows = await sql`
    SELECT pgp_sym_decrypt(credentials_encrypted, ${ENCRYPTION_KEY}) AS decrypted
    FROM integration_connections
    WHERE user_id = ${userId}
      AND workspace_id = ${workspaceId}
      AND integration_id = 'supabase-mgmt'
      AND status = 'active'
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  try {
    const creds = JSON.parse(rows[0].decrypted as string) as Record<string, unknown>;
    const token =
      (creds.access_token as string | undefined) ??
      (creds.accessToken as string | undefined);
    return token ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL not set. Run with: tsx --env-file=.env scripts/backfill-supabase-anon.ts",
    );
    process.exit(1);
  }

  console.log("Scanning Supabase enhanced-auth connections…");

  const rows = (await sql`
    SELECT id,
           user_id,
           workspace_id,
           metadata,
           pgp_sym_decrypt(credentials_encrypted, ${ENCRYPTION_KEY}) AS credentials_decrypted
    FROM integration_connections
    WHERE integration_id = 'supabase'
      AND status = 'active'
      AND metadata->>'connectedVia' = 'enhanced_auth'
  `) as unknown as ConnectionRow[];

  const total = rows.length;
  let backfilled = 0;
  let alreadyDone = 0;
  let needsReconnect = 0;
  let failed = 0;
  const reconnectIds: string[] = [];

  for (const row of rows) {
    let creds: SupabaseCreds;
    try {
      creds = JSON.parse(row.credentials_decrypted) as SupabaseCreds;
    } catch (err) {
      console.warn(
        `· ${row.id}: failed to parse credentials (${err instanceof Error ? err.message : String(err)})`,
      );
      failed++;
      continue;
    }

    if (creds.anonKey && creds.serviceRoleKey) {
      alreadyDone++;
      continue;
    }

    const projectRef = (row.metadata?.projectRef as string | undefined) ?? "";
    const keyType = (row.metadata?.keyType as string | undefined) ?? "";

    // Try the (defensive) Management API path first.
    const accessToken = await lookupMgmtAccessToken(row.user_id, row.workspace_id);
    let nextAnon: string | undefined = creds.anonKey;
    let nextService: string | undefined = creds.serviceRoleKey;
    let source: "mgmt-api" | "offline" | "none" = "none";

    if (accessToken && projectRef) {
      const fetched = await fetchKeysFromMgmtApi(accessToken, projectRef);
      if (fetched) {
        nextAnon = fetched.anonKey ?? nextAnon;
        nextService = fetched.serviceRoleKey ?? nextService;
        source = "mgmt-api";
      }
    }

    // Fall back to offline migration from the existing apiKey field.
    if (source === "none" && creds.apiKey) {
      if (keyType.includes("service_role") && !nextService) {
        nextService = creds.apiKey;
      }
      if (keyType.includes("anon") && !nextAnon) {
        nextAnon = creds.apiKey;
      }
      // Pre-existing rows store either service_role OR anon under apiKey
      // (the chosen-key logic in supabase.ts before this PR). If keyType is
      // missing entirely, we cannot tell which one — leave both unset.
      if (nextAnon !== creds.anonKey || nextService !== creds.serviceRoleKey) {
        source = "offline";
      }
    }

    if (source === "none") {
      // Nothing to update — would be a no-op.
      console.warn(`· ${row.id}: no OAuth token and offline migration unavailable; skipping`);
      failed++;
      continue;
    }

    const updated: SupabaseCreds = {
      url: creds.url,
      apiKey: creds.apiKey, // unchanged — Activepieces piece-supabase reads it
      anonKey: nextAnon,
      serviceRoleKey: nextService,
    };

    // Idempotency guard: bail if nothing actually changed.
    if (
      updated.anonKey === creds.anonKey &&
      updated.serviceRoleKey === creds.serviceRoleKey
    ) {
      alreadyDone++;
      continue;
    }

    try {
      await credentialVault.update(row.id, updated);
      backfilled++;
      const stillMissingClient = !updated.anonKey;
      console.log(
        `· ${row.id}: updated via ${source}` +
          (stillMissingClient ? " (still missing anonKey — user must reconnect)" : ""),
      );
      if (stillMissingClient) {
        needsReconnect++;
        reconnectIds.push(row.id);
      }
    } catch (err) {
      console.warn(
        `· ${row.id}: update failed (${err instanceof Error ? err.message : String(err)})`,
      );
      failed++;
    }
  }

  console.log("");
  console.log(`Backfilled ${backfilled} of ${total} Supabase connections`);
  console.log(
    `  · already populated: ${alreadyDone}` +
      `\n  · backfilled:        ${backfilled}` +
      `\n  · failed:            ${failed}` +
      `\n  · need reconnect:    ${needsReconnect}`,
  );
  if (reconnectIds.length > 0) {
    console.log("");
    console.log("Connection IDs that still need user reconnection (no anonKey recoverable):");
    for (const id of reconnectIds) console.log(`  - ${id}`);
  }

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
