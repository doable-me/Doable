"use client";

import { useState, useMemo } from "react";
import {
  Key,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  AlertTriangle,
  Check,
  Copy,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { CatalogItem, CustomAuthField } from "./use-integration-catalog";

// ─── Public Types ───────────────────────────────────────────

export interface ExistingCredentialHint {
  /** Where the existing credential is stored */
  source: "oauth_apps" | "platform_credentials" | "env";
  /** Masked tail (e.g. last 4 chars) of the existing client_id / api key for display only */
  displayHint?: string;
  /** Human-readable source label for env vars (e.g. "GOOGLE_CLIENT_ID") */
  envSource?: string;
}

export interface SetupGuide {
  consoleUrl?: string;
  steps?: string[];
  requiredScopes?: string[];
  troubleshooting?: string[];
}

export interface IntegrationConfigFormProps {
  item: Pick<
    CatalogItem,
    "id" | "displayName" | "description" | "authType" | "customAuthFields"
  >;
  /** When true, credentials are saved globally; when false, scoped to the workspace */
  isPlatformMode: boolean;
  /** Required when isPlatformMode === false */
  workspaceId?: string;
  /** Set if a credential already exists — UI shows "replace" affordance instead of "create" */
  existing?: ExistingCredentialHint;
  /** Optional per-provider setup guide (deeplink + steps). */
  setupGuide?: SetupGuide;
  /** Called after successful save so the parent can refetch + close */
  onSaved: () => void;
  /** Called on Cancel / dismiss */
  onCancel: () => void;
}

// ─── Test Connection Button ──────────────────────────────────

function TestConnectionButton({ integrationId, disabled }: { integrationId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string; error?: string }>(
        "/integrations/admin/test",
        { method: "POST", body: JSON.stringify({ integrationId }) },
      );
      setResult({ ok: res.ok, message: res.ok ? (res.message ?? "OK") : (res.error ?? "Failed") });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button onClick={run} disabled={busy || disabled} className={btnSecondaryFilled}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
        Test connection
      </button>
      {result && (
        <span className={cn("text-xs", result.ok ? "text-green-600" : "text-red-600")}>
          {result.ok ? "✓" : "✗"} {result.message}
        </span>
      )}
    </div>
  );
}

// ─── Main Polymorphic Form ──────────────────────────────────

export function IntegrationConfigForm(props: IntegrationConfigFormProps) {
  const { item } = props;

  if (item.authType === "none") {
    return (
      <div className="text-sm text-muted-foreground p-4">
        {item.displayName} doesn&apos;t need configuration. Just enable it.
      </div>
    );
  }

  if (item.authType === "oauth2") {
    return <OAuthAppForm {...props} />;
  }

  return <NonOAuthCredentialForm {...props} />;
}

// ─── Per-Provider Help Blurb (driven by `setupGuide` prop) ──

