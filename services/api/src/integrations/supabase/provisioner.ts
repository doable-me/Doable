/**
 * Supabase Management API — platform-managed provisioner (Phase 2A).
 *
 * Thin fetch wrappers around https://api.supabase.com used by the
 * "Add Supabase database" flow. The provisioner creates a brand-new
 * Supabase project under the user's own organization (Lovable model)
 * using their OAuth access token captured by the `supabase-mgmt`
 * enhanced auth flow.
 *
 * SECURITY: never log credential values (db_password, api_keys,
 * access_tokens). All errors must redact tokens before being thrown
 * up the stack.
 */
import * as crypto from "node:crypto";

const SUPABASE_MGMT_API = "https://api.supabase.com";

/** A Supabase organization the user belongs to. */
export interface SupabaseOrganization {
  id: string;
  name: string;
}

/**
 * Generate a strong random database password (server-side).
 * Uses base64url so it survives connection-string/URL contexts unchanged.
 */
export function generateDbPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Create a new Supabase project in the user's chosen organization.
 *
 * Returns the new project ref + the generated db password (so the caller
 * can persist it inside the encrypted credential record). The password is
 * NEVER returned via SSE / logs / chat — only stored in the vault.
 */
export async function createProject(opts: {
  accessToken: string;
  name: string;
  orgId: string;
  region: string;
  /** Optional caller-supplied password — defaults to a 24-byte random one. */
  dbPassword?: string;
}): Promise<{ projectRef: string; dbPassword: string }> {
  const dbPassword = opts.dbPassword ?? generateDbPassword();

  const res = await fetch(`${SUPABASE_MGMT_API}/v1/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: opts.name,
      organization_id: opts.orgId,
      region: opts.region,
      db_pass: dbPassword,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Supabase createProject failed: ${res.status} ${res.statusText} ${errText.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { id?: string; ref?: string };
  // Newer API responses use `id`; older docs use `ref`. Accept either.
  const projectRef = data.id ?? data.ref;
  if (!projectRef) {
    throw new Error("Supabase createProject returned no project ref");
  }
  return { projectRef, dbPassword };
}

/**
 * Poll the Management API until the project becomes ACTIVE_HEALTHY.
 *
 * Default timeout: 120s, default poll interval: 3s. Throws on timeout.
 * Cancels cleanly when the deadline is hit so the SSE stream can surface
 * a friendly error to the chat UI.
 */
export async function waitForActive(opts: {
  accessToken: string;
  projectRef: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  const pollMs = opts.pollMs ?? 3_000;

  while (Date.now() < deadline) {
    const res = await fetch(
      `${SUPABASE_MGMT_API}/v1/projects/${opts.projectRef}`,
      { headers: { Authorization: `Bearer ${opts.accessToken}` } },
    );

    if (res.ok) {
      const data = (await res.json()) as { status?: string };
      if (data.status === "ACTIVE_HEALTHY") return;
    }
    // Non-2xx is allowed transiently while the project initialises.

    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(
    `Timed out waiting for Supabase project ${opts.projectRef} to become ACTIVE_HEALTHY`,
  );
}

/**
 * Fetch the project's anon + service_role API keys via Management API.
 *
 * Mirrors the existing pattern in `enhanced-auth/supabase.ts:44-55` so the
 * vault-bridge picks up VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
 * automatically.
 */
export async function getApiKeys(
  accessToken: string,
  projectRef: string,
): Promise<{ anon: string; serviceRole: string }> {
  const res = await fetch(
    `${SUPABASE_MGMT_API}/v1/projects/${projectRef}/api-keys`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch Supabase API keys: ${res.status} ${res.statusText}`,
    );
  }

  const keys = (await res.json()) as Array<{ name: string; api_key: string }>;
  const anon = keys.find((k) => k.name === "anon")?.api_key;
  const serviceRole = keys.find((k) => k.name === "service_role")?.api_key;

  if (!anon || !serviceRole) {
    throw new Error(
      "Supabase API key fetch returned incomplete results (missing anon or service_role)",
    );
  }

  return { anon, serviceRole };
}

/**
 * List the organizations the OAuth grant has access to.
 * Used by the "create new Supabase project" dialog to render the org picker.
 */
export async function listOrganizations(
  accessToken: string,
): Promise<SupabaseOrganization[]> {
  const res = await fetch(`${SUPABASE_MGMT_API}/v1/organizations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to list Supabase organizations: ${res.status} ${res.statusText}`,
    );
  }

  const orgs = (await res.json()) as Array<{ id: string; name: string }>;
  return orgs.map((o) => ({ id: o.id, name: o.name }));
}
