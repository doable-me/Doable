import type { TemplateDefinition } from "../registry.js";
import { blankTemplate } from "./blank.js";

export const saasDashboardTemplate: TemplateDefinition = {
  id: "saas-dashboard",
  name: "SaaS Dashboard",
  description: "Dashboard with sidebar navigation, auth pages, settings, and analytics placeholder. Built for B2B SaaS apps.",
  category: "dashboard",
  tags: ["react", "dashboard", "saas", "analytics", "sidebar", "b2b"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "vite-react",

  codeFiles: {
    // Inherit base config files from blank
    "package.json": blankTemplate.codeFiles["package.json"]!,
    "vite.config.ts": blankTemplate.codeFiles["vite.config.ts"]!,
    "tsconfig.json": blankTemplate.codeFiles["tsconfig.json"]!,
    "index.html": blankTemplate.codeFiles["index.html"]!,
    "src/main.tsx": blankTemplate.codeFiles["src/main.tsx"]!,
    "src/index.css": blankTemplate.codeFiles["src/index.css"]!,
    "src/lib/utils.ts": blankTemplate.codeFiles["src/lib/utils.ts"]!,

    "src/App.tsx": `import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { DashboardPage } from "@/pages/dashboard";
import { SettingsPage } from "@/pages/settings";
import { AnalyticsPage } from "@/pages/analytics";

type Page = "dashboard" | "analytics" | "settings";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage />;
      case "analytics":
        return <AnalyticsPage />;
      case "settings":
        return <SettingsPage />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-auto">
        <div className="p-8">{renderPage()}</div>
      </main>
    </div>
  );
}
`,

    "src/components/layout/sidebar.tsx": `import { cn } from "@/lib/utils";
import { LayoutDashboard, BarChart3, Settings, LogOut } from "lucide-react";

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: "dashboard" | "analytics" | "settings") => void;
}

const NAV_ITEMS = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export const Sidebar = ({ currentPage, onNavigate }: SidebarProps) => {
  return (
    <aside className="flex w-64 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-6">
        <span className="text-lg font-semibold">Dashboard</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              currentPage === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="border-t p-3">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
};
`,

    "src/pages/dashboard.tsx": `import { StatCard } from "@/components/stat-card";
import { Users, CreditCard, Activity, TrendingUp } from "lucide-react";

const STATS = [
  { title: "Total Users", value: "2,420", change: "+12%", icon: Users },
  { title: "Revenue", value: "$45,231", change: "+20.1%", icon: CreditCard },
  { title: "Active Now", value: "573", change: "+4.3%", icon: Activity },
  { title: "Growth Rate", value: "8.2%", change: "+2.1%", icon: TrendingUp },
];

export const DashboardPage = () => {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your application metrics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <p className="text-sm text-muted-foreground">
          Activity feed will appear here. Connect your data source to see real metrics.
        </p>
      </div>
    </div>
  );
};
`,

    "src/pages/analytics.tsx": `export const AnalyticsPage = () => {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Track usage, performance, and trends.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 h-64 flex items-center justify-center">
          <p className="text-muted-foreground">Chart placeholder — Users over time</p>
        </div>
        <div className="rounded-lg border bg-card p-6 h-64 flex items-center justify-center">
          <p className="text-muted-foreground">Chart placeholder — Revenue breakdown</p>
        </div>
      </div>
    </div>
  );
};
`,

    "src/pages/settings.tsx": `import { useState } from "react";

export const SettingsPage = () => {
  const [name, setName] = useState("My Workspace");
  const [email, setEmail] = useState("admin@example.com");

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">General</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="name">
              Workspace Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <button className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Save Changes
          </button>
        </div>

        <div className="rounded-lg border border-destructive/50 bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          <p className="text-sm text-muted-foreground">
            Permanently delete your workspace and all associated data.
          </p>
          <button className="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground ring-offset-background transition-colors hover:bg-destructive/90">
            Delete Workspace
          </button>
        </div>
      </div>
    </div>
  );
};
`,

    "src/components/stat-card.tsx": `import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
}

export const StatCard = ({ title, value, change, icon: Icon }: StatCardProps) => {
  const isPositive = change.startsWith("+");

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold">{value}</p>
        <p className={"text-xs mt-1 " + (isPositive ? "text-emerald-600" : "text-red-600")}>
          {change} from last month
        </p>
      </div>
    </div>
  );
};
`,
  },

  contextOverrides: {
    "identity.md": `# Project Identity

## Name
SaaS Dashboard

## Purpose
A B2B SaaS dashboard application with user management, analytics, and workspace settings.

## Personality & Tone
- Professional and data-driven
- Clear, scannable layouts
- Efficiency-first design — minimize clicks to key actions
`,
    "knowledge.md": `# Knowledge Base

## Tech Stack
- Frontend: React 19 + Vite 6 + TypeScript (strict)
- Styling: Tailwind CSS 3 + tailwindcss-animate
- UI Pattern: shadcn/ui-style components
- Icons: Lucide React

## Architecture
- \`src/pages/\` — Page-level components (dashboard, analytics, settings)
- \`src/components/layout/\` — Layout primitives (sidebar, header)
- \`src/components/\` — Shared UI components
- Client-side routing via state (upgrade to react-router as needed)

## Patterns
- Stat cards for KPI display
- Sidebar navigation with active state
- Form sections with grouped settings
- Danger zone pattern for destructive actions
`,
  },
};