function ProviderHelpBlurb({ authType, setupGuide }: { authType: string; setupGuide?: SetupGuide }) {
  if (!setupGuide || (!setupGuide.consoleUrl && (!setupGuide.steps || setupGuide.steps.length === 0))) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Get your {authType === "oauth2" ? "OAuth client_id + client_secret" : "credentials"} from the provider&apos;s developer console, then paste them below.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md bg-muted/40 border p-3 text-xs space-y-2">
      {setupGuide.consoleUrl && (
        <a
          href={setupGuide.consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
        >
          <ExternalLink className="h-3 w-3" />
          Open provider console
        </a>
      )}
      {setupGuide.steps && setupGuide.steps.length > 0 && (
        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
          {setupGuide.steps.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      )}
      {setupGuide.requiredScopes && setupGuide.requiredScopes.length > 0 && (
        <div className="text-muted-foreground">
          <span className="font-medium text-foreground">Required scopes:</span>{" "}
          <span className="font-mono text-[11px]">{setupGuide.requiredScopes.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

// ─── OAuth App Form (Platform Admin enters client_id + client_secret) ──

function OAuthAppForm({
  item,
  isPlatformMode,
  workspaceId,
  existing,
  setupGuide,
  onSaved,
  onCancel,
}: IntegrationConfigFormProps) {
  // Per-mount unique form name so each open instance gets a distinct form
  // boundary — prevents Chrome from grouping multiple configure forms into
  // one synthetic login form.
  const [formName] = useState(() => `int-cfg-oauth-${item.id}-${Math.random().toString(36).slice(2, 8)}`);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const redirectUri = useMemo(() => {
    if (typeof window === "undefined") return "/integrations/oauth/callback";
    return `${window.location.origin.replace(/:\d+$/, ":4000")}/integrations/oauth/callback`;
  }, []);

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API not available; user can select-copy manually
    }
  };

  const submit = async () => {
    setError(null);
    if (!clientId.trim() || !clientSecret.trim()) {
      setError("Client ID and Client Secret are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = isPlatformMode
        ? { isGlobal: true, integrationId: item.id, clientId: clientId.trim(), clientSecret }
        : { workspaceId, integrationId: item.id, clientId: clientId.trim(), clientSecret };
      await apiFetch("/integrations/admin/oauth-apps", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // Also flip the enabled flag so the row immediately becomes CONFIGURED.
      const enablePayload = isPlatformMode
        ? { integrationId: item.id, enabled: true }
        : { workspaceId, integrationId: item.id, enabled: true };
      await apiFetch(
        isPlatformMode ? "/integrations/admin/platform-enabled" : "/integrations/admin/enabled",
        { method: "POST", body: JSON.stringify(enablePayload) },
      ).catch(() => { /* already enabled is fine */ });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      name={formName}
      autoComplete="off"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      className="space-y-4"
    >
      {/* Honeypot inputs — Chrome/Safari/password managers see these first
          and target them with autofill instead of the real credential fields
          and the catalog search input. They're positioned off-screen + tab
          excluded so users never see or focus them. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
        <input type="text" name="username" tabIndex={-1} autoComplete="username" defaultValue="" />
        <input type="password" name="password" tabIndex={-1} autoComplete="current-password" defaultValue="" />
      </div>

      <ProviderHelpBlurb authType="oauth2" setupGuide={setupGuide} />

      <div className="flex items-start gap-2 rounded-md bg-muted/40 border p-3 text-xs">
        <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <div className="text-foreground font-medium mb-1">Set this Redirect URI in the provider console:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border bg-background px-2 py-1 font-mono text-[11px]">
              {redirectUri}
            </code>
            <button
              type="button"
              onClick={copyRedirect}
              className="rounded-md border px-2 py-1 hover:bg-muted transition-colors flex items-center gap-1"
            >
              {copied ? (
                <><Check className="h-3 w-3 text-green-600" /> Copied</>
              ) : (
                <><Copy className="h-3 w-3" /> Copy</>
              )}
            </button>
          </div>
        </div>
      </div>

      {existing && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5 text-xs text-blue-700 dark:text-blue-400">
          {existing.source === "env" ? (
            <>Currently configured via <code className="font-mono">{existing.envSource}</code> env var. Saving here will override that with a DB-stored credential.</>
          ) : (
            <>Currently configured{existing.displayHint ? ` (Client ID: ${existing.displayHint})` : ""}. Submitting will replace the existing credential.</>
          )}
        </div>
      )}

      <FieldLabel>Client ID</FieldLabel>
      <input
        type="text"
        name={`${formName}-client-id`}
        autoFocus
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        placeholder="OAuth Client ID from provider console"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        className={inputClass}
      />

      <FieldLabel>Client Secret</FieldLabel>
      <SecretInput
        name={`${formName}-client-secret`}
        value={clientSecret}
        onChange={setClientSecret}
        show={showSecret}
        setShow={setShowSecret}
        placeholder="OAuth Client Secret"
      />

      {error && <FormError>{error}</FormError>}

      <FormActions>
        {existing && <TestConnectionButton integrationId={item.id} disabled={saving} />}
        <div className="flex-1" />
        <button type="button" onClick={onCancel} disabled={saving} className={btnSecondary}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !clientId.trim() || !clientSecret.trim()}
          className={btnPrimary}
        >
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving</> : <><Key className="h-3 w-3" /> Save Credentials</>}
        </button>
      </FormActions>
    </form>
  );
}

// ─── Non-OAuth Credential Form (secret_text, basic_auth, custom_auth) ──

function NonOAuthCredentialForm({
  item,
  isPlatformMode,
  workspaceId,
  existing,
  setupGuide,
  onSaved,
  onCancel,
}: IntegrationConfigFormProps) {
  const [formName] = useState(() => `int-cfg-cred-${item.id}-${Math.random().toString(36).slice(2, 8)}`);
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields: CustomAuthField[] = item.customAuthFields ?? [];

  const isValid = (() => {
    if (item.authType === "secret_text") return apiKey.trim().length > 0;
    if (item.authType === "basic_auth") return username.trim().length > 0 && password.trim().length > 0;
    if (item.authType === "custom_auth") {
      if (fields.length === 0) return apiKey.trim().length > 0;
      return fields
        .filter((f) => f.required)
        .every((f) => (custom[f.name] ?? "").trim().length > 0);
    }
    return false;
  })();

  const submit = async () => {
    setError(null);
    if (!isValid) return;
    setSaving(true);
    try {
      let credentials: Record<string, unknown>;
      let displayHint: string | undefined;
      if (item.authType === "secret_text") {
        credentials = { apiKey: apiKey.trim() };
        displayHint = apiKey.trim().slice(-4);
      } else if (item.authType === "basic_auth") {
        credentials = { username: username.trim(), password };
        displayHint = username.trim();
      } else {
        credentials = fields.length > 0 ? { ...custom } : { token: apiKey.trim() };
        const firstField = fields.find((f) => f.type !== "secret" && custom[f.name]);
        displayHint = firstField ? custom[firstField.name]?.slice(0, 24) : undefined;
      }
      if (!isPlatformMode) {
        setError("Workspace-scoped non-OAuth credentials are not supported yet from this admin form.");
        setSaving(false);
        return;
      }
      await apiFetch("/integrations/admin/credentials", {
        method: "POST",
        body: JSON.stringify({
          integrationId: item.id,
          authType: item.authType,
          credentials,
          displayHint,
        }),
      });
      await apiFetch("/integrations/admin/platform-enabled", {
        method: "POST",
        body: JSON.stringify({ integrationId: item.id, enabled: true }),
      }).catch(() => { /* already enabled is fine */ });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      name={formName}
      autoComplete="off"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      className="space-y-4"
    >
      {/* Honeypot inputs absorb password-manager autofill before it reaches
          the real fields or the catalog search above. Off-screen + untabable. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
        <input type="text" name="username" tabIndex={-1} autoComplete="username" defaultValue="" />
        <input type="password" name="password" tabIndex={-1} autoComplete="current-password" defaultValue="" />
      </div>

      <ProviderHelpBlurb authType={item.authType} setupGuide={setupGuide} />

      {existing && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5 text-xs text-blue-700 dark:text-blue-400">
          Currently configured{existing.displayHint ? ` (…${existing.displayHint})` : ""}. Submitting will replace the existing credential.
        </div>
      )}

      {item.authType === "secret_text" && (
        <>
          <FieldLabel>API Key</FieldLabel>
          <SecretInput
            name={`${formName}-api-key`}
            value={apiKey}
            onChange={setApiKey}
            show={showSecret}
            setShow={setShowSecret}
            placeholder={`Paste your ${item.displayName} API key`}
            autoFocus
          />
        </>
      )}

      {item.authType === "basic_auth" && (
        <>
          <FieldLabel>Username</FieldLabel>
          <input
            type="text"
            name={`${formName}-username`}
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            className={inputClass}
          />
          <FieldLabel>Password</FieldLabel>
          <SecretInput
            name={`${formName}-password`}
            value={password}
            onChange={setPassword}
            show={showSecret}
            setShow={setShowSecret}
            placeholder="Password"
          />
        </>
      )}

      {item.authType === "custom_auth" && (
        fields.length === 0 ? (
          <>
            <FieldLabel>Authentication Token</FieldLabel>
            <SecretInput
              name={`${formName}-token`}
              value={apiKey}
              onChange={setApiKey}
              show={showSecret}
              setShow={setShowSecret}
              placeholder="Authentication token"
              autoFocus
            />
          </>
        ) : (
          fields.map((field, idx) => (
            <div key={field.name} className="space-y-1.5">
              <FieldLabel>
                {field.displayName}
                {!field.required && <span className="text-muted-foreground font-normal ml-1">(optional)</span>}
              </FieldLabel>
              {field.description && (
                <p className="text-[11px] text-muted-foreground -mt-1">{field.description}</p>
              )}
              {field.type === "dropdown" && field.options ? (
                <select
                  name={`${formName}-${field.name}`}
                  value={custom[field.name] ?? ""}
                  onChange={(e) => setCustom({ ...custom, [field.name]: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Select…</option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : field.type === "secret" ? (
                <SecretInput
                  name={`${formName}-${field.name}`}
                  value={custom[field.name] ?? ""}
                  onChange={(v) => setCustom({ ...custom, [field.name]: v })}
                  show={showSecret}
                  setShow={setShowSecret}
                  placeholder={`Enter ${field.displayName.toLowerCase()}`}
                  autoFocus={idx === 0}
                />
              ) : (
                <input
                  type="text"
                  name={`${formName}-${field.name}`}
                  value={custom[field.name] ?? ""}
                  onChange={(e) => setCustom({ ...custom, [field.name]: e.target.value })}
                  placeholder={`Enter ${field.displayName.toLowerCase()}`}
                  autoFocus={idx === 0}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  className={inputClass}
                />
              )}
            </div>
          ))
        )
      )}

      {error && <FormError>{error}</FormError>}

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3 w-3" />
        Secrets are encrypted at rest. Only platform admins can see configuration status.
      </div>

      <FormActions>
        {existing && <TestConnectionButton integrationId={item.id} disabled={saving} />}
        <div className="flex-1" />
        <button type="button" onClick={onCancel} disabled={saving} className={btnSecondary}>
          Cancel
        </button>
        <button type="submit" disabled={saving || !isValid} className={btnPrimary}>
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving</> : <><Key className="h-3 w-3" /> Save Credentials</>}
        </button>
      </FormActions>
    </form>
  );
}

// ─── Reusable inputs / labels ───────────────────────────────

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const btnPrimary = "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors";
const btnSecondary = "rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors";
const btnSecondaryFilled = "inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50 transition-colors";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-foreground">{children}</label>;
}

function SecretInput({
  value,
  onChange,
  show,
  setShow,
  placeholder,
  autoFocus,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  placeholder: string;
  autoFocus?: boolean;
  name?: string;
}) {
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        name={name ?? `int-secret-${Math.random().toString(36).slice(2, 8)}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(inputClass, "pr-10 font-mono")}
        // "new-password" tells Chrome this is a NEW credential being entered,
        // not a saved one to autofill. Combined with the unique name= and the
        // ancestor <form autoComplete="off">, this prevents the credential
        // manager from treating the panel as a login form and autofilling
        // the catalog search input. See also: data-1p-ignore, data-lpignore.
        autoComplete="new-password"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-red-600">{children}</div>;
}

function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 pt-1">{children}</div>;
}
