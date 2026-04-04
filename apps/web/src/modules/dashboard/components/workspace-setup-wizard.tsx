"use client";

import { useState } from "react";
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
import { Loader2, ArrowRight, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

// ─── Constants (matching environments-panel.tsx) ───────────

const COLOR_OPTIONS = [
  { value: "blue", class: "bg-blue-500" },
  { value: "green", class: "bg-green-500" },
  { value: "purple", class: "bg-purple-500" },
  { value: "orange", class: "bg-orange-500" },
  { value: "pink", class: "bg-pink-500" },
  { value: "yellow", class: "bg-yellow-500" },
  { value: "red", class: "bg-red-500" },
  { value: "teal", class: "bg-teal-500" },
];

const ICON_OPTIONS = ["🔧", "🚀", "💻", "🎨", "📦", "🔬", "🎯", "⚡", "🌐", "🛠️", "📝", "🤖"];

const POPULAR_INTEGRATIONS = [
  { name: "GitHub", icon: "🐙", description: "Code & version control" },
  { name: "Slack", icon: "💬", description: "Team messaging" },
  { name: "Gmail", icon: "📧", description: "Email & communication" },
  { name: "Google Drive", icon: "📁", description: "File storage" },
  { name: "Notion", icon: "📓", description: "Notes & wikis" },
  { name: "Linear", icon: "🔷", description: "Issue tracking" },
  { name: "Figma", icon: "🎨", description: "Design files" },
  { name: "Jira", icon: "📋", description: "Project management" },
];

// ─── Types ─────────────────────────────────────────────────

interface WorkspaceSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
  onComplete: () => void;
}

type Step = "environment" | "knowledge" | "integrations" | "done";
const STEPS: Step[] = ["environment", "knowledge", "integrations", "done"];

