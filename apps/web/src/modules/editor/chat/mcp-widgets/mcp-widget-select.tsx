"use client";

import { useState } from "react";
import { Loader2, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { McpUiWidget } from "../../hooks/use-editor-store";
import { useMcpAction } from "./use-mcp-action";
import { useEditorStore } from "../../hooks/use-editor-store";

interface McpSelectWidgetProps {
  widget: McpUiWidget;
  messageId: string;
}

export function McpSelectWidget({ widget, messageId }: McpSelectWidgetProps) {
  const projectId = useEditorStore((s) => s.projectId);
  const { submitAction, loading } = useMcpAction(projectId);
  const [selected, setSelected] = useState<string | null>(
    (widget.state.selected as string | undefined) ?? null,
  );
  const [submitted, setSubmitted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const options = widget.schema.options ?? [];
  const actions = widget.schema.actions ?? [];
  const widgetError = widget.state.__error as string | undefined;

  const primaryAction = actions.find((a) => a.id !== "cancel") ?? actions[0];

  const handleSubmit = async () => {
    if (!selected) return;
    setActionError(null);
    const result = await submitAction({
      toolCallId: widget.toolCallId,
      connectorId: widget.connectorId,
      action: primaryAction?.id ?? "select",
      payload: { selected },
    });
    if (!result.success) {
      setActionError(result.error ?? "Action failed");
    } else {
      setSubmitted(true);
      const chosen = options.find((o) => o.value === selected);
      const label = chosen?.label ?? selected;
      const instructions = result.instructions?.trim();
      // Generic follow-up prompt — works for any MCP app. When the tool
      // returned instructions, forward them verbatim so the LLM has the full
      // spec to act on. Otherwise just acknowledge the selection and let the
      // model proceed on its own.
      const prompt = instructions
        ? `I selected "${label}" (value: ${selected}) in the "${widget.title}" widget. Proceed based on the tool's instructions below. Do not ask again. Do not summarise. Use your available tools to carry out any work the instructions require.\n\n---\n${instructions}`
        : `I selected "${label}" (value: ${selected}) in the "${widget.title}" widget. Please proceed without asking again.`;
      window.dispatchEvent(
        new CustomEvent("doable:mcp-continue", {
          detail: { prompt, display: `Selected: ${label}` },
        }),
      );
    }
  };

  if (submitted) {
    const selectedOption = options.find((o) => o.value === selected);
    return (
      <div className="mt-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 px-4 py-3 text-xs text-green-700 dark:text-green-300">
        ✓ {widget.title} — selected: <strong>{selectedOption?.label ?? selected}</strong>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-background overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs font-semibold text-foreground">{widget.title}</span>
      </div>

      {(widgetError || actionError) && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-b border-border">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {widgetError ?? actionError}
        </div>
      )}

      <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
        {options.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              className={cn(
                "w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                isSelected
                  ? "bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800"
                  : "hover:bg-muted/40 border border-transparent",
              )}
            >
              <span className={cn(
                "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                isSelected
                  ? "border-brand-500 bg-brand-500"
                  : "border-muted-foreground/40",
              )}>
                {isSelected && <Check className="h-2 w-2 text-white" strokeWidth={3} />}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{opt.label}</p>
                {opt.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</p>
                )}
              </div>
            </button>
          );
        })}
        {options.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground text-center">No options available</p>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
        <button
          disabled={loading || !selected}
          onClick={handleSubmit}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {primaryAction?.label ?? "Select"}
        </button>
      </div>
    </div>
  );
}
