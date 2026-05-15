"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Template data (inlined — no DB dependency) ─────────────

interface Template {
  id: string;
  title: string;
  description: string;
  prompt: string;
  tag: string;
  gradient: string; // Tailwind gradient classes for thumbnail bg
}

const TEMPLATES: Template[] = [
  {
    id: "personal-portfolio",
    title: "Personal portfolio",
    description: "Showcase your work with a clean, fast portfolio site",
    prompt: "Build me a personal portfolio website with a hero section, projects grid, about section, and contact form. Make it clean and professional.",
    tag: "Portfolio",
    gradient: "from-slate-700 to-slate-900",
  },
  {
    id: "freelancer-crm",
    title: "Freelancer CRM",
    description: "Track clients, projects, and invoices in one place",
    prompt: "Build me a CRM for freelancers with client management, project tracking, invoice generation, and a dashboard showing monthly revenue.",
    tag: "CRM",
    gradient: "from-blue-700 to-indigo-900",
  },
  {
    id: "customer-feedback",
    title: "Customer feedback form",
    description: "Collect and organize product feedback with NPS scoring",
    prompt: "Build me a customer feedback collection app with NPS scoring, free-text comments, tagging, and a dashboard showing trends over time.",
    tag: "Form",
    gradient: "from-emerald-700 to-teal-900",
  },
  {
    id: "team-task-board",
    title: "Team task board",
    description: "Kanban board for your team with real-time updates",
    prompt: "Build me a Kanban task board with columns for To Do, In Progress, and Done. Support drag-and-drop, assignees, due dates, and labels.",
    tag: "Dashboard",
    gradient: "from-violet-700 to-purple-900",
  },
  {
    id: "coffee-shop-landing",
    title: "Coffee shop landing page",
    description: "Gorgeous landing page for a local cafe with menu and booking",
    prompt: "Build me a landing page for a coffee shop called 'Ember Coffee' with a hero section, menu grid, about story, gallery, and a table reservation form.",
    tag: "Landing",
    gradient: "from-amber-700 to-orange-900",
  },
  {
    id: "habit-tracker",
    title: "Habit tracker dashboard",
    description: "Build and visualize streaks for daily habits",
    prompt: "Build me a habit tracker app where users can define habits, log daily completions, see streak counts, and view a heatmap calendar of consistency.",
    tag: "Dashboard",
    gradient: "from-rose-700 to-pink-900",
  },
];

// ─── Inline SVG thumbnail placeholder ───────────────────────

function ThumbnailSVG({ gradient, title }: { gradient: string; title: string }) {
  return (
    <div className={cn("w-full h-full bg-gradient-to-br flex items-end p-3", gradient)}>
      <span className="text-xs font-medium text-white/70 leading-tight line-clamp-1">{title}</span>
    </div>
  );
}

// ─── Single card ─────────────────────────────────────────────

function TemplateCard({ template, onSelect }: { template: Template; onSelect: (t: Template) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group flex flex-col rounded-xl border text-left overflow-hidden transition-all duration-200",
        hovered
          ? "border-brand-500/50 shadow-lg shadow-brand-500/10 -translate-y-0.5"
          : "border-border bg-card",
      )}
    >
      {/* Thumbnail */}
      <div className="h-32 w-full overflow-hidden">
        <ThumbnailSVG gradient={template.gradient} title={template.title} />
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground leading-tight">{template.title}</p>
          <span className="shrink-0 text-xs text-muted-foreground border border-border/60 rounded px-1.5 py-0.5 bg-muted/30">
            {template.tag}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{template.description}</p>
        <p className="text-xs text-brand-400 mt-1 font-medium">~30 sec</p>
      </div>
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────

interface TemplateGalleryProps {
  onCreated?: (projectId: string) => void;
}

export function TemplateGallery({ onCreated }: TemplateGalleryProps) {
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(template: Template) {
    if (creating) return;
    setCreating(template.id);
    setError(null);
    try {
      const res = await apiFetch<{ id: string; projectId?: string }>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: template.title,
          prompt: template.prompt,
        }),
      });
      const projectId = res.id ?? res.projectId;
      if (!projectId) throw new Error("No project ID returned");
      if (onCreated) onCreated(projectId);
      router.push(`/editor/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project. Try again.");
      setCreating(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map((t) => (
          <div key={t.id} className="relative">
            {creating === t.id && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-sm">
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
              </div>
            )}
            <TemplateCard template={t} onSelect={handleSelect} />
          </div>
        ))}
      </div>
    </div>
  );
}
