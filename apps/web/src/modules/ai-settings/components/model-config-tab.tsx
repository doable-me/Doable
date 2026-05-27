"use client";

import { useState, useEffect } from "react";
import type {
  ApiGitHubCopilotAccount,
  ApiAiProvider,
  ApiWorkspaceAiDefaults,
  ApiUserAiPreferences,
  ApiEnforcementStatus,
} from "@/lib/api";
import { Bot, Sparkles, Loader2, Check, Lock, User, Info } from "lucide-react";
import { ProviderWizard } from "./provider-wizard";
import { useCopilotModels, useProviderModels, deriveSource, EMPTY_MODEL_STATE } from "./model-config-hooks";
import type { ModelSectionState, WorkspaceDefaultsUpdateData, UserPreferencesUpdateData } from "./model-config-hooks";
import { HelpTooltip, InlineConfigFields, ModelSection } from "./model-config-fields";

interface Props {
  workspaceId: string | null;
  defaults: ApiWorkspaceAiDefaults | null;
  loading: boolean;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  onUpdate: (data: WorkspaceDefaultsUpdateData) => Promise<void> | void;
  userPreferences: ApiUserAiPreferences | null;
  enforcement: ApiEnforcementStatus | null;
  onUserPreferenceUpdate?: (data: UserPreferencesUpdateData) => Promise<void> | void;
  onRefreshProviders: () => void;
  isPlatformAdmin: boolean;
}

