import type { EnhancedAuthModule } from "./types.js";
import type { EnhancedAuthResource } from "../types.js";

const SUPABASE_MGMT_API = "https://api.supabase.com";

const supabaseModule: EnhancedAuthModule = {
  async listResources(accessToken: string): Promise<EnhancedAuthResource[]> {
    const res = await fetch(`${SUPABASE_MGMT_API}/v1/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to list Supabase projects: ${res.status} ${res.statusText}`);
    }

    const projects = (await res.json()) as Array<{
      id: string;
      name: string;
      organization_id: string;
      region: string;
      status: string;
    }>;

    return projects
      .filter((p) => p.status === "ACTIVE_HEALTHY")
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: `Region: ${p.region}`,
        meta: {
          region: p.region,
          organizationId: p.organization_id,
          projectRef: p.id,
        },
      }));
  },

  async extractCredentials(accessToken: string, resource: EnhancedAuthResource | null) {
    if (!resource) throw new Error("A Supabase project must be selected");

    const projectRef = resource.id;

    // Fetch API keys for this project
    const keysRes = await fetch(`${SUPABASE_MGMT_API}/v1/projects/${projectRef}/api-keys`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!keysRes.ok) {
      throw new Error(`Failed to fetch API keys: ${keysRes.status} ${keysRes.statusText}`);
    }

    const keys = (await keysRes.json()) as Array<{ name: string; api_key: string }>;

    // Capture both keys when available so vault-bridge can map them to
    // VITE_SUPABASE_ANON_KEY (client) and SUPABASE_SERVICE_ROLE_KEY (server).
    const serviceKey = keys.find((k) => k.name === "service_role");
    const anonKey = keys.find((k) => k.name === "anon");

    if (!serviceKey && !anonKey) {
      throw new Error("No API keys found for this project");
    }

    const url = `https://${projectRef}.supabase.co`;

    // `apiKey` field is unchanged — @activepieces/piece-supabase reads it for tool calls.
    // `anonKey` and `serviceRoleKey` are NEW and consumed by the env vault-bridge
    // (envKeyMap.client.anonKey / envKeyMap.server.serviceRoleKey).
    return {
      authType: "custom_auth" as const,
      credentials: {
        url,
        apiKey: serviceKey?.api_key ?? anonKey?.api_key,
        anonKey: anonKey?.api_key,
        serviceRoleKey: serviceKey?.api_key,
      },
      displayName: `Supabase: ${resource.name}`,
      metadata: {
        projectRef,
        region: resource.meta?.region,
        keyType: serviceKey
          ? (anonKey ? "service_role+anon" : "service_role")
          : "anon",
        connectedVia: "enhanced_auth",
      },
    };
  },

  async validateCredentials(credentials: Record<string, unknown>) {
    const url = credentials.url as string;
    const apiKey = credentials.apiKey as string;

    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return res.ok ? null : `Supabase API returned ${res.status}`;
    } catch (err) {
      return `Connection failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export default supabaseModule;
