#!/usr/bin/env npx tsx
/**
 * Integration Test Harness
 *
 * Validates all registered integrations: piece loading, metadata,
 * action schemas, and auth type consistency.
 *
 * Usage:
 *   npx tsx tools/test-integrations.ts              # Full validation
 *   npx tsx tools/test-integrations.ts --list-actions       # List all piece actions
 *   npx tsx tools/test-integrations.ts --check-installed    # Check installed vs missing
 *   npx tsx tools/test-integrations.ts --verbose            # Show detailed output
 *   npx tsx tools/test-integrations.ts --json-only          # Only write JSON, no stdout summary
 *   npx tsx tools/test-integrations.ts --filter slack,openai # Test specific integrations only
 *
 * Report written to: tools/integration-test-report.json
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// ─── Resolve paths ──────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const API_DIR = path.resolve(ROOT, "services", "api");
const REPORT_PATH = path.resolve(__dirname, "integration-test-report.json");

// ─── Import registry (adjust path for direct ts execution) ──

// We dynamically import the registry to avoid needing the full API
// build chain. tsx handles the TypeScript transpilation.
const registryFile = path.resolve(API_DIR, "src", "integrations", "registry", "index.ts");
// On Windows, dynamic import() requires file:// URLs for absolute paths
const registryPath = pathToFileURL(registryFile).href;

// ─── Types ──────────────────────────────────────────────

interface IntegrationDefinition {
  id: string;
  piecePackage: string;
  displayName: string;
  description: string;
  logoUrl: string;
  category: string;
  tags: string[];
  authType: string;
  oauth2Config?: Record<string, unknown>;
  customAuthFields?: Array<Record<string, unknown>>;
  actions: string[];
  actionOverrides?: Record<string, { description?: string; hidden?: boolean }>;
  triggers?: string[];
  tier: string;
  requiresOAuthApp: boolean;
  supportsUserProvidedCredentials: boolean;
}

interface ActionReport {
  name: string;
  found: boolean;
  displayName?: string;
  description?: string;
  hasProps: boolean;
  propCount: number;
  propNames: string[];
  schemaValid: boolean;
  schemaErrors: string[];
}

interface IntegrationReport {
  id: string;
  displayName: string;
  piecePackage: string;
  status: "passed" | "failed" | "not_installed";
  pieceLoaded: boolean;
  installError?: string;

  // Metadata checks
  hasDisplayName: boolean;
  hasDescription: boolean;
  hasAuth: boolean;
  authTypeMatch: boolean;
  registryAuthType: string;
  pieceAuthType?: string;

  // Action checks
  actionCount: number;
  actionsValidated: number;
  actionsFailed: number;
  actions: ActionReport[];

  // All available actions on the piece (not just registered ones)
  allPieceActions?: string[];

  errors: string[];
  warnings: string[];
}

interface TestReport {
  generatedAt: string;
  totalIntegrations: number;
  passed: number;
  failed: number;
  notInstalled: number;
  integrations: IntegrationReport[];
}

// ─── Auth type mapping ──────────────────────────────────

/** Map Activepieces PropertyType auth constants to our AuthType strings */
const PIECE_AUTH_TYPE_MAP: Record<string, string> = {
  OAUTH2: "oauth2",
  SECRET_TEXT: "secret_text",
  CUSTOM_AUTH: "custom_auth",
  BASIC_AUTH: "basic_auth",
};

function mapPieceAuthType(pieceAuth: unknown): string {
  if (pieceAuth === undefined || pieceAuth === null) return "none";

  // If it's an array of auth options, check the first one
  const authObj = Array.isArray(pieceAuth) ? pieceAuth[0] : pieceAuth;

  if (typeof authObj === "object" && authObj !== null) {
    const type = (authObj as Record<string, unknown>).type as string | undefined;
    if (type && PIECE_AUTH_TYPE_MAP[type]) {
      return PIECE_AUTH_TYPE_MAP[type];
    }
    // Fallback: check for known shapes
    if ("authUrl" in authObj && "tokenUrl" in authObj) return "oauth2";
    if (type) return type.toLowerCase();
  }

  return "unknown";
}

// ─── Prop schema validation ─────────────────────────────

