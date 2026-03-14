"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutGrid,
  List,
  Star,
  MoreHorizontal,
  Clock,
  Sparkles,
  ArrowRight,
  Copy,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// ─── Mock Data ──────────────────────────────────────────────

interface MockProject {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "creating";
  updatedAt: string;
  gradient: string;
  icon: string;
}

const MOCK_PROJECTS: MockProject[] = [
  {
    id: "demo-1",
    name: "E-Commerce Dashboard",
    description: "Full-stack store with product management, cart, and Stripe checkout",
    status: "published",
    updatedAt: "2 hours ago",
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    icon: "🛒",
  },
  {
    id: "demo-2",
    name: "AI Chat Interface",
    description: "Real-time chat app with GPT integration and streaming responses",
    status: "draft",
    updatedAt: "5 hours ago",
    gradient: "from-cyan-500 via-blue-500 to-indigo-500",
    icon: "💬",
  },
  {
    id: "demo-3",
    name: "Task Manager Pro",
    description: "Kanban board with drag-and-drop, labels, and team collaboration",
    status: "draft",
    updatedAt: "1 day ago",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    icon: "✅",
  },
  {
    id: "demo-4",
    name: "Portfolio Site",
    description: "Minimalist portfolio with blog, project gallery, and contact form",
    status: "published",
    updatedAt: "3 days ago",
    gradient: "from-orange-500 via-amber-500 to-yellow-500",
    icon: "🎨",
  },
  {
    id: "demo-5",
    name: "Analytics Platform",
    description: "Real-time metrics dashboard with charts, filters, and CSV export",
    status: "creating",
    updatedAt: "Just now",
    gradient: "from-rose-500 via-pink-500 to-fuchsia-500",
    icon: "📊",
  },
  {
    id: "demo-6",
    name: "Recipe Sharing App",
    description: "Social recipe platform with ingredients scaling and meal planning",
    status: "draft",
    updatedAt: "1 week ago",
    gradient: "from-lime-500 via-green-500 to-emerald-500",
    icon: "🍳",
  },
];

// ─── Greeting ──────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Status Badge ──────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: {
      label: "Draft",
      className: "bg-gray-100 text-gray-600 border-gray-200",
    },
    published: {
      label: "Published",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    creating: {
      label: "Creating...",
      className: "bg-violet-50 text-violet-700 border-violet-200 animate-pulse",
    },
  };
  const c = config[status] ?? config.draft!;
  return (
    <Badge variant="outline" className={`text-[11px] font-medium ${c!.className}`}>
      {c!.label}
    </Badge>
  );
}

// ─── Project Card ──────────────────────────────────────────

function ProjectCard({
  project,
  starred,
  onToggleStar,
  onClick,
}: {
  project: MockProject;
  starred: boolean;
  onToggleStar: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200/60 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300/80 hover:-translate-y-0.5 cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div
        className={`relative h-36 bg-gradient-to-br ${project.gradient} flex items-center justify-center`}
      >
        <span className="text-4xl opacity-80 drop-shadow-sm">{project.icon}</span>

        {/* Star button */}
        <button
          className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/20 backdrop-blur-sm text-white/80 hover:bg-black/30 hover:text-white transition-all opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
        >
          <Star
            className={`h-3.5 w-3.5 ${starred ? "fill-yellow-400 text-yellow-400" : ""}`}
          />
        </button>

        {/* More menu */}
        <div
          className="absolute top-2.5 left-2.5 opacity-0 group-hover:opacity-100 transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-full bg-black/20 backdrop-blur-sm text-white/80 hover:bg-black/30 hover:text-white transition-all">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onClick()}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Open in editor
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-1">
            {project.name}
          </h3>
          <StatusBadge status={project.status} />
        </div>
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
          {project.description}
        </p>
        <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-400">
          <Clock className="h-3 w-3" />
          {project.updatedAt}
        </div>
      </div>
    </div>
  );
}

// ─── Project List Row ──────────────────────────────────────

