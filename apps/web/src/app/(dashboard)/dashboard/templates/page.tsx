"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiListTemplates, type ApiTemplate } from "@/lib/api";
import { TemplateCard } from "@/components/templates/template-card";
import { TemplatePreviewModal } from "@/components/templates/template-preview-modal";
import { UseTemplateDialog } from "@/components/templates/use-template-dialog";
import { Loader2 } from "lucide-react";

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Preview modal state
  const [previewTemplate, setPreviewTemplate] = useState<ApiTemplate | null>(
    null
  );

  // Use template dialog state
  const [remixTemplate, setRemixTemplate] = useState<ApiTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiListTemplates();
      setTemplates(res.data.templates.filter((t) => t.id !== "blank"));
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Templates</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Start from a template to build your next project
          </p>
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500 mb-4" />
            <p className="text-sm text-zinc-500">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-sm text-zinc-500">No templates available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onClick={() => setPreviewTemplate(template)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <TemplatePreviewModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUseTemplate={() => {
          setRemixTemplate(previewTemplate);
          setPreviewTemplate(null);
        }}
      />

      {/* Use Template / Remix Dialog */}
      <UseTemplateDialog
        template={remixTemplate}
        onClose={() => setRemixTemplate(null)}
        onCreated={(projectId) => {
          setRemixTemplate(null);
          router.push(`/editor/${projectId}`);
        }}
      />
    </div>
  );
}
