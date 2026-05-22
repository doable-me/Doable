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
  html = html.replace(/^#### (.+)$/gm, '<h4 class="chat-h4 bubble-heading">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="chat-h3 bubble-heading">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="chat-h2 bubble-heading">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="chat-h1 bubble-heading">$1</h1>');

  // Unordered lists: lines starting with - or *
  html = html.replace(/^[*-] (.+)$/gm, '<li class="premium-ul-li bubble-item"><div class="ul-bullet"></div><div class="li-content">$1</div></li>');

  // Ordered lists: lines starting with 1. 2. etc.
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="premium-ol-li bubble-item"><div class="ol-number">$1</div><div class="li-content">$2</div></li>');

  // Wrap consecutive <li> runs in <ul>/<ol>
  html = html.replace(
    /((?:<li class="premium-ul-li bubble-item">[\s\S]*?<\/li>\s*)+)/g,
    '<ul class="premium-ul">$1</ul>'
  );
  html = html.replace(
    /((?:<li class="premium-ol-li bubble-item">[\s\S]*?<\/li>\s*)+)/g,
    '<ol class="premium-ol">$1</ol>'
  );

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="chat-hr" />');

  // Collapse excessive newlines (3+ → max 2) before converting to <br>
  html = html.replace(/\n{3,}/g, "\n\n");

  // Line breaks (skip inside <pre> blocks — handled by CSS white-space)
  html = html.replace(/\n/g, "<br />");

  // Clean up: remove <br /> right after block elements
  html = html.replace(/<\/(h[1-4]|li|ul|ol|pre|hr|div)><br \/>/g, "</$1>");
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
      case "report_intent": return "Planning";
      case "create_plan": return "Creating plan";
      case "mark_step_complete": return "Tracking progress";
      default: {
        // MCP tools: strip prefix, humanize the tool name
        if (name.startsWith("mcp_")) {
          const parts = name.slice(4).split("_");
          // Find where server name ends and tool name starts by looking for common tool verbs
          const verbIdx = parts.findIndex(p => ["get", "list", "search", "create", "update", "delete", "query", "manage", "run", "download", "cancel", "save", "new"].includes(p));
          const toolParts = verbIdx > 0 ? parts.slice(verbIdx) : parts;
          const label = toolParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
          return count > 1 ? `${label} (×${count})` : label;
        }
        // Humanize underscore names
        const humanized = name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        return count > 1 ? `${humanized} (×${count})` : humanized;
      }
    }
  };

  const allCounts = Object.entries(counts);

  const writeTools = ["create_file", "edit_file", "install_package", "run_terminal_command"];
  const mcpTools = allCounts.filter(([name]) => name.startsWith("mcp_"));
  const writeEntries = allCounts.filter(([name]) => writeTools.includes(name));
  // Show write tools + MCP tools preferentially; fall back to all tools
  const preferred = [...writeEntries, ...mcpTools];
  const entries = preferred.length > 0 ? preferred : allCounts;

  if (entries.length === 0) return null;

  return (
    <div className="my-2 flex flex-col rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-500/15 border border-brand-500/20">
          <Wrench className="h-3 w-3 text-brand-400" />
        </div>
        <div className="flex-1 min-w-0 flex flex-wrap gap-x-2 gap-y-1 items-center text-[12px] text-muted-foreground/80">
          {entries.map(([name, count], i) => (
            <span key={name} className="flex items-center gap-2">
              <span className="font-medium text-foreground/90">{friendlyName(name, count)}</span>
              {i < entries.length - 1 && <span className="h-1 w-1 rounded-full bg-border/80" />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
