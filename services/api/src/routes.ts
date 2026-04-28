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
import { githubRoutes } from "./routes/github.js";
import { projectFileRoutes } from "./routes/project-files.js";
import { previewRoutes } from "./routes/preview-proxy.js";
import { thumbnailRoutes } from "./routes/thumbnails.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { aiSettingsRoutes } from "./routes/ai-settings.js";
import { providerCatalogRoutes } from "./routes/provider-catalog.js";
import { providerBridgeRoutes } from "./routes/provider-bridge.js";
import { usageRoutes } from "./routes/usage.js";
import { adminRoutes } from "./routes/admin.js";
import { securityRoutes } from "./routes/security.js";
import { communityRoutes } from "./routes/community.js";
import { connectorRoutes } from "./routes/connectors.js";
import { integrationRoutes } from "./routes/integrations.js";
import { supabaseProvisionRoutes } from "./routes/integrations/supabase/provision.js";
import { skillsRoutes } from "./routes/skills.js";
import { environmentRoutes } from "./routes/environments.js";
import { wsEnvVarRoutes, projEnvVarRoutes, envVarUtilRoutes } from "./routes/env-vars.js";
import { marketplaceRoutes } from "./routes/marketplace.js";
import { marketplaceModerationRoutes } from "./routes/marketplace-moderation.js";
import { teamChatRoutes } from "./routes/team-chat.js";
import { designCommentRoutes } from "./routes/design-comments.js";
import { internalRoutes } from "./routes/internal.js";
import { planRoutes } from "./routes/plan.js";
import { directSaveRoutes } from "./direct-save/index.js";
import artifactsRoutes from "./routes/artifacts.js";

export function mountRoutes(app: Hono): void {
app.route("/health", healthRoutes);
app.route("/artifacts", artifactsRoutes);
app.route("/internal", internalRoutes);
app.route("/auth", authRoutes);
// Preview reverse proxy — forwards /preview/:projectId/* to the Vite dev server.
// Must be before other catch-all routes.
app.route("/", previewRoutes);
// Project file routes (no auth — filesystem-backed, powers live preview)
app.route("/", projectFileRoutes);
// Direct save — AST-based visual edit saves (no AI, no auth — filesystem-backed)
app.route("/", directSaveRoutes);
// Chat & editor routes BEFORE project routes (projectRoutes has wildcard auth middleware)
app.route("/", chatRoutes);
app.route("/", planRoutes);
app.route("/", editorRoutes);
app.route("/projects", projectRoutes);
app.route("/workspaces", workspaceRoutes);
app.route("/workspaces", aiSettingsRoutes);
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
app.route("/", githubRoutes);
app.route("/thumbnails", thumbnailRoutes);
app.route("/analytics", analyticsRoutes);
app.route("/admin", adminRoutes);
app.route("/projects", securityRoutes);
app.route("/community", communityRoutes);
app.route("/workspaces", connectorRoutes);
app.route("/", integrationRoutes);
app.route("/", supabaseProvisionRoutes);
app.route("/workspaces", skillsRoutes);
app.route("/workspaces", environmentRoutes);
app.route("/workspaces", wsEnvVarRoutes);
app.route("/projects", projEnvVarRoutes);
app.route("/env-vars", envVarUtilRoutes);
app.route("/", marketplaceRoutes);
app.route("/workspaces", marketplaceRoutes);
app.route("/", marketplaceModerationRoutes);
app.route("/workspaces/:wid/context", workspaceContextRoutes);
app.route("/team-chat", teamChatRoutes);
app.route("/design-comments", designCommentRoutes);

}