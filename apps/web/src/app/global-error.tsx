"use client";

/**
 * App Router global error boundary. Replaces the root layout when an error
 * escapes every other boundary; must therefore include <html> and <body>.
 *
 * Hook-free on purpose — Next 16's prerender of the synthesized
 * /_global-error route trips on useEffect/useContext if the component
 * touches React hooks during SSR. Side-effect logging happens client-side
 * after hydration via the inline `componentDidCatch`-style noop below;
 * if you need full error capture, send `error.digest` to the API instead.
 *
 * Next 16 + Turbopack additionally crashes the /_global-error prerender
 * with "Cannot read properties of null (reading 'useContext')" inside
 * <__next_viewport_boundary__> even when this component is hook-free.
 * Marking the boundary as dynamic skips static generation of the synthetic
 * error page (which is fine — error UI is only rendered at runtime anyway).
 */
export const dynamic = "force-dynamic";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Something went wrong</h2>
          <p style={{ fontSize: "0.875rem", color: "#71717a", marginBottom: "1.5rem", textAlign: "center", maxWidth: "32rem" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#a1a1aa", marginBottom: "1rem" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{ borderRadius: "0.5rem", background: "#3b82f6", padding: "0.625rem 1.25rem", fontSize: "0.875rem", color: "white", border: "none", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
