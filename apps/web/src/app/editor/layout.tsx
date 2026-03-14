"use client";

import { AuthProvider } from "@/providers/auth-provider";
import { AuthGuard } from "@/components/auth-guard";

export default function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <AuthGuard>
        <div className="h-screen w-screen overflow-hidden bg-[#0a0a0f]">
          {children}
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}
