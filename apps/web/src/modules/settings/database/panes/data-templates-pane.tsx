"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Package, RefreshCw, Check } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import {
  fetchDataTemplates,
  applyDataTemplate,
  type DataTemplateItem,
} from "../backend-api";

interface Props {
  projectId: string;
}

export function DataTemplatesPane({ projectId }: Props) {
  const [items, setItems] = useState<DataTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDataTemplates(projectId);
      setItems(res.data.available);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply(slug: string) {
    setApplying(slug);
    setError(null);
    setMessage(null);
    try {
      const res = await applyDataTemplate(projectId, slug);
      if (!res.data.ok) {
        setError(res.data.message ?? "Apply failed");
        return;
      }
      const migs = res.data.migrations?.length
        ? ` Applied migrations: ${res.data.migrations.join(", ")}.`
        : "";
      const seed = res.data.seeded ? " Seed ran." : "";
      setMessage(`Template “${slug}” applied.${migs}${seed}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SectionCard
      title="Data Templates"
      description="Browse bundled schema packs and apply them to this project’s database."
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data templates available.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li key={item.slug} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.slug}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.applied ? "Applied to this project" : "Not applied yet"}
                    </p>
                  </div>
                </div>
                {item.applied ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                    Applied
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void apply(item.slug)}
                    disabled={applying === item.slug}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {applying === item.slug ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Apply
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
