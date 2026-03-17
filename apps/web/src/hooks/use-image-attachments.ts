import { useState, useCallback, useRef } from "react";

export interface ImageAttachment {
  type: string;
  data: string; // base64 data URL
  name: string;
}

const MAX_IMAGES = 3;
const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.7;

function resizeImage(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
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
        resolve({ type: "image/jpeg", data, name: file.name });
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function useImageAttachments() {
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canAddMore = attachments.length < MAX_IMAGES;

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const remaining = MAX_IMAGES - attachments.length;
      const toProcess = Array.from(files).slice(0, remaining);

      try {
        const results = await Promise.all(toProcess.map(resizeImage));
        setAttachments((prev) => [...prev, ...results].slice(0, MAX_IMAGES));
      } catch (err) {
        console.error("Failed to process images:", err);
      }

      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [attachments.length],
  );

  const removeImage = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAll = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    openFilePicker,
    removeImage,
    clearAll,
    fileInputRef,
    handleFileChange,
    canAddMore,
  };
}
