/**
 * Local verification of `deployEdgeFunction` HTTP wire format.
 *
 * This script does NOT hit the real Supabase Management API. It monkey-patches
 * global.fetch, calls `deployEdgeFunction`, and asserts the captured request
 * matches the documented multipart shape exactly:
 *
 *   POST https://api.supabase.com/v1/projects/{ref}/functions/deploy?slug={slug}
 *   Authorization: Bearer {token}
 *   Content-Type: multipart/form-data; boundary=...
 *   Body parts:
 *     - metadata (string): JSON {entrypoint_path, name, verify_jwt, [import_map_path]}
 *     - file (Blob, filename "index.ts"): the source
 *     - file (Blob, filename "deno.json", optional): the import map
 *
 * Run with: pnpm exec tsx scripts/test-edge-functions-shape.ts
 */

import { deployEdgeFunction } from "../services/api/src/integrations/supabase/edge-functions.js";

let pass = 0;
let fail = 0;

function ok(msg: string) {
  console.log(`  PASS  ${msg}`);
  pass++;
}
function bad(msg: string) {
  console.error(`  FAIL  ${msg}`);
  fail++;
}

interface CapturedRequest {
  url: string;
  method: string;
  authHeader: string | undefined;
  contentTypeHeader: string | undefined;
  body: FormData;
}

