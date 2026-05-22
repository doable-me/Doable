"use client";

import { AuthProvider } from "@/providers/auth-provider";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="relative flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
        {/* Decorative blurred circles */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-float-slow absolute -left-40 -top-40 h-80 w-80 rounded-full bg-brand-400/10 blur-3xl" />
          <div className="animate-float-medium absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-brand-400/5 blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-md px-4 py-12">
          {/* Branding */}
          <div className="mb-8 text-center">
            <a href="/" className="inline-flex items-center gap-1">
              <span className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">
                Doable
              </span>
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-700" />
            </a>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              AI-powered application builder
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 shadow-lg shadow-black/5">
            {children}
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
            By continuing, you agree to our{" "}
            <a
              href="/terms"
              className="underline hover:text-[hsl(var(--foreground))]"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              className="underline hover:text-[hsl(var(--foreground))]"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </AuthProvider>
  );
}
