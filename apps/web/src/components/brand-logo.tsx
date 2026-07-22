"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string | null;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
  /** Dark marketing surfaces (black landing) use white wordmark */
  variant?: "default" | "inverse";
  className?: string;
  markClassName?: string;
};

const SIZE = {
  sm: { mark: "h-7 w-7", letter: "text-xs", word: "text-base", gap: "gap-2" },
  md: { mark: "h-8 w-8", letter: "text-sm", word: "text-lg", gap: "gap-2" },
  lg: { mark: "h-10 w-10", letter: "text-base", word: "text-xl", gap: "gap-2.5" },
} as const;

export function BrandMark({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 shadow-sm shadow-brand-700/20",
        s.mark,
        className,
      )}
      aria-hidden
    >
      <span className={cn("font-bold text-white leading-none", s.letter)}>A</span>
    </div>
  );
}

export function BrandLogo({
  href = "/",
  showWordmark = true,
  size = "md",
  variant = "default",
  className,
  markClassName,
}: BrandLogoProps) {
  const s = SIZE[size];
  const content = (
    <>
      <BrandMark size={size} className={markClassName} />
      {showWordmark && (
        <span
          className={cn(
            "font-semibold tracking-tight",
            s.word,
            variant === "inverse" ? "text-white" : "text-foreground",
          )}
        >
          Appbrics
        </span>
      )}
    </>
  );

  const classes = cn("inline-flex items-center", s.gap, className);

  if (href) {
    return (
      <Link href={href} className={classes} aria-label="Appbrics">
        {content}
      </Link>
    );
  }

  return (
    <div className={classes} aria-label="Appbrics">
      {content}
    </div>
  );
}
