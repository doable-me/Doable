/**
 * Helper functions extracted from the POST /chat send handler.
 */
import type { SSEStreamingApi } from "hono/streaming";
import { sql } from "../../db/index.js";
import type { TraceCollector } from "../../ai/trace-collector.js";
import type { ByokProviderConfig } from "../../ai/providers/copilot.js";
import { isProjectScaffolded, createProject, ensureDependencies } from "../../projects/file-manager.js";
import { startDevServer, isRunning as isDevServerRunning } from "../../projects/dev-server.js";
import { servers as devServersRegistry } from "../../projects/dev-server-core.js";

export async function scaffoldAndStartDev(projectId: string, stream: SSEStreamingApi, userId: string) {
  if (!isProjectScaffolded(projectId)) {
    try {
      await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "scaffolding", message: "Creating project files..." } }) });
      await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: "Creating project scaffold..." }) });
      console.log(`[Chat] Auto-scaffolding project ${projectId}`);

      // Look up the project's framework_id and any pre-scaffolded files
      let templateFiles: Record<string, string> | undefined;
      let scaffoldFrameworkId: string | undefined;
      try {
        const [project] = await sql<{ framework_id: string | null }[]>`
          SELECT framework_id FROM projects WHERE id = ${projectId}
        `;
        if (project?.framework_id) {
          scaffoldFrameworkId = project.framework_id;
        }
      } catch {
        // DB query failed — fall back to default (vite-react)
      }
      try {
        const dbFiles = await sql<{ file_path: string; content: string }[]>`
          SELECT file_path, content FROM project_files
          WHERE project_id = ${projectId}
            AND file_path NOT LIKE '.doable/%'
        `;
        if (dbFiles.length > 0) {
          templateFiles = {};
          for (const f of dbFiles) {
            templateFiles[f.file_path] = f.content;
          }
        }
      } catch {
        // DB query failed — fall back to blank
      }

      await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "scaffolding", message: "Installing dependencies..." } }) });
      await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: " Installing dependencies..." }) });

      // Emit progress ticks every 3s so the user sees activity during npm install
      const installStart = Date.now();
      let lastNpmMsg = "";
      const installTicker = setInterval(() => {
        const elapsed = Math.round((Date.now() - installStart) / 1000);
        const msg = lastNpmMsg || `Downloading and linking packages… (${elapsed}s)`;
        stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "scaffolding", message: msg } }) }).catch(() => {});
      }, 3000);

      await createProject(projectId, templateFiles, scaffoldFrameworkId, (msg) => {
        lastNpmMsg = msg;
        stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "scaffolding", message: msg } }) }).catch(() => {});
      });
      clearInterval(installTicker);

      const installDuration = Math.round((Date.now() - installStart) / 1000);
      await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "scaffolding", message: `Dependencies installed (${installDuration}s)` } }) });
      await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: ` done (${installDuration}s)\n` }) });
    } catch (err: unknown) {
      const isAlreadyExists = err instanceof Error && err.message.includes("already scaffolded");
      if (!isAlreadyExists) console.error(`[Chat] Scaffold failed for project ${projectId}:`, err);
    }
  }
  if (!isDevServerRunning(projectId) && isProjectScaffolded(projectId)) {
    await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "dev-server", message: "Starting dev server..." } }) });
    await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: " Starting dev server..." }) });
    console.log(`[Chat] Auto-starting dev server for project ${projectId}`);

    // Re-verify the framework's build tool (vite for vite-react) is actually
    // resolvable inside node_modules before spawning. The scaffold install
    // above can leave a populated-looking node_modules/ that's missing vite
    // when it was killed mid-install, ran with NODE_ENV=production, or the
    // AI's install_package tool re-wrote the dir. Without this, the very
    // first spawn dies with `Cannot find module .../vite/bin/vite.js` and
    // the user sees a red "Dev server exited with code 1" before the lazy
    // recovery path eventually re-installs. ensureDependencies is a no-op
    // when the build tool is already present, so this is cheap.
    try {
      await ensureDependencies(projectId);
    } catch (err) {
      console.warn(`[Chat] ensureDependencies failed for ${projectId}:`, err);
      // Continue to startDevServer — it has its own error surfacing path
      // and the user may still get a usable preview from the reactive
      // install loop in dev-server-start.ts.
    }

    // BUG-AI-PREVIEW-001: tick from REAL registry state, not setInterval-only.
    // Previously a setInterval emitted "Compiling project… (Xs)" forever
    // even when startDevServer threw — the catch swallowed the error and
    // never cleared the timer, so users saw fake progress for a process
    // that never spawned. The new tick reads the actual `servers` map:
    //   - no entry yet  → "Spawning dev server…"
    //   - entry, ready=false → "Compiling project… (Xs)" (real vite is up,
    //     waiting for HMR ready signal — see dev-server-start.ts)
    //   - entry, ready=true → loop ends
    //   - process.exitCode !== null → loop ends (failure surfaces below)
    const devStart = Date.now();
    let tickerStopped = false;
    const ticker = setInterval(() => {
      if (tickerStopped) return;
      const elapsed = Math.round((Date.now() - devStart) / 1000);
      const inst = devServersRegistry.get(projectId);
      let msg: string;
      if (!inst) {
        msg = `Spawning dev server… (${elapsed}s)`;
      } else if (inst.process.exitCode !== null) {
        // Process died — let the awaiter throw and surface the real error
        return;
      } else if (inst.ready) {
        return; // success path will emit "Dev server ready"
      } else {
        msg = `Compiling project… (${elapsed}s)`;
      }
      stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "dev-server", message: msg } }) }).catch(() => {});
    }, 3000);
    const stopTicker = () => { tickerStopped = true; clearInterval(ticker); };

    try {
      await startDevServer(projectId, { userId });
      stopTicker();

      const devDuration = Math.round((Date.now() - devStart) / 1000);
      await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "dev-server", message: `Dev server ready (${devDuration}s)` } }) });
      await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: ` ready (${devDuration}s)\n` }) });
    } catch (err) {
      stopTicker();
      const reason = err instanceof Error ? err.message : String(err);
      // Full stack to console so operators can diagnose the underlying
      // spawn failure (sandbox-spawn missing, framework_id invalid, etc.)
      console.error(`[Chat] Dev server start failed for project ${projectId}:`, err);
      // Surface the real failure to the SSE stream — no more synthetic
      // progress on a server that never started.
      await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "dev-server", message: `Dev server failed to start: ${reason.slice(0, 240)}`, error: true } }) }).catch(() => {});
      await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: ` failed: ${reason.slice(0, 240)}\n` }) }).catch(() => {});
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
  if (toolName === "mark_step_complete") {
    const { stepId, planId, status } = args as { stepId?: string; planId?: string; status?: string };
    if (stepId && planId) {
      stream.writeSSE({
        data: JSON.stringify({
          type: "plan_step_update",
          data: { stepId, planId, status: status ?? "completed" },
        }),
      }).catch(() => {});
    }
  }
}
