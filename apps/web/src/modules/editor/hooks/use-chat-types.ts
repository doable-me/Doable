export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Phase 2A — Supabase provisioning state surfaced to consumers of useChat()
 * so the chat surface can render the "create new Supabase project" dialog.
 */
export interface SupabaseProvisionRequest {
  /** Default project name suggested by the AI tool call (may be empty). */
  name: string;
  /** Friendly explanation from the AI tool result. */
  reason: string;
}

/**
 * Phase 1H — "Connect X" affordance surfaced to consumers of useChat()
 * when the AI calls `request_integration` OR an Activepieces tool fails
 * with a credentials-missing error. The chat surface renders an inline
 * Connect card that opens the existing integrations connect flow.
 */
export interface PendingIntegrationRequest {
  /** Registry ID (e.g. "stripe", "github"). */
  integrationId: string;
  /** Registry display name (e.g. "Stripe"). */
  displayName: string;
  /** Optional logo URL from the registry. */
  logoUrl?: string;
  /** One-sentence reason from the AI explaining why this service is needed. */
  reason: string;
}

export function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
