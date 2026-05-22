#!/usr/bin/env tsx
/**
 * generate-env-template.ts
 *
 * Reads all OAuth2 integrations from the registry, groups them by
 * provider (Google, Microsoft, GitHub, Atlassian, Meta, individual),
 * and generates a .env.integrations.example template with all needed env vars.
 *
 * Usage:
 *   npx tsx tools/generate-env-template.ts
 *   npx tsx tools/generate-env-template.ts --output .env.integrations
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ── Import all registry sources ────────────────────────────

// We can't import the TS registry directly without the full project context,
// so we parse the registry files to extract OAuth2 integration definitions.
// This approach avoids needing the full build pipeline.

interface OAuthIntegration {
  id: string;
  displayName: string;
  authUrl: string;
  scopes: string[];
  portalUrl: string;
}

// ── Provider detection ─────────────────────────────────────

interface ProviderGroup {
  name: string;
  description: string;
  portalUrl: string;
  envPrefix: string;
  /** If set, this is a shared provider -- one client ID/secret covers all */
  sharedEnvName?: string;
  integrations: OAuthIntegration[];
}

const PROVIDER_PORTALS: Record<string, string> = {
  slack: "https://api.slack.com/apps",
  notion: "https://www.notion.so/my-integrations",
  hubspot: "https://developers.hubspot.com/",
  salesforce: "https://developer.salesforce.com/",
  pipedrive: "https://developers.pipedrive.com/",
  zoho_crm: "https://api-console.zoho.com/",
  mailchimp: "https://admin.mailchimp.com/account/oauth2/",
  linear: "https://linear.app/settings/api",
  asana: "https://app.asana.com/0/developer-console",
  dropbox: "https://www.dropbox.com/developers/apps",
  box: "https://app.box.com/developers/console",
  twitter: "https://developer.twitter.com/en/portal/dashboard",
  linkedin: "https://www.linkedin.com/developers/apps",
  instagram_business: "https://developers.facebook.com/apps/",
  facebook_pages: "https://developers.facebook.com/apps/",
  intercom: "https://developers.intercom.com/",
  gitlab: "https://gitlab.com/-/user_settings/applications",
  docusign: "https://admindemo.docusign.com/apps-and-keys",
  quickbooks: "https://developer.intuit.com/app/developer/dashboard",
  xero: "https://developer.xero.com/app/manage",
  zoom: "https://marketplace.zoom.us/develop/create",
  reddit: "https://www.reddit.com/prefs/apps",
  constant_contact: "https://developer.constantcontact.com/",
  pinterest: "https://developers.pinterest.com/",
  tiktok: "https://developers.tiktok.com/",
  twitch: "https://dev.twitch.tv/console",
  spotify: "https://developer.spotify.com/dashboard",
};

// ── Parse registry files ───────────────────────────────────

const REGISTRY_DIR = path.resolve(
  import.meta.dirname ?? __dirname,
  "../services/api/src/integrations"
);

function readRegistryFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Quick-and-dirty parser to extract OAuth2 integrations from TS source.
 * Looks for objects with authType: "oauth2" and requiresOAuthApp: true.
 */
function extractOAuthIntegrations(source: string): OAuthIntegration[] {
  const results: OAuthIntegration[] = [];

  // Match top-level integration blocks: key: { ... }
  // We look for patterns like:  someId: {  ... authType: "oauth2" ... }
  const blockRegex = /(\w[\w-]*)\s*:\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(source)) !== null) {
    const id = match[1];
    const startIdx = match.index + match[0].length;

    // Find the matching closing brace by counting braces
    let depth = 1;
    let idx = startIdx;
    while (idx < source.length && depth > 0) {
      if (source[idx] === "{") depth++;
      else if (source[idx] === "}") depth--;
      idx++;
    }

    const block = source.substring(startIdx, idx - 1);

    // Check if this is an OAuth2 integration that requires an OAuth app
    const isOAuth2 = /authType:\s*["']oauth2["']/.test(block);
    const requiresApp = /requiresOAuthApp:\s*true/.test(block);

    if (!isOAuth2 || !requiresApp) continue;

    // Extract displayName
    const nameMatch = block.match(/displayName:\s*["']([^"']+)["']/);
    const displayName = nameMatch?.[1] ?? id;

    // Extract authUrl (direct or via spread)
    let authUrl = "";
    const authUrlMatch = block.match(/authUrl:\s*["']([^"']+)["']/);
    if (authUrlMatch) {
      authUrl = authUrlMatch[1];
    } else if (block.includes("GOOGLE_OAUTH_BASE") || block.includes("GOOGLE_AUTH_URL")) {
      authUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    } else if (block.includes("MICROSOFT_AUTH_URL")) {
      authUrl = "https://login.microsoftonline.com/common/oauth2/v2/authorize";
    } else if (block.includes("ATLASSIAN_AUTH_URL")) {
      authUrl = "https://auth.atlassian.com/authorize";
    }

    // Extract scopes
    const scopes: string[] = [];
    const scopesMatch = block.match(/scopes:\s*\[([^\]]*)\]/s);
    if (scopesMatch) {
      const scopeStr = scopesMatch[1];
      const scopeItemRegex = /["']([^"']+)["']/g;
      let scopeMatch: RegExpExecArray | null;
      while ((scopeMatch = scopeItemRegex.exec(scopeStr)) !== null) {
        scopes.push(scopeMatch[1]);
      }
    }

    // Determine portal URL
    const portalUrl = PROVIDER_PORTALS[id] ?? "";

    results.push({ id, displayName, authUrl, scopes, portalUrl });
  }

  return results;
}

