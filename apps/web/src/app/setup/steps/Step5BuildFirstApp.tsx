"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplateGallery } from "../templates/TemplateGallery";

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export function Step5BuildFirstApp({ onComplete, onBack }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">Build your first app</h2>
        <p className="text-sm text-muted-foreground">
          Pick a template and watch the AI build it in about 30 seconds. This is what Doable
          is for.
        </p>
      </div>

      <TemplateGallery />

      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <Button variant="ghost" onClick={onBack} className="gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <button
          type="button"
          onClick={onComplete}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Start blank — go to dashboard
        </button>
      </div>
    </div>
  );
}
