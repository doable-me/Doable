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
import { apiUseTemplate } from "@/lib/api-templates";

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
      const res = await apiUseTemplate(template.id, projectName.trim());
      onCreated(res.data.projectId);
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
      <DialogContent className="max-w-[450px] p-0 gap-0">
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isCreating}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none text-muted-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <div className="px-6 pt-6 pb-0">
          {/* Logo/icon */}
          <div className="mb-4">
            <div className="h-8 w-8 rounded-lg bg-foreground/10 flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-foreground"
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
            <DialogTitle className="text-xl font-semibold text-foreground">
              Remix project
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              By remixing a project, you will create a copy that you own.
            </DialogDescription>
          </DialogHeader>

          {/* Form */}
          <div className="mt-6 space-y-2">
            <Label htmlFor="project-name" className="text-sm font-medium text-foreground">
              Project name
            </Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isCreating}
              className="bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
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

        <DialogFooter className="px-6 py-4 mt-6 border-t border-border flex-row justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isCreating}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRemix}
            disabled={isCreating || !projectName.trim()}
            className="bg-foreground text-background hover:bg-foreground/90 font-medium"
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
