#!/usr/bin/env npx tsx
// ─── Auto-generate Integration Registry ─────────────────
//
// Scans installed @activepieces/piece-* packages and generates
// IntegrationDefinition entries for services/api/src/integrations/registry/generated.ts
//
// Usage: npx tsx tools/generate-registry.ts

import { readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// ─── Constants ──────────────────────────────────────────

// Handle both ESM (import.meta.dirname) and CJS (__dirname) contexts
const SCRIPT_DIR = typeof __dirname !== "undefined"
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));

const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const API_ROOT = join(PROJECT_ROOT, "services", "api");
const NODE_MODULES_AP = join(API_ROOT, "node_modules", "@activepieces");
const OUTPUT_DIR = join(API_ROOT, "src", "integrations", "registry");
const OUTPUT_FILE = join(OUTPUT_DIR, "generated.ts");

const SKIP_PACKAGES = new Set([
  "pieces-framework",
  "pieces-common",
  "shared",
]);

// ─── Category Mapping ───────────────────────────────────

type IntegrationCategory =
  | "communication"
  | "productivity"
  | "developer_tools"
  | "crm_sales"
  | "marketing"
  | "finance_payments"
  | "ai_ml"
  | "data_storage"
  | "social_media"
  | "ecommerce"
  | "project_management"
  | "customer_support"
  | "hr"
  | "analytics"
  | "content"
  | "automation"
  | "other";

const CATEGORY_MAP: Record<string, IntegrationCategory> = {
  COMMUNICATION: "communication",
  ARTIFICIAL_INTELLIGENCE: "ai_ml",
  UNIVERSAL_AI: "ai_ml",
  PRODUCTIVITY: "productivity",
  DEVELOPER_TOOLS: "developer_tools",
  SALES_AND_CRM: "crm_sales",
  MARKETING: "marketing",
  PAYMENT_PROCESSING: "finance_payments",
  ACCOUNTING: "finance_payments",
  COMMERCE: "ecommerce",
  CONTENT_AND_FILES: "content",
  CUSTOMER_SUPPORT: "customer_support",
  BUSINESS_INTELLIGENCE: "analytics",
  HUMAN_RESOURCES: "hr",
  FORMS_AND_SURVEYS: "productivity",
  CORE: "automation",
  FLOW_CONTROL: "automation",
};

/** Heuristic fallback: guess category from the piece package name */
const NAME_HEURISTICS: Array<[RegExp, IntegrationCategory]> = [
  [/slack|discord|telegram|teams|twilio|whatsapp|sendgrid|mailchimp|email|smtp/i, "communication"],
  [/openai|anthropic|gemini|claude|llm|gpt|ai|cohere|hugging/i, "ai_ml"],
  [/notion|google-sheets|airtable|excel|trello|asana|monday|clickup|todoist/i, "productivity"],
  [/github|gitlab|bitbucket|jira|linear|sentry|datadog|aws|gcp|azure|vercel|netlify/i, "developer_tools"],
  [/salesforce|hubspot|pipedrive|crm|zoho-crm/i, "crm_sales"],
  [/mailchimp|klaviyo|meta-ads|google-ads|facebook|instagram|tiktok|twitter|linkedin/i, "marketing"],
  [/stripe|square|paypal|braintree|invoice|billing|quickbooks|xero/i, "finance_payments"],
  [/shopify|woocommerce|magento|bigcommerce|etsy/i, "ecommerce"],
  [/zendesk|freshdesk|intercom|crisp|helpscout/i, "customer_support"],
  [/wordpress|contentful|sanity|ghost|medium|youtube|dropbox|google-drive|box|s3/i, "content"],
  [/mixpanel|amplitude|segment|google-analytics|posthog|plausible/i, "analytics"],
  [/bamboo|gusto|workday|personio/i, "hr"],
  [/zapier|make|ifttt|webhook|http|schedule|cron/i, "automation"],
  [/mysql|postgres|mongo|redis|supabase|firebase|dynamo/i, "data_storage"],
];

