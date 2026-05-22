"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface TemplatePreviewModalProps {
  template: {
    id: string;
    name: string;
    description: string;
    category: string;
    isOfficial: boolean;
  } | null;
  onClose: () => void;
  onUseTemplate: () => void;
}

export function TemplatePreviewModal({
  template,
  onClose,
  onUseTemplate,
}: TemplatePreviewModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!template) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [template, handleKeyDown]);

  if (!template) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/45 animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div
          className="relative z-10 flex flex-col w-[90vw] h-[85vh] rounded-xl overflow-hidden bg-background border border-border shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-card border-b border-border shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-[15px] font-semibold text-foreground truncate">
                {template.name}
              </h2>
              <span className="text-[13px] text-muted-foreground shrink-0">
                by Doable
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={onUseTemplate}
                className="px-4 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
              >
                Use template
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Preview area */}
          <div className="flex-1 bg-white overflow-hidden">
            <iframe
              src={`${API_URL}/templates/${template.id}/preview`}
              title={`Preview of ${template.name}`}
              className="w-full h-full border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
