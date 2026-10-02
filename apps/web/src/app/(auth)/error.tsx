"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useEffect } from "react";
import Link from "next/link";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const ui = useUiText();

  useEffect(() => {
    console.error("Auth error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
      <h2 className="text-xl font-semibold text-white mb-2">
        {ui("Authentication Error")}
      </h2>
      <p className="text-sm text-zinc-400 mb-6">
        {ui(error.message) || ui("Something went wrong.")}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          {" "}
          {ui("Try again")}{" "}
        </button>
        <Link
          href="/login"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-500 transition-colors"
        >
          {" "}
          {ui("Back to Login")}{" "}
        </Link>
      </div>
    </div>
  );
}
