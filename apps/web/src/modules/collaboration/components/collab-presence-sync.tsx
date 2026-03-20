"use client";

import { useEffect } from "react";
import { useCollaboration } from "../collaboration-context";

interface Props {
  activeTab: string;
  selectedFile: string | null;
}

/** Bridge component that syncs editor state to collaboration presence. Renders nothing. */
export function CollabPresenceSync({ activeTab, selectedFile }: Props) {
  const { updateFile, updateView, joined } = useCollaboration();

  useEffect(() => {
    if (!joined) return;
    const viewMap: Record<string, "code" | "preview" | "chat" | "team"> = {
      chat: "chat", code: "code", preview: "preview", team: "team",
      design: "preview", history: "code", files: "code",
    };
    updateView(viewMap[activeTab] ?? "code");
  }, [activeTab, joined, updateView]);

  useEffect(() => {
    if (!joined) return;
    updateFile(selectedFile);
  }, [selectedFile, joined, updateFile]);

  return null;
}
