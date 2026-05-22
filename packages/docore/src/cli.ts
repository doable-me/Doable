/**
 * docore CLI
 *
 * Interactive console app that demonstrates the full DoCoreEngine event system.
 * Run with: npx tsx src/cli.ts
 */

import * as readline from "node:readline";
import { DoCoreEngine } from "./engine.js";
import type { DoCoreEvent } from "./events.js";

// ============================================================================
// ANSI helpers
// ============================================================================

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function log(color: string, prefix: string, msg: string) {
  process.stderr.write(`${color}${prefix}${c.reset} ${msg}\n`);
}

// ============================================================================
// Human readable event renderer
// ============================================================================

function renderEvent(e: DoCoreEvent): void {
  switch (e.kind) {
    // -- Session lifecycle ----------------------------------------------------
    case "engine.connecting":
      log(c.gray, "[engine]", "Connecting to Copilot CLI...");
      break;
    case "engine.ready":
      log(c.green, "[engine]", "Ready.");
      break;
    case "engine.disconnected":
      log(c.gray, "[engine]", `Disconnected${e.reason ? `: ${e.reason}` : ""}`);
      break;

    case "session.start":
      log(c.green, "[session]", `Started session ${e.sessionId}${e.model ? ` (model: ${e.model})` : ""}`);
      if (e.cwd) log(c.dim, "         ", `cwd: ${e.cwd}`);
      if (e.repository) log(c.dim, "         ", `repo: ${e.repository} branch: ${e.branch ?? "n/a"}`);
      break;
    case "session.resume":
      log(c.green, "[session]", `Resumed (${e.eventCount} events, model: ${e.model ?? "default"})`);
      break;
    case "session.idle":
      log(c.green, "[idle]", e.aborted ? "Session idle (aborted)" : "Session idle");
      break;
    case "session.error":
      log(c.red, "[error]", `${e.errorType}: ${e.message}`);
      break;
    case "session.shutdown":
      log(c.yellow, "[shutdown]", `${e.shutdownType} | requests: ${e.totalPremiumRequests} | +${e.linesAdded}/-${e.linesRemoved} lines`);
      break;
    case "session.info":
      log(c.cyan, "[info]", `${e.infoType}: ${e.message}`);
      break;
    case "session.warning":
      log(c.yellow, "[warn]", `${e.warningType}: ${e.message}`);
      break;
    case "session.title_changed":
      log(c.cyan, "[title]", e.title);
      break;
    case "session.model_change":
      log(c.cyan, "[model]", `${e.previousModel ?? "none"} -> ${e.newModel}`);
      break;
    case "session.mode_changed":
      log(c.cyan, "[mode]", `${e.previousMode} -> ${e.newMode}`);
      break;
    case "session.task_complete":
      log(c.green, "[done]", e.summary ?? "(task complete)");
      break;

    // -- Context window -------------------------------------------------------
    case "session.usage_info":
      log(c.dim, "[tokens]", `${e.currentTokens}/${e.tokenLimit} (${e.messagesLength} msgs)`);
      break;
    case "session.compaction_start":
      log(c.yellow, "[compact]", "Compaction starting...");
      break;
    case "session.compaction_complete":
      log(c.yellow, "[compact]", e.success
        ? `Done. Removed ${e.tokensRemoved ?? 0} tokens`
        : `Failed: ${e.error}`);
      break;
    case "session.truncation":
      log(c.yellow, "[truncate]", `Removed ${e.tokensRemovedDuringTruncation} tokens, ${e.messagesRemovedDuringTruncation} messages`);
      break;

    // -- User messages --------------------------------------------------------
    case "user.message":
      // Don't re-print what the user typed
      break;

    // -- Assistant streaming ---------------------------------------------------
    case "assistant.turn_start":
      log(c.blue, "[turn]", `Turn ${e.turnId} started`);
      break;
    case "assistant.turn_end":
      log(c.blue, "[turn]", `Turn ${e.turnId} ended`);
      break;
    case "assistant.message_delta":
      process.stdout.write(e.deltaContent);
      break;
    case "assistant.message":
      // If we were streaming deltas, we already printed the content.
      // If not streaming, print the full message now.
      if (!streamingEnabled) {
        process.stdout.write(`\n${c.bold}Assistant:${c.reset} ${e.content}\n`);
      } else {
        process.stdout.write("\n");
      }
      break;
    case "assistant.reasoning_delta":
      process.stderr.write(`${c.magenta}${e.deltaContent}${c.reset}`);
      break;
    case "assistant.reasoning":
      log(c.magenta, "[thinking]", `(${e.content.length} chars)`);
      break;
    case "assistant.intent":
      log(c.cyan, "[intent]", e.intent);
      break;
    case "assistant.usage":
      log(c.dim, "[usage]", `${e.model}: in=${e.inputTokens ?? 0} out=${e.outputTokens ?? 0}${e.durationMs ? ` ${e.durationMs}ms` : ""}${e.cost ? ` cost=${e.cost}` : ""}`);
      break;
    case "abort":
      log(c.red, "[abort]", e.reason);
      break;

    // -- Tool execution -------------------------------------------------------
    case "tool.execution_start": {
      const args = e.arguments ? ` ${JSON.stringify(e.arguments).slice(0, 120)}` : "";
      log(c.blue, "[tool]", `${e.toolName}${args}`);
      break;
    }
    case "tool.execution_partial_result":
      process.stderr.write(`${c.dim}${e.partialOutput}${c.reset}`);
      break;
    case "tool.execution_progress":
      log(c.dim, "[progress]", e.progressMessage);
      break;
    case "tool.execution_complete":
      if (e.success) {
        const preview = e.resultContent?.slice(0, 200) ?? "";
        log(c.green, "[tool ok]", `${e.toolCallId.slice(0, 8)}... ${preview ? preview.replace(/\n/g, " ").slice(0, 100) : ""}`);
      } else {
        log(c.red, "[tool err]", `${e.errorMessage ?? "unknown error"} (${e.errorCode ?? ""})`);
      }
      break;

    // -- Permissions -----------------------------------------------------------
    case "permission.requested":
      log(c.yellow, "[perm]", `${e.permissionKind}: ${e.summary}`);
      break;
    case "permission.completed":
      log(c.dim, "[perm]", `${e.requestId.slice(0, 8)}... -> ${e.resultKind}`);
      break;

    // -- Sub-agents ------------------------------------------------------------
    case "subagent.started":
      log(c.magenta, "[agent]", `Started: ${e.agentDisplayName} (${e.agentDescription})`);
      break;
    case "subagent.completed":
      log(c.magenta, "[agent]", `Done: ${e.agentDisplayName}${e.durationMs ? ` (${e.durationMs}ms)` : ""}`);
      break;
    case "subagent.failed":
      log(c.red, "[agent]", `Failed: ${e.agentDisplayName}: ${e.error}`);
      break;

    // -- Hooks -----------------------------------------------------------------
    case "hook.start":
      log(c.dim, "[hook]", `${e.hookType} started`);
      break;
    case "hook.end":
      log(c.dim, "[hook]", `${e.hookType} ${e.success ? "ok" : `failed: ${e.errorMessage}`}`);
      break;

    // -- Skills ----------------------------------------------------------------
    case "skill.invoked":
      log(c.cyan, "[skill]", `${e.name}${e.description ? ` (${e.description})` : ""}`);
      break;

    // -- User input & elicitation ----------------------------------------------
    case "user_input.requested":
      log(c.yellow, "[ask]", e.question);
      if (e.choices) log(c.dim, "       ", `Choices: ${e.choices.join(", ")}`);
      break;
    case "elicitation.requested":
      log(c.yellow, "[elicit]", `${e.message} (mode: ${e.mode ?? "form"})`);
      break;

    // -- Plan mode -------------------------------------------------------------
    case "exit_plan_mode.requested":
      log(c.cyan, "[plan]", `Plan ready: ${e.summary}`);
      log(c.dim, "       ", `Actions: ${e.actions.join(", ")} (recommended: ${e.recommendedAction})`);
      break;

    // -- System ----------------------------------------------------------------
    case "system.notification":
      log(c.dim, "[system]", `[${e.notificationType}] ${e.content.slice(0, 200)}`);
      break;

    // -- Workspace changes -----------------------------------------------------
    case "session.plan_changed":
      log(c.cyan, "[plan]", `Plan ${e.operation}`);
      break;
    case "session.workspace_file_changed":
      log(c.cyan, "[file]", `${e.operation}: ${e.path}`);
      break;

    // -- Session context & handoff ---------------------------------------------
    case "session.handoff":
      log(c.cyan, "[handoff]", `From ${e.sourceType}${e.repository ? ` (${e.repository.owner}/${e.repository.name})` : ""}${e.summary ? `: ${e.summary}` : ""}`);
      break;
    case "session.context_changed":
      log(c.dim, "[context]", `cwd: ${e.cwd}${e.repository ? ` repo: ${e.repository}` : ""}${e.branch ? ` branch: ${e.branch}` : ""}`);
      break;
    case "session.snapshot_rewind":
      log(c.yellow, "[rewind]", `Rewound to ${e.upToEventId.slice(0, 8)}... (${e.eventsRemoved} events removed)`);
      break;
    case "session.remote_steerable_changed":
      log(c.dim, "[remote]", `Steerable: ${e.remoteSteerable}`);
      break;
    case "session.background_tasks_changed":
      if (e.runningAgents === 0) {
        log(c.green, "[bg]", "All background tasks finished");
      } else {
        log(c.yellow, "[bg]", `${e.runningAgents} background agent(s) running`);
      }
      break;

    // -- Config loading --------------------------------------------------------
    case "session.skills_loaded":
      log(c.dim, "[skills]", `${e.skills.length} skill(s) loaded: ${e.skills.map(s => s.name).join(", ")}`);
      break;
    case "session.custom_agents_updated":
      log(c.dim, "[agents]", `${e.agents.length} custom agent(s): ${e.agents.map(a => a.displayName).join(", ")}`);
      if (e.errors.length) log(c.red, "[agents]", `Errors: ${e.errors.join("; ")}`);
      break;
    case "session.mcp_servers_loaded":
      log(c.dim, "[mcp]", `${e.servers.length} server(s): ${e.servers.map(s => `${s.name}(${s.status})`).join(", ")}`);
      break;
    case "session.mcp_server_status_changed":
      log(c.dim, "[mcp]", `${e.serverName}: ${e.status}`);
      break;
    case "session.extensions_loaded":
      log(c.dim, "[ext]", `${e.extensions.length} extension(s): ${e.extensions.map(x => `${x.name}(${x.status})`).join(", ")}`);
      break;
    case "session.tools_updated":
      log(c.dim, "[tools]", `Tools updated (model: ${e.model})`);
      break;

    // -- MCP OAuth -------------------------------------------------------------
    case "mcp.oauth_required":
      log(c.yellow, "[mcp-auth]", `OAuth required: ${e.serverName} (${e.serverUrl})`);
      break;
    case "mcp.oauth_completed":
      log(c.dim, "[mcp-auth]", `OAuth done: ${e.requestId.slice(0, 8)}...`);
      break;

    // -- Sampling --------------------------------------------------------------
    case "sampling.requested":
      log(c.dim, "[sampling]", `Request from ${e.serverName}`);
      break;
    case "sampling.completed":
      log(c.dim, "[sampling]", "Completed");
      break;

    // -- Subagent selection ----------------------------------------------------
    case "subagent.selected":
      log(c.magenta, "[agent]", `Selected: ${e.agentDisplayName} (tools: ${e.tools ? e.tools.length : "all"})`);
      break;
    case "subagent.deselected":
      log(c.magenta, "[agent]", "Deselected (back to default)");
      break;

    // -- Tool user-requested ---------------------------------------------------
    case "tool.user_requested":
      log(c.blue, "[tool-req]", `User requested: ${e.toolName}`);
      break;

    // -- External tools --------------------------------------------------------
    case "external_tool.requested":
      log(c.blue, "[ext-tool]", `${e.toolName} (${e.requestId.slice(0, 8)}...)`);
      break;
    case "external_tool.completed":
      log(c.dim, "[ext-tool]", `Done: ${e.requestId.slice(0, 8)}...`);
      break;

    // -- Commands --------------------------------------------------------------
    case "command.queued":
      log(c.cyan, "[cmd]", `Queued: ${e.command}`);
      break;
    case "command.completed":
      log(c.dim, "[cmd]", `Done: ${e.requestId.slice(0, 8)}...`);
      break;
    case "commands.changed":
      log(c.dim, "[cmd]", `Commands: ${e.commands.map(cmd => `/${cmd.name}`).join(", ")}`);
      break;

    // -- Interactive flow completions ------------------------------------------
    case "elicitation.completed":
      log(c.dim, "[elicit]", `${e.action ?? "no action"}`);
      break;
    case "user_input.completed":
      log(c.dim, "[answer]", `${e.answer ?? "(no answer)"}`);
      break;
    case "exit_plan_mode.completed":
      log(c.dim, "[plan]", `${e.approved ? "Approved" : "Rejected"}${e.selectedAction ? ` (${e.selectedAction})` : ""}`);
      break;

    // -- System message --------------------------------------------------------
    case "system.message":
      log(c.dim, "[sys-msg]", `${e.role} message (${e.contentLength} chars)${e.name ? ` [${e.name}]` : ""}`);
      break;

    // -- Misc ------------------------------------------------------------------
    case "pending_messages.modified":
      // Very noisy, skip in console
      break;
    case "capabilities.changed":
      log(c.dim, "[caps]", `Elicitation: ${e.elicitation ?? "unchanged"}`);
      break;
    case "assistant.streaming_delta":
      // Raw byte progress, skip in console
      break;
  }
}