// ─── Main Component ─────────────────────────────────────────
export function ModelConfigTab({
  workspaceId,
  defaults,
  loading,
  accounts,
  providers,
  onUpdate,
  userPreferences,
  enforcement,
  onUserPreferenceUpdate,
  onRefreshProviders,
  isPlatformAdmin,
}: Props) {
  // ── Workspace default state ──
  const [primary, setPrimary] = useState<ModelSectionState>(() => deriveSource(defaults, "default"));
  const [suggestions, setSuggestions] = useState<ModelSectionState>(() => deriveSource(defaults, "suggestion"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Copilot models per section ──
  const activePrimaryCopilotId = primary.source === "copilot" ? primary.copilotAccountId : "";
  const activeSuggestionCopilotId = suggestions.source === "copilot" ? suggestions.copilotAccountId : "";
  const { models: primaryCopilotModels } = useCopilotModels(activePrimaryCopilotId || undefined);
  const { models: suggestionCopilotModels } = useCopilotModels(activeSuggestionCopilotId || undefined);

  // Resolve a provider's catalog preset id so useProviderModels can fall back
  // to catalog defaultModels when no models are cached/discovered.
  const presetIdFor = (providerId: string): string | null =>
    providerId ? (providers.find((p) => p.id === providerId)?.preset_id ?? null) : null;

  // ── Provider models per workspace section ──
  const primaryCustomProviderId = primary.source === "custom" ? primary.providerId : "";
  const suggestionCustomProviderId = suggestions.source === "custom" ? suggestions.providerId : "";
  const { models: primaryProviderModels, loading: primaryProviderModelsLoading, refresh: refreshPrimaryModels } = useProviderModels(workspaceId, primaryCustomProviderId, presetIdFor(primaryCustomProviderId));
  const { models: suggestionProviderModels, loading: suggestionProviderModelsLoading, refresh: refreshSuggestionModels } = useProviderModels(workspaceId, suggestionCustomProviderId, presetIdFor(suggestionCustomProviderId));

  // ── User preferences (primary override) ──
  const [userPrimary, setUserPrimary] = useState<ModelSectionState>(EMPTY_MODEL_STATE);
  const activeUserCopilotId = userPrimary.source === "copilot" ? userPrimary.copilotAccountId : "";
  const { models: userCopilotModels } = useCopilotModels(activeUserCopilotId || undefined);
  const userCustomProviderId = userPrimary.source === "custom" ? userPrimary.providerId : "";
  const { models: userProviderModels, loading: userProviderModelsLoading, refresh: refreshUserModels } = useProviderModels(workspaceId, userCustomProviderId, presetIdFor(userCustomProviderId));

  // ── User preferences (suggestion override) ──
  const [userSuggestion, setUserSuggestion] = useState<ModelSectionState>(EMPTY_MODEL_STATE);
  const activeUserSugCopilotId = userSuggestion.source === "copilot" ? userSuggestion.copilotAccountId : "";
  const { models: userSugCopilotModels } = useCopilotModels(activeUserSugCopilotId || undefined);
  const userSugCustomProviderId = userSuggestion.source === "custom" ? userSuggestion.providerId : "";
  const { models: userSugProviderModels, loading: userSugProviderModelsLoading, refresh: refreshUserSugModels } = useProviderModels(workspaceId, userSugCustomProviderId, presetIdFor(userSugCustomProviderId));

  const [userSaving, setUserSaving] = useState(false);
  const [userSaved, setUserSaved] = useState(false);

  // ── Which user override sub-tab is active ──
  const [userOverrideTab, setUserOverrideTab] = useState<"primary" | "suggestion">("primary");

  // ── Provider wizard state ──
  const [wizardOpen, setWizardOpen] = useState(false);

  // ── Sync workspace defaults when loaded ──
  useEffect(() => {
    if (defaults) {
      setPrimary(deriveSource(defaults, "default"));
      setSuggestions(deriveSource(defaults, "suggestion"));
    }
  }, [defaults]);

  // ── Sync user preferences when loaded ──
  useEffect(() => {
    if (userPreferences) {
      setUserPrimary({
        source: userPreferences.source ?? "copilot",
        copilotAccountId: userPreferences.copilot_account_id ?? "",
        copilotModel: userPreferences.copilot_model ?? "",
        providerId: userPreferences.provider_id ?? "",
        providerModel: userPreferences.provider_model ?? "",
      });
      setUserSuggestion({
        source: userPreferences.suggestion_source ?? "copilot",
        copilotAccountId: userPreferences.suggestion_copilot_account_id ?? "",
        copilotModel: userPreferences.suggestion_copilot_model ?? "",
        providerId: userPreferences.suggestion_provider_id ?? "",
        providerModel: userPreferences.suggestion_provider_model ?? "",
      });
    }
  }, [userPreferences]);

  // ── Save workspace defaults ──
  // Both copilot and custom configs are persisted on every save. The
  // `*_source` field records which one is currently active. We never null
  // out the inactive side — that was the old destructive behavior that made
  // tab selection feel broken.
  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        defaultSource: primary.source,
        defaultCopilotAccountId: primary.copilotAccountId || null,
        defaultCopilotModel: primary.copilotModel || null,
        defaultProviderId: primary.providerId || null,
        defaultProviderModel: primary.providerModel || null,
        suggestionSource: suggestions.source,
        suggestionCopilotAccountId: suggestions.copilotAccountId || null,
        suggestionCopilotModel: suggestions.copilotModel || null,
        suggestionProviderId: suggestions.providerId || null,
        suggestionProviderModel: suggestions.providerModel || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // ── Save user preferences ──
  // Saves both primary and suggestion overrides at once, each with both
  // copilot and custom sides plus its source flag.
  const handleUserPrefSave = async () => {
    if (!onUserPreferenceUpdate) return;
    setUserSaving(true);
    try {
      await onUserPreferenceUpdate({
        source: userPrimary.source,
        copilotAccountId: userPrimary.copilotAccountId || null,
        copilotModel: userPrimary.copilotModel || null,
        providerId: userPrimary.providerId || null,
        providerModel: userPrimary.providerModel || null,
        suggestionSource: userSuggestion.source,
        suggestionCopilotAccountId: userSuggestion.copilotAccountId || null,
        suggestionCopilotModel: userSuggestion.copilotModel || null,
        suggestionProviderId: userSuggestion.providerId || null,
        suggestionProviderModel: userSuggestion.providerModel || null,
      });
      setUserSaved(true);
      setTimeout(() => setUserSaved(false), 2000);
    } finally {
      setUserSaving(false);
    }
  };

  // ── Provider wizard callback ──
  const handleProviderAdded = () => {
    onRefreshProviders?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEnforced = enforcement?.enforce_ai === true;

  return (
    <div className="space-y-5">
      {/* ════════════════════════════════════════════════════════
           How Model Selection Works (admin only)
         ════════════════════════════════════════════════════════ */}
      {isPlatformAdmin && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-blue-300 mb-1">How model selection works</p>
              <ol className="text-[11px] text-blue-300/80 space-y-0.5 list-decimal list-inside">
                <li><strong className="text-blue-200">Enforcement</strong> (Access Control tab) — if active, everyone uses the enforced model. No exceptions.</li>
                <li><strong className="text-blue-200">Personal Override</strong> — each member can pick their own model. Overrides workspace defaults for that member only.</li>
                <li><strong className="text-blue-200">Workspace Defaults</strong> — the fallback for anyone who hasn&apos;t set a personal override.</li>
              </ol>
              <p className="text-[11px] text-blue-300/60 mt-1.5">Higher-numbered rules are only used when the one above isn&apos;t set.</p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           My Personal Override
         ════════════════════════════════════════════════════════ */}
      {onUserPreferenceUpdate && (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/15">
              <User className="h-4 w-4 text-brand-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">My Personal Override</h3>
                <HelpTooltip text="This only changes the AI model for you. It overrides the workspace defaults below. Other workspace members will still use the workspace defaults unless they set their own override. If you don't set anything here, you'll also use the workspace defaults." />
              </div>
              <p className="text-xs text-muted-foreground">
                Override the workspace defaults below for yourself only — other members are not affected
              </p>
            </div>
          </div>

          {isEnforced ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-amber-600/30 bg-amber-600/5 px-4 py-3">
              <Lock className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-sm text-amber-300">
                An enforcement policy is active (see Access Control tab). Personal overrides are locked for all members.
              </p>
            </div>
          ) : (
            <>
              {/* Sub-tab switcher: Primary / Suggestion */}
              <div className="flex gap-1 mb-4 border-b border-border">
                <button
                  onClick={() => setUserOverrideTab("primary")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                    userOverrideTab === "primary"
                      ? "border-brand-500 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Bot className="h-3.5 w-3.5" /> Primary Model
                </button>
                <button
                  onClick={() => setUserOverrideTab("suggestion")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                    userOverrideTab === "suggestion"
                      ? "border-brand-500 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Suggestion Model
                </button>
              </div>

              {/* Primary override fields */}
              {userOverrideTab === "primary" && (
                <div className="mb-4">
                  <InlineConfigFields
                    state={userPrimary}
                    onChange={setUserPrimary}
                    accounts={accounts}
                    providers={providers}
                    copilotModels={userCopilotModels}
                    workspaceId={workspaceId}
                    providerModels={userProviderModels}
                    providerModelsLoading={userProviderModelsLoading}
                    onRefreshModels={refreshUserModels}
                    onAddProviderClick={() => setWizardOpen(true)}
                  />
                </div>
              )}

              {/* Suggestion override fields */}
              {userOverrideTab === "suggestion" && (
                <div className="mb-4">
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Override which model generates quick-action suggestion chips after each AI response.
                  </p>
                  <InlineConfigFields
                    state={userSuggestion}
                    onChange={setUserSuggestion}
                    accounts={accounts}
                    providers={providers}
                    copilotModels={userSugCopilotModels}
                    workspaceId={workspaceId}
                    providerModels={userSugProviderModels}
                    providerModelsLoading={userSugProviderModelsLoading}
                    onRefreshModels={refreshUserSugModels}
                    onAddProviderClick={() => setWizardOpen(true)}
                  />
                </div>
              )}

              <button
                onClick={handleUserPrefSave}
                disabled={userSaving}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
              >
                {userSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : userSaved ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <User className="h-4 w-4" />
                )}
                {userSaved ? "Saved!" : "Save My Override"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           Workspace Defaults Separator
         ════════════════════════════════════════════════════════ */}
      {isPlatformAdmin && onUserPreferenceUpdate && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Workspace Defaults — applies to all members
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           Primary Model — Workspace Default
         ════════════════════════════════════════════════════════ */}
      {isPlatformAdmin && <ModelSection
        title="Primary Model — All Workspace Members"
        description="Default model for code generation, editing, and agent tasks for everyone you've invited to this workspace"
        icon={Bot}
        state={primary}
        onChange={setPrimary}
        accounts={accounts}
        providers={providers}
        copilotModels={primaryCopilotModels}
        helpText="This is the main AI model used for chat, code generation, and editing. It applies to every member you've invited to this workspace — not all users on the platform. If a member has set a personal override (above), their override takes priority over this default."
        workspaceId={workspaceId}
        providerModels={primaryProviderModels}
        providerModelsLoading={primaryProviderModelsLoading}
        onRefreshModels={refreshPrimaryModels}
        onAddProviderClick={() => setWizardOpen(true)}
      />}

      {/* ════════════════════════════════════════════════════════
           Suggestions Model — Workspace Default
         ════════════════════════════════════════════════════════ */}
      {isPlatformAdmin && <ModelSection
        title="Suggestions Model — All Workspace Members"
        description="Lighter model for suggestion chips, used by everyone you've invited to this workspace (saves cost vs primary model)"
        icon={Sparkles}
        state={suggestions}
        onChange={setSuggestions}
        accounts={accounts}
        providers={providers}
        copilotModels={suggestionCopilotModels}
        helpText="Suggestion chips are the quick-action buttons shown after each AI response. This model handles only those suggestions — a lighter, cheaper model works well here. Like the primary model, this applies to every member you've invited to this workspace, not all users on the platform."
        workspaceId={workspaceId}
        providerModels={suggestionProviderModels}
        providerModelsLoading={suggestionProviderModelsLoading}
        onRefreshModels={refreshSuggestionModels}
        onAddProviderClick={() => setWizardOpen(true)}
      />}

      {isPlatformAdmin && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
          {saved ? "Saved!" : "Save Configuration"}
        </button>
      )}

      {/* ════════════════════════════════════════════════════════
           Provider Wizard Dialog (inline add provider)
         ════════════════════════════════════════════════════════ */}
      <ProviderWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        workspaceId={workspaceId}
        onProviderAdded={handleProviderAdded}
        isWorkspaceAdmin={isPlatformAdmin}
      />
    </div>
  );
}
