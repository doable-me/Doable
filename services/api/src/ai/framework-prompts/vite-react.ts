import type { FrameworkPrompt } from "./index.js";

/**
 * Vite + React framework prompt. Content is extracted VERBATIM from the
 * existing services/api/src/routes/chat/system-prompts.ts agent prompt
 * (lines 85, 253-264, 282, 306-319 plus the file-shape rules 7/10/11) so
 * that switching system-prompts.ts to renderFrameworkPrompt("vite-react")
 * preserves byte-identical AI behavior for the default scaffold.
 */
export const viteReactPrompt: FrameworkPrompt = {
  systemIntro:
    "The project is a Vite + React 19 + TypeScript app with Tailwind CSS v4 (using the @tailwindcss/vite plugin). Files are hot-reloaded via Vite.",

  envConventions: [
    "0. **🔌 USE CONNECTED INTEGRATIONS**: If a `<connected-integrations>` block appears above, the user has already connected those services. You MUST reference the listed env vars (via `import.meta.env.VITE_*` for client vars, `process.env.*` for server vars) and call the listed tools. NEVER ask the user to paste API keys, URLs, or tokens for any service in that block. If you need a service NOT in the block, call `request_integration` instead of asking for keys.",
    "",
    "0a. **🔌 INTEGRATION SDK (`@doable/sdk`)**: When the user wants to interact with external services (Slack, Stripe, Gmail, GitHub, etc.) from the generated app at runtime, use the `@doable/sdk` package. This SDK calls a secure server-side proxy — credentials never reach the browser.",
    "   ```ts",
    "   import { createDoableClient } from \"@doable/sdk\";",
    "   const doable = createDoableClient();",
    "   const result = await doable.integrations.run(\"slack\", \"send_channel_message\", { channel: \"#general\", text: \"Hello!\" });",
    "   if (result.success) { console.log(result.data); }",
    "   ```",
    "   For React components, use the hooks:",
    "   ```ts",
    "   import { useIntegration, useIntegrationQuery } from \"@doable/sdk/react\";",
    "   // Mutations:",
    "   const slack = useIntegration(\"slack\", \"send_channel_message\");",
    "   await slack.run({ channel: \"#general\", text: \"Hello\" });",
    "   // Queries (data fetching):",
    "   const { data, loading } = useIntegrationQuery(\"slack\", \"list_channels\", {});",
    "   ```",
    "   RULES:",
    "   - NEVER use fetch() to call external APIs directly (Slack API, Stripe API, etc.) — ALWAYS use the SDK",
    "   - NEVER hardcode API keys or tokens in the code",
    "   - The only exception is Supabase: use the direct Supabase client SDK (its keys are browser-safe)",
    "   - Add `@doable/sdk` to package.json dependencies: `\"@doable/sdk\": \"workspace:*\"`",
    "",
    "0b. **🔌 MCP TOOLS IN GENERATED APPS**: When the generated app needs to call MCP server tools at runtime (e.g. fetching data from a connected MCP server like HPCA, Supabase MCP, or any custom MCP), use `@doable/sdk`'s MCP support:",
    "   ```ts",
    "   import { createDoableClient } from \"@doable/sdk\";",
    "   const doable = createDoableClient();",
    "   const result = await doable.mcp.call(\"mcp_connector_name_tool_name\", { param1: \"value\" });",
    "   if (result.success) { console.log(result.data); }",
    "   ```",
    "   To discover available MCP tools: `const tools = await doable.mcp.list();`",
    "   RULES:",
    "   - Tool names use the AI-prefixed format: `mcp_{connectorName}_{toolName}` (all lowercase, non-alphanumeric → underscore)",
    "   - NEVER implement a custom postMessage bridge or raw fetch to MCP endpoints",
    "   - NEVER hardcode MCP server URLs or credentials in the app",
    "   - Auth is handled automatically (same as integrations)",
    "",
    "0c. **🔌 SUPABASE NOT CONNECTED? PROVISION FIRST**: If the user asks to add Supabase / a database but there is NO `supabase` entry in the `<connected-integrations>` block above (or the block is absent), you MUST call the `provision_supabase` tool BEFORE writing any code. Do NOT assume Supabase is connected — check the block. Do NOT ask the user for credentials. The provision tool opens a dialog for the user to connect their Supabase project, then injects the env vars automatically. Only after provisioning should you write Supabase client code.",
    "",
    "1. **🚨 GUARD SUPABASE CLIENT 🚨**: When using `@supabase/supabase-js`, ALWAYS guard against missing env vars. The Supabase client THROWS if the URL is undefined — crashing the entire app with a white screen. Write it like this:",
    "   ```ts",
    "   const url = import.meta.env.VITE_SUPABASE_URL ?? \"\";",
    "   const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? \"\";",
    "   export const supabase = url ? createClient(url, key, { auth: { persistSession: false, detectSessionInUrl: false } }) : null;",
    "   ```",
    "   Then in components, check `if (!supabase)` and show a \"Connecting to database...\" placeholder instead of crashing.",
    "   NOTE: `persistSession: false` is REQUIRED because the preview runs in a sandboxed iframe where `navigator.locks` is blocked.",
  ].join("\n"),

  routing:
    "2. **🚨 USE HashRouter NOT BrowserRouter 🚨**: When using react-router-dom, ALWAYS use `HashRouter` (not `BrowserRouter`). The live preview runs at a sub-path (`/preview/{projectId}/`) so BrowserRouter's path-based routing doesn't match. HashRouter uses `#/` which works at any base URL. Import: `import { HashRouter, Routes, Route } from \"react-router-dom\";`",

  styling: [
    "6. **TAILWIND CSS v4** — This project uses Tailwind v4 which is very different from v3:",
    "   - ALWAYS start index.css with: `@import \"tailwindcss\";` as the FIRST line",
    "   - NEVER use `@tailwind base; @tailwind components; @tailwind utilities;` (that is v3 syntax, it will break)",
    "   - NEVER use `@apply` in CSS — it is removed in Tailwind v4 by default. Use utility classes directly in JSX instead.",
    "   - NEVER create a tailwind.config.ts or tailwind.config.js — it's not needed. Tailwind v4 auto-detects utility classes.",
    "   - For custom theme values (colors, fonts, spacing), use the `@theme` directive in CSS:",
    "     ```css",
    "     @import \"tailwindcss\";",
    "     @theme {",
    "       --color-brand: #3b82f6;",
    "       --font-heading: \"Inter\", sans-serif;",
    "     }",
    "     ```",
    "   - Then use them as classes: `className=\"text-brand font-heading\"`",
  ].join("\n"),

  fileShape: [
    "7. **DEFAULT EXPORT**: src/App.tsx must use `export default` since src/main.tsx imports it as a default import.",
    "",
    "10. **FILE EXTENSIONS**: Always use `.tsx` for files containing JSX/TSX markup. Use `.ts` for pure TypeScript files with no JSX. Never put JSX in a `.ts` file.",
    "",
    "11. **IMPORT TYPES**: Do not use `import type { X }` for values that are used at runtime (e.g., as a component, in a function call, or as a value). `import type` strips the import at compile time, causing runtime errors. Only use `import type` for values used exclusively in type annotations.",
  ].join("\n"),

  pwa: [
    "12. **PWA (Progressive Web App)**: When the user asks to make the app installable, work offline, or become a PWA:",
    "   - Install `vite-plugin-pwa` (devDependency) and `idb-keyval` (dependency)",
    "   - **CRITICAL**: Add `import { VitePWA } from \"vite-plugin-pwa\"` and `VitePWA({...})` to the plugins array in vite.config.ts — WITHOUT this, NO service worker, manifest, or registerSW.js will be generated",
    "   - Configure manifest INSIDE VitePWA() options (do NOT create a separate manifest.json)",
    "   - Use `scope: \"./\"` and `start_url: \"./\"` (relative paths — required for sub-path deployment)",
    "   - NEVER create sw.js manually — vite-plugin-pwa auto-generates it via Workbox",
    "   - NEVER call navigator.serviceWorker.register() — the plugin handles it",
    "   - Add to index.html: meta theme-color, apple-mobile-web-app-capable, apple-touch-icon, viewport-fit=cover",
    "   - Provide icons: 192×192 + 512×512 PNG (include one with purpose: \"maskable\")",
    "   - Add BeforeInstallPromptEvent type declaration in vite-env.d.ts",
    "   - **IMPORTANT**: Wrap ALL idb-keyval/IndexedDB calls in try/catch — the preview iframe sandbox blocks IndexedDB; fall back to in-memory or localStorage on SecurityError",
    "   - Caching: CacheFirst for static assets/fonts, NetworkFirst for API calls",
    "   - Add env(safe-area-inset-*) padding on body for iPhone notch",
  ].join("\n"),
};
