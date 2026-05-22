"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Paperclip, Square, Plus, ArrowUp, ChevronDown, Sparkles, FileIcon, FolderIcon, X } from "lucide-react";
import { ModeToggle } from "./mode-toggle";
import { useAttachments, ACCEPTED_EXTENSIONS, type Attachment } from "@/hooks/use-attachments";
import { AttachmentPreviewStrip } from "./attachment-preview";
import type { FileNode } from "../hooks/use-editor-store";

const PLACEHOLDER_SUGGESTIONS = [
  "Build a SaaS landing page with pricing...",
  "Create a task management dashboard...",
  "Design an e-commerce product page...",
  "Make a portfolio website with animations...",
  "Build a blog platform with markdown...",
  "Create a recipe sharing app...",
  "Design a fitness tracking dashboard...",
  "Build a social media feed layout...",
  "Create a weather app with API integration...",
  "Make a chat application with real-time messaging...",
];

function useRotatingPlaceholder(): string {
  const [index, setIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const target = PLACEHOLDER_SUGGESTIONS[index]!;
    let charIndex = 0;
    let timeout: ReturnType<typeof setTimeout>;

    if (isTyping) {
      // Typing animation
      const typeChar = () => {
        if (charIndex <= target.length) {
          setDisplayText(target.slice(0, charIndex));
          charIndex++;
          timeout = setTimeout(typeChar, 30 + Math.random() * 20);
        } else {
          // Hold for a moment then start erasing
          timeout = setTimeout(() => setIsTyping(false), 2500);
        }
      };
      typeChar();
    } else {
      // Erasing animation
      let eraseIndex = displayText.length;
      const eraseChar = () => {
        if (eraseIndex > 0) {
          eraseIndex--;
          setDisplayText(target.slice(0, eraseIndex));
          timeout = setTimeout(eraseChar, 15);
        } else {
          // Move to next suggestion
          setIndex((prev) => (prev + 1) % PLACEHOLDER_SUGGESTIONS.length);
          setIsTyping(true);
        }
      };
      eraseChar();
    }

    return () => clearTimeout(timeout);
  }, [index, isTyping]);

  return displayText || "Describe what you want to build...";
}

interface ChatInputProps {
  onSend: (content: string, attachments?: Attachment[], projectFiles?: string[]) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  fileTree?: FileNode[];
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  fileTree,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [selectedProjectFiles, setSelectedProjectFiles] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const filePickerRef = useRef<HTMLDivElement>(null);
  const placeholder = useRotatingPlaceholder();

  const {
    attachments,
    fileInputRef,
    openFilePicker,
    handleFileChange,
    handleDrop: onDrop,
    handlePaste: onPaste,
    removeAttachment,
    clearAll,
  } = useAttachments();

  const hasContent = value.trim().length > 0 || attachments.length > 0 || selectedProjectFiles.length > 0;

