"use client";

import { useState, useCallback } from "react";
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
import { FileCode, MessageSquare, LayoutTemplate, Loader2 } from "lucide-react";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    name: string;
    slug: string;
    description?: string;
    prompt?: string;
    templateId?: string;
  }) => Promise<void>;
}

type CreationMode = "blank" | "prompt" | "template";

const TEMPLATES = [
  { id: "next-starter", name: "Next.js Starter", category: "Web" },
  { id: "react-dashboard", name: "React Dashboard", category: "Web" },
  { id: "api-service", name: "API Service", category: "Backend" },
  { id: "landing-page", name: "Landing Page", category: "Marketing" },
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Start from scratch, describe what you want, or pick a template.
          </DialogDescription>
        </DialogHeader>

        {/* Mode Selector */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: "blank" as const, icon: FileCode, label: "Blank" },
            { key: "prompt" as const, icon: MessageSquare, label: "From prompt" },
            { key: "template" as const, icon: LayoutTemplate, label: "Template" },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors ${
                mode === key
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>

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
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((t) => (
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
