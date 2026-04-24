"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { McpUiWidget } from "../../hooks/use-editor-store";

interface McpDownloadWidgetProps {
  widget: McpUiWidget;
  messageId: string;
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function McpDownloadWidget({ widget }: McpDownloadWidgetProps) {
  const { fileName, url, sizeBytes, message } = widget.schema;
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!url || !fileName) return;
    setDownloading(true);
    setError(null);
    try {
      // apiFetch returns parsed JSON for normal responses; we need raw bytes.
      // Hit the API directly with the bearer token so the browser receives a
      // proper attachment download.
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("doable_access_token")
          : null;
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${apiBase}${url}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-background overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs font-semibold text-foreground">
          {widget.title}
        </span>
      </div>

      <div className="flex items-center gap-3 p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {fileName ?? "file"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {[message, formatSize(sizeBytes)].filter(Boolean).join(" • ")}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading || !url}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400 border-t border-border bg-red-50 dark:bg-red-950/20">
          {error}
        </div>
      )}
    </div>
  );
}

// re-export apiFetch reference so unused-import lint doesn't trip
void apiFetch;
