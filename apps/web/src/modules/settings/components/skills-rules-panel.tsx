"use client";

import { useState } from "react";
import {
  Plus,
  Loader2,
  Brain,
  ScrollText,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useSkillsRules } from "../hooks/use-skills-rules";
import { SkillCard, CreateSkillForm, RuleCard, CreateRuleForm } from "./skills-rules-cards";

// ─── Types ─────────────────────────────────────────────

interface SkillsRulesPanelProps {
  workspaceId: string;
}

// ─── Inline Edit ───────────────────────────────────────

// ─── Main Panel ────────────────────────────────────────

export function SkillsRulesPanel({ workspaceId }: SkillsRulesPanelProps) {
  const {
    skills, rules, loading, error, refresh,
    createSkill, updateSkill, deleteSkill,
    createRule, updateRule, deleteRule,
  } = useSkillsRules(workspaceId);

  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [showCreateRule, setShowCreateRule] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={refresh} className="mt-3 flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Skills Section ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Skills</h3>
            <span className="text-xs text-muted-foreground">({skills.length})</span>
          </div>
          <button
            onClick={() => setShowCreateSkill(true)}
            disabled={showCreateSkill}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Add Skill
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Skills teach the AI specific capabilities or knowledge. They are included in the AI's context when working on your projects.
        </p>

        {showCreateSkill && (
          <div className="mb-3">
            <CreateSkillForm
              onSubmit={async (data) => { await createSkill(data); setShowCreateSkill(false); }}
              onCancel={() => setShowCreateSkill(false)}
            />
          </div>
        )}

        {skills.length === 0 && !showCreateSkill ? (
          <div className="rounded-lg border border-dashed py-6 text-center">
            <Brain className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No skills yet. Add one to teach the AI new capabilities.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} onUpdate={updateSkill} onDelete={deleteSkill} />
            ))}
          </div>
        )}
      </div>

      {/* ── Rules Section ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Rules</h3>
            <span className="text-xs text-muted-foreground">({rules.length})</span>
          </div>
          <button
            onClick={() => setShowCreateRule(true)}
            disabled={showCreateRule}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Add Rule
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Rules define constraints and conventions the AI must follow. File patterns control which files a rule applies to.
        </p>

        {showCreateRule && (
          <div className="mb-3">
            <CreateRuleForm
              onSubmit={async (data) => { await createRule(data); setShowCreateRule(false); }}
              onCancel={() => setShowCreateRule(false)}
            />
          </div>
        )}

        {rules.length === 0 && !showCreateRule ? (
          <div className="rounded-lg border border-dashed py-6 text-center">
            <ScrollText className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No rules yet. Add one to set constraints for the AI.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} onUpdate={updateRule} onDelete={deleteRule} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
