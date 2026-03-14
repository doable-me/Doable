"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  Pencil,
  MessageSquare,
  Mic,
  ArrowUp,
  Clock,
  MoreHorizontal,
  Copy,
  Trash2,
  ExternalLink,
  Star,
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

// ─── Mock Data ───────────────────────────────────────────────

interface MockProject {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  gradient: string;
  icon: string;
  starred: boolean;
}

const MOCK_PROJECTS: MockProject[] = [
  {
    id: "demo-1",
    name: "E-Commerce Dashboard",
    description: "Full-stack store with product management, cart, and Stripe checkout",
    updatedAt: "2 hours ago",
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    icon: "cart",
    starred: true,
  },
  {
    id: "demo-2",
    name: "AI Chat Interface",
    description: "Real-time chat app with GPT integration and streaming responses",
    updatedAt: "5 hours ago",
    gradient: "from-cyan-500 via-blue-500 to-indigo-500",
    icon: "chat",
    starred: false,
  },
  {
    id: "demo-3",
    name: "Task Manager Pro",
    description: "Kanban board with drag-and-drop, labels, and team collaboration",
    updatedAt: "1 day ago",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    icon: "check",
    starred: false,
  },
  {
    id: "demo-4",
    name: "Portfolio Site",
    description: "Minimalist portfolio with blog, project gallery, and contact form",
    updatedAt: "3 days ago",
    gradient: "from-orange-500 via-amber-500 to-yellow-500",
    icon: "palette",
    starred: true,
  },
  {
    id: "demo-5",
    name: "Analytics Platform",
    description: "Real-time metrics dashboard with charts, filters, and CSV export",
    updatedAt: "Just now",
    gradient: "from-rose-500 via-pink-500 to-fuchsia-500",
    icon: "chart",
    starred: false,
  },
  {
    id: "demo-6",
    name: "Recipe Sharing App",
    description: "Social recipe platform with ingredients scaling and meal planning",
    updatedAt: "1 week ago",
    gradient: "from-lime-500 via-green-500 to-emerald-500",
    icon: "utensils",
    starred: false,
  },
];

const TEMPLATES = [
  { id: "t-1", name: "SaaS Landing Page", gradient: "from-blue-600 to-cyan-500" },
  { id: "t-2", name: "Admin Dashboard", gradient: "from-violet-600 to-purple-500" },
  { id: "t-3", name: "E-Commerce Store", gradient: "from-emerald-600 to-teal-500" },
  { id: "t-4", name: "Blog Platform", gradient: "from-orange-600 to-amber-500" },
  { id: "t-5", name: "Portfolio", gradient: "from-pink-600 to-rose-500" },
  { id: "t-6", name: "Social Media App", gradient: "from-indigo-600 to-blue-500" },
];

// ─── Project Card ────────────────────────────────────────────

function ProjectCard({
  project,
  onStar,
  onClick,
}: {
  project: MockProject;
  onStar: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div
        className={`relative h-32 bg-gradient-to-br ${project.gradient} flex items-center justify-center`}
      >
        <div className="h-16 w-24 rounded-md bg-white/10 backdrop-blur-sm border border-white/20" />

        {/* Star button */}
        <button
          className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white/70 hover:bg-black/50 hover:text-white transition-all opacity-0 group-hover:opacity-100"
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
          className="absolute top-2.5 left-2.5 opacity-0 group-hover:opacity-100 transition-all"
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
              <DropdownMenuItem className="text-zinc-300 focus:bg-white/5 focus:text-white">
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-400">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 p-4">
        <h3 className="text-sm font-medium text-zinc-200 leading-tight line-clamp-1">
          {project.name}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Clock className="h-3 w-3" />
          Edited {project.updatedAt}
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
  template: { id: string; name: string; gradient: string };
  onClick: () => void;
}) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer"
      onClick={onClick}
    >
      <div
        className={`relative h-32 bg-gradient-to-br ${template.gradient} flex items-center justify-center`}
      >
        <div className="h-12 w-20 rounded-md bg-white/10 backdrop-blur-sm border border-white/20" />
      </div>
      <div className="p-4">
        <h3 className="text-sm font-medium text-zinc-200 line-clamp-1">
          {template.name}
        </h3>
        <p className="text-[11px] text-zinc-500 mt-1">Template</p>
      </div>
    </div>
  );
}

// ─── Chat Input Box ──────────────────────────────────────────

function ChatInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const [mode, setMode] = useState<"chat" | "plan">("chat");

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
          />
        </div>

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-between border-t border-zinc-800/60 px-3 py-2">
          <div className="flex items-center gap-1">
            {/* Attach */}
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors">
              <Plus className="h-4 w-4" />
            </button>

            {/* Visual edits */}
            <button className="flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors text-xs">
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Visual edits</span>
            </button>

            {/* Chat / Plan toggle */}
            <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-800/50 p-0.5">
              <button
                onClick={() => setMode("chat")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                  mode === "chat"
                    ? "bg-zinc-700 text-zinc-200"
                    : "text-zinc-500 hover:text-zinc-400"
                }`}
              >
                <MessageSquare className="h-3 w-3" />
                Chat
              </button>
              <button
                onClick={() => setMode("plan")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                  mode === "plan"
                    ? "bg-zinc-700 text-zinc-200"
                    : "text-zinc-500 hover:text-zinc-400"
                }`}
              >
                Plan
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Mic */}
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors">
              <Mic className="h-4 w-4" />
            </button>

            {/* Submit */}
            <button
              onClick={onSubmit}
              disabled={!value.trim()}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                value.trim()
                  ? "bg-violet-600 text-white hover:bg-violet-500"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              }`}
            >
              <ArrowUp className="h-4 w-4" />
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
  const [projects, setProjects] = useState(MOCK_PROJECTS);

  const firstName = user?.displayName?.split(" ")[0] ?? "there";
  const greeting = useRotatingGreeting(firstName);

  const handleSubmit = () => {
    if (prompt.trim()) {
      const encoded = encodeURIComponent(prompt.trim());
      router.push(`/editor/new?prompt=${encoded}`);
    }
  };

  const toggleStar = (id: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p))
    );
  };

  const navigateToProject = (id: string) => {
    router.push(`/editor/${id}`);
  };

  // Filter projects based on active tab
  const displayProjects =
    activeTab === "projects"
      ? projects
      : activeTab === "recent"
        ? [...projects].sort(() => 0) // In real app, sort by last viewed
        : [];

  const tabs = [
    { key: "recent" as const, label: "Recently viewed" },
    { key: "projects" as const, label: "My projects" },
    { key: "templates" as const, label: "Templates" },
  ];

  return (
    <div className="relative min-h-screen">
      {/* Subtle gradient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-blue-600/[0.04] blur-[120px]" />
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
          />
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-zinc-800 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Project Grid */}
        {activeTab !== "templates" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onStar={() => toggleStar(project.id)}
                onClick={() => navigateToProject(project.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onClick={() => {
                  router.push(`/editor/new?template=${template.id}`);
                }}
              />
            ))}
          </div>
        )}

        {/* Empty State (if no projects) */}
        {activeTab !== "templates" && displayProjects.length === 0 && (
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