const KNOWN_PROP_TYPES = new Set([
  "SHORT_TEXT",
  "LONG_TEXT",
  "MARKDOWN",
  "DROPDOWN",
  "STATIC_DROPDOWN",
  "NUMBER",
  "CHECKBOX",
  "OAUTH2",
  "SECRET_TEXT",
  "ARRAY",
  "OBJECT",
  "BASIC_AUTH",
  "JSON",
  "MULTI_SELECT_DROPDOWN",
  "STATIC_MULTI_SELECT_DROPDOWN",
  "DYNAMIC",
  "CUSTOM_AUTH",
  "DATE_TIME",
  "FILE",
  "CUSTOM",
  "COLOR",
]);

function validatePropSchema(
  propName: string,
  prop: unknown,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (prop === null || prop === undefined) {
    errors.push(`Prop "${propName}" is null/undefined`);
    return { valid: false, errors };
  }

  if (typeof prop !== "object") {
    errors.push(`Prop "${propName}" is not an object (got ${typeof prop})`);
    return { valid: false, errors };
  }

  const p = prop as Record<string, unknown>;

  // Check type field
  if (!p.type) {
    errors.push(`Prop "${propName}" missing 'type' field`);
  } else if (typeof p.type !== "string") {
    errors.push(`Prop "${propName}" type is not a string`);
  } else if (!KNOWN_PROP_TYPES.has(p.type)) {
    errors.push(`Prop "${propName}" has unknown type: ${p.type}`);
  }

  // Markdown is display-only, skip further checks
  if (p.type === "MARKDOWN") {
    return { valid: errors.length === 0, errors };
  }

  // Check displayName (should exist for user-facing props)
  if (!p.displayName && p.type !== "MARKDOWN") {
    errors.push(`Prop "${propName}" missing 'displayName'`);
  }

  // Static dropdown should have options
  if (p.type === "STATIC_DROPDOWN") {
    if (!p.options) {
      errors.push(`Prop "${propName}" is STATIC_DROPDOWN but missing 'options'`);
    } else if (typeof p.options === "object" && p.options !== null) {
      const opts = p.options as Record<string, unknown>;
      if (!opts.options || !Array.isArray(opts.options)) {
        // Some static dropdowns wrap options in { options: [...] }
        // This is acceptable
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Piece loading ──────────────────────────────────────

/**
 * Use createRequire anchored at the API directory so that
 * `import()` resolves @activepieces packages from
 * services/api/node_modules regardless of where this script runs.
 */
const apiRequire = createRequire(path.join(API_DIR, "package.json"));

function resolvePackage(pkg: string): string | null {
  try {
    // resolve() returns the full path to the package entry point
    return apiRequire.resolve(pkg);
  } catch {
    return null;
  }
}

/**
 * Find the Piece instance among a module's exports.
 *
 * Activepieces packages export a named piece object (e.g., `openai`)
 * alongside auth helpers (e.g., `openaiAuth`). The piece is the export
 * that has `displayName` and either `getAction` method or `actions`.
 */
function findPieceExport(mod: Record<string, unknown>): unknown {
  // Try default export first
  if (mod.default && isPieceLike(mod.default)) {
    return mod.default;
  }

  // Search named exports for a Piece-like object
  for (const [, value] of Object.entries(mod)) {
    if (isPieceLike(value)) {
      return value;
    }
  }

  // Fallback: return default or first export
  const firstKey = Object.keys(mod)[0];
  return mod.default ?? (firstKey ? mod[firstKey] : undefined);
}

function isPieceLike(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  // A Piece has displayName and either getAction method or actions
  return (
    typeof o.displayName === "string" &&
    (typeof o.getAction === "function" || typeof o.actions === "function")
  );
}

async function tryLoadPiece(
  piecePackage: string,
): Promise<{ piece: unknown; error?: string }> {
  try {
    // First resolve via the API service's node_modules
    const resolved = resolvePackage(piecePackage);
    if (!resolved) {
      return { piece: null, error: "not_installed" };
    }

    // Convert to file:// URL for dynamic import on Windows
    const importUrl = pathToFileURL(resolved).href;
    const mod = await import(importUrl);
    const piece = findPieceExport(mod);
    if (!piece) {
      return { piece: null, error: `No piece export found in ${piecePackage}` };
    }
    return { piece };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Check if it's a "module not found" error
    if (
      msg.includes("Cannot find package") ||
      msg.includes("MODULE_NOT_FOUND") ||
      msg.includes("ERR_MODULE_NOT_FOUND") ||
      msg.includes("Cannot find module")
    ) {
      return { piece: null, error: "not_installed" };
    }
    return { piece: null, error: msg };
  }
}

function getPieceActions(piece: unknown): Record<string, unknown> {
  if (typeof piece !== "object" || piece === null) return {};

  const p = piece as Record<string, unknown>;

  // Piece class exposes actions() as a method returning Record<string, Action>
  if (typeof p.actions === "function") {
    try {
      return (p as any).actions() as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  // Fallback: direct property
  if (typeof p.actions === "object" && p.actions !== null) {
    return p.actions as Record<string, unknown>;
  }

  return {};
}

function getPieceAction(piece: unknown, actionName: string): unknown {
  if (typeof piece !== "object" || piece === null) return undefined;

  const p = piece as Record<string, unknown>;

  // Prefer getAction method (Piece class)
  if (typeof p.getAction === "function") {
    try {
      return (p as any).getAction(actionName);
    } catch {
      // fall through
    }
  }

  // Fallback: actions record
  const actions = getPieceActions(piece);
  return actions[actionName];
}

function getPieceAuth(piece: unknown): unknown {
  if (typeof piece !== "object" || piece === null) return undefined;
  return (piece as Record<string, unknown>).auth;
}

function getPieceMetadata(
  piece: unknown,
): { displayName?: string; description?: string } {
  if (typeof piece !== "object" || piece === null) return {};
  const p = piece as Record<string, unknown>;
  return {
    displayName: p.displayName as string | undefined,
    description: p.description as string | undefined,
  };
}

// ─── Test runner ────────────────────────────────────────

async function testIntegration(
  def: IntegrationDefinition,
  verbose: boolean,
): Promise<IntegrationReport> {
  const report: IntegrationReport = {
    id: def.id,
    displayName: def.displayName,
    piecePackage: def.piecePackage,
    status: "passed",
    pieceLoaded: false,
    hasDisplayName: false,
    hasDescription: false,
    hasAuth: false,
    authTypeMatch: false,
    registryAuthType: def.authType,
    actionCount: def.actions.length,
    actionsValidated: 0,
    actionsFailed: 0,
    actions: [],
    errors: [],
    warnings: [],
  };

  // 1. Load piece
  if (verbose) {
    process.stdout.write(`  Loading ${def.piecePackage}... `);
  }

  const { piece, error: loadError } = await tryLoadPiece(def.piecePackage);

  if (loadError === "not_installed") {
    report.status = "not_installed";
    report.installError = `npm install ${def.piecePackage}`;
    if (verbose) console.log("NOT INSTALLED");
    return report;
  }

  if (loadError || !piece) {
    report.status = "failed";
    report.errors.push(`Piece load failed: ${loadError}`);
    if (verbose) console.log(`FAILED (${loadError})`);
    return report;
  }

  report.pieceLoaded = true;
  if (verbose) console.log("OK");

  // 2. Metadata validation
  const meta = getPieceMetadata(piece);

  report.hasDisplayName = !!meta.displayName;
  if (!meta.displayName) {
    report.warnings.push("Piece missing displayName");
  }

  report.hasDescription = !!meta.description;
  if (!meta.description) {
    report.warnings.push("Piece missing description");
  }

  // 3. Auth type check
  const pieceAuth = getPieceAuth(piece);
  report.hasAuth = pieceAuth !== undefined && pieceAuth !== null;
  const pieceAuthType = mapPieceAuthType(pieceAuth);
  report.pieceAuthType = pieceAuthType;

  // "none" in registry should match undefined/null auth on piece
  if (def.authType === "none") {
    report.authTypeMatch = !report.hasAuth || pieceAuthType === "none";
  } else {
    report.authTypeMatch = pieceAuthType === def.authType;
  }

  if (!report.authTypeMatch) {
    report.errors.push(
      `Auth type mismatch: registry says "${def.authType}", piece has "${pieceAuthType}"`,
    );
  }

  // 4. Collect all piece actions for reference
  const allActions = getPieceActions(piece);
  report.allPieceActions = Object.keys(allActions);

  // 5. Validate each registered action
  for (const actionName of def.actions) {
    const actionReport: ActionReport = {
      name: actionName,
      found: false,
      hasProps: false,
      propCount: 0,
      propNames: [],
      schemaValid: false,
      schemaErrors: [],
    };

    const action = getPieceAction(piece, actionName);

    if (!action) {
      actionReport.found = false;
      const available = report.allPieceActions?.join(", ") ?? "unknown";
      report.errors.push(
        `Action "${actionName}" not found (available: ${available})`,
      );
      report.actionsFailed++;
      report.actions.push(actionReport);
      continue;
    }

    actionReport.found = true;

    const a = action as Record<string, unknown>;
    actionReport.displayName = a.displayName as string | undefined;
    actionReport.description = a.description as string | undefined;

    // Validate props
    const props = a.props;
    if (props && typeof props === "object") {
      actionReport.hasProps = true;
      const propEntries = Object.entries(props as Record<string, unknown>);
      actionReport.propCount = propEntries.length;
      actionReport.propNames = propEntries.map(([k]) => k);

      // Validate each prop's schema
      let allValid = true;
      for (const [propName, propDef] of propEntries) {
        const result = validatePropSchema(propName, propDef);
        if (!result.valid) {
          allValid = false;
          actionReport.schemaErrors.push(...result.errors);
        }
      }
      actionReport.schemaValid = allValid;
    } else {
      // Actions with zero props are valid (e.g., "list" actions)
      actionReport.hasProps = false;
      actionReport.propCount = 0;
      actionReport.schemaValid = true;
    }

    if (actionReport.schemaErrors.length > 0) {
      report.warnings.push(
        `Action "${actionName}" has schema issues: ${actionReport.schemaErrors.join("; ")}`,
      );
    }

    report.actionsValidated++;
    report.actions.push(actionReport);
  }

  // Determine overall status
  if (report.errors.length > 0) {
    report.status = "failed";
  }

  return report;
}

// ─── Modes ──────────────────────────────────────────────

async function runListActions(
  registry: Record<string, IntegrationDefinition>,
  filter?: string[],
): Promise<void> {
  const ids = filter ?? Object.keys(registry);

  console.log("\nAvailable Actions by Integration");
  console.log("================================\n");

  for (const id of ids) {
    const def = registry[id];
    if (!def) {
      console.log(`[?] ${id} - not in registry\n`);
      continue;
    }

    const { piece, error } = await tryLoadPiece(def.piecePackage);

    if (error === "not_installed") {
      console.log(`[!] ${def.displayName} (${def.piecePackage}) - NOT INSTALLED\n`);
      continue;
    }

    if (error || !piece) {
      console.log(`[!] ${def.displayName} (${def.piecePackage}) - LOAD ERROR: ${error}\n`);
      continue;
    }

    const allActions = getPieceActions(piece);
    const actionNames = Object.keys(allActions);
    const registeredSet = new Set(def.actions);

    console.log(`${def.displayName} (${def.piecePackage})`);
    console.log(`  Registered: ${def.actions.length} | Available: ${actionNames.length}`);

    for (const name of actionNames.sort()) {
      const a = allActions[name] as Record<string, unknown> | undefined;
      const displayName = a?.displayName ?? name;
      const registered = registeredSet.has(name);
      const marker = registered ? "[R]" : "[ ]";
      const props = a?.props
        ? Object.keys(a.props as Record<string, unknown>).length
        : 0;

      console.log(`  ${marker} ${name} — ${displayName} (${props} props)`);
    }

    // Check for registered actions not found on piece
    for (const regAction of def.actions) {
      if (!actionNames.includes(regAction)) {
        console.log(`  [!] ${regAction} — REGISTERED BUT NOT FOUND ON PIECE`);
      }
    }

    console.log();
  }
}

async function runCheckInstalled(
  registry: Record<string, IntegrationDefinition>,
  filter?: string[],
): Promise<void> {
  const ids = filter ?? Object.keys(registry);
  const installed: string[] = [];
  const missing: string[] = [];
  const errored: string[] = [];

  console.log("\nInstallation Check");
  console.log("==================\n");

  for (const id of ids) {
    const def = registry[id];
    if (!def) continue;

    const { piece, error } = await tryLoadPiece(def.piecePackage);

    if (error === "not_installed") {
      missing.push(id);
      console.log(`  [ ] ${def.displayName} — ${def.piecePackage}`);
    } else if (error || !piece) {
      errored.push(id);
      console.log(`  [!] ${def.displayName} — ${def.piecePackage} (ERROR: ${error})`);
    } else {
      installed.push(id);
      console.log(`  [x] ${def.displayName} — ${def.piecePackage}`);
    }
  }

  console.log(`\nInstalled: ${installed.length} | Missing: ${missing.length} | Errors: ${errored.length}`);

  if (missing.length > 0) {
    console.log("\nInstall missing packages:");
    const packages = missing.map((id) => registry[id]!.piecePackage);
    console.log(`  pnpm add ${packages.join(" ")}`);
  }
}

// ─── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const listActions = args.includes("--list-actions");
  const checkInstalled = args.includes("--check-installed");
  const verbose = args.includes("--verbose");
  const jsonOnly = args.includes("--json-only");

  // Parse --filter
  let filter: string[] | undefined;
  const filterIdx = args.indexOf("--filter");
  if (filterIdx !== -1 && args[filterIdx + 1]) {
    filter = args[filterIdx + 1].split(",").map((s) => s.trim());
  }

  // Load the registry dynamically
  let REGISTRY: Record<string, IntegrationDefinition>;
  try {
    const mod = await import(registryPath);
    REGISTRY = mod.REGISTRY;
    if (!REGISTRY || typeof REGISTRY !== "object") {
      throw new Error("REGISTRY export not found or not an object");
    }
  } catch (err) {
    console.error(
      `Failed to load registry from ${registryPath}:`,
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  const totalCount = Object.keys(REGISTRY).length;

  if (!jsonOnly) {
    console.log(`\nLoaded registry with ${totalCount} integration(s)`);
  }

  // ── Mode: list actions ──
  if (listActions) {
    await runListActions(REGISTRY, filter);
    return;
  }

  // ── Mode: check installed ──
  if (checkInstalled) {
    await runCheckInstalled(REGISTRY, filter);
    return;
  }

  // ── Mode: full validation ──
  const ids = filter ?? Object.keys(REGISTRY);
  const integrationReports: IntegrationReport[] = [];

  if (!jsonOnly) {
    console.log(`Running validation for ${ids.length} integration(s)...\n`);
  }

  for (const id of ids) {
    const def = REGISTRY[id];
    if (!def) {
      if (!jsonOnly) console.log(`  [?] "${id}" not found in registry, skipping`);
      continue;
    }

    if (verbose && !jsonOnly) {
      console.log(`Testing: ${def.displayName} (${def.id})`);
    }

    const report = await testIntegration(def, verbose && !jsonOnly);
    integrationReports.push(report);

    if (verbose && !jsonOnly) {
      console.log();
    }
  }

  // Build summary
  const passed = integrationReports.filter((r) => r.status === "passed").length;
  const failed = integrationReports.filter((r) => r.status === "failed").length;
  const notInstalled = integrationReports.filter((r) => r.status === "not_installed").length;

  const testReport: TestReport = {
    generatedAt: new Date().toISOString(),
    totalIntegrations: ids.length,
    passed,
    failed,
    notInstalled,
    integrations: integrationReports,
  };

  // Write JSON report
  fs.writeFileSync(REPORT_PATH, JSON.stringify(testReport, null, 2), "utf-8");

  if (!jsonOnly) {
    // Print summary
    console.log("Integration Test Report");
    console.log("=======================");
    console.log(
      `Total: ${ids.length} | Passed: ${passed} | Failed: ${failed} | Not Installed: ${notInstalled}`,
    );
    console.log();

    for (const r of integrationReports) {
      if (r.status === "passed") {
        console.log(
          `  \u2713 ${r.id} (${r.actionsValidated} action${r.actionsValidated !== 1 ? "s" : ""}) \u2014 all actions validated`,
        );
      } else if (r.status === "not_installed") {
        console.log(
          `  \u2717 ${r.id} \u2014 piece not installed (${r.installError})`,
        );
      } else {
        // failed
        for (const err of r.errors) {
          console.log(`  \u2717 ${r.id} \u2014 ${err}`);
        }
      }

      // Show warnings in verbose mode
      if (verbose && r.warnings.length > 0) {
        for (const w of r.warnings) {
          console.log(`    \u26a0 ${w}`);
        }
      }
    }

    console.log();
    console.log(`Report written to: ${REPORT_PATH}`);
  }

  // Exit with failure code if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
