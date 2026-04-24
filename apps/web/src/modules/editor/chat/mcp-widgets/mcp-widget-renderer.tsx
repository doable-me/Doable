"use client";

import { AlertCircle } from "lucide-react";
import type { McpUiWidget } from "../../hooks/use-editor-store";
import { McpTableWidget } from "./mcp-widget-table";
import { McpFormWidget } from "./mcp-widget-form";
import { McpConfirmWidget } from "./mcp-widget-confirm";
import { McpSelectWidget } from "./mcp-widget-select";
import { McpDownloadWidget } from "./mcp-widget-download";

interface McpWidgetRendererProps {
  widget: McpUiWidget;
  messageId: string;
}

export function McpWidgetRenderer({ widget, messageId }: McpWidgetRendererProps) {
  if (widget.closed) {
    return (
      <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {widget.title} — completed
      </div>
    );
  }

  switch (widget.uiType) {
    case "table":
      return <McpTableWidget widget={widget} messageId={messageId} />;
    case "form":
      return <McpFormWidget widget={widget} messageId={messageId} />;
    case "confirm":
      return <McpConfirmWidget widget={widget} messageId={messageId} />;
    case "select":
      return <McpSelectWidget widget={widget} messageId={messageId} />;
    case "download":
      return <McpDownloadWidget widget={widget} messageId={messageId} />;
    default:
      return (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Unknown widget type: {(widget as McpUiWidget).uiType}
        </div>
      );
  }
}
