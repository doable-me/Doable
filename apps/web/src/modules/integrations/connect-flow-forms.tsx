"use client";

import { Loader2, ExternalLink, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── OAuth Form ─────────────────────────────────────────────

export function OAuthForm({
  itemName,
  loading,
  onOAuth,
  onCancel,
}: {
  itemName: string;
  loading: boolean;
  onOAuth: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        You&apos;ll be redirected to {itemName} to authorize
        access. A popup window will open for you to sign in.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={onOAuth} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" />
              Sign in with {itemName}
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Secret Text Form ───────────────────────────────────────

export function SecretTextForm({
  itemName,
  apiKey,
  setApiKey,
  displayName,
  setDisplayName,
  showSecret,
  setShowSecret,
  loading,
  onConnect,
  onCancel,
}: {
  itemName: string;
  apiKey: string;
  setApiKey: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  showSecret: boolean;
  setShowSecret: (v: boolean) => void;
  loading: boolean;
  onConnect: () => void;
  onCancel: () => void;
}) {
  return (
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
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Label <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input
          type="text"
          placeholder={`My ${itemName} connection`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={onConnect} disabled={loading || !apiKey.trim()}>
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Connecting...</>
          ) : "Connect"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Basic Auth Form ────────────────────────────────────────

export function BasicAuthForm({
  itemName,
  username,
  setUsername,
  password,
  setPassword,
  displayName,
  setDisplayName,
  showSecret,
  setShowSecret,
  loading,
  onConnect,
  onCancel,
}: {
  itemName: string;
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  showSecret: boolean;
  setShowSecret: (v: boolean) => void;
  loading: boolean;
  onConnect: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <label className="text-sm font-medium">Username</label>
        <Input type="text" placeholder="Enter username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
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
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Label <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input type="text" placeholder={`My ${itemName} connection`} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={onConnect} disabled={loading || !username.trim() || !password.trim()}>
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Connecting...</>
          ) : "Connect"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Custom Auth Form ───────────────────────────────────────

export function CustomAuthForm({
  item,
  apiKey,
  setApiKey,
  customFields,
  setCustomField,
  displayName,
  setDisplayName,
  showSecret,
  setShowSecret,
  loading,
  isValid,
  onConnect,
  onCancel,
}: {
  item: { displayName: string; customAuthFields?: Array<{ name: string; displayName: string; description?: string; type?: string; required?: boolean; options?: Array<{ value: string; label: string }> }> };
  apiKey: string;
  setApiKey: (v: string) => void;
  customFields: Record<string, string>;
  setCustomField: (name: string, value: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  showSecret: boolean;
  setShowSecret: (v: boolean) => void;
  loading: boolean;
  isValid: boolean;
  onConnect: () => void;
  onCancel: () => void;
}) {
  const fields = item.customAuthFields ?? [];

  return (
    <div className="space-y-4 py-2">
      {fields.length > 0 ? (
        fields.map((field) => (
          <div key={field.name} className="space-y-2">
            <label className="text-sm font-medium">
              {field.displayName}
              {!field.required && (
                <span className="text-muted-foreground font-normal ml-1">(optional)</span>
              )}
            </label>
            {field.description && (
              <p className="text-xs text-muted-foreground -mt-1">{field.description}</p>
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
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : field.type === "secret" ? (
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder={`Enter ${field.displayName.toLowerCase()}`}
                  value={customFields[field.name] ?? ""}
                  onChange={(e) => setCustomField(field.name, e.target.value)}
                  className="pr-10"
                  autoFocus={field === fields.find((f) => f.required)}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            ) : (
              <Input
                type="text"
                placeholder={`Enter ${field.displayName.toLowerCase()}`}
                value={customFields[field.name] ?? ""}
                onChange={(e) => setCustomField(field.name, e.target.value)}
                autoFocus={field === fields.find((f) => f.required)}
              />
            )}
          </div>
        ))
      ) : (
        <div className="space-y-2">
          <label className="text-sm font-medium">Authentication Token</label>
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
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Label <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input
          type="text"
          placeholder={`My ${item.displayName} connection`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={onConnect} disabled={loading || !isValid}>
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Connecting...</>
          ) : "Connect"}
        </Button>
      </DialogFooter>
    </div>
  );
}
