"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiCreateProject } from "@/lib/api";

interface UseTemplateDialogProps {
  template: {
    id: string;
    name: string;
    description: string;
  } | null;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

export function UseTemplateDialog({
  template,
  onClose,
  onCreated,
}: UseTemplateDialogProps) {
  const [projectName, setProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when template changes (dialog opens/closes)
  useEffect(() => {
    if (template) {
      setProjectName(`Remix of ${template.name}`);
      setIsCreating(false);
      setError(null);
    }
  }, [template]);

  // Handle ESC key
  useEffect(() => {
    if (!template) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isCreating) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [template, isCreating, onClose]);

  async function handleRemix() {
    if (!template || !projectName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const res = await apiCreateProject({
        name: projectName.trim(),
        description: template.description,
        templateId: template.id,
      });
      onCreated(res.data.id);
    } catch (err) {
      console.error("Failed to remix project:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create project. Please try again."
      );
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={!!template} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-[450px] p-0 gap-0">
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isCreating}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none text-zinc-400"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <div className="px-6 pt-6 pb-0">
          {/* Logo/icon */}
          <div className="mb-4">
            <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-white"
              >
                <path
                  d="M8 1L14.9282 5V11L8 15L1.07179 11V5L8 1Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-xl font-semibold text-white">
              Remix project
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-400">
              By remixing a project, you will create a copy that you own.
            </DialogDescription>
          </DialogHeader>

          {/* Form */}
          <div className="mt-6 space-y-2">
            <Label htmlFor="project-name" className="text-sm font-medium text-zinc-300">
              Project name
            </Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isCreating}
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-600"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreating && projectName.trim()) {
                  handleRemix();
                }
              }}
            />
            {error && (
              <p className="text-sm text-red-400 mt-1">{error}</p>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 mt-6 border-t border-zinc-800 flex-row justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isCreating}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRemix}
            disabled={isCreating || !projectName.trim()}
            className="bg-white text-zinc-900 hover:bg-zinc-200 font-medium"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Remixing...
              </>
            ) : (
              "Remix"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
