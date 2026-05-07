"use client";

import { useState, useCallback, useRef } from "react";

export interface Attachment {
  id: string;
  type: "image" | "text" | "pdf" | "code" | "document";
  mimeType: string;
  name: string;
  size: number;
  data: string; // base64 data URL for images/PDFs/documents, raw text content for text/code
  preview?: string; // thumbnail data URL for images, first ~200 chars for text/code
}

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_SIZE = 100 * 1024; // 100KB
const MAX_IMAGE_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp",
]);
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml", ".log", ".env",
]);
const CODE_EXTENSIONS = new Set([
  ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".cpp", ".h",
  ".go", ".rs", ".rb", ".php", ".html", ".css", ".scss", ".sql", ".sh", ".bat",
]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const DOCUMENT_EXTENSIONS = new Set([".doc", ".docx", ".xls", ".xlsx", ".csv", ".ppt", ".pptx"]);

const IMAGE_MIMES = "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/bmp";
const TEXT_MIMES = "text/plain,text/markdown,application/json,text/csv,text/xml,application/x-yaml,text/yaml";
const CODE_MIMES = "text/javascript,text/typescript,text/x-python,text/x-java,text/x-c,text/x-c++,text/html,text/css";
const PDF_MIMES = "application/pdf";
const DOCUMENT_MIMES = "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const ACCEPTED_FILE_TYPES = [IMAGE_MIMES, TEXT_MIMES, CODE_MIMES, PDF_MIMES, DOCUMENT_MIMES].join(",");

// Also accept by extension for browsers that don't recognize some MIME types
export const ACCEPTED_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  ...CODE_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
].join(",");

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function classifyFile(name: string, mimeType: string): Attachment["type"] | null {
  const ext = getFileExtension(name);

  if (IMAGE_EXTENSIONS.has(ext) || mimeType.startsWith("image/")) return "image";
  if (PDF_EXTENSIONS.has(ext) || mimeType === "application/pdf") return "pdf";
  if (DOCUMENT_EXTENSIONS.has(ext) || isDocumentMime(mimeType)) return "document";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith("text/")) return "text";

  return null;
}

function isDocumentMime(mime: string): boolean {
  return mime === "application/msword" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

function generateId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function resizeImage(file: File): Promise<{ data: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Resize if needed
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Full-size canvas
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const data = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

        // Thumbnail for preview (48x48)
        const thumbSize = 96; // 2x for retina
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = thumbSize;
        thumbCanvas.height = thumbSize;
        const tctx = thumbCanvas.getContext("2d");
        if (tctx) {
          // Center-crop
          const scale = Math.max(thumbSize / width, thumbSize / height);
          const sw = thumbSize / scale;
          const sh = thumbSize / scale;
          const sx = (width - sw) / 2;
          const sy = (height - sh) / 2;
          tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, thumbSize, thumbSize);
        }
        const preview = thumbCanvas.toDataURL("image/jpeg", 0.6);

        resolve({ data, preview });
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function processFile(file: File): Promise<Attachment | null> {
  if (file.size > MAX_FILE_SIZE) {
    console.warn(`File "${file.name}" exceeds 10MB limit, skipping.`);
    return null;
  }

  const fileType = classifyFile(file.name, file.type);
  if (!fileType) {
    console.warn(`Unsupported file type: "${file.name}" (${file.type}), skipping.`);
    return null;
  }

  const base: Pick<Attachment, "id" | "name" | "size" | "mimeType"> = {
    id: generateId(),
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };

  switch (fileType) {
    case "image": {
      const { data, preview } = await resizeImage(file);
      return { ...base, type: "image", data, preview };
    }
    case "text":
    case "code": {
      let text = await readAsText(file);
      if (text.length > MAX_TEXT_SIZE) {
        text = text.slice(0, MAX_TEXT_SIZE) + "\n... (truncated at 100KB)";
      }
      const preview = text.slice(0, 200);
      return { ...base, type: fileType, data: text, preview };
    }
    case "pdf": {
      const data = await readAsDataURL(file);
      return { ...base, type: "pdf", mimeType: "application/pdf", data };
    }
    case "document": {
      const data = await readAsDataURL(file);
      return { ...base, type: "document", data };
    }
    default:
      return null;
  }
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const remaining = MAX_ATTACHMENTS - attachments.length;
      if (remaining <= 0) return;

      const toProcess = Array.from(files).slice(0, remaining);

      try {
        const results = await Promise.all(toProcess.map(processFile));
        const valid = results.filter(Boolean) as Attachment[];
        if (valid.length > 0) {
          setAttachments((prev) => [...prev, ...valid].slice(0, MAX_ATTACHMENTS));
        }
      } catch (err) {
        console.error("Failed to process files:", err);
      }
    },
    [attachments.length],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      await addFiles(files);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [addFiles],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        await addFiles(files);
      }
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        await addFiles(imageFiles);
      }
    },
    [addFiles],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    fileInputRef,
    openFilePicker,
    handleFileChange,
    handleDrop,
    handlePaste,
    removeAttachment,
    clearAll,
  };
}
