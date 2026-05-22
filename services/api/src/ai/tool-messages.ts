/**
 * Shared tool message helpers — creator-friendly formatting for tool calls,
 * results, paths, and shell commands. Extracted from routes/chat.ts so they
 * can be reused across call sites.
 */

export function prettyFileName(filePath?: string): string {
  if (!filePath) return "";
  const name = filePath.split("/").pop() ?? filePath;
  // Make component names more readable: "ProductCard.tsx" → "ProductCard"
  return name.replace(/\.(tsx?|jsx?|css|json|md|html)$/, "");
}

/** Describe what part of the project a path relates to */
export function describeFileContext(filePath?: string): string {
  if (!filePath) return "";
  const lower = filePath.toLowerCase();
  if (lower.includes("/pages/") || lower.includes("/app/")) return "page";
  if (lower.includes("/components/ui/")) return "UI element";
  if (lower.includes("/components/")) return "component";
  if (lower.includes("/hooks/")) return "feature";
  if (lower.includes("/lib/") || lower.includes("/utils/")) return "utility";
  if (lower.includes("/styles/") || lower.endsWith(".css")) return "styles";
  if (lower.includes("layout")) return "layout";
  if (lower.includes("config") || lower.includes("vite.config") || lower.includes("tailwind")) return "configuration";
  if (lower.endsWith(".json")) return "configuration";
  if (lower.endsWith(".md")) return "documentation";
  return "file";
}

/** Generate a creator-friendly message for a tool operation (shown in real-time) */
export function friendlyToolMessage(
  toolName: string,
  args?: Record<string, unknown>,
): string {
  const filePath = (args?.path ?? args?.filePath ?? args?.file) as string | undefined;
  const pretty = prettyFileName(filePath);
  const context = describeFileContext(filePath);
  const lower = toolName.toLowerCase();

  // Internal SDK tools — give them human-friendly names
  if (toolName === "report_intent") return "Planning";
  if (toolName === "create_plan") return "Creating plan";
  if (toolName === "mark_step_complete") return "Tracking progress";

  // Shell-ish tools: surface the actual command being run
  if (
    lower.includes("bash") ||
    lower.includes("shell") ||
    lower.includes("cmd") ||
    lower.includes("exec") ||
    lower.includes("run") ||
    lower.includes("terminal") ||
    lower.includes("command")
  ) {
    let cmd: string | undefined;
    const rawCmd = args?.command ?? args?.cmd;
    if (typeof rawCmd === "string" && rawCmd.trim()) {
      cmd = rawCmd.trim();
    } else if (args) {
      for (const value of Object.values(args)) {
        if (typeof value === "string" && value.trim()) {
          cmd = value.trim();
          break;
        }
      }
    }
    if (cmd) {
      cmd = sanitizeCommand(cmd);
      if (cmd.length > 80) cmd = `${cmd.slice(0, 77)}...`;
      return `Running: ${cmd}`;
    }
    return "Running command";
  }

  if (lower.includes("create") || lower.includes("write")) {
    if (pretty) return `Building your ${context} \u2014 ${pretty}`;
    return `Running ${toolName}`;
  }
  if (lower.includes("edit") || lower.includes("update") || lower.includes("patch")) {
    if (pretty) return `Refining ${pretty}`;
    return `Running ${toolName}`;
  }
  if (lower.includes("read")) {
    if (pretty) return `Reviewing ${pretty}`;
    return `Running ${toolName}`;
  }
  if (lower.includes("search")) {
    const pattern = args?.pattern as string | undefined;
    if (pattern) return `Searching for "${pattern}"`;
    return `Running ${toolName}`;
  }
  if (lower.includes("install") || lower.includes("package")) {
    const rawPkgs = args?.packages;
    const pkgs = Array.isArray(rawPkgs) ? rawPkgs : typeof rawPkgs === "string" ? rawPkgs.split(/[\s,]+/).filter(Boolean) : [];
    if (pkgs.length > 0) {
      const names = pkgs.slice(0, 2).join(" & ");
      return `Adding ${names} to your toolkit`;
    }
    return "Adding new capabilities";
  }
  if (lower.includes("delete") || lower.includes("remove")) {
    if (pretty) return `Cleaning up ${pretty}`;
    return `Running ${toolName}`;
  }
  // Presentation tools
  if (lower === "create_presentation") return "Setting up your presentation";
  if (lower === "build_deck") return "Rendering your slide deck";
  // MCP tools: extract the human-readable tool action from the name
  // Format: mcp_<server_parts>_<action_verb>_<action_noun>
  if (lower.startsWith("mcp_")) {
    const parts = toolName.slice(4).split("_");
    const verbIdx = parts.findIndex(p =>
      ["get", "list", "search", "create", "update", "delete", "query",
       "manage", "run", "download", "cancel", "save", "new", "release"].includes(p.toLowerCase())
    );
    if (verbIdx > 0) {
      const serverName = parts.slice(0, verbIdx).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
      const action = parts.slice(verbIdx).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
      return `${action} (${serverName})`;
    }
    // Fallback: just title-case everything after mcp_
    const label = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    return label;
  }
  // Final fallback: show the raw tool name so the user at least sees what's happening
  return `Running ${toolName}`;
}

