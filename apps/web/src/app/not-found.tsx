import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 mb-4">
        <span className="text-2xl font-bold text-violet-400">?</span>
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Page not found</h2>
      <p className="text-sm text-zinc-400 mb-6">
        The page you are looking for does not exist.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
