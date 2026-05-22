"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Compass,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Star,
  X,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  apiShareProject,
  apiUnshareProject,
  apiSetProjectFeatured,
  apiCommunityCategories,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

export interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  projectDescription?: string | null;
  /** Whether the project is currently shared. Drives "Update" vs "Share" UI. */
  alreadyShared?: boolean;
  /** Whether the project is currently featured (admins only). */
  alreadyFeatured?: boolean;
  /** Initial values for the form (used when editing an existing share). */
  initialTitle?: string;
  initialCategory?: string;
  /** Called after a successful share/unshare/feature so callers can refresh. */
  onChanged?: () => void;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function ShareDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  projectDescription,
  alreadyShared = false,
  alreadyFeatured = false,
  initialTitle,
  initialCategory,
  onChanged,
}: ShareDialogProps) {
  const { user } = useAuth();
  const isAdmin = user?.isPlatformAdmin === true;

  const [title, setTitle] = useState(initialTitle ?? projectName);
  const [description, setDescription] = useState(projectDescription ?? "");
  const [category, setCategory] = useState(initialCategory ?? "");
  const [categories, setCategories] = useState<string[]>([]);
  const [featured, setFeatured] = useState(alreadyFeatured);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle ?? projectName);
    setDescription(projectDescription ?? "");
    setCategory(initialCategory ?? "");
    setFeatured(alreadyFeatured);
    setState({ kind: "idle" });
  }, [open, projectName, projectDescription, initialTitle, initialCategory, alreadyFeatured]);

  useEffect(() => {
    if (!open) return;
    apiCommunityCategories()
      .then((res) => setCategories(res.data.categories))
      .catch(() => {});
  }, [open]);

  const handleShare = useCallback(async () => {
    if (!title.trim()) {
      setState({ kind: "error", message: "Title is required" });
      return;
    }
    setState({ kind: "submitting" });
    try {
      await apiShareProject(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
      });

      // Admin-only: also flip featured if it changed.
      if (isAdmin && featured !== alreadyFeatured) {
        await apiSetProjectFeatured(projectId, featured).catch(() => {});
      }

      setState({
        kind: "success",
        message: alreadyShared ? "Updated in Discover." : "Shared to Discover.",
      });
      onChanged?.();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Share failed",
      });
    }
  }, [
    projectId,
    title,
    description,
    category,
    isAdmin,
    featured,
    alreadyFeatured,
    alreadyShared,
    onChanged,
  ]);

  const handleUnshare = useCallback(async () => {
    if (!confirm("Remove this project from Discover? Existing remixes are unaffected.")) {
      return;
    }
    setState({ kind: "submitting" });
    try {
      await apiUnshareProject(projectId);
      setState({ kind: "success", message: "Removed from Discover." });
      onChanged?.();
      setTimeout(() => onOpenChange(false), 800);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Unshare failed",
      });
    }
  }, [projectId, onChanged, onOpenChange]);

  const submitting = state.kind === "submitting";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-emerald-400" />
            {alreadyShared ? "Update Discover listing" : "Share to Discover"}
          </DialogTitle>
          <DialogDescription>
            Lists your project in the community feed. Other users can browse it
            and remix it into their own workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="share-title">Title</Label>
            <Input
              id="share-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={submitting}
              placeholder="A clear, searchable title"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="share-description">Description</Label>
            <Textarea
              id="share-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              disabled={submitting}
              placeholder="What does this project do? Who's it for?"
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/1000
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="share-category">Category (optional)</Label>
            <div className="flex flex-wrap gap-1.5">
              {categories.length > 0 ? (
                <>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(category === cat ? "" : cat)}
                      disabled={submitting}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                        category === cat
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <Input
                    id="share-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Or type one..."
                    maxLength={50}
                    disabled={submitting}
                    className="h-7 text-xs flex-1 min-w-[120px]"
                  />
                </>
              ) : (
                <Input
                  id="share-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="dashboard, marketing, ecommerce..."
                  maxLength={50}
                  disabled={submitting}
                />
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <Star className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <Label
                    htmlFor="share-featured"
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <span className="text-sm font-medium">Featured (admin)</span>
                    <input
                      id="share-featured"
                      type="checkbox"
                      checked={featured}
                      onChange={(e) => setFeatured(e.target.checked)}
                      disabled={submitting}
                      className="h-4 w-4 accent-amber-400"
                    />
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Surfaces this project at the top of Discover.
                  </p>
                </div>
              </div>
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{state.message}</span>
            </div>
          )}
          {state.kind === "success" && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{state.message}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-row justify-between">
          {alreadyShared ? (
            <Button
              variant="outline"
              onClick={handleUnshare}
              disabled={submitting}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-3.5 w-3.5 mr-1.5" /> Unshare
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleShare} disabled={submitting || !title.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {alreadyShared ? "Updating..." : "Sharing..."}
                </>
              ) : (
                <>{alreadyShared ? "Save changes" : "Share to Discover"}</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
