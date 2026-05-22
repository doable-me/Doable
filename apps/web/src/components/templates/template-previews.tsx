import { Check } from "lucide-react";

// --- Category-specific preview mockups ---

function DashboardPreview() {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-t-xl bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Sidebar */}
      <div className="flex w-12 shrink-0 flex-col gap-2.5 border-r border-slate-700/50 bg-slate-900/80 p-2 pt-3">
        <div className="h-5 w-5 rounded bg-indigo-500/60 mx-auto" />
        <div className="mt-2 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`mx-auto h-3.5 w-3.5 rounded ${i === 1 ? "bg-indigo-400/50" : "bg-slate-700/60"}`}
            />
          ))}
        </div>
      </div>
      {/* Main content */}
      <div className="flex flex-1 flex-col p-3">
        {/* Header bar */}
        <div className="mb-3 flex items-center justify-between">
          <div className="h-2.5 w-20 rounded bg-slate-600/60" />
          <div className="flex gap-1.5">
            <div className="h-4 w-4 rounded bg-slate-700/60" />
            <div className="h-4 w-16 rounded-full bg-indigo-500/40" />
          </div>
        </div>
        {/* Stat cards */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          {[
            { color: "bg-indigo-500/30", border: "border-indigo-500/20" },
            { color: "bg-emerald-500/30", border: "border-emerald-500/20" },
            { color: "bg-amber-500/30", border: "border-amber-500/20" },
            { color: "bg-rose-500/30", border: "border-rose-500/20" },
          ].map((card, i) => (
            <div
              key={i}
              className={`rounded-md border ${card.border} ${card.color} p-1.5`}
            >
              <div className="h-1.5 w-6 rounded bg-white/20 mb-1" />
              <div className="h-3 w-8 rounded bg-white/30" />
            </div>
          ))}
        </div>
        {/* Chart area */}
        <div className="flex-1 rounded-md border border-slate-700/40 bg-slate-800/50 p-2">
          <div className="mb-2 h-1.5 w-12 rounded bg-slate-600/50" />
          <div className="flex h-full items-end gap-1 pb-1">
            {[40, 65, 45, 80, 55, 70, 60, 90, 50, 75, 85, 65].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-indigo-500/40"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingPagePreview() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-t-xl bg-gradient-to-b from-brand-950 to-slate-900">
      {/* Nav */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded bg-brand-500/60" />
          <div className="h-2 w-12 rounded bg-white/20" />
        </div>
        <div className="flex items-center gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-1.5 w-8 rounded bg-white/15" />
          ))}
          <div className="h-4 w-14 rounded-full bg-brand-500/50" />
        </div>
      </div>
      {/* Hero */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-2 h-3 w-24 rounded-full bg-brand-500/20 border border-brand-500/30" />
        <div className="mb-1.5 h-3 w-44 rounded bg-white/30" />
        <div className="mb-1 h-3 w-36 rounded bg-white/25" />
        <div className="mb-3 h-2 w-48 rounded bg-white/10" />
        <div className="flex gap-2">
          <div className="h-5 w-18 rounded-full bg-brand-500/60" />
          <div className="h-5 w-18 rounded-full border border-white/20 bg-white/5" />
        </div>
      </div>
      {/* Feature grid */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-white/5 bg-white/5 p-2"
          >
            <div className="mb-1.5 h-4 w-4 rounded bg-brand-500/30" />
            <div className="mb-1 h-1.5 w-full rounded bg-white/15" />
            <div className="h-1.5 w-3/4 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EcommercePreview() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-t-xl bg-gradient-to-br from-neutral-900 to-neutral-800">
      {/* Nav bar */}
      <div className="flex items-center justify-between border-b border-neutral-700/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-amber-500/50" />
          <div className="h-2 w-12 rounded bg-white/20" />
        </div>
        <div className="flex items-center gap-3">
          {["Women", "Men", "Sale"].map((_, i) => (
            <div key={i} className="h-1.5 w-8 rounded bg-white/15" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 rounded bg-neutral-700/60" />
          <div className="h-3.5 w-3.5 rounded bg-neutral-700/60" />
          <div className="relative h-3.5 w-3.5 rounded bg-neutral-700/60">
            <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500/70" />
          </div>
        </div>
      </div>
      {/* Product grid */}
      <div className="grid flex-1 grid-cols-3 gap-2 p-3">
        {[
          "bg-rose-900/30",
          "bg-sky-900/30",
          "bg-amber-900/30",
          "bg-emerald-900/30",
          "bg-brand-900/30",
          "bg-pink-900/30",
        ].map((bg, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className={`aspect-[3/4] rounded-lg ${bg} border border-neutral-700/30`} />
            <div className="h-1.5 w-3/4 rounded bg-white/15" />
            <div className="h-1.5 w-1/2 rounded bg-amber-500/30" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioPreview() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-t-xl bg-gradient-to-br from-zinc-950 to-zinc-900">
      {/* Nav */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="h-2 w-16 rounded bg-white/25" />
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-1.5 w-8 rounded bg-white/15" />
          ))}
        </div>
      </div>
      {/* Hero */}
      <div className="mx-4 mb-3 rounded-xl bg-gradient-to-r from-teal-900/40 to-cyan-900/30 border border-teal-500/10 p-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-teal-500/30" />
          <div className="flex-1">
            <div className="mb-1 h-3 w-28 rounded bg-white/25" />
            <div className="mb-1 h-2 w-20 rounded bg-teal-400/20" />
            <div className="h-1.5 w-40 rounded bg-white/10" />
          </div>
        </div>
      </div>
      {/* Work grid */}
      <div className="grid flex-1 grid-cols-3 gap-2 px-4 pb-3">
        {[
          "from-teal-800/30 to-teal-900/20",
          "from-cyan-800/30 to-cyan-900/20",
          "from-emerald-800/30 to-emerald-900/20",
          "from-sky-800/30 to-sky-900/20",
          "from-teal-700/20 to-teal-800/10",
          "from-cyan-700/20 to-cyan-800/10",
        ].map((gradient, i) => (
          <div
            key={i}
            className={`aspect-square rounded-lg bg-gradient-to-br ${gradient} border border-white/5`}
          />
        ))}
      </div>
    </div>
  );
}

function BlogPreview() {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-t-xl bg-gradient-to-br from-stone-900 to-stone-800">
      {/* Content area */}
      <div className="flex flex-1 flex-col p-4">
        {/* Nav */}
        <div className="mb-3 flex items-center justify-between">
          <div className="h-2.5 w-14 rounded bg-orange-400/30" />
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 w-8 rounded bg-white/12" />
            ))}
          </div>
        </div>
        {/* Featured article */}
        <div className="mb-3 flex gap-3">
          <div className="h-16 w-20 shrink-0 rounded-lg bg-gradient-to-br from-orange-800/40 to-amber-800/30 border border-orange-500/10" />
          <div className="flex flex-1 flex-col justify-center gap-1.5">
            <div className="h-2 w-full rounded bg-white/20" />
            <div className="h-2 w-3/4 rounded bg-white/15" />
            <div className="h-1.5 w-1/2 rounded bg-white/8" />
          </div>
        </div>
        {/* Article list */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="mb-2 flex items-center gap-2 border-t border-stone-700/40 pt-2">
            <div className="h-8 w-10 shrink-0 rounded bg-stone-700/40" />
            <div className="flex-1">
              <div className="mb-0.5 h-1.5 w-full rounded bg-white/15" />
              <div className="h-1.5 w-2/3 rounded bg-white/8" />
            </div>
          </div>
        ))}
      </div>
      {/* Sidebar */}
      <div className="w-20 shrink-0 border-l border-stone-700/40 bg-stone-900/50 p-2 pt-10">
        <div className="mb-2 h-1.5 w-full rounded bg-white/10" />
        <div className="space-y-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-1.5 w-full rounded bg-orange-400/15" />
          ))}
        </div>
        <div className="mt-4 mb-2 h-1.5 w-full rounded bg-white/10" />
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-stone-700/60" />
              <div className="h-1 w-full rounded bg-white/8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TodoPreview() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-t-xl bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-4 w-4 items-center justify-center rounded bg-green-500/40">
            <Check className="h-2.5 w-2.5 text-green-400/80" />
          </div>
          <div className="h-2.5 w-16 rounded bg-white/20" />
        </div>
        <div className="h-5 w-14 rounded-full bg-green-500/30 border border-green-500/20" />
      </div>
      {/* Filter tabs */}
      <div className="flex gap-2 px-4 py-2 border-b border-gray-700/30">
        <div className="h-4 w-10 rounded-full bg-green-500/20 border border-green-500/20" />
        <div className="h-4 w-12 rounded-full bg-gray-700/30" />
        <div className="h-4 w-14 rounded-full bg-gray-700/30" />
      </div>
      {/* Task list */}
      <div className="flex-1 px-4 py-2 space-y-1.5">
        {[
          { done: true, w: "w-32" },
          { done: true, w: "w-28" },
          { done: false, w: "w-36" },
          { done: false, w: "w-24" },
          { done: false, w: "w-30" },
          { done: false, w: "w-20" },
        ].map((task, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-lg border border-gray-700/30 bg-gray-800/30 px-2.5 py-1.5"
          >
            <div
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                task.done
                  ? "border-green-500/40 bg-green-500/20"
                  : "border-gray-600/50 bg-gray-700/20"
              }`}
            >
              {task.done && <Check className="h-2 w-2 text-green-400/70" />}
            </div>
            <div
              className={`h-1.5 rounded ${task.w} ${
                task.done ? "bg-white/10 line-through" : "bg-white/20"
              }`}
            />
            {!task.done && i === 2 && (
              <div className="ml-auto h-3 w-10 rounded-full bg-amber-500/20 border border-amber-500/15" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DefaultPreview() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-t-xl bg-gradient-to-br from-zinc-900 to-zinc-800">
      {/* Nav */}
      <div className="flex items-center justify-between border-b border-zinc-700/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-blue-500/40" />
          <div className="h-2 w-14 rounded bg-white/20" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-1.5 w-8 rounded bg-white/12" />
          ))}
        </div>
      </div>
      {/* Content blocks */}
      <div className="flex-1 p-4 space-y-3">
        <div className="space-y-1.5">
          <div className="h-3 w-3/4 rounded bg-white/20" />
          <div className="h-2 w-full rounded bg-white/8" />
          <div className="h-2 w-5/6 rounded bg-white/8" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-700/30 bg-zinc-800/40 p-2"
            >
              <div className="mb-1 h-8 rounded bg-blue-500/10" />
              <div className="mb-0.5 h-1.5 w-3/4 rounded bg-white/15" />
              <div className="h-1.5 w-1/2 rounded bg-white/8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CategoryPreview({ category }: { category: string }) {
  const key = category.toLowerCase();

  if (key === "dashboard" || key === "saas-dashboard") return <DashboardPreview />;
  if (key === "marketing" || key === "landing-page") return <LandingPagePreview />;
  if (key === "ecommerce" || key === "ecommerce-store") return <EcommercePreview />;
  if (key === "portfolio") return <PortfolioPreview />;
  if (key === "blog" || key === "content") return <BlogPreview />;
  if (key === "productivity" || key === "todo-app") return <TodoPreview />;
  return <DefaultPreview />;
}
