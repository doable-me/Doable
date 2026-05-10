import { NextRequest, NextResponse } from "next/server";

/**
 * OTLP proxy: forwards browser OTLP/HTTP exports to the API server's
 * internal OTLP receiver. Keeps the tracing endpoint same-origin so the
 * browser exporter doesn't need CORS preflight, and the API URL never
 * leaks to the client.
 *
 * Tracing must NEVER block the user-facing app: any forwarding error is
 * swallowed and a 204 is returned to the exporter.
 */

export const runtime = "nodejs";
// OTLP exports are background; do not cache.
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ path: string[] }> };

export async function POST(req: NextRequest, ctx: RouteParams) {
  const apiUrl = process.env.API_URL;
  const { path } = await ctx.params;
  const subpath = (path ?? []).join("/");

  if (!apiUrl) {
    // No backend configured — drop silently.
    return new NextResponse(null, { status: 204 });
  }

  const target = `${apiUrl.replace(/\/+$/, "")}/internal/otlp/${subpath}`;

  // Pass through original Content-Type (OTLP can be JSON or protobuf) and
  // Content-Encoding (gzip is common). Strip hop-by-hop headers.
  const fwdHeaders = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) fwdHeaders.set("content-type", ct);
  const ce = req.headers.get("content-encoding");
  if (ce) fwdHeaders.set("content-encoding", ce);
  const internalSecret = process.env.INTERNAL_SECRET;
  if (internalSecret) fwdHeaders.set("x-internal-secret", internalSecret);

  // Read the body once. Browser OTLP payloads are small (batched spans),
  // so buffering is acceptable and avoids streaming-body quirks across
  // Next.js runtimes.
  let body: ArrayBuffer;
  try {
    body = await req.arrayBuffer();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: fwdHeaders,
      body,
      // Tracing exports must never hold the request open.
      // 5s is generous; the BatchSpanProcessor will retry on its own cadence.
      signal: AbortSignal.timeout(5000),
    });

    // Mirror upstream status; OTLP exporters react to 2xx vs 4xx/5xx.
    const respBody = await upstream.arrayBuffer().catch(() => null);
    const respHeaders = new Headers();
    const upCt = upstream.headers.get("content-type");
    if (upCt) respHeaders.set("content-type", upCt);

    return new NextResponse(respBody, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch {
    // API unreachable / timed out — drop the batch silently. The client
    // SDK will continue exporting subsequent batches.
    return new NextResponse(null, { status: 204 });
  }
}
