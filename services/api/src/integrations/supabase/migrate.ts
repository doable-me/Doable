/**
 * Supabase Management API — SQL migration helper (Phase 2A).
 *
 * Executes a SQL script against a freshly-provisioned Supabase project
 * using the Management API's `/database/query` endpoint. Surfaces SQL
 * errors back to the caller so the AI can read the failure message
 * and self-correct (Lovable-style error loop).
 */

const SUPABASE_MGMT_API = "https://api.supabase.com";

export interface MigrationResult {
  ok: boolean;
  error?: string;
  rows?: unknown[];
}

/**
 * Run a SQL block against a Supabase project.
 *
 * Returns `{ ok: true, rows }` on success, `{ ok: false, error }` on
 * failure. Does NOT throw on SQL errors — callers want the error text
 * so they can relay it into the chat as a tool result.
 *
 * NOTE: the caller should never pass user-generated SQL directly without
 * review. This helper is intended for AI-authored migration files that
 * have been committed into the project's `supabase/migrations/*.sql`.
 */
export async function runMigration(opts: {
  accessToken: string;
  projectRef: string;
  sql: string;
}): Promise<MigrationResult> {
  let res: Response;
  try {
    res = await fetch(
      `${SUPABASE_MGMT_API}/v1/projects/${opts.projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: opts.sql }),
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: `Network error running migration: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // The Management API returns JSON { message, code, ... } on failure.
    // Try to extract a clean message so the AI sees a readable SQL error
    // instead of an HTTP envelope.
    let message = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(errText) as { message?: string; error?: string };
      if (parsed.message) message = parsed.message;
      else if (parsed.error) message = parsed.error;
    } catch {
      if (errText) message = errText.slice(0, 500);
    }
    return { ok: false, error: message };
  }

  try {
    const rows = (await res.json()) as unknown[];
    return { ok: true, rows };
  } catch {
    return { ok: true, rows: [] };
  }
}
