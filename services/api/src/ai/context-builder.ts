import { sql } from "../db/index.js";
import {
  isProjectScaffolded,
  readFile,
  listFiles,
} from "../projects/file-manager.js";
import { contextManager } from "../context/manager.js";
import { buildContextPrompt } from "../context/injector.js";
import { environmentQueries, marketplaceQueries, skillsQueries } from "@doable/db";

const ctxManager = contextManager(sql);
const envDb = environmentQueries(sql);
const mktDb = marketplaceQueries(sql);
const skillsDb = skillsQueries(sql);

export async function buildProjectContext(projectId: string): Promise<string> {
  let context = "";

  // ── .doable/ context files (always load, even before scaffold) ──
  try {
    const contextFiles = await ctxManager.initializeContext(projectId);
    if (contextFiles.length > 0) {
      // Build the context prompt using the injector (mode defaults to agent)
      const contextPrompt = buildContextPrompt(contextFiles, "agent");
      if (contextPrompt) {
        context += `\n\n${contextPrompt}`;
      }
    }
  } catch (err) {
    console.warn("[Chat] Failed to load .doable/ context files:", err);
  }

  // ── File listing and package info ──
  if (!isProjectScaffolded(projectId)) return context;

  try {
    const [files, pkgContent] = await Promise.all([
      listFiles(projectId).catch(() => [] as string[]),
      readFile(projectId, "package.json").catch(() => ""),
    ]);

    if (files.length > 0) {
      context += `\n\nCurrent project files:\n${files.join("\n")}`;
    }

    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        context += `\n\nInstalled dependencies: ${deps.join(", ") || "(none)"}`;
        context += `\nInstalled devDependencies: ${devDeps.join(", ") || "(none)"}`;
      } catch { /* ignore parse errors */ }
    }

    return context;
  } catch {
    return context;
  }
}

/**
 * Build project context with mode-specific injection.
 * Uses the context injector to select the right files per mode.
 */
export async function buildProjectContextForMode(
  projectId: string,
  mode: "agent" | "plan" | "chat" | "visual-edit",
  workspaceId?: string,
  userId?: string,
): Promise<string> {
  let context = "";

  // Map visual-edit to agent mode for context purposes
  const contextMode = mode === "visual-edit" ? "agent" : mode;

  // ── .doable/ context files (multi-scope if workspace/user available) ──
  try {
    if (workspaceId && userId) {
      // Multi-scope: workspace > project > user
      const contextPrompt = await ctxManager.resolveEffectiveContext(
        workspaceId, projectId, userId, contextMode,
      );
      if (contextPrompt) {
        context += `\n\n${contextPrompt}`;
      }
    } else {
      // Fallback: project-scoped only
      const contextFiles = await ctxManager.initializeContext(projectId);
      if (contextFiles.length > 0) {
        const contextPrompt = buildContextPrompt(contextFiles, contextMode);
        if (contextPrompt) {
          context += `\n\n${contextPrompt}`;
        }
      }
    }
  } catch (err) {
    console.warn("[Chat] Failed to load .doable/ context files:", err);
  }

  // ── Skills, Rules, Knowledge & Instructions from effective environment ──
  if (workspaceId) {
    try {
      // Resolve: project env > workspace default env > all workspace items
      const { environment, source } = await mktDb.resolveEffectiveEnvironment(
        workspaceId,
        // projectId is always available in this function
        projectId,
      );

      let skills: { skill_name: string; skill_content: string }[] = [];
      let rules: { rule_name: string; content: string }[] = [];
      let instructions: { filename: string; content: string }[] = [];

      if (environment) {
        // Custom environment (from project or workspace level)
        skills = environment.skills;
        rules = environment.rules;
        // Knowledge is already loaded via resolveEffectiveContext above (multi-scope merged)
        instructions = environment.instructions;
      } else {
        // No custom default — use all workspace-level skills & rules
        const items = await envDb.getDefaultItems(workspaceId);
        skills = items.skills;
        rules = items.rules;
        // No instructions for virtual default
      }

      // Also include project-scoped skills & rules (always, regardless of environment)
      if (projectId) {
        const [projSkills, projRules] = await Promise.all([
          skillsDb.listProjectScopedSkills(workspaceId, projectId),
          skillsDb.listProjectScopedRules(workspaceId, projectId),
        ]);
        const existingSkillIds = new Set(skills.map((s) => "id" in s ? (s as { id: string }).id : s.skill_name));
        for (const ps of projSkills) {
          if (!existingSkillIds.has(ps.id)) {
            skills.push(ps);
          }
        }
        const existingRuleIds = new Set(rules.map((r) => "id" in r ? (r as { id: string }).id : r.rule_name));
        for (const pr of projRules) {
          if (!existingRuleIds.has(pr.id)) {
            rules.push(pr);
          }
        }
      }

      if (skills.length > 0) {
        context += `\n\n<skills>\n${skills.map((s) => `<skill name="${s.skill_name}">\n${s.skill_content}\n</skill>`).join("\n")}\n</skills>`;
      }
      if (rules.length > 0) {
        context += `\n\n<rules>\n${rules.map((r) => `<rule name="${r.rule_name}">\n${r.content}\n</rule>`).join("\n")}\n</rules>`;
      }
      if (instructions.length > 0) {
        context += `\n\n<environment-instructions>\n${instructions.map((i) => `<instruction file="${i.filename}">\n${i.content}\n</instruction>`).join("\n")}\n</environment-instructions>`;
      }
    } catch (err) {
      console.warn("[Chat] Failed to load environment skills/rules:", err);
    }
  }

  // ── Connected integrations manifest (vault-bridge) ──
  if (workspaceId && userId) {
    try {
      const { buildConnectedIntegrationsContext } = await import("../integrations/prompt-manifest.js");
      const block = await buildConnectedIntegrationsContext(projectId, workspaceId, userId);
      if (block) {
        console.log(`[Chat] Connected integrations manifest injected (${block.length} chars, integrations: ${(block.match(/^- /gm) || []).length})`);
        context += `\n\n${block}`;
      } else {
        console.log(`[Chat] No connected integrations found for workspace=${workspaceId?.slice(0,8)} project=${projectId?.slice(0,8)} user=${userId?.slice(0,8)}`);
      }
    } catch (err) {
      console.warn("[Chat] integrations manifest failed:", err);
    }
  }

  // ── File listing and package info ──
  if (!isProjectScaffolded(projectId)) return context;

  try {
    const [files, pkgContent] = await Promise.all([
      listFiles(projectId).catch(() => [] as string[]),
      readFile(projectId, "package.json").catch(() => ""),
    ]);

    if (files.length > 0) {
      context += `\n\nCurrent project files:\n${files.join("\n")}`;
    }

    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        context += `\n\nInstalled dependencies: ${deps.join(", ") || "(none)"}`;
        context += `\nInstalled devDependencies: ${devDeps.join(", ") || "(none)"}`;
      } catch { /* ignore parse errors */ }
    }

    return context;
  } catch {
    return context;
  }
}
