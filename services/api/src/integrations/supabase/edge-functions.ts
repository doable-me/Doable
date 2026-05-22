/**
 * Supabase Management API — edge function deploy helper (Phase 2A).
 *
 * Uploads a single-file Edge Function to a provisioned Supabase project
 * so the AI can ship server-side logic alongside the database migrations
 * it just ran. Small single-file functions can be uploaded without a
 * bundler; larger ones can be esbuild-bundled upstream before calling.
 *
 * Endpoint: `POST /v1/projects/{ref}/functions/deploy?slug={slug}`
 * (creates if the slug is new, updates otherwise.)
 *
 * Multipart shape (verified against the docs):
 *   - `metadata` — single JSON part with `{entrypoint_path, name, verify_jwt,
 *      import_map_path?, static_patterns?}`. JWT verification defaults to
 *      true; pass `verifyJwt: false` for webhooks.
 *   - `file` — one part per source file (entrypoint + optional import map).
 *      Both files use the same `file` form name; the metadata references
 *      them by filename via `entrypoint_path` and `import_map_path`.
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
 * @param opts.slug            Function slug (URL path segment + query arg).
 * @param opts.entrypointSource Raw TypeScript/JavaScript source for `index.ts`.
 * @param opts.importMap       Optional Deno import map JSON string. When
 *                              provided, it ships as a sibling `deno.json`
 *                              file and `metadata.import_map_path` is set.
 * @param opts.verifyJwt       Whether the function requires a valid JWT in
 *                              the Authorization header. Defaults to `true`
 *                              (Supabase's own default). Set `false` for
 *                              public webhooks.
 * @param opts.displayName     Optional display name. Defaults to slug.
 */
export async function deployEdgeFunction(opts: {
  accessToken: string;
  projectRef: string;
  slug: string;
  entrypointSource: string;
  importMap?: string;
  verifyJwt?: boolean;
  displayName?: string;
}): Promise<DeployEdgeFunctionResult> {
  const ENTRYPOINT_FILENAME = "index.ts";
  const IMPORT_MAP_FILENAME = "deno.json";

  const metadata: Record<string, unknown> = {
    entrypoint_path: ENTRYPOINT_FILENAME,
    name: opts.displayName ?? opts.slug,
    verify_jwt: opts.verifyJwt ?? true,
  };
  if (opts.importMap) {
    metadata.import_map_path = IMPORT_MAP_FILENAME;
  }

  const form = new FormData();
  form.append("metadata", JSON.stringify(metadata));

  // Both source and import map are attached under the same `file` field name.
  // The Management API treats repeated `file` parts as the function's bundle
  // and uses the metadata paths to identify the entrypoint and import map.
  // FormData in Node 18+ accepts Blob for binary/text payloads.
  form.append(
    "file",
    new Blob([opts.entrypointSource], { type: "application/typescript" }),
    ENTRYPOINT_FILENAME,
  );

  if (opts.importMap) {
    form.append(
      "file",
      new Blob([opts.importMap], { type: "application/json" }),
      IMPORT_MAP_FILENAME,
    );
  }

  // Slug is a query parameter on the deploy endpoint, not a form field.
  const url =
    `${SUPABASE_MGMT_API}/v1/projects/${opts.projectRef}/functions/deploy` +
    `?slug=${encodeURIComponent(opts.slug)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        // NOTE: do NOT set Content-Type manually — fetch will add the
        // correct multipart boundary automatically when body is FormData.
      },
      body: form,
    });
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
