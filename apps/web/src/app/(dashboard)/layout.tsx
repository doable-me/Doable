"use client";

import { AuthProvider } from "@/providers/auth-provider";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AuthGuard>
        <div className="flex h-screen overflow-hidden bg-[#0a0a0a]">
          {/* Fixed Sidebar */}
          <DashboardSidebar />

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}
