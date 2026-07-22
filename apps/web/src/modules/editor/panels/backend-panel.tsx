"use client";

import { useState } from "react";
import { X, Database, Workflow, Package, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { NamedQueriesPane } from "@/modules/settings/database/panes/named-queries-pane";
import { WorkflowsPane } from "@/modules/settings/database/panes/workflows-pane";
import { DataTemplatesPane } from "@/modules/settings/database/panes/data-templates-pane";

type BackendTab = "named-queries" | "workflows" | "templates";

const TABS: { id: BackendTab; label: string; icon: typeof Database }[] = [
  { id: "named-queries", label: "Named Queries", icon: Terminal },
  { id: "workflows", label: "Workflows", icon: Workflow },
  { id: "templates", label: "Templates", icon: Package },
];

interface BackendPanelProps {
  projectId: string;
  onClose: () => void;
}

export function BackendPanel({ projectId, onClose }: BackendPanelProps) {
  const [tab, setTab] = useState<BackendTab>("named-queries");

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold">Backend</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b bg-muted/20 px-3 py-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "named-queries" && <NamedQueriesPane projectId={projectId} />}
        {tab === "workflows" && <WorkflowsPane projectId={projectId} />}
        {tab === "templates" && <DataTemplatesPane projectId={projectId} />}
      </div>
    </div>
  );
}