// ─── Step Indicator ────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {STEPS.slice(0, -1).map((step, i) => (
        <div
          key={step}
          className={cn(
            "h-1.5 w-8 rounded-full transition-colors",
            i <= idx ? "bg-primary" : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}

// ─── Wizard Component ──────────────────────────────────────

export function WorkspaceSetupWizard({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  onComplete,
}: WorkspaceSetupWizardProps) {
  const [step, setStep] = useState<Step>("environment");

  // Step 1 — Environment
  const [envName, setEnvName] = useState("My Environment");
  const [envIcon, setEnvIcon] = useState("🔧");
  const [envColor, setEnvColor] = useState("blue");
  const [envSubmitting, setEnvSubmitting] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [createdEnvId, setCreatedEnvId] = useState<string | null>(null);

  // Step 2 — Knowledge
  const [instructions, setInstructions] = useState("");
  const [knowledgeSubmitting, setKnowledgeSubmitting] = useState(false);

  const handleCreateEnvironment = async () => {
    if (!envName.trim()) return;
    setEnvSubmitting(true);
    setEnvError(null);
    try {
      // Create environment
      const { data: env } = await apiFetch<{ data: { id: string } }>(
        `/workspaces/${workspaceId}/environments`,
        {
          method: "POST",
          body: JSON.stringify({
            name: envName.trim(),
            icon: envIcon,
            color: envColor,
          }),
        }
      );
      // Apply to workspace + set as default
      await apiFetch(`/workspaces/${workspaceId}/environments/${env.id}/default`, {
        method: "POST",
      });
      setCreatedEnvId(env.id);
      setStep("knowledge");
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Failed to create environment");
    } finally {
      setEnvSubmitting(false);
    }
  };

  const handleSaveKnowledge = async () => {
    if (!instructions.trim() || !createdEnvId) {
      setStep("integrations");
      return;
    }
    setKnowledgeSubmitting(true);
    try {
      await apiFetch(
        `/workspaces/${workspaceId}/environments/${createdEnvId}/instructions`,
        {
          method: "POST",
          body: JSON.stringify({
            filename: "custom-instructions.md",
            content: instructions.trim(),
          }),
        }
      );
      setStep("integrations");
    } catch {
      // Non-critical — move forward anyway
      setStep("integrations");
    } finally {
      setKnowledgeSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    onComplete();
    // Reset for next use
    setStep("environment");
    setEnvName("My Environment");
    setEnvIcon("🔧");
    setEnvColor("blue");
    setEnvError(null);
    setCreatedEnvId(null);
    setInstructions("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {step !== "done" && <StepIndicator current={step} />}

        {/* ─── Step 1: Environment ─── */}
        {step === "environment" && (
          <>
            <DialogHeader>
              <DialogTitle>Set up your workspace</DialogTitle>
              <DialogDescription>
                Every workspace needs an environment — it defines what your AI assistant knows and can do.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="flex gap-3">
                <div className="flex flex-col items-center gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Icon</label>
                  <div className="grid grid-cols-4 gap-1 rounded-md border p-1.5">
                    {ICON_OPTIONS.map((icon) => (
                      <button
                        key={icon}
                        onClick={() => setEnvIcon(icon)}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded text-base transition-colors",
                          envIcon === icon
                            ? "bg-primary/15 ring-1 ring-primary/30"
                            : "hover:bg-muted"
                        )}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Name
                    </label>
                    <Input
                      value={envName}
                      onChange={(e) => setEnvName(e.target.value)}
                      placeholder="My Environment"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleCreateEnvironment()}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Color
                    </label>
                    <div className="flex gap-2">
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => setEnvColor(c.value)}
                          className={cn(
                            "h-6 w-6 rounded-full transition-all",
                            c.class,
                            envColor === c.value
                              ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                              : "opacity-60 hover:opacity-100"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {envError && <p className="text-sm text-destructive">{envError}</p>}
            </div>
            <DialogFooter className="mt-6">
              <Button variant="ghost" onClick={handleClose}>
                Skip setup
              </Button>
              <Button
                onClick={handleCreateEnvironment}
                disabled={envSubmitting || !envName.trim()}
              >
                {envSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create & Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ─── Step 2: Knowledge ─── */}
        {step === "knowledge" && (
          <>
            <DialogHeader>
              <DialogTitle>Add knowledge</DialogTitle>
              <DialogDescription>
                Tell your AI what it should know about your projects. You can always add more later.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={"e.g. We use React with TypeScript.\nOur API follows REST conventions.\nAlways use Tailwind for styling."}
                rows={5}
                autoFocus
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground resize-none"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                These instructions guide your AI assistant across all projects in this workspace.
              </p>
            </div>
            <DialogFooter className="mt-6">
              <Button variant="ghost" onClick={() => setStep("integrations")}>
                Skip
              </Button>
              <Button
                onClick={handleSaveKnowledge}
                disabled={knowledgeSubmitting || !instructions.trim()}
              >
                {knowledgeSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ─── Step 3: Integrations ─── */}
        {step === "integrations" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect tools</DialogTitle>
              <DialogDescription>
                Connect external tools to supercharge your workflow. You can set these up anytime from Settings.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {POPULAR_INTEGRATIONS.map((integration) => (
                <button
                  key={integration.name}
                  className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted"
                  onClick={() => {
                    // Placeholder — integrations are set up from the settings page
                  }}
                >
                  <span className="text-lg">{integration.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{integration.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {integration.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Integrations can be connected from workspace settings at any time.
            </p>
            <DialogFooter className="mt-4">
              <Button onClick={() => setStep("done")}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ─── Step 4: Done ─── */}
        {step === "done" && (
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle className="mb-2">You&apos;re all set!</DialogTitle>
            <p className="text-sm text-muted-foreground mb-6">
              <strong>{workspaceName}</strong> is ready to go. Start creating projects and let AI help you build.
            </p>
            <Button onClick={handleClose} className="w-full max-w-[200px]">
              <Check className="mr-2 h-4 w-4" />
              Go to workspace
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
