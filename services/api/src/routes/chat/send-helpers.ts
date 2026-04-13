/**
 * Helper functions extracted from the POST /chat send handler.
 */
import type { SSEStreamingApi } from "hono/streaming";
import { sql } from "../../db/index.js";
import type { TraceCollector } from "../../ai/trace-collector.js";
import type { ByokProviderConfig } from "../../ai/providers/copilot.js";
import { isProjectScaffolded, createProject } from "../../projects/file-manager.js";
import { startDevServer, isRunning as isDevServerRunning } from "../../projects/dev-server.js";

export async function scaffoldAndStartDev(projectId: string, stream: SSEStreamingApi, userId: string) {
  if (!isProjectScaffolded(projectId)) {
    try {
      await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "scaffolding", message: "Creating project files..." } }) });
      console.log(`[Chat] Auto-scaffolding project ${projectId}`);
      await createProject(projectId);
    } catch (err: unknown) {
      const isAlreadyExists = err instanceof Error && err.message.includes("already scaffolded");
      if (!isAlreadyExists) console.error(`[Chat] Scaffold failed for project ${projectId}:`, err);
    }
  }
  if (!isDevServerRunning(projectId) && isProjectScaffolded(projectId)) {
    try {
      await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "dev-server", message: "Starting live preview..." } }) });
      console.log(`[Chat] Auto-starting dev server for project ${projectId}`);
      await startDevServer(projectId, { userId });
    } catch (err) {
      console.error(`[Chat] Dev server start failed for project ${projectId}:`, err);
    }
  }
}

export function emitConfigTraces(
  traceCollector: TraceCollector | null,
  resolvedModel: string | undefined, modelSource: string,
  resolvedProvider: ByokProviderConfig | undefined, providerSource: string,
  resolvedGithubToken: string | undefined,
  systemPrompt: string, projectContext: string,
) {
  traceCollector?.onConfigResolved({ model: resolvedModel ?? null, modelSource, provider: resolvedProvider?.type ?? null, providerSource, systemPromptLength: systemPrompt?.length ?? 0, hasCustomSystemPrompt: projectContext.length > 0, githubTokenPresent: !!resolvedGithubToken });
  if (resolvedProvider) {
    traceCollector?.onProviderResolved({ type: resolvedProvider.type ?? null, baseUrl: resolvedProvider.baseUrl ?? null, hasApiKey: !!resolvedProvider.apiKey, hasBearerToken: !!resolvedProvider.bearerToken, wireApi: resolvedProvider.wireApi, source: providerSource });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logToolManifest(allTools: any[], sessionTools: any[], mode: string, projectId: string, traceCollector: TraceCollector | null) {
  const toolManifest = sessionTools.map((t: any) => ({
    name: t.name ?? "?",
    description: (t.description ?? "").slice(0, 120),
    params: t.parameters ? Object.keys(t.parameters?.properties ?? {}) : [],
    required: t.parameters?.required ?? [],
  }));
  console.log(`[Chat:Tools] mode=${mode} project=${projectId.slice(0, 8)} total=${allTools.length} filtered=${sessionTools.length}`);
  console.log(`[Chat:Tools] MANIFEST:\n${toolManifest.map((t: any) => `  ${t.name} (${t.params.join(", ")}) [req: ${t.required.join(", ")}] — ${t.description}`).join("\n")}`);
  traceCollector?.onToolManifest({ mode: mode ?? "agent", totalToolsCreated: allTools.length, filteredToolCount: sessionTools.length, toolNames: sessionTools.map((t: any) => t.name ?? "unknown"), mcpToolCount: sessionTools.filter((t: any) => (t.name ?? "").startsWith("mcp_")).length, integrationToolCount: sessionTools.filter((t: any) => (t.name ?? "").startsWith("integration_")).length, builtinToolCount: sessionTools.filter((t: any) => !(t.name ?? "").startsWith("mcp_") && !(t.name ?? "").startsWith("integration_")).length, filterReason: mode === "plan" ? "plan_mode_filter" : undefined });
}

export function handleToolEndEvent(stream: SSEStreamingApi, toolName: string, args: Record<string, unknown>, projectId: string) {
  if (toolName === "ask_clarification" && args.output) {
    try {
      const questions = JSON.parse(args.output as string);
      stream.writeSSE({ data: JSON.stringify({ type: "clarification", data: { questions } }) }).catch(() => {});
    } catch { /* parse error */ }
  }
  if (toolName === "create_plan" && args.output) {
    try {
      const plan = JSON.parse(args.output as string);
      (async () => {
        try {
          const planId = plan.id as string;
          await sql`INSERT INTO plans (id, project_id, summary, complexity, status, created_at) VALUES (${planId}, ${projectId}, ${plan.summary}, ${plan.complexity}, 'draft', ${plan.createdAt}) ON CONFLICT (id) DO NOTHING`;
          if (Array.isArray(plan.steps)) {
            for (const step of plan.steps) {
              await sql`INSERT INTO plan_steps (id, plan_id, "order", title, description, details, status, file_paths) VALUES (${step.id}, ${planId}, ${step.order}, ${step.title}, ${step.description}, ${step.details ?? null}, 'pending', ${step.filePaths ?? null}) ON CONFLICT (id) DO NOTHING`;
            }
          }
        } catch (dbErr) { console.warn("[Chat] Failed to save plan to DB:", dbErr); }
      })();
      stream.writeSSE({ data: JSON.stringify({ type: "plan", data: { plan } }) }).catch(() => {});
    } catch { /* parse error */ }
  }
}