/**
 * Generate a creator-friendly result message for a completed tool operation.
 * Strips server paths and technical details, keeps it engaging.
 */
export function friendlyToolResult(
  toolName: string,
  result?: unknown,
  success?: unknown,
): string {
  const lower = (toolName ?? "").toLowerCase();
  const ok = success !== false;

  if (!ok) {
    if (lower.includes("build")) return "Build ran into an issue \u2014 working on a fix";
    if (lower.includes("install")) return "Had trouble adding that package";
    return "Hit a snag \u2014 figuring it out";
  }

  if (lower.includes("create") || lower.includes("write")) return "Added to your project";
  if (lower.includes("edit") || lower.includes("update") || lower.includes("patch")) return "Changes applied";
  if (lower.includes("read")) return "Got it";
  if (lower.includes("list")) return "Project mapped out";
  if (lower.includes("search")) return "Search complete";
  if (lower.includes("install") || lower.includes("package")) return "Ready to use";
  if (lower.includes("build")) return "Build complete";
  if (lower.includes("delete") || lower.includes("remove")) return "Cleaned up";
  if (lower.includes("deploy")) return "Live and ready";

  return ok ? "Done" : "Issue encountered";
}

/**
 * Strip absolute server paths and humanize technical jargon
 * so the chat feels natural for creators, producers, and designers.
 *
 * Runs on every text token streamed to the frontend — must be fast.
 */

// Pre-compiled patterns for jargon replacement (word-boundary safe).
// Order matters: longer/more-specific phrases first to avoid partial matches.
const JARGON_MAP: Array<[RegExp, string]> = [
  // ── Database / SQL ───────────────────────────────────────
  [/\bSQL\s+migration(?:s)?\b/gi, "database update"],
  [/\bSQL\s+schema\b/gi, "data structure"],
  [/\bSQL\s+quer(?:y|ies)\b/gi, "data request"],
  [/\bSQL\s+table(?:s)?\b/gi, "data table"],
  [/\bSQL\s+column(?:s)?\b/gi, "data field"],
  [/\brun(?:ning)?\s+(?:the\s+)?migration(?:s)?\b/gi, "updating the database"],
  [/\bmigration\s+file(?:s)?\b/gi, "database update"],
  [/\bschema\s+migration(?:s)?\b/gi, "database update"],
  [/\bRow[- ]Level\s+Security\b/gi, "data protection rules"],
  [/\bRLS\s+polic(?:y|ies)\b/gi, "data protection rules"],
  [/\bforeign\s+keys\b/gi, "data links"],
  [/\bforeign\s+key\b/gi, "data link"],
  [/\bprimary\s+key\b/gi, "unique identifier"],
  [/\bPostgreSQL\s+database\b/gi, "database"],
  [/\bPostgres\s+database\b/gi, "database"],
  [/\bPostgreSQL\b/gi, "database"],
  [/\bPostgres\b/gi, "database"],
  [/\bSQL\b/g, "database"],
  [/\bCRUD\b/g, "create, read, update, delete"],

  // ── Build & tooling ─────────────────────────────────────
  [/\bVite\s+build\b/gi, "app build"],
  [/\bVite\s+dev\s+server\b/gi, "live preview server"],
  [/\bnpx\s+vite\b/gi, "build tool"],
  [/\bnode_modules\b/g, "dependencies"],
  [/\bpackage\.json\b/g, "project configuration"],
  [/\btsconfig\.json\b/g, "project settings"],
  [/\btailwind\.config\b/g, "style settings"],
  [/\bvite\.config\b/g, "build settings"],
  [/\bdevDependenc(?:y|ies)\b/gi, "development tools"],
  [/\b(?:run\s+)?npm\s+install\b/gi, "install packages"],
  [/\b(?:run\s+)?pnpm\s+add\b/gi, "install packages"],
  [/\b(?:run\s+)?yarn\s+add\b/gi, "install packages"],

  // ── Auth / security jargon ──────────────────────────────
  [/\bJWT\s+token(?:s)?\b/gi, "login session"],
  [/\bJWT\b/g, "authentication"],
  [/\bOAuth\s+2\.0\b/gi, "secure sign-in"],
  [/\bOAuth\b/gi, "secure sign-in"],
  [/\bBearer\s+token\b/gi, "access token"],
  [/\bCORS\s+(?:policy|config(?:uration)?|headers?)\b/gi, "security settings"],
  [/\bCORS\b/g, "cross-origin security"],
  [/\bmiddleware\b/gi, "security layer"],

  // ── API / networking ────────────────────────────────────
  [/\bAPI\s+endpoints\b/gi, "connection points"],
  [/\bAPI\s+endpoint\b/gi, "connection point"],
  [/\bREST\s+API\b/gi, "web service"],
  [/\bGraphQL\b/gi, "data query layer"],
  [/\bedge\s+functions\b/gi, "server functions"],
  [/\bedge\s+function\b/gi, "server function"],
  [/\bserverless\s+functions\b/gi, "server functions"],
  [/\bserverless\s+function\b/gi, "server function"],
  [/\bwebhooks\b/gi, "automated notifications"],
  [/\bwebhook\b/gi, "automated notification"],

  // ── Code structure (use lookaround for dotted extensions) ─
  [/\.tsx\s+files\b/gi, "components"],
  [/\.tsx\s+file\b/gi, "component"],
  [/\.ts\s+files\b/gi, "modules"],
  [/\.ts\s+file\b/gi, "module"],
  [/\.css\s+files\b/gi, "stylesheets"],
  [/\.css\s+file\b/gi, "stylesheet"],
  [/\.jsx\s+files\b/gi, "components"],
  [/\.jsx\s+file\b/gi, "component"],
];

