/**
 * Next.js 15 native instrumentation hook.
 *
 * Server-side OTel init for apps/web. Most real backend instrumentation
 * happens in services/api — this hook is a stub so future work has a
 * registered entry point.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.TRACING_LEVEL === "off") return;

  // Intentionally minimal: apps/web is mostly a Next.js shell. Backend
  // instrumentation lives in services/api. Browser-side instrumentation
  // is mounted via <TracingInit /> in the root layout.
}
