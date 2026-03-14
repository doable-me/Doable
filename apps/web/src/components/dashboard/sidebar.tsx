"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  apiListWorkspaces,
  apiListProjects,
  type ApiWorkspace,
  type ApiProject,
} from "@/lib/api";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Home,
  Search,
  BookOpen,
  FolderOpen,
  Star,
  UserCircle,
  Users,
  ChevronDown,
  ChevronRight,
  Zap,
  Settings,
  LogOut,
  CreditCard,
} from "lucide-react";

// ─── Navigation Item ─────────────────────────────────────────

function NavItem({
  icon: Icon,
  label,
  shortcut,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left truncate">{label}</span>
      {shortcut && (
        <kbd className="hidden lg:inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

// ─── Section Header ──────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-5 pb-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
    </div>
  );
}

// ─── Sidebar Component ───────────────────────────────────────

export function DashboardSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [recentOpen, setRecentOpen] = useState(true);
  const [workspace, setWorkspace] = useState<ApiWorkspace | null>(null);
  const [recentProjects, setRecentProjects] = useState<ApiProject[]>([]);

  // Fetch workspace and recent projects
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [wsRes, projRes] = await Promise.all([
          apiListWorkspaces(),
          apiListProjects({ pageSize: 5 }),
        ]);
        if (cancelled) return;

        if (wsRes.data.length > 0) {
          setWorkspace(wsRes.data[0]!);
        }
        setRecentProjects(projRes.data.slice(0, 5));
      } catch (err) {
        console.error("Sidebar: failed to load data:", err);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  const displayName = user?.displayName ?? "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Use real workspace data or defaults
  const workspaceName = workspace?.name ?? `${displayName}'s workspace`;
  const workspacePlan = workspace?.plan ?? "free";
  const memberCount = workspace?.memberCount ?? 1;
  const dailyCredits = workspace?.credits?.dailyRemaining ?? 0;
  const dailyTotal = workspacePlan === "free" ? 5 : workspacePlan === "pro" ? 50 : 200;
  const creditsUsed = dailyTotal - dailyCredits;
  const creditsPercent = dailyTotal > 0 ? (creditsUsed / dailyTotal) * 100 : 0;

  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-zinc-800 bg-[#0a0a0a]">
      {/* ── Logo ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 shadow-sm shadow-violet-900/30">
          <span className="text-sm font-bold text-white">D</span>
        </div>
        <span className="text-lg font-semibold tracking-tight text-white">
          Doable
        </span>
      </div>

      {/* ── Workspace Selector ───────────────────────────── */}
      <div className="mx-3 mb-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-zinc-200 truncate">
              {workspaceName}
            </p>
            <p className="text-[11px] text-zinc-500 capitalize">
              {workspacePlan} plan{memberCount > 1 ? ` \u00b7 ${memberCount} members` : ""}
            </p>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">Credits today</span>
            <span className="text-zinc-400">
              {creditsUsed}/{dailyTotal}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-800">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all"
              style={{ width: `${Math.min(creditsPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Main Navigation ──────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2">
        <div className="space-y-0.5">
          <NavItem
            icon={Home}
            label="Home"
            active={pathname === "/dashboard"}
            onClick={() => router.push("/dashboard")}
          />
          <NavItem
            icon={Search}
            label="Search"
            shortcut="Ctrl+K"
          />
          <NavItem
            icon={BookOpen}
            label="Resources"
          />
        </div>

        {/* ── Projects Section ───────────────────────────── */}
        <SectionHeader label="Projects" />
        <div className="space-y-0.5">
          <NavItem
            icon={FolderOpen}
            label="All projects"
            onClick={() => router.push("/dashboard")}
          />
          <NavItem icon={Star} label="Starred" />
          <NavItem icon={UserCircle} label="Created by me" />
          <NavItem icon={Users} label="Shared with me" />
        </div>

        {/* ── Recent Projects ────────────────────────────── */}
        <div className="mt-4">
          <button
            onClick={() => setRecentOpen(!recentOpen)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            {recentOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Recent
          </button>
          {recentOpen && (
            <div className="space-y-0.5 mt-1">
              {recentProjects.length === 0 && (
                <p className="px-3 py-2 text-[11px] text-zinc-600">
                  No recent projects
                </p>
              )}
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => router.push(`/editor/${project.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800 text-[10px]">
                    {project.name.charAt(0)}
                  </div>
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* ── Bottom Section ───────────────────────────────── */}
      <div className="mt-auto border-t border-zinc-800 p-3 space-y-3">
        {/* Upgrade Card */}
        {workspacePlan === "free" && (
          <div className="rounded-lg bg-gradient-to-br from-violet-600/20 to-purple-600/10 border border-violet-500/20 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-medium text-violet-300">
                Upgrade to Pro
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mb-2.5">
              Get unlimited projects and priority AI generation.
            </p>
            <button className="w-full rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 transition-colors">
              Upgrade now
            </button>
          </div>
        )}

        {/* User Avatar + Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5 transition-colors outline-none">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-medium text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">
                {displayName}
              </p>
              <p className="text-[11px] text-zinc-500 truncate">
                {user?.email ?? "user@doable.dev"}
              </p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56 bg-zinc-900 border-zinc-800 bottom-full mb-2"
          >
            <DropdownMenuItem className="text-zinc-300 focus:bg-white/5 focus:text-white">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem className="text-zinc-300 focus:bg-white/5 focus:text-white">
              <CreditCard className="mr-2 h-4 w-4" />
              Billing
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem
              className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
