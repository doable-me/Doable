"use client";

import { memo } from "react";
import { X, Image as ImageIcon, FileText, FileCode, File } from "lucide-react";
import type { Attachment } from "@/hooks/use-attachments";

// ─── File Type Icon ──────────────────────────────────────────
function FileTypeIcon({
  type,
  className = "h-4 w-4",
}: {
  type: Attachment["type"];
  className?: string;
}) {
  switch (type) {
    case "image":
      return <ImageIcon className={className} />;
    case "code":
      return <FileCode className={className} />;
    case "text":
      return <FileText className={className} />;
    case "pdf":
      return <File className={className} />;
    case "document":
      return <FileText className={className} />;
    default:
      return <File className={className} />;
  }
}

// ─── Attachment Preview Strip (above textarea in chat-input) ─
interface AttachmentPreviewStripProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export const AttachmentPreviewStrip = memo(function AttachmentPreviewStrip({
  attachments,
  onRemove,
}: AttachmentPreviewStripProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-2 pb-1.5 pt-2 scrollbar-thin">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="group relative flex-none rounded-md border border-border bg-muted/30 transition-colors hover:bg-muted/50"
        >
          {/* Remove button */}
          <button
            onClick={() => onRemove(att.id)}
            className="absolute -right-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background opacity-0 transition-opacity group-hover:opacity-100"
            title="Remove"
          >
            <X className="h-2.5 w-2.5" />
          </button>

          {att.type === "image" && att.preview ? (
            <img
              src={att.preview}
              alt={att.name}
              className="h-12 w-12 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-12 items-center gap-1.5 px-2">
              <FileTypeIcon
                type={att.type}
                className="h-3.5 w-3.5 flex-none text-muted-foreground"
              />
              <span className="max-w-[100px] truncate text-xs text-muted-foreground">
                {att.name}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

// ─── Message Attachments (displayed in chat messages) ────────
interface MessageAttachmentsProps {
  attachments: Array<{
    type: "image" | "text" | "pdf" | "code" | "document";
    name: string;
    mimeType: string;
    preview?: string;
  }>;
}

export const MessageAttachments = memo(function MessageAttachments({
  attachments,
}: MessageAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      {attachments.map((att, idx) => {
        if (att.type === "image" && att.preview) {
          return (
            <img
              key={idx}
              src={att.preview}
              alt={att.name}
              className="max-w-[200px] rounded-md border border-border object-contain"
              title={att.name}
            />
          );
        }

        return (
          <div
            key={idx}
            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2 py-1"
          >
            <FileTypeIcon
              type={att.type}
              className="h-3.5 w-3.5 flex-none text-muted-foreground"
            />
            <span className="max-w-[160px] truncate text-xs text-muted-foreground">
              {att.name}
            </span>
          </div>
        );
      })}
    </div>
  );
});
