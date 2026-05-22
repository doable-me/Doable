"use client";

import { useState, useCallback, useMemo } from "react";
import { useEditorStore, type FileNode } from "../hooks/use-editor-store";
import { usePreview } from "../hooks/use-preview";
import { useChat } from "../hooks/use-chat";
import {
  Layout,
  Plus,
  Globe,
  FileText,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface PageEntry {
  name: string;
  route: string;
  filePath: string;
}

// ─── Route Detection ────────────────────────────────────────

/**
 * Parse the file tree to find page components.
 * Detects:
 *  - Files in src/pages/ directory (conventional routing)
 *  - index.tsx / App.tsx as root route
 */
function detectPages(fileTree: FileNode[]): PageEntry[] {
  const pages: PageEntry[] = [];

  function walk(nodes: FileNode[], currentPath: string) {
    for (const node of nodes) {
      if (node.type === "directory" && node.children) {
        walk(node.children, node.path);
      }

      if (node.type !== "file") continue;

      const lowerPath = node.path.toLowerCase().replace(/\\/g, "/");
      const lowerName = node.name.toLowerCase();

      // Detect files inside src/pages/
      if (lowerPath.includes("src/pages/")) {
        const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
        if (!["tsx", "jsx", "ts", "js"].includes(ext)) continue;

        const baseName = node.name.replace(/\.[^.]+$/, "");
        const route = deriveRoute(baseName);
        pages.push({
          name: baseName,
          route,
          filePath: node.path,
        });
      }
      // Detect App.tsx / index.tsx at src/ level as root
      else if (
        (lowerName === "app.tsx" || lowerName === "app.jsx") &&
        lowerPath.includes("src/") &&
        !lowerPath.includes("src/pages/")
      ) {
        // App is the shell, not a separate page — skip unless no pages found
      }
    }
  }

  walk(fileTree, "");

  // If no pages found, add a default "Home" entry for the root route
  if (pages.length === 0) {
    pages.push({
      name: "Home",
      route: "/",
      filePath: "src/App.tsx",
    });
  }

  // Sort: Home/Index first, then alphabetical
  pages.sort((a, b) => {
    if (a.route === "/") return -1;
    if (b.route === "/") return 1;
    return a.name.localeCompare(b.name);
  });

  return pages;
}

function deriveRoute(baseName: string): string {
  const lower = baseName.toLowerCase();
  if (lower === "home" || lower === "index") return "/";
  // Convert PascalCase to kebab-case for the route
  const kebab = baseName
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
  return `/${kebab}`;
}

// ─── Add Page Dialog ────────────────────────────────────────

function AddPageDialog({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-3 border-b border-border bg-muted/30">
      <label className="text-xs font-medium text-muted-foreground">
        New Page Name
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Dashboard, Settings, Pricing"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create via AI
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function PagesTab() {
  const { fileTree, projectId, previewUrl } = useEditorStore();
  const { navigate } = usePreview(projectId);
  const { sendMessage, isStreaming } = useChat(projectId);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Detect pages from the file tree
  const pages = useMemo(() => detectPages(fileTree), [fileTree]);

  // Filter by search
  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return pages;
    const q = searchQuery.toLowerCase();
    return pages.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.route.toLowerCase().includes(q)
    );
  }, [pages, searchQuery]);

  // Determine active page based on current preview URL
  const activePage = useMemo(() => {
    if (!previewUrl) return null;
    try {
      const url = new URL(previewUrl);
      const path = url.pathname;
      // Strip the /preview/:projectId prefix if present
      const previewPrefix = projectId ? `/preview/${projectId}` : "";
      const cleanPath = previewPrefix && path.startsWith(previewPrefix)
        ? path.slice(previewPrefix.length) || "/"
        : path;
      return pages.find((p) => p.route === cleanPath)?.route ?? null;
    } catch {
      return null;
    }
  }, [previewUrl, pages, projectId]);

  // Navigate preview to a page route
  const handlePageClick = useCallback(
    (page: PageEntry) => {
      const routePath = page.route === "/" ? "" : page.route;
      navigate(routePath);
    },
    [navigate]
  );

  // Add page via AI
  const handleAddPage = useCallback(
    (name: string) => {
      setShowAddDialog(false);
      const prompt = `Create a new page called "${name}" with a route at /${name.toLowerCase().replace(/\s+/g, "-")}. Add it to the router in App.tsx and create the page component in src/pages/${name.replace(/\s+/g, "")}.tsx with a basic layout that matches the existing pages.`;
      sendMessage(prompt);
    },
    [sendMessage]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pages
        </h3>
        <button
          onClick={() => setShowAddDialog(!showAddDialog)}
          disabled={isStreaming}
          className={cn(
            "flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors",
            isStreaming && "opacity-50 cursor-not-allowed"
          )}
          title="Add a new page"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>

      {/* Add Page Dialog */}
      {showAddDialog && (
        <AddPageDialog
          onSubmit={handleAddPage}
          onCancel={() => setShowAddDialog(false)}
        />
      )}

      {/* Search */}
      {pages.length > 3 && (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
            <Search className="h-3 w-3 text-muted-foreground flex-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pages..."
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Page List */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {filteredPages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-3">
            <FileText className="h-6 w-6 text-muted-foreground/50" />
            <p className="mt-2 text-xs text-muted-foreground text-center">
              {searchQuery ? "No pages match your search." : "No pages detected. Add files to src/pages/ to see them here."}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredPages.map((page) => {
              const isActive = activePage === page.route;
              return (
                <button
                  key={page.filePath}
                  onClick={() => handlePageClick(page)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors group",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Layout
                    className={cn(
                      "h-3.5 w-3.5 flex-none",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <span className="truncate font-medium">{page.name}</span>
                    <span
                      className={cn(
                        "ml-2 flex-none text-[11px] font-mono",
                        isActive
                          ? "text-primary/70"
                          : "text-muted-foreground/60 group-hover:text-muted-foreground"
                      )}
                    >
                      {page.route}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Globe className="h-3 w-3" />
          <span>{pages.length} page{pages.length !== 1 ? "s" : ""} detected</span>
        </div>
      </div>
    </div>
  );
}
