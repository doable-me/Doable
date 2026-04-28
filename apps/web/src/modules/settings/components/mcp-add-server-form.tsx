"use client";

import { useState, useCallback, useRef } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  X,
  AlertCircle,
  Terminal,
  Radio,
  Globe,
  Search,
  CheckCircle2,
  Wrench,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TRANSPORT_LABELS,
  type McpConnector,
  type CreateConnectorPayload,
  type DiscoveryResult,
  type McpTool,
} from "../hooks/use-mcp-connectors";

export function AddServerForm({
  onSubmit,
  onCancel,
  onDiscover,
}: {
  onSubmit: (payload: CreateConnectorPayload) => Promise<void>;
  onCancel: () => void;
  onDiscover?: (url: string) => Promise<DiscoveryResult>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transportType, setTransportType] = useState<McpConnector["transport_type"]>("streamable_http");
  const [serverUrl, setServerUrl] = useState("");
  const [serverCommand, setServerCommand] = useState("");
  const [serverArgs, setServerArgs] = useState("");
  const [authType, setAuthType] = useState<"none" | "api_key" | "bearer_token" | "oauth2">("none");
  const [bearerToken, setBearerToken] = useState("");
  const [apiKeyHeader, setApiKeyHeader] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [envPairs, setEnvPairs] = useState<Array<{ key: string; value: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discovery state
  const [discovering, setDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);
  const [discoveredUrl, setDiscoveredUrl] = useState("");
  const discoverDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isHttp = transportType !== "stdio";

  const addEnvPair = useCallback(() => {
    setEnvPairs((prev) => [...prev, { key: "", value: "" }]);
  }, []);
  const updateEnvPair = useCallback((index: number, field: "key" | "value", value: string) => {
    setEnvPairs((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }, []);
  const removeEnvPair = useCallback((index: number) => {
    setEnvPairs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Trigger discovery when user enters a URL */
  const handleUrlChange = useCallback((value: string) => {
    setServerUrl(value);
    setError(null);

    // Auto-discover for HTTP transports
    if (!onDiscover || transportType === "stdio") return;

    // Clear pending debounce
    if (discoverDebounce.current) clearTimeout(discoverDebounce.current);
    setDiscoveryResult(null);

    // Validate URL before probing
    try {
      new URL(value);
    } catch {
      return; // Not a valid URL yet
    }

    // Debounce the discovery call
    discoverDebounce.current = setTimeout(async () => {
      setDiscovering(true);
      setDiscoveredUrl(value);
      try {
        const result = await onDiscover(value);
        setDiscoveryResult(result);

        // Auto-fill fields from discovery
        if (result.success) {
          if (result.name && !name) setName(result.name);
          if (result.description && !description) setDescription(result.description);
          if (result.transportType) setTransportType(result.transportType);
          if (result.authType) setAuthType(result.authType);
          if (result.mcpEndpointUrl && result.mcpEndpointUrl !== value) {
            setServerUrl(result.mcpEndpointUrl);
          }
        }
      } catch {
        // Ignore discovery errors — user can still add manually
      } finally {
        setDiscovering(false);
      }
    }, 800);
  }, [onDiscover, transportType, name, description]);

  /** Manual discover button */
  const handleManualDiscover = useCallback(async () => {
    if (!onDiscover || !serverUrl.trim()) return;

    try {
      new URL(serverUrl);
    } catch {
      setError("Enter a valid URL to discover");
      return;
    }

    setDiscovering(true);
    setError(null);
    setDiscoveredUrl(serverUrl);
    try {
      const result = await onDiscover(serverUrl);
      setDiscoveryResult(result);
      if (result.success) {
        if (result.name && !name) setName(result.name);
        if (result.description && !description) setDescription(result.description);
        if (result.transportType) setTransportType(result.transportType);
        if (result.authType) setAuthType(result.authType);
        if (result.mcpEndpointUrl && result.mcpEndpointUrl !== serverUrl) {
          setServerUrl(result.mcpEndpointUrl);
        }
      }
    } catch {
      // Ignore
    } finally {
      setDiscovering(false);
    }
  }, [onDiscover, serverUrl, name, description]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (isHttp && !serverUrl.trim()) { setError("Server URL is required for HTTP transports"); return; }
    if (!isHttp && !serverCommand.trim()) { setError("Command is required for stdio transport"); return; }

    let credentials: Record<string, unknown> | undefined;
    if (authType === "bearer_token" && bearerToken.trim()) {
      credentials = { token: bearerToken.trim() };
    } else if (authType === "api_key" && apiKeyValue.trim()) {
      credentials = { apiKey: apiKeyValue.trim(), ...(apiKeyHeader.trim() ? { header: apiKeyHeader.trim() } : {}) };
    } else if (authType === "oauth2" && accessToken.trim()) {
      credentials = { access_token: accessToken.trim() };
    }

    let serverEnv: Record<string, string> | undefined;
    if (!isHttp) {
      const filtered = envPairs.filter((p) => p.key.trim() && p.value.trim());
      if (filtered.length > 0) {
        serverEnv = Object.fromEntries(filtered.map((p) => [p.key.trim(), p.value.trim()]));
      }
    }

    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        transportType,
        scope: "workspace",
        serverUrl: isHttp ? serverUrl.trim() : undefined,
        serverCommand: !isHttp ? serverCommand.trim() : undefined,
        serverArgs: !isHttp && serverArgs.trim()
          ? serverArgs.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        authType,
        credentials,
        serverEnv,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add server");
    } finally {
      setSaving(false);
    }
  }, [name, description, transportType, serverUrl, serverCommand, serverArgs, authType, bearerToken, apiKeyHeader, apiKeyValue, accessToken, envPairs, isHttp, onSubmit]);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Add MCP Server</h3>
        <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Transport type first — determines the URL vs command flow */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Transport Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(TRANSPORT_LABELS) as [McpConnector["transport_type"], { label: string; description: string }][]).map(([key, val]) => (
              <button
                key={key}
                onClick={() => { setTransportType(key); setDiscoveryResult(null); }}
                className={cn("rounded-lg border p-3 text-left transition-colors", transportType === key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {key === "stdio" ? <Terminal className="h-3.5 w-3.5" /> : key === "http_sse" ? <Radio className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                  <span className="text-xs font-medium">{val.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">{val.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* URL with auto-discovery for HTTP transports */}
        {isHttp && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Server URL *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://mcp.example.com/v1"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring pr-8"
                />
                {discovering && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {!discovering && discoveryResult?.success && (
                  <CheckCircle2 className="absolute right-2.5 top-2.5 h-4 w-4 text-emerald-500" />
                )}
              </div>
              {onDiscover && (
                <button
                  type="button"
                  onClick={() => void handleManualDiscover()}
                  disabled={discovering || !serverUrl.trim()}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                  title="Discover server capabilities"
                >
                  {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Discover
                </button>
              )}
            </div>

            {/* Discovery results banner */}
            {discoveryResult && (
              <DiscoveryBanner result={discoveryResult} />
            )}
          </div>
        )}

        {/* stdio fields */}
        {!isHttp && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Command *</label>
              <input type="text" value={serverCommand} onChange={(e) => setServerCommand(e.target.value)} placeholder="npx -y @modelcontextprotocol/server-filesystem" className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Arguments (comma-separated)</label>
              <input type="text" value={serverArgs} onChange={(e) => setServerArgs(e.target.value)} placeholder="/path/to/dir, --verbose" className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My MCP Server" className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          {discoveryResult?.success && discoveryResult.name && !name && (
            <p className="text-[10px] text-muted-foreground">
              Auto-detected: <span className="font-medium">{discoveryResult.name}</span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this server provide?" className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Authentication</label>
          <div className="flex flex-wrap gap-2">
            {([["none", "None"], ["api_key", "API Key"], ["bearer_token", "Bearer Token"], ["oauth2", "OAuth Token"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setAuthType(key)} className={cn("rounded-md border px-3 py-1.5 text-xs font-medium transition-colors", authType === key ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted/50")}>
                {label}
              </button>
            ))}
          </div>
          {discoveryResult?.success && discoveryResult.authType && discoveryResult.authType !== "none" && (
            <p className="text-[10px] text-muted-foreground">
              Server requires: <span className="font-medium capitalize">{discoveryResult.authType.replace("_", " ")}</span>
            </p>
          )}
        </div>

        {authType === "bearer_token" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Bearer Token</label>
            <input type="password" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="Token sent as Authorization: Bearer ..." autoComplete="off" className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
          </div>
        )}

        {authType === "api_key" && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Header Name</label>
              <input type="text" value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} placeholder="X-API-Key (default)" className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">API Key</label>
              <input type="password" value={apiKeyValue} onChange={(e) => setApiKeyValue(e.target.value)} placeholder="Sent as the header value" autoComplete="off" className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </>
        )}

        {authType === "oauth2" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Access Token</label>
            <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="OAuth access token (manual entry)" autoComplete="off" className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
          </div>
        )}

        {!isHttp && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Environment Variables</label>
              <button type="button" onClick={addEnvPair} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            {envPairs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Optional. Passed to the stdio process via its environment.</p>
            ) : (
              <div className="space-y-2">
                {envPairs.map((pair, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={pair.key} onChange={(e) => updateEnvPair(i, "key", e.target.value)} placeholder="KEY" className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
                    <input type="password" value={pair.value} onChange={(e) => updateEnvPair(i, "value", e.target.value)} placeholder="value" autoComplete="off" className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring" />
                    <button type="button" onClick={() => removeEnvPair(i)} className="rounded-md px-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button onClick={() => void handleSubmit()} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Server
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Discovery Banner ───────────────────────────────────────

function DiscoveryBanner({ result }: { result: DiscoveryResult }) {
  if (!result.success) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 text-xs">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
        <div>
          <p className="font-medium text-amber-800 dark:text-amber-300">Server not auto-detected</p>
          <p className="text-amber-700 dark:text-amber-400 mt-0.5">{result.error ?? "You can still add it manually — fill in the details below."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs">
        <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <span className="font-medium text-emerald-800 dark:text-emerald-300">
          Server discovered
          {result.method === "server-card" && " via Server Card"}
          {result.method === "mcp-probe" && " via MCP handshake"}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* Server info */}
        {result.serverCard?.serverInfo && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {result.serverCard.serverInfo.name && (
              <span className="text-emerald-700 dark:text-emerald-400">
                <span className="text-muted-foreground">Name:</span> {result.serverCard.serverInfo.name}
                {result.serverCard.serverInfo.version && ` v${result.serverCard.serverInfo.version}`}
              </span>
            )}
            {result.serverCard.serverInfo.homepage && (
              <a
                href={result.serverCard.serverInfo.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-emerald-600 hover:underline"
              >
                Homepage <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        )}

        {/* Capabilities */}
        {result.serverCard?.capabilities && (
          <div className="flex flex-wrap gap-1.5">
            {result.serverCard.capabilities.tools && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                <Wrench className="h-2.5 w-2.5" /> Tools
              </span>
            )}
            {result.serverCard.capabilities.resources && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                Resources
              </span>
            )}
            {result.serverCard.capabilities.prompts && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-300">
                Prompts
              </span>
            )}
          </div>
        )}

        {/* Discovered tools */}
        {result.tools && result.tools.length > 0 && (
          <div className="mt-1.5">
            <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 mb-1">
              {result.toolCount ?? result.tools.length} tools available:
            </p>
            <div className="flex flex-wrap gap-1">
              {result.tools.slice(0, 12).map((tool) => (
                <span
                  key={tool.name}
                  className="inline-flex items-center rounded bg-white dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 text-[10px] font-mono text-emerald-800 dark:text-emerald-300"
                  title={tool.description ?? tool.name}
                >
                  {tool.name}
                </span>
              ))}
              {result.tools.length > 12 && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  +{result.tools.length - 12} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Auth requirement hint */}
        {result.authType && result.authType !== "none" && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
            ⚠ This server requires <span className="font-medium capitalize">{result.authType.replace("_", " ")}</span> authentication
          </p>
        )}
      </div>
    </div>
  );
}
