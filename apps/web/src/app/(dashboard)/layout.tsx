"use client";

import { useState, useCallback } from "react";
import { AuthProvider } from "@/providers/auth-provider";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Footer } from "@/components/dashboard/footer";
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
        <div className="flex h-screen overflow-hidden bg-background">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="fixed top-3 left-3 z-50 flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border text-foreground md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile overlay */}
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-foreground/45 md:hidden"
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
          <div className="flex flex-1 flex-col overflow-y-auto">
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}
