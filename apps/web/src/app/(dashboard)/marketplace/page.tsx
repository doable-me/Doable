"use client";

import { useState, useEffect } from "react";
import { apiListWorkspaces, type ApiWorkspace } from "@/lib/api";
import { MarketplacePanel } from "@/modules/marketplace/marketplace-panel";
import { Loader2 } from "lucide-react";

export default function MarketplacePage() {
  const [workspace, setWorkspace] = useState<ApiWorkspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiListWorkspaces();
        if (res.data.length > 0) {
          // Honor the workspace the sidebar has active so installs land
          // in the workspace the user expects.
          const activeId = typeof window !== "undefined"
            ? localStorage.getItem("doable_active_workspace_id")
            : null;
          const active = activeId ? res.data.find((w) => w.id === activeId) : null;
          setWorkspace(active ?? res.data[0] ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        No workspace found
      </div>
    );
  }

  return <MarketplacePanel workspaceId={workspace.id} />;
}
