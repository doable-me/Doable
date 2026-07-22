"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useDataToken } from "./hooks/use-data-token";
import { OverviewPane } from "./panes/overview-pane";
import { SchemaPane } from "./panes/schema-pane";
import { RowsPane } from "./panes/rows-pane";
import { QueriesPane } from "./panes/queries-pane";
import { MigrationsPane } from "./panes/migrations-pane";
import { DangerPane } from "./panes/danger-pane";
import { NamedQueriesPane } from "./panes/named-queries-pane";
import { WorkflowsPane } from "./panes/workflows-pane";
import { DataTemplatesPane } from "./panes/data-templates-pane";

type Pane =
  | "overview"
  | "schema"
  | "rows"
  | "queries"
  | "named-queries"
  | "workflows"
  | "templates"
  | "migrations"
  | "danger";

const PANES: { id: Pane; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "schema", label: "Schema" },
  { id: "rows", label: "Rows" },
  { id: "queries", label: "SQL" },
  { id: "named-queries", label: "Named Queries" },
  { id: "workflows", label: "Workflows" },
  { id: "templates", label: "Templates" },
  { id: "migrations", label: "Migrations" },
  { id: "danger", label: "Danger Zone" },
];

interface DatabaseTabProps {
  projectId: string;
}

export function DatabaseTab({ projectId }: DatabaseTabProps) {
  const [activePane, setActivePane] = useState<Pane>(() => {
    if (typeof window === "undefined") return "overview";
    const p = new URLSearchParams(window.location.search).get("pane") as Pane | null;
    return PANES.some((x) => x.id === p) ? (p as Pane) : "overview";
  });

  const tokenState = useDataToken(projectId);

  function navigate(pane: string) {
    const valid = PANES.some((x) => x.id === pane);
    if (!valid) return;
    setActivePane(pane as Pane);
    const url = new URL(window.location.href);
    url.searchParams.set("pane", pane);
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label="Database panes"
        className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1"
      >
        {PANES.map((pane) => (
          <button
            key={pane.id}
            role="tab"
            aria-selected={activePane === pane.id}
            onClick={() => navigate(pane.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              activePane === pane.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {pane.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {activePane === "overview" && (
          <OverviewPane projectId={projectId} tokenState={tokenState} onNavigate={navigate} />
        )}
        {activePane === "schema" && <SchemaPane projectId={projectId} tokenState={tokenState} />}
        {activePane === "rows" && <RowsPane tokenState={tokenState} />}
        {activePane === "queries" && <QueriesPane tokenState={tokenState} />}
        {activePane === "named-queries" && <NamedQueriesPane projectId={projectId} />}
        {activePane === "workflows" && <WorkflowsPane projectId={projectId} />}
        {activePane === "templates" && <DataTemplatesPane projectId={projectId} />}
        {activePane === "migrations" && <MigrationsPane projectId={projectId} />}
        {activePane === "danger" && <DangerPane projectId={projectId} tokenState={tokenState} />}
      </div>
    </div>
  );
}
