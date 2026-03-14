"use client";

import { useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  RotateCcw,
  GitCommit,
} from "lucide-react";

interface VersionEntry {
  id: string;
  versionNumber: number;
  description: string | null;
  bookmarked: boolean;
  createdBy: string;
  createdAt: string;
}

// Demo data for initial UI
const DEMO_VERSIONS: VersionEntry[] = [
  {
    id: "v5",
    versionNumber: 5,
    description: "Added contact form with validation",
    bookmarked: true,
    createdBy: "AI",
    createdAt: new Date(Date.now() - 600_000).toISOString(),
  },
  {
    id: "v4",
    versionNumber: 4,
    description: "Updated navigation styling",
    bookmarked: false,
    createdBy: "AI",
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: "v3",
    versionNumber: 3,
    description: "Implemented responsive layout",
    bookmarked: false,
    createdBy: "AI",
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: "v2",
    versionNumber: 2,
    description: "Added hero section and features",
    bookmarked: true,
    createdBy: "AI",
    createdAt: new Date(Date.now() - 14_400_000).toISOString(),
  },
  {
    id: "v1",
    versionNumber: 1,
    description: "Initial project scaffold",
    bookmarked: false,
    createdBy: "System",
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
];

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function VersionHistory() {
  const [versions, setVersions] = useState<VersionEntry[]>(DEMO_VERSIONS);
  const [filter, setFilter] = useState<"all" | "bookmarked">("all");

  const filtered =
    filter === "bookmarked"
      ? versions.filter((v) => v.bookmarked)
      : versions;

  const toggleBookmark = (id: string) => {
    setVersions((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, bookmarked: !v.bookmarked } : v
      )
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Version History
        </h3>
        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
          <button
            onClick={() => setFilter("all")}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("bookmarked")}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              filter === "bookmarked"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Saved
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative px-3 py-2">
          {/* Timeline line */}
          <div className="absolute left-[23px] top-4 bottom-4 w-px bg-border" />

          {filtered.map((version, index) => (
            <div key={version.id} className="relative flex gap-3 pb-4 last:pb-0">
              {/* Timeline dot */}
              <div
                className={`relative z-10 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                  index === 0
                    ? "border-primary bg-primary"
                    : "border-border bg-background"
                }`}
              >
                <GitCommit
                  className={`h-2.5 w-2.5 ${
                    index === 0 ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-sm font-medium text-foreground leading-tight">
                    {version.description ?? `Version ${version.versionNumber}`}
                  </p>
                  <button
                    onClick={() => toggleBookmark(version.id)}
                    className="flex-none text-muted-foreground hover:text-foreground transition-colors"
                    title={version.bookmarked ? "Remove bookmark" : "Bookmark"}
                  >
                    {version.bookmarked ? (
                      <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Bookmark className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeAgo(version.createdAt)}
                  </span>
                  <span>v{version.versionNumber}</span>
                  <span>{version.createdBy}</span>
                </div>

                {/* Restore button */}
                {index > 0 && (
                  <button className="mt-1.5 flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                    <RotateCcw className="h-3 w-3" />
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
