import { sql } from "../db/index.js";
import { marketplaceFeaturedQueries } from "@doable/db/queries/marketplace-featured";

/**
 * Periodic refresher for the marketplace + discover featured materialised
 * views (mv_marketplace_featured, mv_discover_featured). Refresh runs
 * CONCURRENTLY when possible so reads aren't blocked.
 *
 * In production this would normally be a pg_cron job — running it inside
 * the API process keeps the stack dependency-free and works in
 * single-instance dev/staging. If we ever scale horizontally, set
 * MARKETPLACE_DISABLE_FEATURED_REFRESHER=1 in all but one node and use
 * pg_cron instead.
 */

const featured = marketplaceFeaturedQueries(sql);

let timer: ReturnType<typeof setInterval> | null = null;

export function startMarketplaceFeaturedRefresher(opts: { intervalMs: number }): void {
  if (process.env.MARKETPLACE_DISABLE_FEATURED_REFRESHER === "1") {
    console.log("[marketplace-featured] refresher disabled by env flag");
    return;
  }
  if (timer) return;

  const tick = async () => {
    const { getTracer } = await import("../tracing/instrumentation.js");
    const { SpanStatusCode } = await import("@opentelemetry/api");
    const tracer = getTracer("doable-api/jobs");
    await tracer.startActiveSpan("bg.marketplace_featured_refresh", async (span) => {
      const t0 = Date.now();
      try {
        // Run both in parallel — they're independent views.
        await Promise.all([
          featured.refreshMarketplaceFeatured(),
          featured.refreshDiscoverFeatured(),
        ]);
        span.setAttribute("bg.duration_ms", Date.now() - t0);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        // Don't log every minute on a broken DB — just warn once per failure.
        console.warn("[marketplace-featured] refresh failed:", err instanceof Error ? err.message : err);
      } finally {
        span.end();
      }
    });
  };

  // Kick off async, no top-level await — startup must not block.
  void tick();
  timer = setInterval(() => { void tick(); }, opts.intervalMs);
  if (timer.unref) timer.unref();
  console.log(`[marketplace-featured] refresher started (interval=${opts.intervalMs}ms)`);
}

export function stopMarketplaceFeaturedRefresher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
