"use client";

import { useState } from "react";
import { Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import type { McpUiWidget } from "../../hooks/use-editor-store";
import { useMcpAction } from "./use-mcp-action";
import { useEditorStore } from "../../hooks/use-editor-store";

interface McpConfirmWidgetProps {
  widget: McpUiWidget;
  messageId: string;
}

export function McpConfirmWidget({ widget, messageId }: McpConfirmWidgetProps) {
  const projectId = useEditorStore((s) => s.projectId);
  const { submitAction, loading } = useMcpAction(projectId);
  const [resolved, setResolved] = useState<"confirmed" | "cancelled" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const actions = widget.schema.actions ?? [];
  const message = widget.schema.message ?? "Are you sure you want to proceed?";
  const widgetError = widget.state.__error as string | undefined;

  const confirmAction = actions.find((a) => a.id === "confirm" || a.variant !== "destructive") ?? actions[0];
  const cancelAction = actions.find((a) => a.id === "cancel" || a.variant === "outline") ?? actions[1];

  const handleAction = async (actionId: string, label: "confirmed" | "cancelled") => {
    setActionError(null);
    const result = await submitAction({
      toolCallId: widget.toolCallId,
      connectorId: widget.connectorId,
      action: actionId,
      payload: {},
    });
    if (!result.success) {
      setActionError(result.error ?? "Action failed");
    } else {
      setResolved(label);
    }
  };

  if (resolved) {
    return (
      <div className={`mt-3 rounded-lg border px-4 py-3 text-xs ${
        resolved === "confirmed"
          ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300"
          : "border-border bg-muted/30 text-muted-foreground"
      }`}>
        {resolved === "confirmed" ? `✓ ${widget.title} — confirmed` : `✗ ${widget.title} — cancelled`}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200 dark:border-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">{widget.title}</span>
      </div>

      {(widgetError || actionError) && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-b border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {widgetError ?? actionError}
        </div>
      )}

      <div className="px-3 py-3">
        <p className="text-xs text-amber-800 dark:text-amber-200">{message}</p>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-amber-200 dark:border-amber-800">
        {confirmAction && (
          <button
            disabled={loading}
            onClick={() => handleAction(confirmAction.id, "confirmed")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              confirmAction.variant === "destructive"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-amber-600 text-white hover:bg-amber-700"
            }`}
          >
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            {confirmAction.label ?? "Confirm"}
          </button>
        )}
        {cancelAction && (
          <button
            disabled={loading}
            onClick={() => handleAction(cancelAction.id, "cancelled")}
            className="rounded-md border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
          >
            {cancelAction.label ?? "Cancel"}
          </button>
        )}
        {actions.length === 0 && (
          <>
            <button
              disabled={loading}
              onClick={() => handleAction("confirm", "confirmed")}
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              Confirm
            </button>
            <button
              disabled={loading}
              onClick={() => handleAction("cancel", "cancelled")}
              className="rounded-md border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