// ── Group by provider ──────────────────────────────────────

function groupByProvider(integrations: OAuthIntegration[]): ProviderGroup[] {
  const google: OAuthIntegration[] = [];
  const microsoft: OAuthIntegration[] = [];
  const github: OAuthIntegration[] = [];
  const atlassian: OAuthIntegration[] = [];
  const meta: OAuthIntegration[] = [];
  const individual: OAuthIntegration[] = [];

  for (const int of integrations) {
    if (int.authUrl.includes("accounts.google.com")) {
      google.push(int);
    } else if (int.authUrl.includes("login.microsoftonline.com")) {
      microsoft.push(int);
    } else if (int.authUrl.includes("github.com")) {
      github.push(int);
    } else if (int.authUrl.includes("auth.atlassian.com")) {
      atlassian.push(int);
    } else if (
      int.authUrl.includes("facebook.com") ||
      int.authUrl.includes("instagram.com")
    ) {
      meta.push(int);
    } else {
      individual.push(int);
    }
  }

  const groups: ProviderGroup[] = [];

  if (google.length > 0) {
    groups.push({
      name: "Google Services",
      description: `1 OAuth app covers: ${google.map((i) => i.id).join(", ")}`,
      portalUrl: "https://console.cloud.google.com/apis/credentials",
      envPrefix: "GOOGLE",
      sharedEnvName: "GOOGLE",
      integrations: google,
    });
  }

  if (microsoft.length > 0) {
    groups.push({
      name: "Microsoft Services",
      description: `1 Azure AD app covers: ${microsoft.map((i) => i.id).join(", ")}`,
      portalUrl:
        "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
      envPrefix: "MICROSOFT",
      integrations: microsoft,
    });
  }

  if (github.length > 0) {
    groups.push({
      name: "GitHub",
      description: "Already configured for git sync -- just add the redirect URI",
      portalUrl: "https://github.com/settings/developers",
      envPrefix: "GITHUB",
      sharedEnvName: "GITHUB",
      integrations: github,
    });
  }

  if (atlassian.length > 0) {
    groups.push({
      name: "Atlassian (Jira + Confluence)",
      description: `1 Atlassian OAuth app covers: ${atlassian.map((i) => i.id).join(", ")}`,
      portalUrl: "https://developer.atlassian.com/console/myapps/",
      envPrefix: "ATLASSIAN",
      integrations: atlassian,
    });
  }

  if (meta.length > 0) {
    groups.push({
      name: "Meta (Facebook + Instagram)",
      description: `1 Meta app can cover: ${meta.map((i) => i.id).join(", ")}`,
      portalUrl: "https://developers.facebook.com/apps/",
      envPrefix: "META",
      integrations: meta,
    });
  }

  // Sort individual integrations alphabetically
  individual.sort((a, b) => a.displayName.localeCompare(b.displayName));

  for (const int of individual) {
    groups.push({
      name: int.displayName,
      description: "",
      portalUrl: int.portalUrl || `(see ${int.displayName} developer docs)`,
      envPrefix: int.id.toUpperCase().replace(/-/g, "_"),
      integrations: [int],
    });
  }

  return groups;
}

// ── Generate .env template ─────────────────────────────────

