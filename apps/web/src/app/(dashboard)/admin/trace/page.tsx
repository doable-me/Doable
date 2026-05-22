"use client";

/**
 * /admin/trace — search page.
 *
 * Reads filters from URL search params (set by the SearchForm). Calls the
 * backend search endpoint and renders a results table linking to detail pages.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Activity, Loader2, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Button } from "@/components/ui/button";
import { SearchForm } from "./_components/search-form";
import { ResultsTable, type TraceRow } from "./_components/results-table";

function AdminTracePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = params.toString();

  useEffect(() => {
    if (!isPlatformAdmin) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const path = queryString
          ? `/admin/traces/search?${queryString}`
          : "/admin/traces/search";
        const res = await apiFetch<{ traces: TraceRow[]; total: number }>(path);
        if (!cancelled) setTraces(res.traces);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load traces");
          setTraces([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isPlatformAdmin, queryString]);

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <ShieldCheck className="h-12 w-12" />
        <p className="font-medium text-foreground">Platform admin access required</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mb-2 flex items-center gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Admin
          </Link>
        </div>
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-foreground">
          <Activity className="h-6 w-6 text-brand-400" />
          Trace search
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Search traces across services. Click a row to open the flame graph.
        </p>

        <div className="mb-6">
          <SearchForm />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <ResultsTable traces={traces} loading={loading} />
      </div>
    </div>
  );
}

export default function AdminTracePage() {
  return (
    <Suspense fallback={null}>
      <AdminTracePageInner />
    </Suspense>
  );
}