function guessCategory(
  pieceCategories: string[] | undefined,
  packageName: string,
): IntegrationCategory {
  // First, try the piece's own categories
  if (pieceCategories && pieceCategories.length > 0) {
    for (const cat of pieceCategories) {
      const mapped = CATEGORY_MAP[cat];
      if (mapped) return mapped;
    }
  }

  // Fall back to name-based heuristics
  const shortName = packageName.replace("@activepieces/piece-", "");
  for (const [pattern, category] of NAME_HEURISTICS) {
    if (pattern.test(shortName)) return category;
  }

  return "other";
}

// ─── Auth Type Mapping ──────────────────────────────────

interface AuthInfo {
  authType: "oauth2" | "secret_text" | "custom_auth" | "basic_auth" | "none";
  oauth2Config?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    pkce?: boolean;
    pkceMethod?: "plain" | "S256";
    authorizationMethod?: "HEADER" | "BODY";
    prompt?: "consent" | "login" | "none" | "omit";
    extraParams?: Record<string, string>;
  };
  customAuthFields?: Array<{
    name: string;
    displayName: string;
    description?: string;
    type: "text" | "secret" | "dropdown";
    required: boolean;
  }>;
}

function extractAuth(auth: any): AuthInfo {
  if (!auth) {
    return { authType: "none" };
  }

  const type = auth.type;

  switch (type) {
    case "OAUTH2": {
      const oauth2Config: AuthInfo["oauth2Config"] = {
        authUrl: auth.authUrl || "",
        tokenUrl: auth.tokenUrl || "",
        scopes: Array.isArray(auth.scope) ? auth.scope : [],
      };
      if (auth.pkce) oauth2Config.pkce = auth.pkce;
      if (auth.pkceMethod) oauth2Config.pkceMethod = auth.pkceMethod;
      if (auth.authorizationMethod) oauth2Config.authorizationMethod = auth.authorizationMethod;
      if (auth.prompt && auth.prompt !== "omit") oauth2Config.prompt = auth.prompt;
      if (auth.extra && Object.keys(auth.extra).length > 0) {
        oauth2Config.extraParams = auth.extra;
      }
      return { authType: "oauth2", oauth2Config };
    }

    case "SECRET_TEXT":
      return { authType: "secret_text" };

    case "CUSTOM_AUTH": {
      const customAuthFields: AuthInfo["customAuthFields"] = [];
      if (auth.props && typeof auth.props === "object") {
        for (const [name, prop] of Object.entries(auth.props)) {
          const p = prop as any;
          let fieldType: "text" | "secret" | "dropdown" = "text";
          if (p.type === "SECRET_TEXT") fieldType = "secret";
          else if (p.type === "STATIC_DROPDOWN") fieldType = "dropdown";
          customAuthFields.push({
            name,
            displayName: p.displayName || name,
            description: p.description,
            type: fieldType,
            required: p.required ?? true,
          });
        }
      }
      return { authType: "custom_auth", customAuthFields };
    }

    case "BASIC_AUTH":
      return { authType: "basic_auth" };

    default:
      return { authType: "none" };
  }
}

// ─── Tag Generation ─────────────────────────────────────

function generateTags(displayName: string, description: string, category: IntegrationCategory): string[] {
  const tags = new Set<string>();

  // Add category-derived tags
  const categoryTags: Record<string, string[]> = {
    communication: ["messaging"],
    ai_ml: ["ai"],
    productivity: ["productivity"],
    developer_tools: ["developer"],
    crm_sales: ["crm"],
    marketing: ["marketing"],
    finance_payments: ["finance"],
    ecommerce: ["ecommerce"],
    customer_support: ["support"],
    analytics: ["analytics"],
    content: ["content"],
    hr: ["hr"],
    automation: ["automation"],
    data_storage: ["database"],
    social_media: ["social"],
    project_management: ["project-management"],
  };
  const catTags = categoryTags[category];
  if (catTags) catTags.forEach((t) => tags.add(t));

  // Extract meaningful words from display name
  const nameWords = displayName.toLowerCase().split(/\s+/);
  for (const word of nameWords) {
    if (word.length > 2 && !["the", "and", "for", "with"].includes(word)) {
      tags.add(word);
    }
  }

  return [...tags].slice(0, 6);
}