function generateEnvTemplate(groups: ProviderGroup[]): string {
  const lines: string[] = [];

  lines.push(
    "# ═══════════════════════════════════════════════════════════════════",
    "# Doable Integration OAuth Credentials",
    "# ═══════════════════════════════════════════════════════════════════",
    "#",
    "# This file lists all OAuth2 integrations that need platform-level",
    "# credentials. See tools/setup-oauth-providers.md for setup instructions.",
    "#",
    "# Redirect URI for ALL integrations:",
    "#   Local:      http://127.0.0.1:4000/integrations/oauth/callback",
    "#   Production: https://api.doable.me/integrations/oauth/callback",
    "#",
    "# Override with: INTEGRATIONS_OAUTH_REDIRECT_URI=https://...",
    "#",
    ""
  );

  for (const group of groups) {
    const ids = group.integrations.map((i) => i.id).join(", ");

    lines.push(
      `# ── ${group.name} (${ids}) ──`
    );

    if (group.description) {
      lines.push(`# ${group.description}`);
    }

    lines.push(`# Create at: ${group.portalUrl}`);
    lines.push(
      "# Redirect URI: http://127.0.0.1:4000/integrations/oauth/callback"
    );

    // Collect all scopes from this group
    const allScopes = new Set<string>();
    for (const int of group.integrations) {
      for (const scope of int.scopes) {
        allScopes.add(scope);
      }
    }

    if (allScopes.size > 0) {
      lines.push(`# Scopes: ${[...allScopes].join(", ")}`);
    }

    if (group.sharedEnvName) {
      // Shared provider -- one set of env vars
      lines.push(`${group.sharedEnvName}_CLIENT_ID=`);
      lines.push(`${group.sharedEnvName}_CLIENT_SECRET=`);
    } else if (group.integrations.length > 1) {
      // Multi-integration provider without a shared fallback (e.g. Microsoft, Atlassian, Meta)
      // Show one set for each integration, noting they can be the same app
      lines.push(`# (All can point to the same OAuth app)`);
      for (const int of group.integrations) {
        const envKey = int.id.toUpperCase().replace(/-/g, "_");
        lines.push(`OAUTH_${envKey}_CLIENT_ID=`);
        lines.push(`OAUTH_${envKey}_CLIENT_SECRET=`);
      }
    } else {
      // Individual integration
      const envKey = group.integrations[0].id.toUpperCase().replace(/-/g, "_");
      lines.push(`OAUTH_${envKey}_CLIENT_ID=`);
      lines.push(`OAUTH_${envKey}_CLIENT_SECRET=`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────

function main() {
  const registryFiles = [
    path.join(REGISTRY_DIR, "registry.ts"),
    path.join(REGISTRY_DIR, "registry/communication.ts"),
    path.join(REGISTRY_DIR, "registry/productivity.ts"),
    path.join(REGISTRY_DIR, "registry/developer-tools.ts"),
    path.join(REGISTRY_DIR, "registry/crm-marketing-social.ts"),
    path.join(REGISTRY_DIR, "registry/finance-ecommerce.ts"),
    path.join(REGISTRY_DIR, "registry/ai-ml.ts"),
  ];

  const allIntegrations: OAuthIntegration[] = [];
  const seenIds = new Set<string>();

  for (const file of registryFiles) {
    const source = readRegistryFile(file);
    if (!source) {
      console.warn(`  Skipped: ${path.relative(process.cwd(), file)} (not found)`);
      continue;
    }

    const integrations = extractOAuthIntegrations(source);
    for (const int of integrations) {
      if (!seenIds.has(int.id)) {
        seenIds.add(int.id);
        allIntegrations.push(int);
      }
    }
  }

  console.log(`Found ${allIntegrations.length} OAuth2 integrations requiring OAuth apps:\n`);
  for (const int of allIntegrations) {
    console.log(`  - ${int.displayName} (${int.id})`);
  }
  console.log();

  const groups = groupByProvider(allIntegrations);
  const template = generateEnvTemplate(groups);

  // Determine output path
  const outputFlag = process.argv.indexOf("--output");
  const outputPath =
    outputFlag !== -1 && process.argv[outputFlag + 1]
      ? path.resolve(process.argv[outputFlag + 1])
      : path.resolve(
          import.meta.dirname ?? __dirname,
          "../.env.integrations.example"
        );

  fs.writeFileSync(outputPath, template, "utf-8");
  console.log(`Generated: ${path.relative(process.cwd(), outputPath)}`);

  // Print summary
  const sharedCount = groups.filter((g) => g.integrations.length > 1).length;
  const individualCount = groups.filter((g) => g.integrations.length === 1).length;
  console.log(
    `\n  ${sharedCount} shared provider groups + ${individualCount} individual OAuth apps`
  );
  console.log(
    `  ${allIntegrations.length} integrations total need OAuth configuration`
  );
}

main();
