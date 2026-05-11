"use client";

import { useEffect } from "react";

/**
 * Mounts browser-side OpenTelemetry tracing exactly once on the client.
 *
 * The OTel runtime is dynamically imported so it never lands in the
 * initial server-rendered bundle, and is entirely skipped when
 * NEXT_PUBLIC_TRACING_LEVEL is set to "off".
 */
export function TracingInit(): null {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_TRACING_LEVEL === "off") return;

    let cancelled = false;

    void import("@/lib/tracing/browser")
      .then((mod) => {
        if (cancelled) return;
        try {
          mod.initBrowserTracing();
        } catch (err) {
          // Tracing must never break the app.
           
          console.warn("[tracing] init failed:", err);
        }
      })
      .catch((err) => {
         
        console.warn("[tracing] dynamic import failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

export default TracingInit;
