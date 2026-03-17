"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useImageAttachments, type ImageAttachment } from "@/hooks/use-image-attachments";
import {
  apiListProjects,
  apiListStarredProjects,
  apiCreateProject,
  apiToggleStarProject,
  apiDeleteProject,
  apiDuplicateProject,
  apiUpdateProject,
  apiListTemplates,
  apiFetch,
  type ApiProject,
  type ApiTemplate,
} from "@/lib/api";
import {
  DASHBOARD_EVENTS,
  emitDashboardEvent,
  type DashboardFilter,
} from "@/components/dashboard/sidebar";
import {
  Plus,
  Mic,
  ArrowUp,
  MoreHorizontal,
  Copy,
  Trash2,
  ExternalLink,
  Star,
  Loader2,
  Search,
  LayoutGrid,
  List,
  Filter,
  X,
  Pencil,
  FolderInput,
  CheckSquare,
  Square,
  ChevronDown,
  ArrowUpDown,
  ChevronUp,
  Globe,
  AlertCircle,
  FileCode,
  FolderOpen,
  FolderIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Folder } from "@doable/shared";
import { TemplateCard as NewTemplateCard } from "@/components/templates/template-card";
import { TemplatePreviewModal } from "@/components/templates/template-preview-modal";
import { UseTemplateDialog } from "@/components/templates/use-template-dialog";
import { ArrowRight } from "lucide-react";

// ---- Constants ----

const VIEW_MODE_KEY = "doable_dashboard_view";

const GREETINGS = [
  "Let's make it Doable",
  "What's Doable today",
  "Ready to get it done",
  "Dream it. Do it",
  "What will you ship",
];

type ViewMode = "grid" | "list";
type StatusFilter = "all" | "published" | "draft" | "error";
type SortKey = "name" | "updated_at" | "created_at" | "status";
type SortDir = "asc" | "desc";

// ---- Project Card Gradient Helpers ----

const PROJECT_GRADIENTS = [
  "from-violet-500/20 to-purple-600/20",
  "from-blue-500/20 to-cyan-600/20",
  "from-emerald-500/20 to-teal-600/20",
  "from-orange-500/20 to-amber-600/20",
  "from-pink-500/20 to-rose-600/20",
  "from-indigo-500/20 to-blue-600/20",
  "from-fuchsia-500/20 to-pink-600/20",
  "from-cyan-500/20 to-sky-600/20",
];

const PROJECT_ACCENT_COLORS = [
  "bg-violet-500/30",
  "bg-blue-500/30",
  "bg-emerald-500/30",
  "bg-orange-500/30",
  "bg-pink-500/30",
  "bg-indigo-500/30",
  "bg-fuchsia-500/30",
  "bg-cyan-500/30",
];

function getProjectColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % PROJECT_GRADIENTS.length;
}

const TEMPLATE_CATEGORY_COLORS: Record<string, { bg: string; accent: string; highlight: string }> = {
  dashboard: { bg: "bg-blue-50", accent: "bg-blue-100", highlight: "bg-blue-200" },
  marketing: { bg: "bg-amber-50", accent: "bg-amber-100", highlight: "bg-amber-200" },
  ecommerce: { bg: "bg-emerald-50", accent: "bg-emerald-100", highlight: "bg-emerald-200" },
  blog: { bg: "bg-rose-50", accent: "bg-rose-100", highlight: "bg-rose-200" },
  social: { bg: "bg-violet-50", accent: "bg-violet-100", highlight: "bg-violet-200" },
  productivity: { bg: "bg-cyan-50", accent: "bg-cyan-100", highlight: "bg-cyan-200" },
  portfolio: { bg: "bg-indigo-50", accent: "bg-indigo-100", highlight: "bg-indigo-200" },
};

function getTemplateCategoryColors(category: string) {
  return TEMPLATE_CATEGORY_COLORS[category] ?? { bg: "bg-gray-50", accent: "bg-gray-100", highlight: "bg-gray-200" };
}

// ---- Helpers ----

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
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  published: {
    label: "Published",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  draft: {
    label: "Draft",
    className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
  creating: {
    label: "Creating",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  error: {
    label: "Error",
    className: "bg-red-500/10 text-red-400 border-red-500/20",
  },
};

// ---- Context Menu (right-click) ----

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  projectId: string | null;
}

function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    projectId: null,
  });

  const show = useCallback((e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ visible: true, x: e.clientX, y: e.clientY, projectId });
  }, []);

  const hide = useCallback(() => {
    setMenu((m) => ({ ...m, visible: false, projectId: null }));
  }, []);

  // Close on click outside or scroll
  useEffect(() => {
    if (!menu.visible) return;
    const handler = () => hide();
    document.addEventListener("click", handler);
    document.addEventListener("scroll", handler, true);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("scroll", handler, true);
    };
  }, [menu.visible, hide]);

  return { menu, show, hide };
}

// ---- Chat Input Box ----

