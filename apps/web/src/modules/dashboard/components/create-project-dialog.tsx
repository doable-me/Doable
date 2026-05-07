"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileCode,
  MessageSquare,
  LayoutTemplate,
  Loader2,
  Atom,
  Globe,
  Layers,
  Wind,
  Server,
  Zap,
  Hexagon,
  Code2,
} from "lucide-react";
import { apiListTemplates, apiFetch, type ApiTemplate } from "@/lib/api";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    name: string;
    slug: string;
    description?: string;
    prompt?: string;
    templateId?: string;
    frameworkId?: string;
  }) => Promise<void>;
}

type CreationMode = "blank" | "prompt" | "template";

// Mirrors `services/api/src/frameworks/init.ts:DEFAULT_ENABLED`. Default
// ships only React (Vite) and Next.js — the two frameworks with the most
// production mileage. The backend rejects creates for any framework not
// in DOABLE_ENABLED_FRAMEWORKS, so even if a stale build of this file
// sent a disabled id, the API guards against it.
//
// This is the FULL set of known frameworks (for icon/color mapping).
// The actual enabled set is fetched from GET /frameworks at runtime.
const FRAMEWORK_META: Record<string, { icon: typeof Globe; color: string }> = {
  "vite-react": { icon: Atom, color: "text-cyan-400" },
  "nextjs-app": { icon: Globe, color: "text-white" },
  "sveltekit": { icon: Hexagon, color: "text-orange-400" },
  "nuxt": { icon: Layers, color: "text-green-400" },
  "astro": { icon: Wind, color: "text-purple-400" },
  "hono": { icon: Zap, color: "text-orange-300" },
  "fastapi": { icon: Server, color: "text-emerald-400" },
  "django": { icon: Code2, color: "text-green-300" },
};

// Fallback list if API call fails
const FALLBACK_FRAMEWORKS = [
  { id: "vite-react", name: "React (Vite)", description: "Client-side SPA", category: "Frontend", isDefault: true },
  { id: "nextjs-app", name: "Next.js", description: "Full-stack React", category: "Full-Stack", isDefault: false },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateProjectDialogProps) {
  const [mode, setMode] = useState<CreationMode>("blank");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<string>("vite-react");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [frameworks, setFrameworks] = useState(FALLBACK_FRAMEWORKS);

  // Fetch enabled frameworks from the API
  useEffect(() => {
    if (!open) return;
    apiFetch<{ frameworks: Array<{ id: string; name: string; description: string; category: string; isDefault: boolean }>; defaultFramework: string }>("/frameworks")
      .then((res) => {
        if (res.frameworks && res.frameworks.length > 0) {
          setFrameworks(res.frameworks);
          // Set default framework selection
          const def = res.frameworks.find((f) => f.isDefault) ?? res.frameworks[0];
          if (def) setSelectedFramework(def.id);
        }
      })
      .catch(() => {
        // Use fallback on error
      });
  }, [open]);

  // Fetch templates from the registry on first open. Filter out the empty
  // "blank" template — the dialog's "Blank" mode covers that case directly.
  useEffect(() => {
    if (!open || templates.length > 0 || templatesLoading) return;
    setTemplatesLoading(true);
    apiListTemplates()
      .then((res) => {
        setTemplates(res.data.templates.filter((t) => t.id !== "blank"));
      })
      .catch(() => {
        // Non-fatal — templates tab will just be empty.
      })
      .finally(() => setTemplatesLoading(false));
  }, [open, templates.length, templatesLoading]);

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!slugEdited) {
        setSlug(slugify(value));
      }
    },
    [slugEdited]
  );

  const reset = () => {
    setMode("blank");
    setName("");
    setSlug("");
    setDescription("");
    setPrompt("");
    setSelectedTemplate(null);
    setSelectedFramework(frameworks.find((f) => f.isDefault)?.id ?? frameworks[0]?.id ?? "vite-react");
    setError(null);
    setSlugEdited(false);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    if (!slug.trim() || slug.length < 3) {
      setError("Slug must be at least 3 characters");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onCreate({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        prompt: mode === "prompt" ? prompt.trim() || undefined : undefined,
        templateId:
          mode === "template" ? selectedTemplate ?? undefined : undefined,
        frameworkId:
          mode !== "template" ? selectedFramework : undefined,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Create a new project</DialogTitle>
          <DialogDescription>
            Start from scratch, describe what you want, or pick a template.
          </DialogDescription>
        </DialogHeader>

        {/* Mode Selector */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "blank" as const, icon: FileCode, label: "Blank", desc: "Start fresh" },
            { key: "prompt" as const, icon: MessageSquare, label: "From prompt", desc: "AI generates" },
            { key: "template" as const, icon: LayoutTemplate, label: "Template", desc: "Pre-built" },
          ].map(({ key, icon: Icon, label, desc }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                mode === key
                  ? "border-blue-500 bg-blue-500/10 text-white shadow-lg shadow-blue-500/10"
                  : "border-zinc-700/50 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <Icon className={`h-6 w-6 ${mode === key ? "text-blue-400" : ""}`} />
              <div>
                <div className="text-sm font-semibold">{label}</div>
                <div className="text-[11px] text-zinc-500">{desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Framework selector — shown for blank and prompt modes */}
        {(mode === "blank" || mode === "prompt") && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Framework</label>
            <div className="grid grid-cols-2 gap-2">
              {frameworks.map((fw) => {
                const meta = FRAMEWORK_META[fw.id] ?? { icon: Globe, color: "text-white" };
                const Icon = meta.icon;
                return (
                  <button
                    key={fw.id}
                    type="button"
                    onClick={() => setSelectedFramework(fw.id)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      selectedFramework === fw.id
                        ? "border-blue-500 bg-blue-500/10 shadow-md shadow-blue-500/5"
                        : "border-zinc-700/50 hover:border-zinc-600 hover:bg-zinc-800/50"
                    }`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      selectedFramework === fw.id ? "bg-blue-500/20" : "bg-zinc-800"
                    }`}>
                      <Icon className={`h-4.5 w-4.5 ${meta.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium ${
                        selectedFramework === fw.id ? "text-white" : "text-zinc-200"
                      }`}>{fw.name}</div>
                      <div className="text-xs text-zinc-500">{fw.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <Input
              placeholder="My Awesome Project"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Slug</label>
            <Input
              placeholder="my-awesome-project"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Description{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              placeholder="A brief description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {mode === "prompt" && (
            <div>
              <label className="mb-1 block text-sm font-medium">
                What do you want to build?
              </label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Describe your application in detail..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {mode === "template" && (
            <div>
              <label className="mb-1 block text-sm font-medium">
                Choose a template
              </label>
              {templatesLoading ? (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Loading templates…
                </div>
              ) : templates.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No templates available.
                </div>
              ) : (
                <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                        selectedTemplate === t.id
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50"
                      }`}
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