async function captureCall(
  fn: () => Promise<unknown>,
): Promise<CapturedRequest | null> {
  const originalFetch = globalThis.fetch;
  let captured: CapturedRequest | null = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    captured = {
      url,
      method: init?.method ?? "GET",
      authHeader: headers.get("Authorization") ?? undefined,
      contentTypeHeader: headers.get("Content-Type") ?? undefined,
      body: init?.body as FormData,
    };
    // Return a fake "success" response so deployEdgeFunction's happy path runs.
    return new Response(JSON.stringify({ id: "fake-fn-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }

  return captured;
}

async function readFormDataParts(form: FormData): Promise<{
  metadata: Record<string, unknown> | null;
  files: Array<{ filename: string | undefined; type: string; size: number; content?: string }>;
}> {
  const parts = {
    metadata: null as Record<string, unknown> | null,
    files: [] as Array<{ filename: string | undefined; type: string; size: number; content?: string }>,
  };

  for (const [key, value] of form.entries()) {
    if (key === "metadata") {
      if (typeof value === "string") {
        try {
          parts.metadata = JSON.parse(value);
        } catch {
          parts.metadata = null;
        }
      }
    } else if (key === "file") {
      if (value instanceof Blob) {
        parts.files.push({
          // @ts-expect-error Blob from FormData has a name when appended with one
          filename: (value as { name?: string }).name,
          type: value.type,
          size: value.size,
          content: value.size < 1024 ? await value.text() : undefined,
        });
      }
    }
  }

  return parts;
}

async function main() {
  console.log("=== Test 1: minimal call (entrypoint only, no import map) ===\n");

  const captured1 = await captureCall(async () => {
    const result = await deployEdgeFunction({
      accessToken: "sbp_test_token_for_shape_validation",
      projectRef: "bhdqgkwahxrbopjiysfz",
      slug: "doable-shape-test",
      entrypointSource: 'Deno.serve(() => new Response("hello"));',
    });
    if (!result.ok) {
      bad(`deployEdgeFunction returned ok=false even though mock returned 200: ${result.error}`);
    } else {
      ok("deployEdgeFunction parses mock 200 response and returns ok=true");
    }
  });

  if (!captured1) {
    bad("fetch was never called");
    return;
  }

  // URL assertions
  if (captured1.url === "https://api.supabase.com/v1/projects/bhdqgkwahxrbopjiysfz/functions/deploy?slug=doable-shape-test") {
    ok("URL matches documented shape /v1/projects/{ref}/functions/deploy?slug={slug}");
  } else {
    bad(`URL is wrong: ${captured1.url}`);
  }

  if (captured1.method === "POST") {
    ok("HTTP method is POST");
  } else {
    bad(`HTTP method is ${captured1.method}, expected POST`);
  }

  // Auth header
  if (captured1.authHeader === "Bearer sbp_test_token_for_shape_validation") {
    ok("Authorization header is `Bearer {token}`");
  } else {
    bad(`Authorization header is wrong: ${captured1.authHeader}`);
  }

  // Content-Type — must NOT be set manually (fetch sets it with boundary when body is FormData)
  if (captured1.contentTypeHeader === undefined || captured1.contentTypeHeader === null) {
    ok("Content-Type header is NOT set manually (fetch will set the multipart boundary)");
  } else {
    bad(`Content-Type header was manually set: ${captured1.contentTypeHeader}`);
  }

  if (!(captured1.body instanceof FormData)) {
    bad("body is not FormData");
    return;
  }
  ok("body is a FormData instance (fetch will encode as multipart)");

  // Inspect parts
  const parts1 = await readFormDataParts(captured1.body);

  if (parts1.metadata) {
    ok("multipart body has a `metadata` JSON part");
    const m = parts1.metadata;
    if (m.entrypoint_path === "index.ts") ok("metadata.entrypoint_path === 'index.ts'");
    else bad(`metadata.entrypoint_path is wrong: ${JSON.stringify(m.entrypoint_path)}`);

    if (m.name === "doable-shape-test") ok("metadata.name defaults to slug");
    else bad(`metadata.name is wrong: ${JSON.stringify(m.name)}`);

    if (m.verify_jwt === true) ok("metadata.verify_jwt defaults to boolean true");
    else bad(`metadata.verify_jwt is wrong: ${JSON.stringify(m.verify_jwt)} (should be boolean true)`);

    if (m.import_map_path === undefined) ok("metadata.import_map_path is absent when no import map provided");
    else bad(`metadata.import_map_path leaked when no import map provided: ${m.import_map_path}`);
  } else {
    bad("multipart body is missing the `metadata` JSON part");
  }

  if (parts1.files.length === 1) {
    ok("multipart body has exactly 1 `file` part (entrypoint only)");
    const f = parts1.files[0];
    if (f.filename === "index.ts") ok("file part filename is `index.ts`");
    else bad(`file part filename is wrong: ${f.filename}`);
    if (f.type === "application/typescript") ok("file part Content-Type is application/typescript");
    else bad(`file part Content-Type is wrong: ${f.type}`);
    if (f.content === 'Deno.serve(() => new Response("hello"));') ok("file part content matches entrypointSource");
    else bad(`file part content mismatch`);
  } else {
    bad(`multipart body has ${parts1.files.length} file parts, expected 1`);
  }

  // ── Test 2: with import map + custom verifyJwt + displayName ──
  console.log("\n=== Test 2: with import map, verifyJwt=false, custom display name ===\n");

  const captured2 = await captureCall(async () => {
    await deployEdgeFunction({
      accessToken: "sbp_another_test_token",
      projectRef: "myref",
      slug: "webhook-fn",
      entrypointSource: 'export default { fetch: () => new Response() }',
      importMap: '{"imports":{"std/":"https://deno.land/std@0.220.0/"}}',
      verifyJwt: false,
      displayName: "My Webhook",
    });
  });

  if (!captured2) {
    bad("fetch was never called for test 2");
    return;
  }

  if (captured2.url === "https://api.supabase.com/v1/projects/myref/functions/deploy?slug=webhook-fn") {
    ok("URL has correct projectRef and slug");
  } else {
    bad(`URL is wrong: ${captured2.url}`);
  }

  const parts2 = await readFormDataParts(captured2.body);

  if (parts2.metadata) {
    const m = parts2.metadata;
    if (m.verify_jwt === false) ok("metadata.verify_jwt honors verifyJwt: false override");
    else bad(`verifyJwt: false override not honored, got ${JSON.stringify(m.verify_jwt)}`);

    if (m.name === "My Webhook") ok("metadata.name uses displayName when provided");
    else bad(`displayName not honored, got ${JSON.stringify(m.name)}`);

    if (m.import_map_path === "deno.json") ok("metadata.import_map_path === 'deno.json'");
    else bad(`metadata.import_map_path is wrong: ${m.import_map_path}`);
  }

  if (parts2.files.length === 2) {
    ok("multipart body has 2 `file` parts (entrypoint + import map)");
    const filenames = parts2.files.map((f) => f.filename).sort();
    if (JSON.stringify(filenames) === JSON.stringify(["deno.json", "index.ts"])) {
      ok("file parts are named index.ts and deno.json");
    } else {
      bad(`file part names are wrong: ${JSON.stringify(filenames)}`);
    }
    const importMapPart = parts2.files.find((f) => f.filename === "deno.json");
    if (importMapPart?.type === "application/json") ok("import map file is application/json");
    else bad(`import map content type is wrong: ${importMapPart?.type}`);
  } else {
    bad(`expected 2 file parts, got ${parts2.files.length}`);
  }

  // ── Test 3: slug query-string encoding ──
  console.log("\n=== Test 3: slug with special characters is URL-encoded ===\n");

  const captured3 = await captureCall(async () => {
    await deployEdgeFunction({
      accessToken: "sbp_t",
      projectRef: "ref",
      slug: "fn with spaces & symbols",
      entrypointSource: "x",
    });
  });

  if (captured3?.url.includes("?slug=fn%20with%20spaces%20%26%20symbols")) {
    ok("slug is URL-encoded in the query string");
  } else {
    bad(`slug encoding is wrong: ${captured3?.url}`);
  }

  // ── Test 4: error handling (non-2xx response) ──
  console.log("\n=== Test 4: non-2xx response surfaces error ===\n");

  const originalFetch4 = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: "Invalid token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    const result4 = await deployEdgeFunction({
      accessToken: "bad",
      projectRef: "ref",
      slug: "fn",
      entrypointSource: "x",
    });
    if (result4.ok === false && result4.error === "Invalid token") {
      ok("non-2xx response is parsed and error message surfaces");
    } else {
      bad(`error handling broken: ${JSON.stringify(result4)}`);
    }
  } finally {
    globalThis.fetch = originalFetch4;
  }

  // Summary
  console.log();
  console.log("─".repeat(60));
  console.log(`${pass} passed, ${fail} failed`);
  if (fail > 0) {
    process.exitCode = 1;
    console.error("FAIL");
  } else {
    console.log("PASS");
  }
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