// ─── Piece ID from Package Name ─────────────────────────

function pieceIdFromPackage(packageDir: string): string {
  // piece-google-sheets → google_sheets
  return packageDir
    .replace(/^piece-/, "")
    .replace(/-/g, "_");
}

// ─── Main Scanner ───────────────────────────────────────

interface GeneratedEntry {
  id: string;
  piecePackage: string;
  displayName: string;
  description: string;
  logoUrl: string;
  category: IntegrationCategory;
  tags: string[];
  authType: string;
  oauth2Config?: AuthInfo["oauth2Config"];
  customAuthFields?: AuthInfo["customAuthFields"];
  actions: string[];
  triggers: string[];
  tier: "community";
  requiresOAuthApp: boolean;
  supportsUserProvidedCredentials: boolean;
}

async function scanPieces(): Promise<GeneratedEntry[]> {
  if (!existsSync(NODE_MODULES_AP)) {
    console.error(`[generate-registry] @activepieces directory not found at ${NODE_MODULES_AP}`);
    console.error("  Run 'pnpm install' in the API service first.");
    process.exit(1);
  }

  const entries: GeneratedEntry[] = [];
  const dirs = await readdir(NODE_MODULES_AP);

  const piecePackages = dirs.filter(
    (d) => d.startsWith("piece-") && !SKIP_PACKAGES.has(d),
  );

  console.log(`[generate-registry] Found ${piecePackages.length} piece package(s) to scan.`);

  // We need require() because Activepieces pieces use CommonJS
  const require = createRequire(join(API_ROOT, "package.json"));

  for (const dir of piecePackages) {
    const packageName = `@activepieces/${dir}`;

    try {
      console.log(`  Scanning ${packageName}...`);

      const mod = require(packageName);

      // Find the Piece export — it's typically the default export or a named export
      // that is an instance of Piece (has .displayName, .actions(), .triggers())
      let piece: any = null;

      for (const [key, value] of Object.entries(mod)) {
        if (
          value &&
          typeof value === "object" &&
          "displayName" in value &&
          typeof (value as any).actions === "function" &&
          typeof (value as any).triggers === "function"
        ) {
          piece = value;
          break;
        }
      }

      if (!piece) {
        console.warn(`  [WARN] No Piece export found in ${packageName}, skipping.`);
        continue;
      }

      const id = pieceIdFromPackage(dir);
      const displayName: string = piece.displayName || dir.replace(/^piece-/, "");
      const description: string = piece.description || `Integrate with ${displayName}.`;
      const logoUrl: string = piece.logoUrl || `https://cdn.activepieces.com/pieces/${dir.replace("piece-", "")}.png`;
      const categories: string[] = piece.categories || [];

      // Extract auth info
      const authInfo = extractAuth(piece.auth);

      // Extract action names
      const actionsMap = piece.actions();
      const actionNames = Object.keys(actionsMap);

      // Extract trigger names
      const triggersMap = piece.triggers();
      const triggerNames = Object.keys(triggersMap);

      // Determine category
      const category = guessCategory(categories, packageName);

      // Generate tags
      const tags = generateTags(displayName, description, category);

      entries.push({
        id,
        piecePackage: packageName,
        displayName,
        description,
        logoUrl,
        category,
        tags,
        authType: authInfo.authType,
        oauth2Config: authInfo.oauth2Config,
        customAuthFields: authInfo.customAuthFields,
        actions: actionNames,
        triggers: triggerNames,
        tier: "community",
        requiresOAuthApp: authInfo.authType === "oauth2",
        supportsUserProvidedCredentials: true,
      });

      console.log(
        `    -> ${displayName}: ${actionNames.length} actions, ${triggerNames.length} triggers, auth=${authInfo.authType}`,
      );
    } catch (err: any) {
      console.warn(`  [WARN] Failed to load ${packageName}: ${err.message}`);
      continue;
    }
  }

  return entries;
}

