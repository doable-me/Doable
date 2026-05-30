import type { Hono } from "hono";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { folderRoutes } from "./routes/folders.js";
import { editorRoutes } from "./routes/editor.js";
import { chatRoutes } from "./routes/chat/index.js";
import { billingRoutes } from "./routes/billing.js";
import { deployRoutes } from "./routes/deploy.js";
import { customDomainRoutes } from "./routes/custom-domains.js";
import { contextRoutes, workspaceContextRoutes } from "./routes/context.js";
import { templateRoutes } from "./routes/templates.js";
import { versionRoutes } from "./routes/versions.js";
import { githubRoutes, githubProjectRoutes } from "./routes/github.js";
import { projectFileRoutes } from "./routes/project-files.js";
import { previewRoutes } from "./routes/preview-proxy.js";
import { connectorProxyRoutes } from "./routes/connector-proxy.js";
import { runtimeRoutes, workspaceRuntimeRoutes } from "./routes/runtime.js";
import { buildStreamRoutes } from "./routes/build-stream.js";
import { thumbnailRoutes } from "./routes/thumbnails.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { aiSettingsRoutes } from "./routes/ai-settings.js";
import { sandboxRoutes } from "./routes/sandbox-rules.js";
import { workspaceSandboxRoutes } from "./routes/workspaces/sandbox.js";
import { providerCatalogRoutes } from "./routes/provider-catalog.js";
import { providerBridgeRoutes } from "./routes/provider-bridge.js";
import { usageRoutes } from "./routes/usage.js";
import { adminRoutes } from "./routes/admin.js";
import { adminTraceRoutes } from "./admin/trace-routes.js";
import { adminAuditRoutes } from "./admin/audit-routes.js";
import { tracingControlRouter } from "./admin/tracing-control.js";
import { adminMfaRoutes } from "./routes/admin-mfa.js";
import { adminSignupRoutes } from "./routes/admin-signups.js";
import { securityRoutes } from "./routes/security.js";
import { communityRoutes } from "./routes/community.js";
import { connectorRoutes, mcpOAuthCallbackRoute } from "./routes/connectors.js";
import { integrationRoutes } from "./routes/integrations.js";
import { supabaseProvisionRoutes } from "./routes/integrations/supabase/provision.js";
import { skillsRoutes } from "./routes/skills.js";
import { environmentRoutes } from "./routes/environments.js";
import { wsEnvVarRoutes, projEnvVarRoutes, envVarUtilRoutes } from "./routes/env-vars.js";
import { workspaceLogFilterRoutes } from "./routes/workspace-log-filters.js";
import { marketplaceRoutes } from "./routes/marketplace.js";
import { marketplaceModerationRoutes } from "./routes/marketplace-moderation.js";
import { teamChatRoutes } from "./routes/team-chat.js";
import { designCommentRoutes } from "./routes/design-comments.js";
import { internalRoutes } from "./routes/internal.js";
import { notificationRoutes } from "./routes/notifications.js";
import { planRoutes } from "./routes/plan.js";
import { directSaveRoutes } from "./direct-save/index.js";
import artifactsRoutes from "./routes/artifacts.js";
import { publicFrameworkRoutes } from "./routes/admin-frameworks.js";
import { setupRoutes } from "./routes/setup.js";
// Per-app database (PRD per-app-db). Mounted only when the feature flag is on.
import { appDataRoutes } from "./routes/app-data.js";
import { appAuthRoutes } from "./routes/app-auth.js";
import { dataTokenRoutes } from "./routes/projects/data-token.js";
import { mcpAppsDataRoutes } from "./routes/mcp-apps-data.js";
import { DOABLE_APP_DB_ENABLED } from "./data-worker/config.js";
// Runtime AI data-plane (PRD ChatBotInfra). Mounted only when the feature flag is on.
import { aiProxyRoutes } from "./routes/ai-proxy.js";
import { aiSettingsRoutes as projectAiSettingsRoutes } from "./routes/projects/ai-settings.js";
import { embeddingsRoutes as projectEmbeddingsRoutes } from "./routes/projects/embeddings.js";
import { workspaceAiExtrasRoutes } from "./routes/workspaces/ai-extras.js";
import { DOABLE_APP_AI_ENABLED } from "./ai/runtime-config.js";
import { geminiProxyRoutes } from "./routes/gemini-proxy.js";

