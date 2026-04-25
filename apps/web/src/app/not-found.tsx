import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 mb-4">
        <span className="text-2xl font-bold text-brand-700 dark:text-brand-400">?</span>
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">Page not found</h2>
      <p className="text-sm text-muted-foreground mb-6">
        The page you are looking for does not exist.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
