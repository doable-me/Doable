"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useEditorStore } from "@/modules/editor/hooks/use-editor-store";
import { EditorLayout } from "@/modules/editor/components/editor-layout";
import { EditorToolbar } from "@/modules/editor/toolbar/editor-toolbar";
import { EditorSidebar } from "@/modules/editor/sidebar/editor-sidebar";
import { ChatPanel } from "@/modules/editor/chat/chat-panel";
import { CodeEditorPanel } from "@/modules/editor/code-editor/code-editor-panel";
import { PreviewPanel } from "@/modules/editor/preview/preview-panel";

export default function EditorPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const setProjectId = useEditorStore((s) => s.setProjectId);
  const viewMode = useEditorStore((s) => s.viewMode);

  useEffect(() => {
    if (projectId) {
      setProjectId(projectId);
    }
  }, [projectId, setProjectId]);

  return (
    <EditorLayout
      toolbar={<EditorToolbar />}
      sidebar={<EditorSidebar />}
      center={
        <div className="flex h-full w-full">
          {/* Chat panel */}
          <div className="flex h-full w-[380px] flex-none flex-col border-r border-border">
            <ChatPanel />
          </div>

          {/* Code editor */}
          <div className="flex-1 min-w-0">
            <CodeEditorPanel />
          </div>
        </div>
      }
      preview={<PreviewPanel />}
    />
  );
}