// ============================================================================
// Main
// ============================================================================

let streamingEnabled = true;

async function main() {
  const engine = new DoCoreEngine({
    streaming: true,
    workingDirectory: process.cwd(),
  });

  // Subscribe to ALL events and render them
  engine.events.onAny(renderEvent);

  // Also log raw JSON to stderr when DOCORE_DEBUG is set
  if (process.env.DOCORE_DEBUG) {
    engine.events.onAny((e) => {
      process.stderr.write(`${c.gray}${JSON.stringify(e)}${c.reset}\n`);
    });
  }

  console.log(`${c.bold}docore${c.reset} ${c.dim}v0.1.0${c.reset}`);
  console.log(`${c.dim}Powered by GitHub Copilot SDK${c.reset}\n`);

  try {
    await engine.connect();
  } catch (err) {
    console.error(`${c.red}Failed to connect:${c.reset}`, err);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const prompt = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  console.log(`${c.dim}Type a message to chat. Ctrl+C to exit.${c.reset}\n`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log(`\n${c.dim}Shutting down...${c.reset}`);
    rl.close();
    await engine.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  while (true) {
    const input = await prompt(`\n${c.bold}You:${c.reset} `);
    if (!input.trim()) continue;

    // Special commands
    if (input.trim() === "/quit" || input.trim() === "/exit") {
      await shutdown();
      return;
    }
    if (input.trim() === "/abort") {
      await engine.abort();
      continue;
    }
    if (input.trim() === "/state") {
      console.log(`Engine state: ${engine.state}`);
      continue;
    }

    try {
      process.stdout.write(`\n${c.bold}Assistant:${c.reset} `);
      await engine.sendAndWait(input, 300_000); // 5 min timeout
    } catch (err) {
      console.error(`\n${c.red}Error:${c.reset}`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