// ─── Code Generation ────────────────────────────────────

function stringifyValue(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  const innerPad = "  ".repeat(indent + 1);

  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${innerPad}${stringifyValue(v, indent + 1)}`);
    return `[\n${items.join(",\n")},\n${pad}]`;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    const lines = keys.map((k) => {
      const v = obj[k];
      if (v === undefined) return null;
      // Use identifier-safe keys without quotes, otherwise quote them
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
      return `${innerPad}${safeKey}: ${stringifyValue(v, indent + 1)}`;
    }).filter(Boolean);
    return `{\n${lines.join(",\n")},\n${pad}}`;
  }

  return String(value);
}

function generateTypeScript(entries: GeneratedEntry[]): string {
  const lines: string[] = [];

  lines.push("// ─── Auto-Generated Integration Registry ────────────────");
  lines.push("//");
  lines.push("// DO NOT EDIT — this file is generated by tools/generate-registry.ts");
  lines.push(`// Generated at: ${new Date().toISOString()}`);
  lines.push(`// Pieces scanned: ${entries.length}`);
  lines.push("//");
  lines.push("");
  lines.push('import type { IntegrationDefinition } from "../types.js";');
  lines.push("");
  lines.push("export const GENERATED_REGISTRY: Record<string, IntegrationDefinition> = {");

  for (const entry of entries) {
    lines.push("");
    lines.push(`  ${entry.id}: {`);
    lines.push(`    id: ${JSON.stringify(entry.id)},`);
    lines.push(`    piecePackage: ${JSON.stringify(entry.piecePackage)},`);
    lines.push(`    displayName: ${JSON.stringify(entry.displayName)},`);
    lines.push(`    description: ${JSON.stringify(entry.description)},`);
    lines.push(`    logoUrl: ${JSON.stringify(entry.logoUrl)},`);
    lines.push(`    category: ${JSON.stringify(entry.category)},`);
    lines.push(`    tags: ${stringifyValue(entry.tags, 2)},`);
    lines.push(`    authType: ${JSON.stringify(entry.authType)},`);

    if (entry.oauth2Config) {
      lines.push(`    oauth2Config: ${stringifyValue(entry.oauth2Config, 2)},`);
    }

    if (entry.customAuthFields && entry.customAuthFields.length > 0) {
      lines.push(`    customAuthFields: ${stringifyValue(entry.customAuthFields, 2)},`);
    }

    lines.push(`    actions: ${stringifyValue(entry.actions, 2)},`);

    if (entry.triggers.length > 0) {
      lines.push(`    triggers: ${stringifyValue(entry.triggers, 2)},`);
    }

    lines.push(`    tier: ${JSON.stringify(entry.tier)},`);
    lines.push(`    requiresOAuthApp: ${entry.requiresOAuthApp},`);
    lines.push(`    supportsUserProvidedCredentials: ${entry.supportsUserProvidedCredentials},`);
    lines.push("  },");
  }

  lines.push("};");
  lines.push("");

  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log("[generate-registry] Starting scan...\n");

  const entries = await scanPieces();

  if (entries.length === 0) {
    console.log("\n[generate-registry] No pieces found. Writing empty registry.");
  }

  // Ensure output directory exists
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Generate and write TypeScript
  const code = generateTypeScript(entries);
  await writeFile(OUTPUT_FILE, code, "utf-8");

  console.log(`\n[generate-registry] Wrote ${entries.length} entries to ${OUTPUT_FILE}`);

  // Summary
  const categories = new Map<string, number>();
  for (const e of entries) {
    categories.set(e.category, (categories.get(e.category) || 0) + 1);
  }
  if (categories.size > 0) {
    console.log("\n  Category breakdown:");
    for (const [cat, count] of [...categories.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat}: ${count}`);
    }
  }

  console.log("\n[generate-registry] Done.");
}

main().catch((err) => {
  console.error("[generate-registry] Fatal error:", err);
  process.exit(1);
});
