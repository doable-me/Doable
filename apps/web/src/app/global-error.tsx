"use client";

import { useEffect } from "react";

/**
 * App Router global error boundary. Required by Next 15 when force-dynamic
 * on the root layout would otherwise trigger Pages-Router fallback (<Html>
 * import from next/document, which doesn't exist in App-Router-only apps).
 *
 * Must include <html> and <body> because it replaces the root layout when
 * an error escapes every other boundary.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Something went wrong</h2>
          <p style={{ fontSize: "0.875rem", color: "#71717a", marginBottom: "1.5rem", textAlign: "center", maxWidth: "32rem" }}>
            {error.message || "An unexpected error occurred."}
          </p>
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
