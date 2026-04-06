"use client";

import { useState, useCallback } from "react";
import { AuthProvider } from "@/providers/auth-provider";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Menu } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  return (
    <AuthProvider>
      <AuthGuard>
        <div className="flex h-screen overflow-hidden bg-[#0a0a0a]">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="fixed top-3 left-3 z-50 flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile overlay */}
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              onClick={closeSidebar}
            />
          )}

          {/* Sidebar: always visible on md+, slide-over on mobile */}
          <div
            className={`
              fixed inset-y-0 left-0 z-40 w-[260px] transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:transition-none
              ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}
            `}
          >
            <DashboardSidebar onNavigate={closeSidebar} />
          </div>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}
