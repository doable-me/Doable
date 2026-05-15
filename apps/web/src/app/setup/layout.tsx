"use client";

import { AuthProvider } from "@/providers/auth-provider";
import { AuthGuard } from "@/components/auth-guard";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <div className="min-h-screen bg-background flex flex-col">
          {children}
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}