/** Strip server-side absolute paths from text, leaving only relative project paths */
const SERVER_PATH_RE = /(?:[A-Za-z]:)?(?:[\\/][^\s:,)"'`]+)?[\\/]projects[\\/][a-f0-9-]+[\\/]/gi;
export function stripServerPaths(text: string): string {
  let result = text;
  // 1. Full project paths: /path/to/projects/<uuid>/ → (empty, leaves relative)
  result = result.replace(SERVER_PATH_RE, "");
  // 2. Common server install dirs: /<any-path>/doable/
  result = result.replace(/(?:\/[\w.-]+)+\/doable\//g, "");
  // 3. Bare project dir reference without trailing file: /<any-path>/doable/projects/<uuid>
  result = result.replace(/(?:\/[\w.-]+)+\/doable\/projects\/[a-f0-9-]+/g, ".");
  return result;
}

/**
 * Sanitize a shell command for display to end users.
 * Strips server paths, internal tool details, and makes commands user-friendly.
 */
export function sanitizeCommand(cmd: string): string {
  let result = stripServerPaths(cmd);

  // Replace MCP tool invocations with friendly descriptions
  // "npx mcp-supabase execute-sql ..." → "Setting up database..."
  if (/\bnpx\s+mcp-supabase\s+execute-sql\b/.test(result)) {
    const sqlMatch = result.match(/(?:CREATE\s+TABLE|ALTER\s+TABLE|INSERT|UPDATE|DELETE|SELECT|DROP|CREATE\s+INDEX)/i);
    if (sqlMatch) {
      const op = sqlMatch[0].toLowerCase();
      if (op.startsWith("create")) return "Setting up database table";
      if (op.startsWith("alter")) return "Updating database schema";
      if (op.startsWith("insert")) return "Adding data to database";
      if (op.startsWith("select")) return "Querying database";
      if (op.startsWith("drop")) return "Removing database table";
      return "Running database operation";
    }
    return "Running database operation";
  }
  // Other MCP tools and npx @scoped/... invocations — strip the prefix
  result = result.replace(/\bnpx\s+mcp-\S+\s+/g, "");
  result = result.replace(/\bnpx\s+@\S+\s+/g, "");

  // Replace `find / ...` with friendly description
  const findMatch = result.match(/\bfind\s+\/(?:\S+\s)?.*-name\s+["']?([^"'\s]+)/);
  if (findMatch) {
    return `Searching for ${findMatch[1]}`;
  }
  result = result.replace(/\bfind\s+\/(?:\S+\s)?/g, "find . ");

  // Strip shell noise: 2>/dev/null, 2>&1, | head -N, | tail -N
  result = result.replace(/\s*2>\/dev\/null/g, "");
  result = result.replace(/\s*2>&1/g, "");
  result = result.replace(/\s*\|\s*(?:head|tail)\s+-\d+/g, "");

  // Clean up leftover whitespace
  result = result.replace(/\s{2,}/g, " ").trim();

  return result;
}

export function sanitizeText(text: string): string {
  if (!text) return text;

  let result = text;

  // 0. Strip leftover thinking/reasoning markers from all known model families
  //    <think>, </think> — DeepSeek-R1, Qwen3, Llama 3.x
  //    <|channel>thought, <channel>, <|channel|> — Gemma 4
  //    <rationale>, </rationale> — Claude (when prompted)
  //    <answer>, </answer> — DeepSeek (post-thinking answer marker)
  result = result.replace(/<\/?think>/gi, "");
  result = result.replace(/<\|?channel\|?>(?:thought)?/gi, "");
  result = result.replace(/<\/?rationale>/gi, "");
  result = result.replace(/<\/?answer>/gi, "");

  // 1. Strip absolute server paths
  result = stripServerPaths(result);

  // 2. Humanize technical jargon
  for (const [pattern, replacement] of JARGON_MAP) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * Transform the raw `tool_calls` array accumulated during a chat turn into
 * the `tool_actions` shape the editor UI expects when it rehydrates chat
 * history on reload.
 */
export function buildToolActionsFromCalls(
  toolCalls: Array<{ name?: string; arguments?: Record<string, unknown> | undefined }>,
  assistantMessageId: string,
): Array<Record<string, unknown>> {
  return toolCalls.map((tc, i) => {
    const toolName = tc.name ?? "unknown";
    const args = tc.arguments ?? {};
    const filePath =
      (args.path as string | undefined) ??
      (args.filePath as string | undefined) ??
      (args.file as string | undefined);
    const shortName = filePath ? filePath.split(/[\\/]/).pop() ?? "" : "";
    const lower = toolName.toLowerCase();

    let description = toolName;
    if (
      lower.includes("bash") || lower.includes("shell") || lower.includes("powershell") ||
      lower.includes("cmd") || lower.includes("exec") || lower.includes("run_command") ||
      lower.includes("terminal")
    ) {
      const rawCmd = args.command ?? args.cmd ?? args.input;
      let cmd = typeof rawCmd === "string" ? rawCmd.trim() : "";
      if (cmd) {
        if (cmd.length > 80) cmd = cmd.slice(0, 77) + "\u2026";
        description = `$ ${cmd}`;
      } else {
        description = "Running command";
      }
    } else if (lower.includes("create") || lower.includes("write")) {
      description = shortName ? `Creating ${shortName}` : "Creating file";
    } else if (lower.includes("edit") || lower.includes("update") || lower.includes("patch")) {
      description = shortName ? `Updating ${shortName}` : "Updating file";
    } else if (lower.includes("delete") || lower.includes("remove")) {
      description = shortName ? `Removing ${shortName}` : "Removing file";
    } else if (lower.includes("rename")) {
      description = shortName ? `Renaming ${shortName}` : "Renaming file";
    } else if (lower.includes("read")) {
      description = shortName ? `Reading ${shortName}` : "Reading file";
    } else if (lower.includes("list") || lower.includes("glob")) {
      description = "Scanning project structure";
    } else if (lower.includes("install") || lower.includes("package")) {
      const pkgs = args.packages ?? args.name ?? "";
      if (typeof pkgs === "string" && pkgs) {
        const first = pkgs.split(/\s+/)[0] ?? pkgs;
        description = `Installing ${first}`;
      } else {
        description = "Installing packages";
      }
    } else if (lower.includes("deploy")) {
      description = "Deploying preview";
    } else {
      description = toolName.replace(/[_-]/g, " ").trim() || "Tool action";
    }

    return {
      id: `hist-${assistantMessageId}-${i}`,
      toolName,
      description,
      isExpanded: false,
      isBookmarked: false,
      filePath,
      status: "completed" as const,
    };
  });
}
