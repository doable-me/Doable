"use client";

import { useCallback, useRef } from "react";
import { useEditorStore } from "./use-editor-store";

export function usePreview(projectId: string | null) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const { previewUrl, previewLoading, setPreviewUrl, setPreviewLoading } =
    useEditorStore();

  const baseUrl = projectId
    ? `${process.env.NEXT_PUBLIC_PREVIEW_URL ?? "http://localhost:3100"}/${projectId}`
    : "";

  const refresh = useCallback(() => {
    if (!iframeRef.current || !baseUrl) return;
    setPreviewLoading(true);
    iframeRef.current.src = `${baseUrl}?t=${Date.now()}`;
  }, [baseUrl, setPreviewLoading]);

  const navigate = useCallback(
    (path: string) => {
      const url = `${baseUrl}${path}`;
      setPreviewUrl(url);
      if (iframeRef.current) {
        setPreviewLoading(true);
        iframeRef.current.src = url;
      }
    },
    [baseUrl, setPreviewUrl, setPreviewLoading]
  );

  const onLoad = useCallback(() => {
    setPreviewLoading(false);
    try {
      const currentUrl = iframeRef.current?.contentWindow?.location.href;
      if (currentUrl) setPreviewUrl(currentUrl);
    } catch {
      // Cross-origin, ignore
    }
  }, [setPreviewLoading, setPreviewUrl]);

  const openExternal = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
    } else if (baseUrl) {
      window.open(baseUrl, "_blank");
    }
  }, [previewUrl, baseUrl]);

  return {
    iframeRef,
    previewUrl: previewUrl || baseUrl,
    previewLoading,
    refresh,
    navigate,
    onLoad,
    openExternal,
  };
}
