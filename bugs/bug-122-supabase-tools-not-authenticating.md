# BUG-122: Supabase Activepieces Tools Fail to Authenticate

**Severity:** HIGH
**Status:** Open
**Found:** 2026-04-09 (Chrome E2E testing)
**Component:** services/api/src/integrations/tool-bridge.ts, Activepieces Supabase piece

## Summary
When the AI calls "Supabase Custom Api Call" or "Supabase Search Rows" tools, they fail with an authentication error. The AI reports: "The Supabase platform tools aren't authenticating."

The env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) ARE injected correctly into the dev server — the preview app connects to Supabase successfully (gets "table not found" error, proving the connection works). But the Activepieces tool-bridge fails to authenticate when invoking Supabase tools on behalf of the AI.

## Evidence
- Console: "Supabase tasks table not available: Could not find the table 'public.tasks' in the schema cache" — proves Supabase client works
- AI chat: "The Supabase platform tools aren't authenticating" — proves tool-bridge auth fails
- AI workaround: "Let me try a different approach — use the Supabase Management API via a raw HTTP call"

## Likely Cause (from Supabase analyst)
The tool-bridge decrypts credentials per-call when tools are invoked. But:
1. The ENCRYPTION_KEY mismatch may prevent decryption of the stored OAuth credentials
2. The OAuth token may have expired (no refresh path for supabase-mgmt integration)
3. The Activepieces piece expects a specific credential format that doesn't match what enhanced-auth stores

## Impact
- AI cannot create tables, run SQL, or manage Supabase resources via tools
- AI CAN write code that uses the Supabase client (env vars work)
- Users must manually create tables in Supabase dashboard
