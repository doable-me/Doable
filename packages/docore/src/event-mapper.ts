/**
 * docore event mapper
 *
 * Pure mapping function that converts SDK SessionEvent objects into
 * normalized DoCoreEvent objects. Extracted from engine.ts to keep
 * engine.ts focused on lifecycle and the mapper as an append-only file.
 *
 * When the SDK adds new events, add a new `case` here and a
 * corresponding type in events.ts. No other files need to change.
 */

import type { DoCoreEvent } from "./events.js";

/**
 * Context provided by the engine for events that need engine state
 * (currently only session.background_tasks_changed needs runningSubagents count).
 */
export interface MapperContext {
  runningSubagentCount: number;
}

/**
 * Map a raw SDK SessionEvent into a normalized DoCoreEvent.
 * Returns null for events we intentionally skip or don't recognize yet.
 *
 * Uses `any` for the event parameter because the SDK evolves frequently
 * and docore needs to handle events from multiple SDK versions gracefully.
 */
export function mapSdkEvent(e: any, ctx: MapperContext): DoCoreEvent | null {
  const ts = e.timestamp;

  switch (e.type) {
    // -- Session lifecycle --------------------------------------------------
    case "session.start":
      return {
        kind: "session.start",
        sessionId: e.data.sessionId,
        timestamp: ts,
        model: e.data.selectedModel,
        reasoningEffort: e.data.reasoningEffort,
        cwd: e.data.context?.cwd,
        gitRoot: e.data.context?.gitRoot,
        repository: e.data.context?.repository,
        branch: e.data.context?.branch,
      };

    case "session.resume":
      return {
        kind: "session.resume",
        timestamp: ts,
        eventCount: e.data.eventCount,
        model: e.data.selectedModel,
      };

    case "session.idle":
      return { kind: "session.idle", timestamp: ts, aborted: e.data.aborted };

    case "session.error":
      return {
        kind: "session.error",
        timestamp: ts,
        errorType: e.data.errorType,
        message: e.data.message,
        stack: e.data.stack,
        statusCode: e.data.statusCode,
      };

    case "session.shutdown":
      return {
        kind: "session.shutdown",
        timestamp: ts,
        shutdownType: e.data.shutdownType,
        errorReason: e.data.errorReason,
        totalPremiumRequests: e.data.totalPremiumRequests,
        totalApiDurationMs: e.data.totalApiDurationMs,
        linesAdded: e.data.codeChanges.linesAdded,
        linesRemoved: e.data.codeChanges.linesRemoved,
        filesModified: e.data.codeChanges.filesModified,
      };

    case "session.info":
      return {
        kind: "session.info",
        timestamp: ts,
        infoType: e.data.infoType,
        message: e.data.message,
        url: e.data.url,
      };

    case "session.warning":
      return {
        kind: "session.warning",
        timestamp: ts,
        warningType: e.data.warningType,
        message: e.data.message,
        url: e.data.url,
      };

    case "session.title_changed":
      return { kind: "session.title_changed", timestamp: ts, title: e.data.title };

    case "session.model_change":
      return {
        kind: "session.model_change",
        timestamp: ts,
        previousModel: e.data.previousModel,
        newModel: e.data.newModel,
        reasoningEffort: e.data.reasoningEffort,
      };

    case "session.mode_changed":
      return {
        kind: "session.mode_changed",
        timestamp: ts,
        previousMode: e.data.previousMode,
        newMode: e.data.newMode,
      };

    case "session.task_complete":
      return {
        kind: "session.task_complete",
        timestamp: ts,
        summary: e.data.summary,
        success: e.data.success,
      };

    case "session.plan_changed":
      return { kind: "session.plan_changed", timestamp: ts, operation: e.data.operation };

    case "session.workspace_file_changed":
      return {
        kind: "session.workspace_file_changed",
        timestamp: ts,
        path: e.data.path,
        operation: e.data.operation,
      };

    // -- Context window management -------------------------------------------
    case "session.usage_info":
      return {
        kind: "session.usage_info",
        timestamp: ts,
        tokenLimit: e.data.tokenLimit,
        currentTokens: e.data.currentTokens,
        messagesLength: e.data.messagesLength,
        systemTokens: e.data.systemTokens,
        conversationTokens: e.data.conversationTokens,
        toolDefinitionsTokens: e.data.toolDefinitionsTokens,
      };

    case "session.compaction_start":
      return {
        kind: "session.compaction_start",
        timestamp: ts,
        systemTokens: e.data.systemTokens,
        conversationTokens: e.data.conversationTokens,
        toolDefinitionsTokens: e.data.toolDefinitionsTokens,
      };

    case "session.compaction_complete":
      return {
        kind: "session.compaction_complete",
        timestamp: ts,
        success: e.data.success,
        error: e.data.error,
        preCompactionTokens: e.data.preCompactionTokens,
        postCompactionTokens: e.data.postCompactionTokens,
        tokensRemoved: e.data.tokensRemoved,
        summaryContent: e.data.summaryContent,
      };

    case "session.truncation":
      return {
        kind: "session.truncation",
        timestamp: ts,
        tokenLimit: e.data.tokenLimit,
        tokensRemovedDuringTruncation: e.data.tokensRemovedDuringTruncation,
        messagesRemovedDuringTruncation: e.data.messagesRemovedDuringTruncation,
      };

    // -- User messages -------------------------------------------------------
    case "user.message":
      return {
        kind: "user.message",
        timestamp: ts,
        content: e.data.content,
        agentMode: e.data.agentMode,
        attachmentCount: e.data.attachments?.length ?? 0,
      };

    // -- Assistant response --------------------------------------------------
    case "assistant.turn_start":
      return { kind: "assistant.turn_start", timestamp: ts, turnId: e.data.turnId };

    case "assistant.turn_end":
      return { kind: "assistant.turn_end", timestamp: ts, turnId: e.data.turnId };

    case "assistant.message_delta":
      return {
        kind: "assistant.message_delta",
        timestamp: ts,
        messageId: e.data.messageId,
        deltaContent: e.data.deltaContent,
        parentToolCallId: e.data.parentToolCallId,
      };

    case "assistant.message":
      return {
        kind: "assistant.message",
        timestamp: ts,
        messageId: e.data.messageId,
        content: e.data.content,
        toolRequestCount: e.data.toolRequests?.length ?? 0,
        parentToolCallId: e.data.parentToolCallId,
      };

    case "assistant.reasoning_delta":
      return {
        kind: "assistant.reasoning_delta",
        timestamp: ts,
        reasoningId: e.data.reasoningId,
        deltaContent: e.data.deltaContent,
      };

    case "assistant.reasoning":
      return {
        kind: "assistant.reasoning",
        timestamp: ts,
        reasoningId: e.data.reasoningId,
        content: e.data.content,
      };

    case "assistant.intent":
      return { kind: "assistant.intent", timestamp: ts, intent: e.data.intent };

    case "assistant.usage":
      return {
        kind: "assistant.usage",
        timestamp: ts,
        model: e.data.model,
        inputTokens: e.data.inputTokens,
        outputTokens: e.data.outputTokens,
        cacheReadTokens: e.data.cacheReadTokens,
        cacheWriteTokens: e.data.cacheWriteTokens,
        cost: e.data.cost,
        durationMs: e.data.duration,
        ttftMs: e.data.ttftMs,
      };

    case "abort":
      return { kind: "abort", timestamp: ts, reason: e.data.reason };

    // -- Tool execution ------------------------------------------------------
    case "tool.execution_start":
      return {
        kind: "tool.execution_start",
        timestamp: ts,
        toolCallId: e.data.toolCallId,
        toolName: e.data.toolName,
        arguments: e.data.arguments as Record<string, unknown> | undefined,
        mcpServerName: e.data.mcpServerName,
        parentToolCallId: e.data.parentToolCallId,
      };

    case "tool.execution_partial_result":
      return {
        kind: "tool.execution_partial_result",
        timestamp: ts,
        toolCallId: e.data.toolCallId,
        partialOutput: e.data.partialOutput,
      };

    case "tool.execution_progress":
      return {
        kind: "tool.execution_progress",
        timestamp: ts,
        toolCallId: e.data.toolCallId,
        progressMessage: e.data.progressMessage,
      };

    case "tool.execution_complete":
      return {
        kind: "tool.execution_complete",
        timestamp: ts,
        toolCallId: e.data.toolCallId,
        success: e.data.success,
        resultContent: e.data.result?.content,
        detailedContent: e.data.result?.detailedContent,
        errorMessage: e.data.error?.message,
        errorCode: e.data.error?.code,
        parentToolCallId: e.data.parentToolCallId,
      };

    // -- Permissions ---------------------------------------------------------
    case "permission.requested": {
      const perm = e.data.permissionRequest;
      let summary = `${perm.kind} permission requested`;
      if (perm.kind === "shell") summary = `Shell: ${perm.fullCommandText}`;
      else if (perm.kind === "write") summary = `Write: ${perm.fileName}`;
      else if (perm.kind === "read") summary = `Read: ${perm.path}`;
      else if (perm.kind === "mcp") summary = `MCP: ${perm.serverName}/${perm.toolName}`;
      else if (perm.kind === "url") summary = `URL: ${perm.url}`;
      return {
        kind: "permission.requested",
        timestamp: ts,
        requestId: e.data.requestId,
        permissionKind: perm.kind,
        toolCallId: perm.toolCallId,
        summary,
      };
    }

    case "permission.completed":
      return {
        kind: "permission.completed",
        timestamp: ts,
        requestId: e.data.requestId,
        resultKind: e.data.result.kind,
      };

    // -- Sub-agents ----------------------------------------------------------
    case "subagent.started":
      return {
        kind: "subagent.started",
        timestamp: ts,
        toolCallId: e.data.toolCallId,
        agentName: e.data.agentName,
        agentDisplayName: e.data.agentDisplayName,
        agentDescription: e.data.agentDescription,
      };

    case "subagent.completed":
      return {
        kind: "subagent.completed",
        timestamp: ts,
        toolCallId: e.data.toolCallId,
        agentName: e.data.agentName,
        agentDisplayName: e.data.agentDisplayName,
        model: e.data.model,
        totalToolCalls: e.data.totalToolCalls,
        totalTokens: e.data.totalTokens,
        durationMs: e.data.durationMs,
      };

    case "subagent.failed":
      return {
        kind: "subagent.failed",
        timestamp: ts,
        toolCallId: e.data.toolCallId,
        agentName: e.data.agentName,
        agentDisplayName: e.data.agentDisplayName,
        error: e.data.error,
      };

    // -- Hooks ---------------------------------------------------------------
    case "hook.start":
      return {
        kind: "hook.start",
        timestamp: ts,
        hookInvocationId: e.data.hookInvocationId,
        hookType: e.data.hookType,
      };

    case "hook.end":
      return {
        kind: "hook.end",
        timestamp: ts,
        hookInvocationId: e.data.hookInvocationId,
        hookType: e.data.hookType,
        success: e.data.success,
        errorMessage: e.data.error?.message,
      };

    // -- Skills --------------------------------------------------------------
    case "skill.invoked":
      return {
        kind: "skill.invoked",
        timestamp: ts,
        name: e.data.name,
        path: e.data.path,
        description: e.data.description,
      };

    // -- User input & elicitation --------------------------------------------
    case "user_input.requested":
      return {
        kind: "user_input.requested",
        timestamp: ts,
        requestId: e.data.requestId,
        question: e.data.question,
        choices: e.data.choices,
        allowFreeform: e.data.allowFreeform,
      };

    case "elicitation.requested":
      return {
        kind: "elicitation.requested",
        timestamp: ts,
        requestId: e.data.requestId,
        message: e.data.message,
        mode: e.data.mode,
        elicitationSource: e.data.elicitationSource,
      };

    // -- Plan mode -----------------------------------------------------------
    case "exit_plan_mode.requested":
      return {
        kind: "exit_plan_mode.requested",
        timestamp: ts,
        requestId: e.data.requestId,
        summary: e.data.summary,
        planContent: e.data.planContent,
        actions: e.data.actions,
        recommendedAction: e.data.recommendedAction,
      };

    // -- System notifications ------------------------------------------------
    case "system.notification":
      return {
        kind: "system.notification",
        timestamp: ts,
        content: e.data.content,
        notificationType: e.data.kind.type,
      };

    case "system.message":
      return {
        kind: "system.message",
        timestamp: ts,
        role: e.data.role,
        contentLength: e.data.content.length,
        name: e.data.name,
      };

    // -- Session handoff & context -------------------------------------------
    case "session.handoff":
      return {
        kind: "session.handoff",
        timestamp: ts,
        sourceType: e.data.sourceType,
        repository: e.data.repository,
        summary: e.data.summary,
        remoteSessionId: e.data.remoteSessionId,
      };

    case "session.context_changed":
      return {
        kind: "session.context_changed",
        timestamp: ts,
        cwd: e.data.cwd,
        gitRoot: e.data.gitRoot,
        repository: e.data.repository,
        branch: e.data.branch,
      };

    case "session.snapshot_rewind":
      return {
        kind: "session.snapshot_rewind",
        timestamp: ts,
        upToEventId: e.data.upToEventId,
        eventsRemoved: e.data.eventsRemoved,
      };

    case "session.remote_steerable_changed":
      return {
        kind: "session.remote_steerable_changed",
        timestamp: ts,
        remoteSteerable: e.data.remoteSteerable,
      };

    // -- Background tasks ----------------------------------------------------
    case "session.background_tasks_changed":
      return {
        kind: "session.background_tasks_changed",
        timestamp: ts,
        runningAgents: ctx.runningSubagentCount,
      };

    // -- Config loading events -----------------------------------------------
    case "session.skills_loaded":
      return {
        kind: "session.skills_loaded",
        timestamp: ts,
        skills: e.data.skills.map((s: { name: string; description: string; source: string; enabled: boolean }) => ({
          name: s.name,
          description: s.description,
          source: s.source,
          enabled: s.enabled,
        })),
      };

    case "session.custom_agents_updated":
      return {
        kind: "session.custom_agents_updated",
        timestamp: ts,
        agents: e.data.agents.map((a: { name: string; displayName: string; description: string; source: string }) => ({
          name: a.name,
          displayName: a.displayName,
          description: a.description,
          source: a.source,
        })),
        warnings: e.data.warnings,
        errors: e.data.errors,
      };

    case "session.mcp_servers_loaded":
      return {
        kind: "session.mcp_servers_loaded",
        timestamp: ts,
        servers: e.data.servers.map((s: { name: string; status: string; source?: string; error?: string }) => ({
          name: s.name,
          status: s.status as "connected" | "failed" | "needs-auth" | "pending" | "disabled" | "not_configured",
          source: s.source,
          error: s.error,
        })),
      };

    case "session.mcp_server_status_changed":
      return {
        kind: "session.mcp_server_status_changed",
        timestamp: ts,
        serverName: e.data.serverName,
        status: e.data.status,
      };

    case "session.extensions_loaded":
      return {
        kind: "session.extensions_loaded",
        timestamp: ts,
        extensions: e.data.extensions.map((ext: { id: string; name: string; source: string; status: string }) => ({
          id: ext.id,
          name: ext.name,
          source: ext.source as "project" | "user",
          status: ext.status as "running" | "starting" | "failed" | "disabled",
        })),
      };

    case "session.tools_updated":
      return {
        kind: "session.tools_updated",
        timestamp: ts,
        model: e.data.model,
      };

    // -- MCP OAuth -----------------------------------------------------------
    case "mcp.oauth_required":
      return {
        kind: "mcp.oauth_required",
        timestamp: ts,
        requestId: e.data.requestId,
        serverName: e.data.serverName,
        serverUrl: e.data.serverUrl,
      };

    case "mcp.oauth_completed":
      return {
        kind: "mcp.oauth_completed",
        timestamp: ts,
        requestId: e.data.requestId,
      };

    // -- Sampling ------------------------------------------------------------
    case "sampling.requested":
      return {
        kind: "sampling.requested",
        timestamp: ts,
        requestId: e.data.requestId,
        serverName: e.data.serverName,
      };

    case "sampling.completed":
      return {
        kind: "sampling.completed",
        timestamp: ts,
        requestId: e.data.requestId,
      };

    // -- Subagent selection --------------------------------------------------
    case "subagent.selected":
      return {
        kind: "subagent.selected",
        timestamp: ts,
        agentName: e.data.agentName,
        agentDisplayName: e.data.agentDisplayName,
        tools: e.data.tools,
      };

    case "subagent.deselected":
      return { kind: "subagent.deselected", timestamp: ts };

    // -- Tool user-requested -------------------------------------------------
    case "tool.user_requested":
      return {
        kind: "tool.user_requested",
        timestamp: ts,
        toolCallId: e.data.toolCallId,
        toolName: e.data.toolName,
        arguments: e.data.arguments as Record<string, unknown> | undefined,
      };

    // -- External tool dispatch ----------------------------------------------
    case "external_tool.requested":
      return {
        kind: "external_tool.requested",
        timestamp: ts,
        requestId: e.data.requestId,
        toolCallId: e.data.toolCallId,
        toolName: e.data.toolName,
        arguments: e.data.arguments as Record<string, unknown> | undefined,
      };

    case "external_tool.completed":
      return {
        kind: "external_tool.completed",
        timestamp: ts,
        requestId: e.data.requestId,
      };

    // -- Commands ------------------------------------------------------------
    case "command.queued":
      return {
        kind: "command.queued",
        timestamp: ts,
        requestId: e.data.requestId,
        command: e.data.command,
      };

    case "command.completed":
      return {
        kind: "command.completed",
        timestamp: ts,
        requestId: e.data.requestId,
      };

    case "command.execute":
      return null;

    case "commands.changed":
      return {
        kind: "commands.changed",
        timestamp: ts,
        commands: e.data.commands,
      };

    // -- Completion events for interactive flows -----------------------------
    case "elicitation.completed":
      return {
        kind: "elicitation.completed",
        timestamp: ts,
        requestId: e.data.requestId,
        action: (e.data as any).action,
      };

    case "user_input.completed":
      return {
        kind: "user_input.completed",
        timestamp: ts,
        requestId: e.data.requestId,
        answer: (e.data as any).answer,
        wasFreeform: (e.data as any).wasFreeform,
      };

    case "exit_plan_mode.completed":
      return {
        kind: "exit_plan_mode.completed",
        timestamp: ts,
        requestId: e.data.requestId,
        approved: (e.data as any).approved,
        selectedAction: (e.data as any).selectedAction,
      };

    // -- Misc ephemeral events -----------------------------------------------
    case "pending_messages.modified":
      return { kind: "pending_messages.modified", timestamp: ts };

    case "capabilities.changed":
      return {
        kind: "capabilities.changed",
        timestamp: ts,
        elicitation: e.data.ui?.elicitation,
      };

    case "assistant.streaming_delta":
      return {
        kind: "assistant.streaming_delta",
        timestamp: ts,
        totalResponseSizeBytes: e.data.totalResponseSizeBytes,
      };

    default:
      // Future events we haven't mapped yet; return null to avoid crashes
      return null;
  }
}
