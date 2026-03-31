"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, ExternalLink, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUTH_LABELS, type CatalogItem } from "./use-integration-catalog";

// ─── Connect Flow Dialog ───────────────────────────────────

interface ConnectFlowProps {
  item: CatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (
    integrationId: string,
    data: {
      scope?: string;
      credentials?: Record<string, unknown>;
      displayName?: string;
      projectId?: string;
    }
  ) => Promise<unknown>;
  onGetAuthorizationUrl: (
    integrationId: string,
    scope?: string
  ) => Promise<string>;
  projectId?: string;
}

export function ConnectFlow({
  item,
  open,
  onOpenChange,
  onConnect,
  onGetAuthorizationUrl,
  projectId,
}: ConnectFlowProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for different auth types
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // Dynamic form state for custom_auth fields
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  // Reset state when dialog opens/closes or item changes
  useEffect(() => {
    if (open) {
      setApiKey("");
      setUsername("");
      setPassword("");
      setDisplayName("");
      setError(null);
      setLoading(false);
      setShowSecret(false);
      setCustomFields({});
    }
  }, [open, item?.id]);

  // Auto-connect for "none" auth type
  useEffect(() => {
    if (open && item?.authType === "none") {
      void handleNoAuthConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.authType]);

  const handleNoAuthConnect = useCallback(async () => {
    if (!item) return;
    setLoading(true);
    setError(null);
    try {
      await onConnect(item.id, { credentials: {}, projectId });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, [item, onConnect, onOpenChange, projectId]);

  const handleOAuth = useCallback(async () => {
    if (!item) return;
    setLoading(true);
    setError(null);
    try {
      const url = await onGetAuthorizationUrl(item.id);
      // Open popup for OAuth
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        url,
        "doable-oauth",
        `width=${width},height=${height},left=${left},top=${top},popup=1`
      );

      if (!popup) {
        setError(
          "Popup was blocked. Please allow popups for this site and try again."
        );
        setLoading(false);
        return;
      }

      // Poll for popup closure
      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer);
          setLoading(false);
          onOpenChange(false);
        }
      }, 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start OAuth flow";
      // Detect "not configured" errors and show a friendly message
      if (
        msg.includes("not configured") ||
        msg.includes("CLIENT_ID") ||
        msg.includes("CLIENT_SECRET") ||
        msg.includes("OAuth app")
      ) {
        setError(
          `OAuth is not set up for ${item.displayName} yet. Ask your workspace admin to configure the OAuth credentials in Settings.`
        );
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }, [item, onGetAuthorizationUrl, onOpenChange]);

  const handleSecretTextConnect = useCallback(async () => {
    if (!item || !apiKey.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onConnect(item.id, {
        credentials: { apiKey: apiKey.trim() },
        displayName: displayName.trim() || undefined,
        projectId,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, [item, apiKey, displayName, onConnect, onOpenChange, projectId]);

  const handleBasicAuthConnect = useCallback(async () => {
    if (!item || !username.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onConnect(item.id, {
        credentials: { username: username.trim(), password: password.trim() },
        displayName: displayName.trim() || undefined,
        projectId,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, [item, username, password, displayName, onConnect, onOpenChange, projectId]);

  const handleCustomAuthConnect = useCallback(async () => {
    if (!item) return;

    // Validate all required fields are filled
    const fields = item.customAuthFields ?? [];
    const credentials: Record<string, string> = {};
    for (const field of fields) {
      const value = customFields[field.name]?.trim() ?? "";
      if (field.required && !value) return;
      if (value) credentials[field.name] = value;
    }

    // If there are no defined fields, fall back to the single apiKey field
    if (fields.length === 0) {
      if (!apiKey.trim()) return;
      credentials.token = apiKey.trim();
    }

    setLoading(true);
    setError(null);
    try {
      await onConnect(item.id, {
        credentials,
        displayName: displayName.trim() || undefined,
        projectId,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, [item, customFields, apiKey, displayName, onConnect, onOpenChange, projectId]);

  // Helper: check if custom auth form is valid
  const isCustomAuthValid = useCallback(() => {
    if (!item) return false;
    const fields = item.customAuthFields ?? [];
    if (fields.length === 0) return apiKey.trim().length > 0;
    return fields.every(
      (f) => !f.required || (customFields[f.name]?.trim() ?? "").length > 0
    );
  }, [item, customFields, apiKey]);

  // Helper: update a custom field value
  const setCustomField = useCallback((name: string, value: string) => {
    setCustomFields((prev) => ({ ...prev, [name]: value }));
  }, []);

  if (!item) return null;

  const authLabel = AUTH_LABELS[item.authType] ?? item.authType;

  // "none" auth type shows a simple connecting state
  if (item.authType === "none") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            {loading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Connecting to {item.displayName}...
                </p>
              </>
            ) : error ? (
              <>
                <p className="text-sm text-red-600">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleNoAuthConnect()}
                >
                  Try Again
                </Button>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0 overflow-hidden">
              {item.logoUrl ? (
                <img
                  src={item.logoUrl}
                  alt={item.displayName}
                  className="h-6 w-6 object-contain"
                />
              ) : (
                <span className="text-sm font-bold text-muted-foreground">
                  {item.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <DialogTitle>Connect {item.displayName}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {authLabel}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Error */}
        {error && (
          <div className={cn(
            "rounded-md border px-3 py-2 text-xs",
            error.includes("not set up") || error.includes("OAuth")
              ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
              : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-600"
          )}>
            {(error.includes("not set up") || error.includes("OAuth")) && (
              <ShieldAlert className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
            )}
            {error}
          </div>
        )}

        {/* OAuth2 */}
        {item.authType === "oauth2" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              You&apos;ll be redirected to {item.displayName} to authorize
              access. A popup window will open for you to sign in.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleOAuth()} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Sign in with {item.displayName}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Secret Text (API Key) */}
        {item.authType === "secret_text" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder="Enter your API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Label{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <Input
                type="text"
                placeholder={`My ${item.displayName} connection`}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleSecretTextConnect()}
                disabled={loading || !apiKey.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Basic Auth */}
        {item.authType === "basic_auth" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Username</label>
              <Input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Label{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <Input
                type="text"
                placeholder={`My ${item.displayName} connection`}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleBasicAuthConnect()}
                disabled={
                  loading || !username.trim() || !password.trim()
                }
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Custom Auth — dynamic fields from customAuthFields */}
        {item.authType === "custom_auth" && (
          <div className="space-y-4 py-2">
            {/* Render defined custom fields */}
            {(item.customAuthFields ?? []).length > 0 ? (
              (item.customAuthFields ?? []).map((field) => (
                <div key={field.name} className="space-y-2">
                  <label className="text-sm font-medium">
                    {field.displayName}
                    {!field.required && (
                      <span className="text-muted-foreground font-normal ml-1">
                        (optional)
                      </span>
                    )}
                  </label>
                  {field.description && (
                    <p className="text-xs text-muted-foreground -mt-1">
                      {field.description}
                    </p>
                  )}
                  {field.type === "dropdown" && field.options ? (
                    <select
                      value={customFields[field.name] ?? ""}
                      onChange={(e) => setCustomField(field.name, e.target.value)}
                      className={cn(
                        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
                        "shadow-xs transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      )}
                    >
                      <option value="">Select...</option>
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "secret" ? (
                    <div className="relative">
                      <Input
                        type={showSecret ? "text" : "password"}
                        placeholder={`Enter ${field.displayName.toLowerCase()}`}
                        value={customFields[field.name] ?? ""}
                        onChange={(e) =>
                          setCustomField(field.name, e.target.value)
                        }
                        className="pr-10"
                        autoFocus={
                          field ===
                          (item.customAuthFields ?? []).find((f) => f.required)
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showSecret ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <Input
                      type="text"
                      placeholder={`Enter ${field.displayName.toLowerCase()}`}
                      value={customFields[field.name] ?? ""}
                      onChange={(e) =>
                        setCustomField(field.name, e.target.value)
                      }
                      autoFocus={
                        field ===
                        (item.customAuthFields ?? []).find((f) => f.required)
                      }
                    />
                  )}
                </div>
              ))
            ) : (
              /* Fallback: single token field when no customAuthFields defined */
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Authentication Token
                </label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    placeholder="Enter your authentication token"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSecret ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Label{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <Input
                type="text"
                placeholder={`My ${item.displayName} connection`}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCustomAuthConnect()}
                disabled={loading || !isCustomAuthValid()}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
