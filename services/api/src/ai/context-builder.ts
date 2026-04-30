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
 * 
 * Skills use progressive loading:
 *  1. A manifest of skill names + descriptions is always included
 *  2. Full skill content is loaded only for:
 *     - Explicitly invoked skills (via /skill-name in user message)
 *     - Auto-invoked skills whose description matches the user's prompt
 *  3. Rules are always fully injected (they're guidelines, not skills)
 */
export async function buildProjectContextForMode(
  projectId: string,
  mode: "agent" | "plan" | "chat" | "visual-edit",
  workspaceId?: string,
  userId?: string,
  options?: {
    /** Skill names explicitly invoked via /skill-name */
    invokedSkillNames?: string[];
    /** The user's message, used for auto-matching skills */
    userMessage?: string;
  },
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

  // ── Skills (progressive loading), Rules, Knowledge & Instructions ──
  if (workspaceId) {
    try {
      // Resolve: project env > workspace default env > all workspace items
      const { environment, source } = await mktDb.resolveEffectiveEnvironment(
        workspaceId,
        projectId,
      );

      let envRules: { rule_name: string; content: string }[] = [];
      let instructions: { filename: string; content: string }[] = [];

      if (environment) {
        envRules = environment.rules;
        instructions = environment.instructions;
      } else {
        const items = await envDb.getDefaultItems(workspaceId);
        envRules = items.rules;
      }

      // Also include project-scoped rules (always, regardless of environment)
      if (projectId) {
        const projRules = await skillsDb.listProjectScopedRules(workspaceId, projectId);
        const existingRuleIds = new Set(envRules.map((r) => "id" in r ? (r as { id: string }).id : r.rule_name));
        for (const pr of projRules) {
          if (!existingRuleIds.has(pr.id)) {
            envRules.push(pr);
          }
        }
      }

      // ── Progressive skill loading ──
      // 1. Load skill manifest (names + descriptions, no full content)
      const manifest = await skillsDb.listSkillManifest(workspaceId, projectId);
      
      // 2. Determine which skills to fully load
      const invokedNames = new Set(options?.invokedSkillNames ?? []);
      const userMsg = options?.userMessage?.toLowerCase() ?? "";
      
      const skillIdsToLoad: string[] = [];
      const manifestEntries: string[] = [];
      
      for (const skill of manifest) {
        const isExplicitlyInvoked = invokedNames.has(skill.skill_name);
        const isAutoMatched = skill.auto_invoke && userMsg && matchSkillToPrompt(skill.skill_name, skill.description, userMsg);
        
        if (isExplicitlyInvoked || isAutoMatched) {
          skillIdsToLoad.push(skill.id);
        } else {
          // Include in manifest so AI knows it exists
          manifestEntries.push(`  - /${skill.skill_name}: ${skill.description || "(no description)"}`);
        }
      }
      
      // 3. Load full content for matched/invoked skills
      const loadedSkills = await skillsDb.getSkillsByIds(skillIdsToLoad);
      
      // Also check environment skills that aren't in DB (from marketplace bundles)
      if (environment) {
        for (const envSkill of environment.skills) {
          const isEnvInvoked = invokedNames.has(envSkill.skill_name);
          if (isEnvInvoked) {
            // Only inject env skills that were explicitly invoked
            loadedSkills.push(envSkill as any);
          } else {
            manifestEntries.push(`  - /${envSkill.skill_name}`);
          }
        }
      }
      
      // 4. Build the output
      if (loadedSkills.length > 0 || manifestEntries.length > 0) {
        let skillBlock = "\n\n<skills>";
        
        if (loadedSkills.length > 0) {
          skillBlock += `\n<!-- Active skills (loaded for this request) -->`;
          for (const s of loadedSkills) {
            skillBlock += `\n<skill name="${s.skill_name}" status="active">\n${s.skill_content}\n</skill>`;
          }
        }
        
        if (manifestEntries.length > 0) {
          skillBlock += `\n<!-- Available skills (user can invoke with /skill-name) -->\n<available-skills>\n${manifestEntries.join("\n")}\n</available-skills>`;
        }
        
        skillBlock += "\n</skills>";
        context += skillBlock;
      }

      if (envRules.length > 0) {
        context += `\n\n<rules>\n${envRules.map((r) => `<rule name="${r.rule_name}">\n${r.content}\n</rule>`).join("\n")}\n</rules>`;
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

/**
 * Parse /skill-name invocations from a user message.
 * Returns { invokedSkillNames, cleanMessage } where cleanMessage has the /xxx prefix removed.
 */
export function parseSkillInvocations(message: string): { invokedSkillNames: string[]; cleanMessage: string } {
  const skillPattern = /^\/([a-zA-Z0-9_-]+)\s*/;
  const match = message.match(skillPattern);
  if (match) {
    return {
      invokedSkillNames: [match[1]!],
      cleanMessage: message.slice(match[0].length),
    };
  }
  return { invokedSkillNames: [], cleanMessage: message };
}

/**
 * Simple keyword-based skill matching.
 * Returns true if the user's prompt appears relevant to the skill,
 * based on matching words from the skill name and description.
 */
function matchSkillToPrompt(skillName: string, description: string, prompt: string): boolean {
  // Tokenize skill name (e.g. "react-component-builder" → ["react", "component", "builder"])
  const nameTokens = skillName.toLowerCase().split(/[-_\s]+/).filter(t => t.length > 2);
  
  // Tokenize description
  const descTokens = (description || "").toLowerCase()
    .split(/\W+/)
    .filter(t => t.length > 3); // skip short/common words
  
  // Count how many tokens appear in the prompt
  const allTokens = [...new Set([...nameTokens, ...descTokens])];
  if (allTokens.length === 0) return false;
  
  const matchCount = allTokens.filter(t => prompt.includes(t)).length;
  
  // Require at least 2 matching tokens, or 1 if the skill name is a single-word match
  if (nameTokens.length === 1 && prompt.includes(nameTokens[0]!)) return true;
  return matchCount >= 2;
}