function ProjectListRow({
  project,
  starred,
  onToggleStar,
  onClick,
}: {
  project: MockProject;
  starred: boolean;
  onToggleStar: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-4 rounded-lg border border-gray-200/60 bg-white px-4 py-3 transition-all hover:shadow-sm hover:border-gray-300/80 cursor-pointer"
      onClick={onClick}
    >
      {/* Icon */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${project.gradient}`}
      >
        <span className="text-lg">{project.icon}</span>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <h3 className="text-sm font-semibold text-gray-900 truncate">
          {project.name}
        </h3>
        <p className="text-xs text-gray-500 truncate">{project.description}</p>
      </div>

      {/* Meta */}
      <StatusBadge status={project.status} />

      <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400 shrink-0">
        <Clock className="h-3 w-3" />
        {project.updatedAt}
      </span>

      {/* Star */}
      <button
        className="shrink-0 text-gray-300 hover:text-yellow-500 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar();
        }}
      >
        <Star
          className={`h-4 w-4 ${starred ? "fill-yellow-400 text-yellow-400" : ""}`}
        />
      </button>
    </div>
  );
}

// ─── Main Dashboard Page ───────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [prompt, setPrompt] = useState("");
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set(["demo-1"]));

  const toggleStar = (id: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const navigateToProject = (id: string) => {
    router.push(`/editor/${id}`);
  };

  const handleCreate = () => {
    if (prompt.trim()) {
      // In production this would create a project via API
      router.push("/editor/demo-1");
    }
  };

  // Sort: starred first, then by most recent
  const sortedProjects = [...MOCK_PROJECTS].sort((a, b) => {
    const aStarred = starredIds.has(a.id) ? 1 : 0;
    const bStarred = starredIds.has(b.id) ? 1 : 0;
    return bStarred - aStarred;
  });

  const starredProjects = sortedProjects.filter((p) => starredIds.has(p.id));
  const otherProjects = sortedProjects.filter((p) => !starredIds.has(p.id));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Greeting + Prompt */}
      <section className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
          {getGreeting()} ✨
        </h1>
        <p className="text-gray-500 mb-6">What do you want to build today?</p>

        {/* Prompt Input */}
        <div className="relative rounded-2xl border border-gray-200 bg-white shadow-sm transition-all focus-within:shadow-md focus-within:border-violet-300">
          <div className="flex items-start gap-3 p-4">
            <Sparkles className="mt-1 h-5 w-5 shrink-0 text-violet-500" />
            <textarea
              className="flex-1 resize-none border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none min-h-[60px]"
              placeholder="Describe the app you want to build... e.g. 'A project management tool with kanban boards and team collaboration'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleCreate();
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5">
            <span className="text-xs text-gray-400">
              Press{" "}
              <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px]">
                Ctrl + Enter
              </kbd>{" "}
              to create
            </span>
            <Button
              size="sm"
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-sm rounded-lg px-5"
              onClick={handleCreate}
              disabled={!prompt.trim()}
            >
              Create project
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Projects Header */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Your projects</h2>
            <p className="text-sm text-gray-500">
              {MOCK_PROJECTS.length} project{MOCK_PROJECTS.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`rounded-md p-1.5 transition-all ${
                viewMode === "grid"
                  ? "bg-gray-100 text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`rounded-md p-1.5 transition-all ${
                viewMode === "list"
                  ? "bg-gray-100 text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Starred Section */}
        {starredProjects.length > 0 && (
          <div className="mb-8">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              Starred
            </h3>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {starredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    starred={true}
                    onToggleStar={() => toggleStar(project.id)}
                    onClick={() => navigateToProject(project.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {starredProjects.map((project) => (
                  <ProjectListRow
                    key={project.id}
                    project={project}
                    starred={true}
                    onToggleStar={() => toggleStar(project.id)}
                    onClick={() => navigateToProject(project.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Projects */}
        <div>
          {starredProjects.length > 0 && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              All projects
            </h3>
          )}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  starred={false}
                  onToggleStar={() => toggleStar(project.id)}
                  onClick={() => navigateToProject(project.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {otherProjects.map((project) => (
                <ProjectListRow
                  key={project.id}
                  project={project}
                  starred={false}
                  onToggleStar={() => toggleStar(project.id)}
                  onClick={() => navigateToProject(project.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
