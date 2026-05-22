"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  apiDiscoverProjects,
  apiFeaturedProjects,
  apiCommunityCategories,
  apiRemixProject,
  type ApiPublicProject,
} from "@/lib/api";
import Link from "next/link";
import {
  Search,
  Loader2,
  Sparkles,
  Eye,
  GitFork,
  Star,
  TrendingUp,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Category colors ────────────────────────────────────────

function getCategoryColor(category: string | null): string {
  switch (category?.toLowerCase()) {
    case "dashboard":
      return "bg-indigo-500/15 text-indigo-400 border-indigo-500/20";
    case "marketing":
      return "bg-purple-500/15 text-purple-400 border-purple-500/20";
    case "ecommerce":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "content":
      return "bg-orange-500/15 text-orange-400 border-orange-500/20";
    case "personal":
      return "bg-teal-500/15 text-teal-400 border-teal-500/20";
    case "productivity":
      return "bg-green-500/15 text-green-400 border-green-500/20";
    default:
      return "bg-blue-500/15 text-blue-400 border-blue-500/20";
  }
}

function getCategoryGradient(category: string | null): string {
  switch (category?.toLowerCase()) {
    case "dashboard":
      return "from-indigo-900/40 to-indigo-950/30";
    case "marketing":
      return "from-purple-900/40 to-purple-950/30";
    case "ecommerce":
      return "from-amber-900/40 to-amber-950/30";
    case "content":
      return "from-orange-900/40 to-orange-950/30";
    case "personal":
      return "from-teal-900/40 to-teal-950/30";
    case "productivity":
      return "from-green-900/40 to-green-950/30";
    default:
      return "from-blue-900/40 to-blue-950/30";
  }
}

// ─── Community Project Card ─────────────────────────────────

function ProjectCard({
  project,
  onRemix,
  isRemixing,
}: {
  project: ApiPublicProject;
  onRemix: () => void;
  isRemixing: boolean;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-border hover:-translate-y-0.5 hover:shadow-lg">
      {/* Thumbnail / gradient placeholder */}
      <div className={cn("relative h-44 w-full overflow-hidden bg-gradient-to-br", getCategoryGradient(project.category))}>
        {project.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt={project.title}
            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-3xl font-bold text-foreground/10">
              {project.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Featured badge */}
        {project.featured && (
          <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5">
            <Star className="h-3 w-3 text-white" />
            <span className="text-[10px] font-semibold text-white">Featured</span>
          </div>
        )}

        {/* Stats overlay */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-foreground/45 backdrop-blur-sm px-2 py-0.5 text-[10px] text-background">
            <Eye className="h-3 w-3" />
            {project.view_count}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-foreground/45 backdrop-blur-sm px-2 py-0.5 text-[10px] text-background">
            <GitFork className="h-3 w-3" />
            {project.remix_count}
          </span>
        </div>
      </div>

      {/* Info section */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground line-clamp-1 transition-colors">
            {project.title}
          </h3>
        </div>

        {project.description && (
          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {project.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-2">
          {project.category && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                getCategoryColor(project.category)
              )}
            >
              {project.category}
            </span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemix();
            }}
            disabled={isRemixing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              isRemixing
                ? "bg-secondary text-muted-foreground cursor-wait"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isRemixing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Remixing...
              </>
            ) : (
              <>
                <GitFork className="h-3 w-3" />
                Remix
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Discover Page ─────────────────────────────────────

export default function DiscoverPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<ApiPublicProject[]>([]);
  const [featuredProjects, setFeaturedProjects] = useState<ApiPublicProject[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [remixingId, setRemixingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 12;

  // ─── Load featured + categories on mount ──────────────

  useEffect(() => {
    async function loadInitial() {
      try {
        const [featured, cats] = await Promise.all([
          apiFeaturedProjects(),
          apiCommunityCategories(),
        ]);
        setFeaturedProjects(featured.data.projects);
        setCategories(cats.data.categories);
      } catch (err) {
        console.error("Failed to load community data:", err);
      }
    }
    loadInitial();
  }, []);

  // ─── Load projects (paginated + filtered) ─────────────

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiDiscoverProjects({
        category: activeCategory ?? undefined,
        search: searchQuery || undefined,
        page,
        pageSize,
      });
      setProjects(res.data.projects);
      setTotal(res.data.total);
    } catch (err) {
      console.error("Failed to discover projects:", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeCategory, searchQuery, page]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // ─── Remix handler ────────────────────────────────────

  async function handleRemix(project: ApiPublicProject) {
    setRemixingId(project.project_id);
    try {
      const res = await apiRemixProject(project.project_id);
      router.push(`/editor/${res.data.projectId}`);
    } catch (err) {
      console.error("Failed to remix:", err);
      setRemixingId(null);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">Discover</h1>
              <Link
                href="/help/discover-vs-marketplace"
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                title="What's the difference between Discover and Marketplace?"
              >
                <HelpCircle className="h-3 w-3" />
                Discover vs Marketplace
              </Link>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Explore community projects and remix them into your own
            </p>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-9 w-64 rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Featured Section */}
        {featuredProjects.length > 0 && !searchQuery && !activeCategory && (
          <div className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-400" />
              <h2 className="text-lg font-semibold text-foreground">Featured</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredProjects.slice(0, 3).map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onRemix={() => handleRemix(project)}
                  isRemixing={remixingId === project.project_id}
                />
              ))}
            </div>
          </div>
        )}

        {/* Category Filter Tabs */}
        <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border pb-px">
          <button
            onClick={() => {
              setActiveCategory(null);
              setPage(1);
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeCategory === null
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                setPage(1);
              }}
              className={cn(
                "flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px capitalize",
                activeCategory === cat
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? `No projects matching "${searchQuery}"`
                : "No community projects yet. Be the first to publish!"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onRemix={() => handleRemix(project)}
                  isRemixing={remixingId === project.project_id}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