export function mountRoutes(app: Hono): void {
// Gemini OpenAI-compat proxy — strips unsupported params from copilot SDK
// requests. Must be early (no auth) since the CLI sends Gemini's API key directly.
app.route("/__gemini-proxy", geminiProxyRoutes);
app.route("/health", healthRoutes);
app.route("/artifacts", artifactsRoutes);
app.route("/internal", internalRoutes);
app.route("/auth", authRoutes);
// Preview reverse proxy — forwards /preview/:projectId/* to the Vite dev server.
// Must be before other catch-all routes.
app.route("/", previewRoutes);
// Connector-bridge proxy — POST /__doable/connector-proxy/:integration/:action.
// Lets static-kind generated apps reach connected integrations server-side
// without ever holding the raw secret. JWT-protected, allowlist-gated, audited.
app.route("/", connectorProxyRoutes);
// Per-app DB data plane (/__doable/data/*), settings data-token minter, and the
// MCP Apps inspector resources — gated behind DOABLE_APP_DB_ENABLED. With the
// flag off there is no /__doable/data/* surface at all (PRD 08 §6 kill switch).
if (DOABLE_APP_DB_ENABLED) {
  app.route("/", appDataRoutes);
  // Per-app end-user auth plane (/__doable/auth/{signup,login,me,logout}).
  // Credentials live in the platform DB (never the per-app DB); the issued
  // session token drives app.user_id so per-user RLS works for the app's own
  // end-users without exposing any password hash. See routes/app-auth.ts.
  app.route("/", appAuthRoutes);
  // mcpAppsDataRoutes defines GET /:resource{.+} — it MUST be mounted under its
  // own prefix, NOT at "/", or the {.+} wildcard swallows every GET request
  // (/workspaces, /projects, …) and 404s the whole app.
  app.route("/__doable/mcp-apps/data", mcpAppsDataRoutes);
  // NOTE: dataTokenRoutes is mounted further down — AFTER chatRoutes — because
  // it applies authMiddlewareWithRls on "/projects/*". Mounting it here (before
  // chat) wrapped the streaming /projects/:id/chat route in the RLS
  // single-connection transaction, which deadlocked the chat handler's
  // concurrent Promise.all() DB queries (AI turns hung 180s, "no tools, no
  // content"). See the mount below.
}
// Runtime AI proxy (/__doable/ai/*) — gated behind DOABLE_APP_AI_ENABLED.
// Mirrors the appDataRoutes pattern exactly: an unauthenticated POST surface
// that resolves identity from the project-scoped token, calls the workspace's
// configured AI model server-side, and never exposes the provider key.
if (DOABLE_APP_AI_ENABLED) {
  app.route("/", aiProxyRoutes);
}
// Per-project runtime status / restart / logs (PRD 06 §4)
app.route("/", runtimeRoutes);
app.route("/workspaces", workspaceRuntimeRoutes);
// Per-project build-event SSE stream (PRD 03 §4.3)
app.route("/", buildStreamRoutes);
// Project file routes (no auth — filesystem-backed, powers live preview)
app.route("/", projectFileRoutes);
// Direct save — AST-based visual edit saves (no AI, no auth — filesystem-backed)
app.route("/", directSaveRoutes);
// Chat & editor routes BEFORE project routes (projectRoutes has wildcard auth middleware)
app.route("/", chatRoutes);
app.route("/", planRoutes);
app.route("/", editorRoutes);
// Per-app DB data-token routes mount AFTER chat/editor: their
// authMiddlewareWithRls "/projects/*" wildcard must NOT wrap the streaming
// /projects/:id/chat route, or the chat handler's concurrent Promise.all() DB
// queries deadlock inside the single-connection RLS transaction (AI turns hang
// 180s with no output). Same ordering rationale as projectRoutes below.
if (DOABLE_APP_DB_ENABLED) {
  app.route("/projects", dataTokenRoutes);
}
// Per-project Doable AI settings (CRUD + usage readout). Mounted AFTER
// chatRoutes for the same RLS-deadlock reason documented above for
// dataTokenRoutes — the router applies authMiddlewareWithRls on "/projects/*".
if (DOABLE_APP_AI_ENABLED) {
  app.route("/projects", projectAiSettingsRoutes);
  app.route("/projects", projectEmbeddingsRoutes);
  app.route("/workspaces", workspaceAiExtrasRoutes);
}
app.route("/projects", projectRoutes);
app.route("/workspaces", workspaceRoutes);
app.route("/workspaces", aiSettingsRoutes);
app.route("/workspaces", sandboxRoutes);
app.route("/workspaces", workspaceSandboxRoutes);
app.route("/ai", providerCatalogRoutes);
app.route("/workspaces", providerBridgeRoutes);
app.route("/workspaces", usageRoutes);
app.route("/folders", folderRoutes);
app.route("/billing", billingRoutes);
app.route("/deploy", deployRoutes);
app.route("/domains", customDomainRoutes);
app.route("/projects/:id/context", contextRoutes);
app.route("/templates", templateRoutes);
app.route("/projects", versionRoutes);
// BUG-GH-003 / TC-GH-COMMITS-001: clients (and the spec under
// testcases/15-github) expect project-scoped GitHub routes at
// `/projects/:id/github/*`, but historically they were mounted at the bare
// `/:id/github/*` prefix. Keep the legacy mount for backwards compatibility
// AND mount the project sub-router under `/projects` so both shapes work.
// OAuth + user-account routes (no :projectId) stay on the root mount only.
// Consolidated GitHub OAuth callback paths under /oauth/github/{login,copilot,repo}/callback.
// Registered directly on app (not via app.route("/", subRouter)) so they
// short-circuit the request chain before publicFrameworkRoutes' wildcard
// authMiddleware (mounted at "/" at the bottom of this file) can intercept.
// 308 redirects forward to the existing per-flow handlers in authRoutes /
// githubRoutes so handler logic stays in one place.
// Path-only redirects (no scheme/host) so the browser stays on the original
// origin's HTTPS. Using `new URL(c.req.url)` would emit `http://...` because
// Caddy terminates TLS and forwards plain HTTP to the api container.
function preserveQuery(c: { req: { url: string } }): string {
  const i = c.req.url.indexOf("?");
  return i >= 0 ? c.req.url.slice(i) : "";
}
app.get("/oauth/github/login/callback", (c) => {
  return c.redirect(`/auth/github/callback${preserveQuery(c)}`, 308);
});
app.get("/oauth/github/copilot/callback", (c) => {
  return c.redirect(`/auth/github/copilot/callback${preserveQuery(c)}`, 308);
});
app.get("/oauth/github/repo/callback", (c) => {
  return c.redirect(`/github/repo/callback${preserveQuery(c)}`, 308);
});
app.route("/", githubRoutes);
app.route("/projects", githubProjectRoutes);
app.route("/thumbnails", thumbnailRoutes);
app.route("/analytics", analyticsRoutes);
app.route("/admin", adminRoutes);
app.route("/admin", adminTraceRoutes);
app.route("/admin", adminAuditRoutes);
app.route("/admin/tracing", tracingControlRouter);
app.route("/admin/mfa", adminMfaRoutes);
app.route("/admin", adminSignupRoutes);
app.route("/setup", setupRoutes);
app.route("/projects", securityRoutes);
app.route("/community", communityRoutes);
app.route("/workspaces", connectorRoutes);
app.route("/", mcpOAuthCallbackRoute);
app.route("/", integrationRoutes);
app.route("/", supabaseProvisionRoutes);
app.route("/workspaces", skillsRoutes);
app.route("/workspaces", environmentRoutes);
app.route("/workspaces", wsEnvVarRoutes);
app.route("/workspaces", workspaceLogFilterRoutes);
app.route("/projects", projEnvVarRoutes);
app.route("/env-vars", envVarUtilRoutes);
app.route("/", marketplaceRoutes);
app.route("/workspaces", marketplaceRoutes);
app.route("/", marketplaceModerationRoutes);
app.route("/workspaces/:wid/context", workspaceContextRoutes);
app.route("/team-chat", teamChatRoutes);
app.route("/design-comments", designCommentRoutes);
app.route("/", notificationRoutes);
app.route("/", publicFrameworkRoutes);

}