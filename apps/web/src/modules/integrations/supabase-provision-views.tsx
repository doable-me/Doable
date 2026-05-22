"use client";

import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  SupabaseOrganization,
  ExistingSupabaseProject,
  ProvisionPhase,
  DialogMode,
} from "./supabase-provision-types";
import { SUPABASE_REGIONS } from "./supabase-provision-types";

// ─── OAuth required section ─────────────────────────────────

export function OAuthRequiredSection({
  signingIn,
  signInError,
  onSignIn,
}: {
  signingIn: boolean;
  signInError: string | null;
  onSignIn: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-4">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-sm">
          Sign in with Supabase so Doable can create projects on your behalf.
          You&apos;ll be redirected briefly to Supabase to authorize, then come
          right back here.
        </p>
      </div>
      <Button onClick={onSignIn} disabled={signingIn} className="w-full">
        {signingIn ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Waiting for Supabase…
          </>
        ) : (
          "Sign in with Supabase"
        )}
      </Button>
      {signInError ? (
        <div className="flex items-start gap-2 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
          <span>{signInError}</span>
        </div>
      ) : null}
    </div>
  );
}

// ─── Existing projects list ─────────────────────────────────

export function ExistingProjectsSection({
  existingProjects,
  connectingExistingRef,
  connectExistingError,
  onConnect,
}: {
  existingProjects: ExistingSupabaseProject[];
  connectingExistingRef: string | null;
  connectExistingError: string | null;
  onConnect: (p: ExistingSupabaseProject) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Pick a project — Doable will fetch its API keys and wire them into this
        app automatically.
      </p>
      <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
        {existingProjects.map((p) => {
          const busy = connectingExistingRef === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onConnect(p)}
              disabled={!!connectingExistingRef}
              className="flex items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/60 hover:bg-muted/50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">
                  {p.name}
                </div>
                {p.meta?.region ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {p.meta.region}
                  </div>
                ) : null}
              </div>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <span className="text-xs text-muted-foreground">Connect</span>
              )}
            </button>
          );
        })}
      </div>
      {connectExistingError ? (
        <div className="flex items-start gap-2 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
          <span>{connectExistingError}</span>
        </div>
      ) : null}
    </div>
  );
}

// ─── Create-new form ────────────────────────────────────────

export function CreateNewFormSection({
  name,
  orgId,
  region,
  orgs,
  submitting,
  progress,
  error,
  existingProjects,
  onNameChange,
  onOrgChange,
  onRegionChange,
}: {
  name: string;
  orgId: string;
  region: string;
  orgs: SupabaseOrganization[] | null;
  submitting: boolean;
  progress: ProvisionPhase[];
  error: string | null;
  existingProjects: ExistingSupabaseProject[] | null;
  onNameChange: (v: string) => void;
  onOrgChange: (v: string) => void;
  onRegionChange: (v: string) => void;
}) {
  return (
    <>
      {existingProjects && existingProjects.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          You don&apos;t have any Supabase projects yet — let&apos;s create your
          first one.
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Project name</label>
        <Input
          value={name}
          placeholder="e.g. My App"
          onChange={(e) => onNameChange(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Supabase organization</label>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={orgId}
          disabled={submitting}
          onChange={(e) => onOrgChange(e.target.value)}
        >
          {(orgs ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Region</label>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={region}
          disabled={submitting}
          onChange={(e) => onRegionChange(e.target.value)}
        >
          {SUPABASE_REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {progress.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3 text-xs">
          {progress.map((p, i) => {
            const isLast = i === progress.length - 1;
            const isDone = p.phase === "done";
            return (
              <div key={`${p.phase}-${i}`} className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : isLast && submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span>{p.message}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}
    </>
  );
}

// ─── Mode toggle ────────────────────────────────────────────

export function ModeToggle({
  mode,
  submitting,
  connectingExistingRef,
  onModeChange,
}: {
  mode: DialogMode;
  submitting: boolean;
  connectingExistingRef: string | null;
  onModeChange: (m: DialogMode) => void;
}) {
  return (
    <div className="flex gap-1 rounded-md bg-muted/40 p-1 text-xs">
      <button
        type="button"
        onClick={() => onModeChange("existing")}
        disabled={submitting || !!connectingExistingRef}
        className={`flex-1 rounded px-3 py-1.5 font-medium transition-colors ${
          mode === "existing"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Connect existing project
      </button>
      <button
        type="button"
        onClick={() => onModeChange("new")}
        disabled={submitting || !!connectingExistingRef}
        className={`flex-1 rounded px-3 py-1.5 font-medium transition-colors ${
          mode === "new"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Create new
      </button>
    </div>
  );
}
