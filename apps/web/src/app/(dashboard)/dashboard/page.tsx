"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  apiListProjects,
  apiCreateProject,
  apiToggleStarProject,
  apiDeleteProject,
  apiDuplicateProject,
  apiListTemplates,
  type ApiProject,
  type ApiTemplate,
} from "@/lib/api";
import {
  Plus,
  MessageSquare,
  Mic,
  ArrowUp,
  MoreHorizontal,
  Copy,
  Trash2,
  ExternalLink,
  Star,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// ─── Greeting Variations ─────────────────────────────────────

const GREETINGS = [
  "Got an idea",
  "What will you build",
  "Ready to create",
  "Feeling inspired",
  "Something on your mind",
];

function useRotatingGreeting(name: string) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % GREETINGS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return `${GREETINGS[index]}, ${name}?`;
}

// ─── Time Formatting ─────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

// ─── Project Card ────────────────────────────────────────────

function ProjectCard({
  project,
  onStar,
  onClick,
  onDelete,
  onDuplicate,
}: {
  project: ApiProject;
  onStar: () => void;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail — wireframe mockup */}
      <div className="relative h-36 bg-white rounded-t-xl p-3 overflow-hidden">
        {/* Mini wireframe: nav bar, content blocks */}
        <div className="h-2 w-16 bg-gray-200 rounded mb-2" />
        <div className="h-2 w-full bg-gray-100 rounded mb-1" />
        <div className="h-2 w-3/4 bg-gray-100 rounded mb-3" />
        <div className="flex gap-2 mb-2">
          <div className="h-8 w-8 bg-gray-200 rounded" />
          <div className="flex-1">
            <div className="h-2 w-full bg-gray-100 rounded mb-1" />
            <div className="h-2 w-2/3 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="h-6 w-20 bg-purple-100 rounded" />

        {/* Star button */}
        <button
          className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
        >
          <Star
            className={`h-3.5 w-3.5 ${project.starred ? "fill-yellow-400 text-yellow-400" : ""}`}
          />
        </button>

        {/* More menu */}
        <div
          className="absolute top-2.5 left-2.5 opacity-0 group-hover:opacity-100 transition-all [&_button]:text-gray-400 [&_button]:bg-gray-100 [&_button:hover]:bg-gray-200 [&_button:hover]:text-gray-600"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white/70 hover:bg-black/50 hover:text-white transition-all">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-800">
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white"
                onClick={() => onClick()}
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Open in editor
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white"
                onClick={() => onDuplicate()}
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                onClick={() => onDelete()}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center gap-2.5 p-3">
        {/* User avatar */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-[10px] font-semibold text-white">
          {project.name?.charAt(0)?.toUpperCase() ?? "U"}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="text-sm font-medium text-zinc-200 leading-tight line-clamp-1">
            {project.name}
          </h3>
          <span className="text-[11px] text-zinc-500">
            Viewed {formatRelativeTime(project.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Template Card ───────────────────────────────────────────

function TemplateCard({
  template,
  onClick,
}: {
  template: ApiTemplate;
  onClick: () => void;
}) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer"
      onClick={onClick}
    >
      <div className="relative h-36 bg-white rounded-t-xl p-3 overflow-hidden">
        {/* Distinct wireframe mockups per template category */}
        {template.category === "dashboard" || template.id === "saas-dashboard" ? (
          <>
            <div className="flex gap-2 mb-2">
              <div className="h-full w-10 bg-gray-100 rounded" />
              <div className="flex-1">
                <div className="h-2 w-24 bg-gray-200 rounded mb-2" />
                <div className="flex gap-2 mb-2">
                  <div className="h-10 flex-1 bg-blue-50 rounded" />
                  <div className="h-10 flex-1 bg-green-50 rounded" />
                  <div className="h-10 flex-1 bg-purple-50 rounded" />
                </div>
                <div className="h-12 w-full bg-gray-50 rounded" />
              </div>
            </div>
          </>
        ) : template.category === "marketing" || template.id === "landing-page" ? (
          <>
            <div className="h-2 w-20 bg-gray-200 rounded mx-auto mb-2" />
            <div className="h-3 w-32 bg-gray-100 rounded mx-auto mb-1" />
            <div className="h-2 w-24 bg-gray-100 rounded mx-auto mb-3" />
            <div className="h-6 w-16 bg-blue-100 rounded mx-auto mb-2" />
            <div className="flex gap-2">
              <div className="h-12 flex-1 bg-gray-50 rounded" />
              <div className="h-12 flex-1 bg-gray-50 rounded" />
              <div className="h-12 flex-1 bg-gray-50 rounded" />
            </div>
          </>
        ) : template.category === "ecommerce" || template.id === "ecommerce-store" ? (
          <>
            <div className="h-2 w-full bg-gray-200 rounded mb-2" />
            <div className="grid grid-cols-3 gap-1.5">
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded" />
            </div>
          </>
        ) : template.category === "blog" || template.id === "blog" ? (
          <>
            <div className="h-2 w-20 bg-gray-200 rounded mb-2" />
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="h-10 w-10 bg-gray-100 rounded" />
                <div className="flex-1">
                  <div className="h-2 w-full bg-gray-100 rounded mb-1" />
                  <div className="h-2 w-3/4 bg-gray-50 rounded" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-10 w-10 bg-gray-100 rounded" />
                <div className="flex-1">
                  <div className="h-2 w-full bg-gray-100 rounded mb-1" />
                  <div className="h-2 w-2/3 bg-gray-50 rounded" />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="h-2 w-16 bg-gray-200 rounded mb-2" />
            <div className="h-2 w-full bg-gray-100 rounded mb-1" />
            <div className="h-2 w-3/4 bg-gray-100 rounded mb-3" />
            <div className="flex gap-2 mb-2">
              <div className="h-8 w-8 bg-gray-200 rounded" />
              <div className="flex-1">
                <div className="h-2 w-full bg-gray-100 rounded mb-1" />
                <div className="h-2 w-2/3 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="h-6 w-20 bg-indigo-100 rounded" />
          </>
        )}
        {template.isOfficial && (
          <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            Official
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-sm font-medium text-zinc-200 line-clamp-1">
          {template.name}
        </h3>
        <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">
          {template.description}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-zinc-600 rounded-full bg-zinc-800 px-2 py-0.5">
            {template.category}
          </span>
          <span className="text-[10px] text-zinc-600">
            {template.fileCount} files
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Chat Input Box ──────────────────────────────────────────

function ChatInput({
  value,
  onChange,
  onSubmit,
  isCreating,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isCreating: boolean;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-2xl shadow-black/20 transition-all focus-within:border-zinc-700">
        {/* Text Area */}
        <div className="p-4 pb-2">
          <textarea
            className="w-full resize-none border-0 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none min-h-[48px]"
            placeholder="Ask Doable to create..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isCreating}
          />
        </div>

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-between border-t border-zinc-800/60 px-3 py-2">
          <div className="flex items-center gap-1">
            {/* Attach */}
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors">
              <Plus className="h-4 w-4" />
            </button>

            {/* Chat icon */}
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors">
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Mic */}
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors">
              <Mic className="h-4 w-4" />
            </button>

            {/* Submit */}
            <button
              onClick={onSubmit}
              disabled={!value.trim() || isCreating}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                value.trim() && !isCreating
                  ? "bg-violet-600 text-white hover:bg-violet-500"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              }`}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard Page ─────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [activeTab, setActiveTab] = useState<"recent" | "projects" | "templates">("recent");
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstName = user?.displayName?.split(" ")[0] ?? "there";
  const greeting = useRotatingGreeting(firstName);

  // Fetch projects on mount
  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const res = await apiListProjects({ pageSize: 50 });
      setProjects(res.data);
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      setError("Failed to load projects");
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await apiListTemplates();
      // Filter out the blank template since it's not useful as a starter
      setTemplates(res.data.templates.filter((t) => t.id !== "blank"));
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Fetch templates when the Templates tab is first activated
  useEffect(() => {
    if (activeTab === "templates" && templates.length === 0 && !isLoadingTemplates) {
      fetchTemplates();
    }
  }, [activeTab, templates.length, isLoadingTemplates, fetchTemplates]);

  const handleSubmit = async () => {
    if (!prompt.trim() || isCreating) return;

    setIsCreating(true);
    try {
      // Create a real project from the prompt
      const projectName = prompt.trim().slice(0, 100);
      const res = await apiCreateProject({
        name: projectName,
        description: prompt.trim(),
        prompt: prompt.trim(),
      });
      // Navigate to the editor with the new project
      router.push(`/editor/${res.data.id}?prompt=${encodeURIComponent(prompt.trim())}`);
    } catch (err) {
      console.error("Failed to create project:", err);
      setError("Failed to create project. Please try again.");
      setIsCreating(false);
    }
  };

  const toggleStar = async (id: string) => {
    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p))
    );
    try {
      await apiToggleStarProject(id);
    } catch (err) {
      console.error("Failed to toggle star:", err);
      // Revert on error
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p))
      );
    }
  };

  const handleDelete = async (id: string) => {
    // Optimistic removal
    setProjects((prev) => prev.filter((p) => p.id !== id));
    try {
      await apiDeleteProject(id);
    } catch (err) {
      console.error("Failed to delete project:", err);
      // Refetch to restore state
      fetchProjects();
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await apiDuplicateProject(id);
      // Add the duplicated project to the list
      setProjects((prev) => [res.data, ...prev]);
    } catch (err) {
      console.error("Failed to duplicate project:", err);
    }
  };

  const navigateToProject = (id: string) => {
    router.push(`/editor/${id}`);
  };

  // Filter projects based on active tab
  const displayProjects =
    activeTab === "projects"
      ? projects
      : activeTab === "recent"
        ? [...projects].sort(
            (a, b) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
        : [];

  const tabs = [
    { key: "recent" as const, label: "Recently viewed" },
    { key: "projects" as const, label: "My projects" },
    { key: "templates" as const, label: "Templates" },
  ];

  return (
    <div className="relative min-h-screen">
      {/* Gradient background matching Lovable's blue-to-pink */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 left-1/4 h-[600px] w-[600px] rounded-full bg-blue-600/[0.08] blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 h-[500px] w-[500px] rounded-full bg-purple-600/[0.06] blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-pink-600/[0.06] blur-[120px]" />
        <div className="absolute top-20 right-1/4 h-[400px] w-[400px] rounded-full bg-purple-600/[0.05] blur-[120px]" />
        <div className="absolute top-40 left-1/2 h-[300px] w-[300px] rounded-full bg-pink-600/[0.03] blur-[100px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-4xl px-6 pt-16 pb-10">
        {/* Greeting */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight transition-all duration-500">
            {greeting}
          </h1>
        </div>

        {/* Chat Input */}
        <div className="mb-14">
          <ChatInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleSubmit}
            isCreating={isCreating}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            {error}
            <button
              onClick={() => {
                setError(null);
                fetchProjects();
              }}
              className="ml-2 underline hover:text-red-300"
            >
              Retry
            </button>
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex items-center mb-6">
          <div className="flex items-center gap-1 flex-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? "text-white bg-zinc-800"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Browse all
            <span className="text-lg leading-none">→</span>
          </button>
        </div>

        {/* Loading State */}
        {isLoading && activeTab !== "templates" && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500 mb-4" />
            <p className="text-sm text-zinc-500">Loading projects...</p>
          </div>
        )}

        {/* Project Grid */}
        {!isLoading && activeTab !== "templates" && displayProjects.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onStar={() => toggleStar(project.id)}
                onClick={() => navigateToProject(project.id)}
                onDelete={() => handleDelete(project.id)}
                onDuplicate={() => handleDuplicate(project.id)}
              />
            ))}
          </div>
        )}

        {/* Templates Grid */}
        {activeTab === "templates" && (
          isLoadingTemplates ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-500 mb-4" />
              <p className="text-sm text-zinc-500">Loading templates...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onClick={async () => {
                    setIsCreating(true);
                    try {
                      const res = await apiCreateProject({
                        name: template.name,
                        description: template.description,
                        templateId: template.id,
                      });
                      router.push(`/editor/${res.data.id}`);
                    } catch (err) {
                      console.error("Failed to create project from template:", err);
                      setError("Failed to create project from template. Please try again.");
                      setIsCreating(false);
                    }
                  }}
                />
              ))}
              {templates.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-zinc-500">No templates available.</p>
                </div>
              )}
            </div>
          )
        )}

        {/* Empty State (if no projects) */}
        {!isLoading && activeTab !== "templates" && displayProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-zinc-600" />
            </div>
            <h3 className="text-lg font-medium text-zinc-300 mb-2">
              No projects yet
            </h3>
            <p className="text-sm text-zinc-500 max-w-sm">
              Describe what you want to build in the chat above and Doable will create it for you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
