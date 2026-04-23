"use client";

import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import type { McpUiWidget, McpUiFormField } from "../../hooks/use-editor-store";
import { useMcpAction } from "./use-mcp-action";
import { useEditorStore } from "../../hooks/use-editor-store";

interface McpFormWidgetProps {
  widget: McpUiWidget;
  messageId: string;
}

export function McpFormWidget({ widget, messageId }: McpFormWidgetProps) {
  const projectId = useEditorStore((s) => s.projectId);
  const { submitAction, loading } = useMcpAction(projectId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const fields = widget.schema.fields ?? [];
  const actions = widget.schema.actions ?? [];

  const initialValues = fields.reduce<Record<string, unknown>>((acc, f) => {
    acc[f.key] = (widget.state[f.key] ?? f.defaultValue) ?? "";
    return acc;
  }, {});

  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const widgetError = widget.state.__error as string | undefined;

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleAction = async (actionId: string) => {
    setActionError(null);
    const result = await submitAction({
      toolCallId: widget.toolCallId,
      connectorId: widget.connectorId,
      action: actionId,
      payload: values,
    });
    if (!result.success) {
      setActionError(result.error ?? "Action failed");
    } else {
      setSubmitted(true);
    }
  };

  if (submitted && !widgetError) {
    return (
      <div className="mt-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 px-4 py-3 text-xs text-green-700 dark:text-green-300">
        ✓ {widget.title} — submitted successfully
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

      <div className="p-3 space-y-3">
        {fields.map((field) => (
          <FormField
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(v) => handleChange(field.key, v)}
          />
        ))}
      </div>

      {actions.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
          {actions.map((action) => (
            <button
              key={action.id}
              disabled={loading}
              onClick={() => handleAction(action.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                action.variant === "destructive"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : action.variant === "outline"
                    ? "border border-border hover:bg-accent"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormField({
  field,
  value,
  onChange,
}: {
  field: McpUiFormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const baseInput =
    "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground";

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground">
        {field.label}
        {field.required && <span className="ml-0.5 text-red-500">*</span>}
      </label>

      {field.type === "textarea" ? (
        <textarea
          className={`${baseInput} min-h-[80px] resize-y`}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          className={baseInput}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={field.key}
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded"
          />
          <label htmlFor={field.key} className="text-xs text-muted-foreground">
            {field.placeholder ?? field.label}
          </label>
        </div>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          className={baseInput}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(field.type === "number" ? Number(e.target.value) : e.target.value)
          }
        />
      )}
    </div>
  );
}