const DASHBOARD_SUGGESTIONS = [
  "Build a SaaS landing page with pricing...",
  "Create a portfolio website with animations...",
  "Design a task management app...",
  "Make an e-commerce store with checkout...",
  "Build a social media dashboard...",
  "Create a recipe sharing platform...",
  "Design a fitness tracking app...",
  "Build a blog with markdown support...",
  "Create a real-time chat application...",
  "Make an invoice management system...",
];

function useTypingPlaceholder(): string {
  const [index, setIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "erasing">("typing");

  useEffect(() => {
    const target = DASHBOARD_SUGGESTIONS[index]!;
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (displayText.length < target.length) {
        timeout = setTimeout(() => {
          setDisplayText(target.slice(0, displayText.length + 1));
        }, 35 + Math.random() * 25);
      } else {
        timeout = setTimeout(() => setPhase("holding"), 100);
      }
    } else if (phase === "holding") {
      timeout = setTimeout(() => setPhase("erasing"), 2500);
    } else {
      if (displayText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1));
        }, 18);
      } else {
        setIndex((prev) => (prev + 1) % DASHBOARD_SUGGESTIONS.length);
        setPhase("typing");
      }
    }

    return () => clearTimeout(timeout);
  }, [displayText, phase, index]);

  return displayText || "Ask Doable to create...";
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  isCreating,
  attachments,
  onOpenFilePicker,
  onRemoveImage,
  isListening,
  isMicSupported,
  onToggleMic,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isCreating: boolean;
  attachments: ImageAttachment[];
  onOpenFilePicker: () => void;
  onRemoveImage: (index: number) => void;
  isListening: boolean;
  isMicSupported: boolean;
  onToggleMic: () => void;
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

  const placeholder = useTypingPlaceholder();
  const hasContent = value.trim() || attachments.length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-2xl shadow-black/20 transition-all focus-within:border-zinc-700">
        <div className="p-4 pb-2">
          <textarea
            className="w-full resize-none border-0 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none min-h-[48px]"
            placeholder={value ? "" : placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isCreating}
          />
        </div>
        {/* Image preview thumbnails */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-2 px-4 pb-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative group/thumb">
                <img
                  src={att.data}
                  alt={att.name}
                  className="h-16 w-16 rounded-lg object-cover border border-zinc-700"
                />
                <button
                  onClick={() => onRemoveImage(i)}
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-white hover:bg-red-600 hover:border-red-600 transition-colors opacity-0 group-hover/thumb:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-zinc-800/60 px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenFilePicker}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors"
              title="Attach image"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {isMicSupported && (
              <button
                onClick={onToggleMic}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  isListening
                    ? "text-red-400 bg-red-500/10 animate-pulse"
                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                }`}
                title={isListening ? "Stop recording" : "Voice input"}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onSubmit}
              disabled={!hasContent || isCreating}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                hasContent && !isCreating
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

// ---- Project Card (Grid View) ----

function ProjectCard({
  project,
  selected,
  onSelect,
  onStar,
  onClick,
  onDelete,
  onDuplicate,
  onRename,
  onContextMenu,
}: {
  project: ApiProject;
  selected: boolean;
  onSelect: (id: string, add: boolean) => void;
  onStar: () => void;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const statusStyle = STATUS_STYLES[project.status] ?? STATUS_STYLES.draft!;
  const [imgFailed, setImgFailed] = useState(false);
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const colorIdx = getProjectColorIndex(project.name);

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200 cursor-pointer ${
        selected
          ? "border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/30"
          : "border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 hover:bg-zinc-900"
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Thumbnail — real image with gradient fallback */}
      <div className={`relative h-36 rounded-t-xl overflow-hidden ${imgFailed ? `bg-gradient-to-br ${PROJECT_GRADIENTS[colorIdx]}` : ''}`}>
        {!imgFailed ? (
          <img
            src={`${project.thumbnail_url ? `${API_URL}${project.thumbnail_url}` : `${API_URL}/thumbnails/${project.id}.png`}?v=${encodeURIComponent(project.updated_at)}`}
            alt={project.name}
            className="h-full w-full object-cover object-top rounded-t-xl"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <>
            {/* Decorative dot grid */}
            <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
            {/* Decorative blurred orbs */}
            <div className={`absolute -bottom-4 -right-4 h-24 w-24 rounded-full ${PROJECT_ACCENT_COLORS[colorIdx]} blur-xl`} />
            <div className={`absolute -top-2 -left-2 h-16 w-16 rounded-full ${PROJECT_ACCENT_COLORS[colorIdx]} blur-lg opacity-60`} />
            {/* Mini wireframe overlay */}
            <div className="absolute inset-3 rounded-lg bg-white/[0.06] backdrop-blur-[1px] border border-white/[0.08] p-2.5">
              <div className="h-1.5 w-10 bg-white/10 rounded mb-1.5" />
              <div className="h-1.5 w-full bg-white/[0.06] rounded mb-1" />
              <div className="h-1.5 w-3/4 bg-white/[0.06] rounded mb-2.5" />
              <div className="flex gap-1.5 mb-1.5">
                <div className="h-5 w-5 bg-white/[0.08] rounded" />
                <div className="flex-1">
                  <div className="h-1.5 w-full bg-white/[0.06] rounded mb-0.5" />
                  <div className="h-1.5 w-2/3 bg-white/[0.06] rounded" />
                </div>
              </div>
            </div>
            {/* Large initial watermark */}
            <div className="absolute bottom-2 right-3 text-4xl font-bold text-white/[0.08] leading-none select-none">
              {project.name?.charAt(0)?.toUpperCase() ?? "P"}
            </div>
          </>
        )}

        {/* Selection checkbox */}
        <button
          className={`absolute top-2.5 left-2.5 flex h-6 w-6 items-center justify-center rounded transition-all ${
            selected
              ? "bg-violet-600 text-white opacity-100"
              : "bg-black/30 backdrop-blur-sm text-white/70 opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(project.id, e.metaKey || e.ctrlKey);
          }}
        >
          {selected ? (
            <CheckSquare className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Star button */}
        <button
          className={`absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full transition-all ${
            project.starred
              ? "bg-yellow-500/20 text-yellow-400 opacity-100"
              : "bg-black/30 backdrop-blur-sm text-white/70 hover:bg-black/50 hover:text-white opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
        >
          <Star
            className={`h-3.5 w-3.5 ${project.starred ? "fill-yellow-400 text-yellow-400" : ""}`}
          />
        </button>

        {/* Quick actions */}
        <div
          className="absolute bottom-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/60 hover:text-white transition-all">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 w-48">
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white"
                onClick={onClick}
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Open in editor
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white"
                onClick={onRename}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white"
                onClick={onDuplicate}
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white"
                onClick={() => onStar()}
              >
                <Star className="mr-2 h-3.5 w-3.5" />
                {project.starred ? "Unstar" : "Star"}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                onClick={onDelete}
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
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-[10px] font-semibold text-white">
          {project.name?.charAt(0)?.toUpperCase() ?? "U"}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <h3 className="text-sm font-medium text-zinc-200 leading-tight line-clamp-1">
            {project.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">
              {formatRelativeTime(project.updated_at)}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${statusStyle.className}`}
            >
              {statusStyle.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Project Row (List View) ----

function ProjectRow({
  project,
  selected,
  onSelect,
  onStar,
  onClick,
  onDelete,
  onDuplicate,
  onRename,
  onContextMenu,
}: {
  project: ApiProject;
  selected: boolean;
  onSelect: (id: string, add: boolean) => void;
  onStar: () => void;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const statusStyle = STATUS_STYLES[project.status] ?? STATUS_STYLES.draft!;

  return (
    <tr
      className={`group border-b border-zinc-800/50 transition-colors cursor-pointer ${
        selected ? "bg-violet-500/5" : "hover:bg-white/[0.02]"
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Checkbox */}
      <td className="w-10 px-3 py-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(project.id, e.metaKey || e.ctrlKey);
          }}
          className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
            selected
              ? "bg-violet-600 text-white"
              : "text-zinc-600 hover:text-zinc-400"
          }`}
        >
          {selected ? (
            <CheckSquare className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </td>

      {/* Star */}
      <td className="w-10 px-1 py-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          className="rounded p-0.5"
        >
          <Star
            className={`h-4 w-4 transition-colors ${
              project.starred
                ? "fill-yellow-400 text-yellow-400"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          />
        </button>
      </td>

      {/* Name */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-xs font-medium text-zinc-400">
            {project.name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-zinc-200 line-clamp-1">
              {project.name}
            </span>
            {project.description && (
              <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                {project.description}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusStyle.className}`}
        >
          {statusStyle.label}
        </span>
      </td>

      {/* Updated */}
      <td className="px-3 py-3 text-sm text-zinc-500">
        {formatRelativeTime(project.updated_at)}
      </td>

      {/* Actions */}
      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 w-48">
            <DropdownMenuItem
              className="text-zinc-300 focus:bg-white/5 focus:text-white"
              onClick={onClick}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open in editor
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-zinc-300 focus:bg-white/5 focus:text-white"
              onClick={onRename}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-zinc-300 focus:bg-white/5 focus:text-white"
              onClick={onDuplicate}
            >
              <Copy className="mr-2 h-3.5 w-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-zinc-300 focus:bg-white/5 focus:text-white"
              onClick={onStar}
            >
              <Star className="mr-2 h-3.5 w-3.5" />
              {project.starred ? "Unstar" : "Star"}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem
              className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ---- Template Card ----

function TemplateCard({
  template,
  onClick,
}: {
  template: ApiTemplate;
  onClick: () => void;
}) {
  const catColors = getTemplateCategoryColors(template.category);

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer"
      onClick={onClick}
    >
      <div className={`relative h-36 ${catColors.bg} rounded-t-xl p-3 overflow-hidden`}>
        {template.category === "dashboard" || template.id === "saas-dashboard" ? (
          <>
            <div className="flex gap-2 mb-2">
              <div className={`h-full w-10 ${catColors.accent} rounded`} />
              <div className="flex-1">
                <div className={`h-2 w-24 ${catColors.highlight} rounded mb-2`} />
                <div className="flex gap-2 mb-2">
                  <div className="h-10 flex-1 bg-blue-100/60 rounded" />
                  <div className="h-10 flex-1 bg-green-100/60 rounded" />
                  <div className="h-10 flex-1 bg-purple-100/60 rounded" />
                </div>
                <div className={`h-12 w-full ${catColors.accent} rounded`} />
              </div>
            </div>
          </>
        ) : template.category === "marketing" || template.id === "landing-page" ? (
          <>
            <div className={`h-2 w-20 ${catColors.highlight} rounded mx-auto mb-2`} />
            <div className={`h-3 w-32 ${catColors.accent} rounded mx-auto mb-1`} />
            <div className={`h-2 w-24 ${catColors.accent} rounded mx-auto mb-3`} />
            <div className={`h-6 w-16 ${catColors.highlight} rounded mx-auto mb-2`} />
            <div className="flex gap-2">
              <div className={`h-12 flex-1 ${catColors.accent} rounded`} />
              <div className={`h-12 flex-1 ${catColors.accent} rounded`} />
              <div className={`h-12 flex-1 ${catColors.accent} rounded`} />
            </div>
          </>
        ) : template.category === "ecommerce" || template.id === "ecommerce-store" ? (
          <>
            <div className={`h-2 w-full ${catColors.highlight} rounded mb-2`} />
            <div className="grid grid-cols-3 gap-1.5">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className={`h-10 ${catColors.accent} rounded`} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className={`h-2 w-16 ${catColors.highlight} rounded mb-2`} />
            <div className={`h-2 w-full ${catColors.accent} rounded mb-1`} />
            <div className={`h-2 w-3/4 ${catColors.accent} rounded mb-3`} />
            <div className="flex gap-2 mb-2">
              <div className={`h-8 w-8 ${catColors.highlight} rounded`} />
              <div className="flex-1">
                <div className={`h-2 w-full ${catColors.accent} rounded mb-1`} />
                <div className={`h-2 w-2/3 ${catColors.accent} rounded`} />
              </div>
            </div>
            <div className={`h-6 w-20 ${catColors.highlight} rounded`} />
          </>
        )}
        {template.isOfficial && (
          <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-600">
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

// ---- Right-Click Context Menu ----

function ContextMenuPortal({
  menu,
  project,
  onOpen,
  onStar,
  onDuplicate,
  onRename,
  onMoveToFolder,
  onDelete,
  onHide,
}: {
  menu: ContextMenuState;
  project: ApiProject | null;
  onOpen: () => void;
  onStar: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onMoveToFolder: () => void;
  onDelete: () => void;
  onHide: () => void;
}) {
  if (!menu.visible || !project) return null;

  return (
    <div
      className="fixed z-[100] min-w-[180px] rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl shadow-black/40"
      style={{ top: menu.y, left: menu.x }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
        onClick={() => { onOpen(); onHide(); }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open in editor
      </button>
      <button
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
        onClick={() => { onRename(); onHide(); }}
      >
        <Pencil className="h-3.5 w-3.5" />
        Rename
      </button>
      <button
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
        onClick={() => { onDuplicate(); onHide(); }}
      >
        <Copy className="h-3.5 w-3.5" />
        Duplicate
      </button>
      <button
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
        onClick={() => { onMoveToFolder(); onHide(); }}
      >
        <FolderInput className="h-3.5 w-3.5" />
        Move to folder
      </button>
      <button
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
        onClick={() => { onStar(); onHide(); }}
      >
        <Star className={`h-3.5 w-3.5 ${project.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
        {project.starred ? "Unstar" : "Star"}
      </button>
      <div className="my-1 h-px bg-zinc-800" />
      <button
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        onClick={() => { onDelete(); onHide(); }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    </div>
  );
}

// ---- Main Dashboard Page ----

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  // Data
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice input
  const speechRecognition = useSpeechRecognition((transcript: string) => {
    setPrompt((prev) => (prev ? prev + " " + transcript : transcript));
  });

  // Image attachments
  const imageAttachments = useImageAttachments();

  // UI state
  const [prompt, setPrompt] = useState("");
  const [activeTab, setActiveTab] = useState<"recent" | "projects" | "templates">("recent");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) ?? "grid";
    }
    return "grid";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [starredFilter, setStarredFilter] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Template preview/remix state
  const [previewTemplate, setPreviewTemplate] = useState<ApiTemplate | null>(null);
  const [remixTemplate, setRemixTemplate] = useState<ApiTemplate | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sidebar filter/folder
  const [sidebarFilter, setSidebarFilter] = useState<DashboardFilter>("all");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Dialogs
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [renamingProject, setRenamingProject] = useState<ApiProject | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveToFolderProject, setMoveToFolderProject] = useState<string | null>(null);

  // Context menu
  const { menu: contextMenu, show: showContextMenu, hide: hideContextMenu } = useContextMenu();

  // Search ref for keyboard shortcut
  const searchRef = useRef<HTMLInputElement>(null);

  const firstName = user?.displayName?.split(" ")[0] ?? "there";
  const greeting = useRotatingGreeting(firstName);

  // ---- Persist view mode ----
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  // ---- Fetch projects ----
  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const res = await apiListProjects({ pageSize: 100 });
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
      setTemplates(res.data.templates.filter((t) => t.id !== "blank"));
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Folder[] }>("/folders");
      setFolders(res.data);
    } catch {
      setFolders([]);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchFolders();
  }, [fetchProjects, fetchFolders]);

  useEffect(() => {
    if (activeTab === "templates" && templates.length === 0 && !isLoadingTemplates) {
      fetchTemplates();
    }
  }, [activeTab, templates.length, isLoadingTemplates, fetchTemplates]);

  // ---- Listen for sidebar events ----
  useEffect(() => {
    const handleFilter = (e: Event) => {
      const filter = (e as CustomEvent<DashboardFilter>).detail;
      setSidebarFilter(filter);
      setActiveFolderId(null);
      setActiveTab(filter === "all" ? "recent" : "projects");
      if (filter === "starred") setStarredFilter(true);
      else setStarredFilter(false);
    };
    const handleFolder = (e: Event) => {
      const folderId = (e as CustomEvent<string>).detail;
      setActiveFolderId(folderId);
      setSidebarFilter("all");
      setActiveTab("projects");
      setStarredFilter(false);
    };
    const handleSearchFocus = () => {
      searchRef.current?.focus();
    };

    window.addEventListener(DASHBOARD_EVENTS.NAVIGATE_FILTER, handleFilter);
    window.addEventListener(DASHBOARD_EVENTS.NAVIGATE_FOLDER, handleFolder);
    window.addEventListener(DASHBOARD_EVENTS.SEARCH_FOCUS, handleSearchFocus);
    return () => {
      window.removeEventListener(DASHBOARD_EVENTS.NAVIGATE_FILTER, handleFilter);
      window.removeEventListener(DASHBOARD_EVENTS.NAVIGATE_FOLDER, handleFolder);
      window.removeEventListener(DASHBOARD_EVENTS.SEARCH_FOCUS, handleSearchFocus);
    };
  }, []);

  // ---- Keyboard shortcut for search ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      // Escape clears selection
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setSearchQuery("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ---- Actions ----

  const handleSubmit = async () => {
    const hasContent = prompt.trim() || imageAttachments.attachments.length > 0;
    if (!hasContent || isCreating) return;
    setIsCreating(true);
    try {
      const text = prompt.trim() || "See attached image(s)";
      const projectName = text.slice(0, 100);
      const res = await apiCreateProject({
        name: projectName,
        description: text,
        prompt: text,
      });
      // Store prompt + attachments in sessionStorage as JSON
      const payload = JSON.stringify({
        prompt: text,
        attachments: imageAttachments.attachments,
      });
      sessionStorage.setItem(`doable_initial_prompt_${res.data.id}`, payload);
      imageAttachments.clearAll();
      router.push(`/editor/${res.data.id}?prompt=${encodeURIComponent(text)}`);
    } catch (err) {
      console.error("Failed to create project:", err);
      setError("Failed to create project. Please try again.");
      setIsCreating(false);
    }
  };

  const toggleStar = async (id: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p))
    );
    try {
      await apiToggleStarProject(id);
      emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED);
    } catch (err) {
      console.error("Failed to toggle star:", err);
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p))
      );
    }
  };

  const handleDelete = async (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDeleteConfirmId(null);
    try {
      await apiDeleteProject(id);
      emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED);
    } catch (err) {
      console.error("Failed to delete project:", err);
      fetchProjects();
    }
  };

  const handleBulkDelete = async () => {
    const ids: string[] = Array.from(selectedIds);
    setProjects((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
    try {
      await Promise.all(ids.map((id) => apiDeleteProject(id)));
      emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED);
    } catch (err) {
      console.error("Failed to delete projects:", err);
      fetchProjects();
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await apiDuplicateProject(id);
      setProjects((prev) => [res.data, ...prev]);
      emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED);
    } catch (err) {
      console.error("Failed to duplicate project:", err);
    }
  };

  const handleRename = async () => {
    if (!renamingProject || !renameValue.trim()) return;
    try {
      const res = await apiUpdateProject(renamingProject.id, { name: renameValue.trim() });
      setProjects((prev) =>
        prev.map((p) => (p.id === renamingProject.id ? { ...p, ...res.data } : p))
      );
      setRenamingProject(null);
      setRenameValue("");
      emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED);
    } catch (err) {
      console.error("Failed to rename project:", err);
    }
  };

  const handleMoveToFolder = async (projectId: string, folderId: string | null) => {
    try {
      await apiUpdateProject(projectId, { folderId });
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, folder_id: folderId } : p))
      );
      setMoveToFolderProject(null);
      emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED);
    } catch (err) {
      console.error("Failed to move project:", err);
    }
  };

  const handleBulkMoveToFolder = async (folderId: string | null) => {
    const ids: string[] = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => apiUpdateProject(id, { folderId })));
      setProjects((prev) =>
        prev.map((p) => (selectedIds.has(p.id) ? { ...p, folder_id: folderId } : p))
      );
      setSelectedIds(new Set());
      setMoveToFolderProject(null);
      emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED);
    } catch (err) {
      console.error("Failed to move projects:", err);
    }
  };

  const navigateToProject = (id: string) => {
    router.push(`/editor/${id}`);
  };

  const handleSelect = (id: string, add: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (add) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.has(id) && next.size === 1) {
          next.clear();
        } else {
          next.clear();
          next.add(id);
        }
      }
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  // ---- Filtered & sorted projects ----
  const displayProjects = useMemo(() => {
    let filtered = [...projects];

    // Folder filter
    if (activeFolderId) {
      filtered = filtered.filter((p) => p.folder_id === activeFolderId);
    }

    // Sidebar filter
    if (sidebarFilter === "starred") {
      filtered = filtered.filter((p) => p.starred);
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // Starred filter
    if (starredFilter && sidebarFilter !== "starred") {
      filtered = filtered.filter((p) => p.starred);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "created_at":
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
        case "updated_at":
        default:
          return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
      }
    });

    return filtered;
  }, [projects, activeFolderId, sidebarFilter, statusFilter, starredFilter, searchQuery, sortKey, sortDir]);

  // ---- Context menu project ----
  const contextProject = contextMenu.projectId
    ? projects.find((p) => p.id === contextMenu.projectId) ?? null
    : null;

  // ---- Tab config ----
  const tabs = [
    { key: "recent" as const, label: "Recently viewed" },
    { key: "projects" as const, label: "My projects" },
    { key: "templates" as const, label: "Templates" },
  ];

  // ---- Folder name for breadcrumb ----
  const activeFolderName = activeFolderId
    ? folders.find((f) => f.id === activeFolderId)?.name ?? "Folder"
    : null;

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 h-3 w-3 text-violet-400" />
    ) : (
      <ChevronDown className="ml-1 h-3 w-3 text-violet-400" />
    );
  };

  return (
    <div className="relative min-h-screen">
      {/* Content */}
      <div className="relative z-10 mx-auto max-w-5xl px-6 pt-0 pb-10">
        {/* Greeting + Chat Input (only when no folder/filter active) */}
        {!activeFolderId && sidebarFilter === "all" && (
          <div className="relative overflow-hidden mb-8 -mx-6" style={{ minHeight: "340px" }}>
            {/* Animated gradient background - smooth blend like Lovable's pre-rendered image */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {/* Smooth blend using Lovable's exact sampled colors: black → periwinkle blue → pink */}
              <div className="absolute inset-0 animate-pulse-drift" style={{
                width: "130%",
                height: "130%",
                top: "-15%",
                left: "-15%",
                background: "linear-gradient(180deg, #000000 0%, #000000 12%, #0d1030 22%, #2a55b0 38%, #4c8ffc 50%, #7a6bea 62%, #c84a90 74%, #fe2771 85%, #a38bfb 95%, #000000 100%)",
              }} />
            </div>
            {/* Bottom fade into dark background */}
            <div className="absolute inset-x-0 bottom-0 h-24 z-[1]" style={{
              background: "linear-gradient(to top, #0a0a0a 0%, #0a0a0ae0 50%, transparent 100%)",
            }} />
            {/* Content */}
            <div className="relative z-10 px-8 py-16 max-w-5xl mx-auto">
              <div className="text-center mb-6">
                <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight transition-all duration-500">
                  {greeting}
                </h1>
              </div>
              <div>
                <ChatInput
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={handleSubmit}
                  isCreating={isCreating}
                  attachments={imageAttachments.attachments}
                  onOpenFilePicker={imageAttachments.openFilePicker}
                  onRemoveImage={imageAttachments.removeImage}
                  isListening={speechRecognition.isListening}
                  isMicSupported={speechRecognition.isSupported}
                  onToggleMic={speechRecognition.toggle}
                />
                <input
                  ref={imageAttachments.fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={imageAttachments.handleFileChange}
                />
              </div>
            </div>
          </div>
        )}

        {/* Folder/Filter breadcrumb */}
        {(activeFolderId || sidebarFilter !== "all") && (
          <div className="mb-6">
            <div className="flex items-center gap-2 text-sm">
              <button
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
                onClick={() => {
                  setSidebarFilter("all");
                  setActiveFolderId(null);
                  setStarredFilter(false);
                  emitDashboardEvent(DASHBOARD_EVENTS.NAVIGATE_FILTER, "all");
                }}
              >
                Home
              </button>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-200 font-medium">
                {activeFolderName ?? (sidebarFilter === "starred" ? "Starred" : sidebarFilter === "created-by-me" ? "Created by me" : "Shared with me")}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-white mt-2">
              {activeFolderName ?? (sidebarFilter === "starred" ? "Starred Projects" : sidebarFilter === "created-by-me" ? "My Projects" : "Shared Projects")}
            </h1>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button
              onClick={() => {
                setError(null);
                fetchProjects();
              }}
              className="ml-auto underline hover:text-red-300"
            >
              Retry
            </button>
          </div>
        )}

        {/* Toolbar: Tabs + Search + Filters + View Toggle */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Tab Bar */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === tab.key
                      ? "text-white bg-zinc-800"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              {/* Browse all templates link */}
              {activeTab === "templates" && (
                <button
                  onClick={() => router.push("/dashboard/templates")}
                  className="ml-auto flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition-colors"
                >
                  Browse all
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-56 rounded-lg border border-zinc-800 bg-zinc-900/80 pl-9 pr-8 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            {activeTab !== "templates" && (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-9 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors">
                  <Filter className="h-3.5 w-3.5" />
                  {statusFilter === "all" ? "All status" : STATUS_STYLES[statusFilter]?.label}
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                  <DropdownMenuItem
                    className="text-zinc-300 focus:bg-white/5 focus:text-white"
                    onClick={() => setStatusFilter("all")}
                  >
                    All status
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-zinc-300 focus:bg-white/5 focus:text-white"
                    onClick={() => setStatusFilter("published")}
                  >
                    <Globe className="mr-2 h-3.5 w-3.5 text-emerald-400" />
                    Published
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-zinc-300 focus:bg-white/5 focus:text-white"
                    onClick={() => setStatusFilter("draft")}
                  >
                    <FileCode className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                    Draft
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-zinc-300 focus:bg-white/5 focus:text-white"
                    onClick={() => setStatusFilter("error")}
                  >
                    <AlertCircle className="mr-2 h-3.5 w-3.5 text-red-400" />
                    Error
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Starred filter toggle */}
            {activeTab !== "templates" && (
              <button
                onClick={() => setStarredFilter(!starredFilter)}
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
                  starredFilter
                    ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                    : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${starredFilter ? "fill-yellow-400" : ""}`} />
                Starred
              </button>
            )}

            {/* View Mode Toggle */}
            {activeTab !== "templates" && (
              <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/80 overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`flex h-9 w-9 items-center justify-center transition-colors ${
                    viewMode === "grid"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex h-9 w-9 items-center justify-center transition-colors ${
                    viewMode === "list"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-violet-500/30 bg-violet-500/5 px-4 py-2">
              <span className="text-sm text-violet-300 font-medium">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-1 ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-zinc-300 hover:bg-white/5 transition-colors">
                    <FolderInput className="h-3.5 w-3.5" />
                    Move to folder
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                    <DropdownMenuItem
                      className="text-zinc-300 focus:bg-white/5 focus:text-white"
                      onClick={() => handleBulkMoveToFolder(null)}
                    >
                      Root (no folder)
                    </DropdownMenuItem>
                    {folders.length > 0 && <DropdownMenuSeparator className="bg-zinc-800" />}
                    {folders.map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        className="text-zinc-300 focus:bg-white/5 focus:text-white"
                        onClick={() => handleBulkMoveToFolder(f.id)}
                      >
                        <FolderInput className="mr-2 h-3.5 w-3.5" />
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-zinc-400 hover:bg-white/5 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && activeTab !== "templates" && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500 mb-4" />
            <p className="text-sm text-zinc-500">Loading projects...</p>
          </div>
        )}

        {/* Project Grid View */}
        {!isLoading && activeTab !== "templates" && viewMode === "grid" && displayProjects.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                selected={selectedIds.has(project.id)}
                onSelect={handleSelect}
                onStar={() => toggleStar(project.id)}
                onClick={() => navigateToProject(project.id)}
                onDelete={() => setDeleteConfirmId(project.id)}
                onDuplicate={() => handleDuplicate(project.id)}
                onRename={() => {
                  setRenamingProject(project);
                  setRenameValue(project.name);
                }}
                onContextMenu={(e) => showContextMenu(e, project.id)}
              />
            ))}
          </div>
        )}

        {/* Project List View */}
        {!isLoading && activeTab !== "templates" && viewMode === "list" && displayProjects.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80">
                <tr className="border-b border-zinc-800">
                  <th className="w-10 px-3 py-3" />
                  <th className="w-10 px-1 py-3" />
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                      onClick={() => handleSort("name")}
                    >
                      Name <SortIcon col="name" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                      onClick={() => handleSort("status")}
                    >
                      Status <SortIcon col="status" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                      onClick={() => handleSort("updated_at")}
                    >
                      Updated <SortIcon col="updated_at" />
                    </button>
                  </th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {displayProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    selected={selectedIds.has(project.id)}
                    onSelect={handleSelect}
                    onStar={() => toggleStar(project.id)}
                    onClick={() => navigateToProject(project.id)}
                    onDelete={() => setDeleteConfirmId(project.id)}
                    onDuplicate={() => handleDuplicate(project.id)}
                    onRename={() => {
                      setRenamingProject(project);
                      setRenameValue(project.name);
                    }}
                    onContextMenu={(e) => showContextMenu(e, project.id)}
                  />
                ))}
              </tbody>
            </table>
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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {templates
                .filter((t) =>
                  searchQuery.trim()
                    ? t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      t.description.toLowerCase().includes(searchQuery.toLowerCase())
                    : true
                )
                .map((template) => (
                <NewTemplateCard
                  key={template.id}
                  template={template}
                  onClick={() => setPreviewTemplate(template)}
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

        {/* Empty State */}
        {!isLoading && activeTab !== "templates" && displayProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
              {searchQuery || statusFilter !== "all" || starredFilter ? (
                <Search className="h-8 w-8 text-zinc-600" />
              ) : (
                <Plus className="h-8 w-8 text-zinc-600" />
              )}
            </div>
            <h3 className="text-lg font-medium text-zinc-300 mb-2">
              {searchQuery
                ? "No projects found"
                : statusFilter !== "all" || starredFilter
                  ? "No matching projects"
                  : activeFolderId
                    ? "This folder is empty"
                    : "No projects yet"}
            </h3>
            <p className="text-sm text-zinc-500 max-w-sm">
              {searchQuery
                ? `No projects match "${searchQuery}". Try a different search.`
                : statusFilter !== "all" || starredFilter
                  ? "Try adjusting your filters."
                  : "Describe what you want to build in the chat above and Doable will create it for you."}
            </p>
            {(searchQuery || statusFilter !== "all" || starredFilter) && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setStarredFilter(false);
                }}
                className="mt-4 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Results count */}
        {!isLoading && activeTab !== "templates" && displayProjects.length > 0 && (
          <div className="mt-4 text-center">
            <span className="text-xs text-zinc-600">
              {displayProjects.length} project{displayProjects.length !== 1 ? "s" : ""}
              {searchQuery && ` matching "${searchQuery}"`}
            </span>
          </div>
        )}
      </div>

      {/* Right-click Context Menu */}
      <ContextMenuPortal
        menu={contextMenu}
        project={contextProject}
        onOpen={() => contextMenu.projectId && navigateToProject(contextMenu.projectId)}
        onStar={() => contextMenu.projectId && toggleStar(contextMenu.projectId)}
        onDuplicate={() => contextMenu.projectId && handleDuplicate(contextMenu.projectId)}
        onRename={() => {
          if (contextProject) {
            setRenamingProject(contextProject);
            setRenameValue(contextProject.name);
          }
        }}
        onMoveToFolder={() => {
          if (contextMenu.projectId) {
            setMoveToFolderProject(contextMenu.projectId);
          }
        }}
        onDelete={() => {
          if (contextMenu.projectId) {
            setDeleteConfirmId(contextMenu.projectId);
          }
        }}
        onHide={hideContextMenu}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-200">Delete project</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete &ldquo;
              {projects.find((p) => p.id === deleteConfirmId)?.name}
              &rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog
        open={bulkDeleteConfirm}
        onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}
      >
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-200">Delete {selectedIds.size} projects</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete {selectedIds.size} selected project
              {selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteConfirm(false)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkDelete}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Delete {selectedIds.size} project{selectedIds.size !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={!!renamingProject}
        onOpenChange={(open) => !open && setRenamingProject(null)}
      >
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-200">Rename project</DialogTitle>
          </DialogHeader>
          <div>
            <Input
              placeholder="Project name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
              className="bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenamingProject(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameValue.trim()}
              className="bg-violet-600 text-white hover:bg-violet-500"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Folder Dialog */}
      <Dialog
        open={!!moveToFolderProject}
        onOpenChange={(open) => !open && setMoveToFolderProject(null)}
      >
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-200">Move to folder</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Choose a folder for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            <button
              onClick={() => moveToFolderProject && handleMoveToFolder(moveToFolderProject, null)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors"
            >
              <FolderOpen className="h-4 w-4 text-zinc-500" />
              Root (no folder)
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => moveToFolderProject && handleMoveToFolder(moveToFolderProject, f.id)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors"
              >
                <FolderIcon className="h-4 w-4 text-zinc-500" />
                {f.name}
              </button>
            ))}
            {folders.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-4">
                No folders yet. Create one in the sidebar.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Preview Modal */}
      <TemplatePreviewModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUseTemplate={() => {
          setRemixTemplate(previewTemplate);
          setPreviewTemplate(null);
        }}
      />

      {/* Use Template / Remix Dialog */}
      <UseTemplateDialog
        template={remixTemplate}
        onClose={() => setRemixTemplate(null)}
        onCreated={(projectId) => {
          setRemixTemplate(null);
          router.push(`/editor/${projectId}`);
        }}
      />
    </div>
  );
}
