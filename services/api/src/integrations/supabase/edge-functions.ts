/**
 * Supabase Management API — edge function deploy helper (Phase 2A).
 *
 * Uploads a single-file Edge Function to a provisioned Supabase project
 * so the AI can ship server-side logic alongside the database migrations
 * it just ran. Small single-file functions can be uploaded without a
 * bundler; larger ones can be esbuild-bundled upstream before calling.
 *
 * NOTE: the exact multipart payload shape for `POST /v1/projects/{ref}/functions`
 * is not stable across the Management API versions — if you are extending
 * this helper, verify the current shape against the live docs before
 * merging.
 */

const SUPABASE_MGMT_API = "https://api.supabase.com";

export interface DeployEdgeFunctionResult {
  ok: boolean;
  functionId?: string;
  error?: string;
}

/**
 * Deploy (create or update) a single Edge Function.
 *
 * @param opts.slug            Function slug (URL path segment).
 * @param opts.entrypointSource Raw TypeScript/JavaScript source for `index.ts`.
 *                              The helper wraps it in a multipart form so it
 *                              ships as a single-file function.
 * @param opts.importMap       Optional Deno import map JSON string.
 */
export async function deployEdgeFunction(opts: {
  accessToken: string;
  projectRef: string;
  slug: string;
  entrypointSource: string;
  importMap?: string;
}): Promise<DeployEdgeFunctionResult> {
  // TODO(supabase-api): verify multipart shape against
  //   https://api.supabase.com/api/v1#tag/edge-functions/operation/v1-create-a-function
  // The exact field names (file vs files[], slug vs name, verify_jwt flag, etc.)
  // vary across doc revisions — treat this implementation as a starting point
  // and confirm in a staging project before production use.

  const form = new FormData();
  form.append("slug", opts.slug);
  form.append("name", opts.slug);
  form.append("verify_jwt", "true");

  // Attach the entrypoint as a file named `index.ts`. FormData in Node 18+
  // accepts Blob for binary/text payloads.
  const entrypointBlob = new Blob([opts.entrypointSource], {
    type: "application/typescript",
  });
  form.append("file", entrypointBlob, "index.ts");

  if (opts.importMap) {
    const importMapBlob = new Blob([opts.importMap], {
      type: "application/json",
    });
    // TODO(supabase-api): confirm field name for import map upload.
    form.append("import_map_file", importMapBlob, "import_map.json");
  }

  let res: Response;
  try {
    res = await fetch(
      `${SUPABASE_MGMT_API}/v1/projects/${opts.projectRef}/functions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          // NOTE: do NOT set Content-Type manually — fetch will add the
          // correct multipart boundary automatically when body is FormData.
        },
        body: form,
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: `Network error deploying edge function: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
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
    const data = (await res.json()) as { id?: string };
    return { ok: true, functionId: data.id };
  } catch {
    return { ok: true };
  }
}