  // Close file picker when clicking outside
  useEffect(() => {
    if (!showFilePicker) return;
    const handleClick = (e: MouseEvent) => {
      if (filePickerRef.current && !filePickerRef.current.contains(e.target as Node)) {
        setShowFilePicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showFilePicker]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0 && selectedProjectFiles.length === 0) || disabled) return;
    onSend(
      trimmed || "(attachments)",
      attachments.length > 0 ? attachments : undefined,
      selectedProjectFiles.length > 0 ? selectedProjectFiles : undefined,
    );
    setValue("");
    clearAll();
    setSelectedProjectFiles([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachments, selectedProjectFiles, disabled, onSend, clearAll]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) return;
        handleSend();
      }
    },
    [isStreaming, handleSend]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(false);
      onDrop(e);
    },
    [onDrop]
  );

  return (
    <div className="pt-2 pb-4 px-4 bg-gradient-to-t from-background via-background to-transparent shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        className={`relative flex flex-col rounded-2xl border shadow-[0_0_20px_rgba(0,0,0,0.05)] backdrop-blur-xl transition-all duration-300 ease-out bg-muted/20 ${
          isDragging
            ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-400 scale-[1.01]"
            : "border-border/80 hover:border-border"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <AttachmentPreviewStrip
          attachments={attachments}
          onRemove={removeAttachment}
        />

        {/* Selected project files strip */}
        {selectedProjectFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2">
            {selectedProjectFiles.map((filePath) => (
              <div
                key={filePath}
                className="flex items-center gap-1 rounded-md bg-brand-500/10 border border-brand-500/20 px-2 py-1 text-[11px] text-brand-400"
              >
                <FileIcon className="h-3 w-3" />
                <span className="max-w-[150px] truncate">{filePath.split("/").pop()}</span>
                <button
                  onClick={() => setSelectedProjectFiles((prev) => prev.filter((p) => p !== filePath))}
                  className="ml-0.5 rounded-full hover:bg-brand-500/20 p-0.5"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={onPaste}
          placeholder={value ? "" : placeholder}
          disabled={disabled}
          rows={1}
          className="w-full max-h-[40vh] min-h-[48px] resize-none bg-transparent px-4 py-3.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
        />

        <div className="flex items-center justify-between px-2 pb-2 mt-1">
          {/* Left side: Attach + Project Files + ModeToggle */}
          <div className="flex items-center gap-2">
             <button
               onClick={openFilePicker}
               className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 border border-white/5"
               title="Upload files from your device"
             >
               <Plus className="h-4 w-4" />
               {attachments.length > 0 && (
                 <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-medium text-white shadow-sm">
                   {attachments.length}
                 </span>
               )}
             </button>

             {/* Project file attach button */}
             {fileTree && fileTree.length > 0 && (
               <div className="relative" ref={filePickerRef}>
                 <button
                   onClick={() => setShowFilePicker(!showFilePicker)}
                   className="relative flex h-8 items-center gap-1 rounded-full bg-white/5 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 border border-white/5 px-2"
                   title="Attach project files"
                 >
                   <FileIcon className="h-3.5 w-3.5" />
                   <span className="text-[10px] font-medium">Files</span>
                   {selectedProjectFiles.length > 0 && (
                     <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-medium text-white shadow-sm">
                       {selectedProjectFiles.length}
                     </span>
                   )}
                 </button>

                 {/* File picker dropdown */}
                 {showFilePicker && (
                   <ProjectFilePicker
                     fileTree={fileTree}
                     selected={selectedProjectFiles}
                     onToggle={(path) => {
                       setSelectedProjectFiles((prev) =>
                         prev.includes(path)
                           ? prev.filter((p) => p !== path)
                           : prev.length < 10 ? [...prev, path] : prev
                       );
                     }}
                     onClose={() => setShowFilePicker(false)}
                   />
                 )}
               </div>
             )}
             
             <ModeToggle />
          </div>

          {/* Right side: Send / Stop */}
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex h-8 items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-3 text-red-500 hover:bg-red-500/20 transition-colors"
                title="Stop generating"
              >
                <Square className="h-3 w-3 fill-current" />
                <span className="text-[11px] font-medium">Stop</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!hasContent || disabled}
                className="group flex h-8 items-center gap-1.5 rounded-full bg-brand-500 border border-brand-500/20 px-3 text-white shadow-sm hover:bg-brand-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Send message"
              >
                <span className="text-[11px] font-medium tracking-wide">Send</span>
                <ArrowUp className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-2 text-center text-[10px] text-muted-foreground/40 font-medium tracking-wide">
        Shift + Enter for new line
      </div>
    </div>
  );
}

// ─── Project File Picker ─────────────────────────────────────

function ProjectFilePicker({
  fileTree,
  selected,
  onToggle,
  onClose,
}: {
  fileTree: FileNode[];
  selected: string[];
  onToggle: (path: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Flatten files for search
  const allFiles: { name: string; path: string }[] = [];
  function collectFiles(nodes: FileNode[], prefix = "") {
    for (const node of nodes) {
      if (node.type === "file") {
        allFiles.push({ name: node.name, path: node.path });
      } else if (node.children) {
        collectFiles(node.children, node.path);
      }
    }
  }
  collectFiles(fileTree);

  const filtered = search.trim()
    ? allFiles.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl z-50 flex flex-col">
      {/* Search */}
      <div className="p-2 border-b border-border">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search project files..."
          className="w-full rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
          autoFocus
        />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-1.5 text-xs">
        {filtered ? (
          // Search results (flat list)
          filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No files found</p>
          ) : (
            filtered.map((f) => (
              <FilePickerItem
                key={f.path}
                path={f.path}
                name={f.name}
                isSelected={selected.includes(f.path)}
                onToggle={onToggle}
              />
            ))
          )
        ) : (
          // Tree view
          fileTree.map((node) => (
            <FilePickerNode
              key={node.path}
              node={node}
              selected={selected}
              expanded={expanded}
              onToggle={onToggle}
              onExpand={(path) => setExpanded((prev) => {
                const next = new Set(prev);
                next.has(path) ? next.delete(path) : next.add(path);
                return next;
              })}
              depth={0}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-2.5 py-1.5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {selected.length}/10 files selected
        </span>
        <button
          onClick={onClose}
          className="text-[10px] text-brand-400 hover:text-brand-300 font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function FilePickerNode({
  node,
  selected,
  expanded,
  onToggle,
  onExpand,
  depth,
}: {
  node: FileNode;
  selected: string[];
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onExpand: (path: string) => void;
  depth: number;
}) {
  const isExpanded = expanded.has(node.path);

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => onExpand(node.path)}
          className="flex items-center gap-1.5 w-full rounded px-1.5 py-1 hover:bg-muted/50 text-left"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          <FolderIcon className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground truncate">{node.name}</span>
          <ChevronDown className={`h-2.5 w-2.5 text-muted-foreground/50 ml-auto transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
        </button>
        {isExpanded && node.children?.map((child) => (
          <FilePickerNode
            key={child.path}
            node={child}
            selected={selected}
            expanded={expanded}
            onToggle={onToggle}
            onExpand={onExpand}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  return (
    <FilePickerItem
      path={node.path}
      name={node.name}
      isSelected={selected.includes(node.path)}
      onToggle={onToggle}
      depth={depth}
    />
  );
}

function FilePickerItem({
  path,
  name,
  isSelected,
  onToggle,
  depth = 0,
}: {
  path: string;
  name: string;
  isSelected: boolean;
  onToggle: (path: string) => void;
  depth?: number;
}) {
  return (
    <button
      onClick={() => onToggle(path)}
      className={`flex items-center gap-1.5 w-full rounded px-1.5 py-1 text-left transition-colors ${
        isSelected
          ? "bg-brand-500/10 text-brand-400"
          : "hover:bg-muted/50 text-foreground"
      }`}
      style={{ paddingLeft: `${depth * 12 + 6}px` }}
    >
      <FileIcon className="h-3 w-3 shrink-0" />
      <span className="truncate flex-1">{name}</span>
      {isSelected && (
        <span className="text-[9px] font-bold text-brand-400">✓</span>
      )}
    </button>
  );
}
