"use client";

import { useCallback, useState } from "react";
import { Copy, Check, Wrench } from "lucide-react";

// ─── Simple Markdown Renderer ───────────────────────────────
export function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (must be before line-level rules)
  html = html.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang, code) =>
      `<pre class="code-block ${lang ?? ""}" data-lang="${lang ?? ""}"><code>${code.trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="inline-code">$1</code>'
  );

  // Bold (before italic so **bold** isn't caught by *italic*)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headings (# to ####) — must be at start of line
  html = html.replace(/^#### (.+)$/gm, '<h4 class="chat-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="chat-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="chat-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="chat-h1">$1</h1>');

  // Unordered lists: lines starting with - or *
  html = html.replace(/^[*-] (.+)$/gm, '<li class="chat-li">$1</li>');

  // Ordered lists: lines starting with 1. 2. etc.
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="chat-li-ol">$1</li>');

  // Wrap consecutive <li> runs in <ul>/<ol>
  html = html.replace(
    /((?:<li class="chat-li">[\s\S]*?<\/li>\s*)+)/g,
    '<ul class="chat-ul">$1</ul>'
  );
  html = html.replace(
    /((?:<li class="chat-li-ol">[\s\S]*?<\/li>\s*)+)/g,
    '<ol class="chat-ol">$1</ol>'
  );

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="chat-hr" />');

  // Collapse excessive newlines (3+ → max 2) before converting to <br>
  html = html.replace(/\n{3,}/g, "\n\n");

  // Line breaks (skip inside <pre> blocks — handled by CSS white-space)
  html = html.replace(/\n/g, "<br />");

  // Clean up: remove <br /> right after block elements
  html = html.replace(/<\/(h[1-4]|li|ul|ol|pre|hr)><br \/>/g, "</$1>");
  html = html.replace(/<hr class="chat-hr" \/><br \/>/g, '<hr class="chat-hr" />');

  return html;
}

// ─── Code Block with Copy ───────────────────────────────────
export function CodeBlockCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      title="Copy code"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ─── Tool Activity Summary (shown for history messages) ─────
export function ToolActivitySummary({ toolCalls }: { toolCalls: Array<{ name: string; arguments?: unknown }> }) {
  const counts: Record<string, number> = {};
  for (const tc of toolCalls) {
    const name = tc.name ?? "unknown";
    counts[name] = (counts[name] ?? 0) + 1;
  }

  const friendlyName = (name: string, count: number): string => {
    switch (name) {
      case "create_file": return `Created ${count} file${count > 1 ? "s" : ""}`;
      case "edit_file": return `Edited ${count} file${count > 1 ? "s" : ""}`;
      case "read_file": return `Read ${count} file${count > 1 ? "s" : ""}`;
      case "list_files": return "Explored project structure";
      case "install_package": return `Installed ${count} package${count > 1 ? "s" : ""}`;
      case "search_files": return `Searched ${count} time${count > 1 ? "s" : ""}`;
      case "run_terminal_command": return `Ran ${count} command${count > 1 ? "s" : ""}`;
      default: return `${name} (${count})`;
    }
  };

  const writeTools = ["create_file", "edit_file", "install_package", "run_terminal_command"];
  const writeEntries = Object.entries(counts).filter(([name]) => writeTools.includes(name));
  const entries = writeEntries.length > 0 ? writeEntries : Object.entries(counts);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Wrench className="h-3 w-3 text-blue-400" />
      {entries.map(([name, count], i) => (
        <span key={name}>
          {friendlyName(name, count)}
          {i < entries.length - 1 ? " · " : ""}
        </span>
      ))}
    </div>
  );
}
