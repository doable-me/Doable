#!/usr/bin/env npx tsx
/**
 * Integration Bulk Test Suite
 *
 * Validates ALL integrations across 4 levels without needing real credentials.
 *
 * Usage:
 *   cd services/api && npx tsx ../../tools/test-integrations-bulk.ts
 *   cd services/api && npx tsx ../../tools/test-integrations-bulk.ts --level 1
 *   cd services/api && npx tsx ../../tools/test-integrations-bulk.ts --level 2
 *   cd services/api && npx tsx ../../tools/test-integrations-bulk.ts --level 1,2,3
 *   cd services/api && npx tsx ../../tools/test-integrations-bulk.ts --filter slack,gmail
 *   cd services/api && npx tsx ../../tools/test-integrations-bulk.ts --fix
 *   cd services/api && npx tsx ../../tools/test-integrations-bulk.ts --verbose
 *
 * Levels:
 *   1: Package Loading        - Can the npm package be imported?
 *   2: Schema Validation      - Do registered actions exist on the piece?
 *   3: Auth Type Validation   - Does registry auth type match the piece?
 *   4: Dry-Run Action Test    - Call action.run() with mock credentials
 *
 * Report written to: tools/bulk-test-report.json
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// ─── Resolve paths ──────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const API_DIR = path.resolve(ROOT, "services", "api");
const REPORT_PATH = path.resolve(__dirname, "bulk-test-report.json");

const registryFile = path.resolve(API_DIR, "src", "integrations", "registry", "index.ts");
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
  oauth2Config?: {
    authUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    [key: string]: unknown;
  };
  customAuthFields?: Array<{
    name: string;
    displayName: string;
    type?: string;
    required?: boolean;
    [key: string]: unknown;
  }>;
  actions: string[];
  actionOverrides?: Record<string, { description?: string; hidden?: boolean }>;
  triggers?: string[];
  tier: string;
  requiresOAuthApp: boolean;
  supportsUserProvidedCredentials: boolean;
}

// ─── Report types ───────────────────────────────────────

interface Level1Result {
  id: string;
  package: string;
  loaded: boolean;
  hasDisplayName: boolean;
  hasActions: boolean;
  hasTriggers: boolean;
  actionCount: number;
  triggerCount: number;
  error?: string;
}

interface ActionMismatch {
  registryAction: string;
  found: boolean;
  suggestion?: string;
}

interface Level2Result {
  id: string;
  package: string;
  allActionsValid: boolean;
  registeredActionCount: number;
  pieceActionCount: number;
  mismatches: ActionMismatch[];
  propErrors: Array<{ action: string; prop: string; error: string }>;
  pieceActions: string[];
}

interface Level3Result {
  id: string;
  registryAuthType: string;
  pieceAuthType: string;
  match: boolean;
  oauth2Valid?: boolean;
  oauth2Errors?: string[];
  customAuthFields?: string[];
  errors: string[];
}

interface DryRunActionResult {
  action: string;
  outcome: "ok" | "expected_error" | "crash";
  errorType?: string;
  errorMessage?: string;
}

interface Level4Result {
  id: string;
  actions: DryRunActionResult[];
  totalActions: number;
  ok: number;
  expectedErrors: number;
  crashes: number;
}

interface BulkTestReport {
  generatedAt: string;
  totalIntegrations: number;
  levelsRun: number[];
  level1?: {
    total: number;
    loaded: number;
    failed: number;
    notInstalled: number;
    results: Level1Result[];
  };
  level2?: {
    total: number;
    allValid: number;
    withMismatches: number;
    results: Level2Result[];
  };
  level3?: {
    total: number;
    matched: number;
    mismatched: number;
    results: Level3Result[];
  };
  level4?: {
    total: number;
    ok: number;
    expectedErrors: number;
    crashes: number;
    results: Level4Result[];
  };
}

// ─── Piece loading utilities ────────────────────────────

const apiRequire = createRequire(path.join(API_DIR, "package.json"));

function resolvePackage(pkg: string): string | null {
  try {
    return apiRequire.resolve(pkg);
  } catch {
    return null;
  }
}

function isPieceLike(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.displayName === "string" &&
    (typeof o.getAction === "function" || typeof o.actions === "function")
  );
}

function findPieceExport(mod: Record<string, unknown>): unknown {
  if (mod.default && isPieceLike(mod.default)) return mod.default;
  for (const [, value] of Object.entries(mod)) {
    if (isPieceLike(value)) return value;
  }
  const firstKey = Object.keys(mod)[0];
  return mod.default ?? (firstKey ? mod[firstKey] : undefined);
}

/** Cache loaded pieces across all levels */
const pieceCache = new Map<string, { piece: unknown; error?: string }>();

async function loadPiece(
  piecePackage: string,
): Promise<{ piece: unknown; error?: string }> {
  if (pieceCache.has(piecePackage)) return pieceCache.get(piecePackage)!;

  try {
    const resolved = resolvePackage(piecePackage);
    if (!resolved) {
      const result = { piece: null, error: "not_installed" };
      pieceCache.set(piecePackage, result);
      return result;
    }
    const importUrl = pathToFileURL(resolved).href;
    const mod = await import(importUrl);
    const piece = findPieceExport(mod);
    if (!piece) {
      const result = { piece: null, error: `No piece export found in ${piecePackage}` };
      pieceCache.set(piecePackage, result);
      return result;
    }
    const result = { piece };
    pieceCache.set(piecePackage, result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("Cannot find package") ||
      msg.includes("MODULE_NOT_FOUND") ||
      msg.includes("ERR_MODULE_NOT_FOUND") ||
      msg.includes("Cannot find module")
    ) {
      const result = { piece: null, error: "not_installed" };
      pieceCache.set(piecePackage, result);
      return result;
    }
    const result = { piece: null, error: msg };
    pieceCache.set(piecePackage, result);
    return result;
  }
}

function getPieceActions(piece: unknown): Record<string, unknown> {
  if (typeof piece !== "object" || piece === null) return {};
  const p = piece as Record<string, unknown>;
  if (typeof p.actions === "function") {
    try { return (p as any).actions() as Record<string, unknown>; } catch { return {}; }
  }
  if (typeof p.actions === "object" && p.actions !== null) {
    return p.actions as Record<string, unknown>;
  }
  return {};
}

function getPieceAction(piece: unknown, actionName: string): unknown {
  if (typeof piece !== "object" || piece === null) return undefined;
  const p = piece as Record<string, unknown>;
  if (typeof p.getAction === "function") {
    try { return (p as any).getAction(actionName); } catch { /* fall through */ }
  }
  const actions = getPieceActions(piece);
  return actions[actionName];
}

function getPieceAuth(piece: unknown): unknown {
  if (typeof piece !== "object" || piece === null) return undefined;
  return (piece as Record<string, unknown>).auth;
}

function getPieceTriggers(piece: unknown): Record<string, unknown> {
  if (typeof piece !== "object" || piece === null) return {};
  const p = piece as Record<string, unknown>;
  if (typeof p.triggers === "function") {
    try { return (p as any).triggers() as Record<string, unknown>; } catch { return {}; }
  }
  if (typeof p.triggers === "object" && p.triggers !== null) {
    return p.triggers as Record<string, unknown>;
  }
  return {};
}

// ─── Auth type mapping ──────────────────────────────────

const PIECE_AUTH_TYPE_MAP: Record<string, string> = {
  OAUTH2: "oauth2",
  SECRET_TEXT: "secret_text",
  CUSTOM_AUTH: "custom_auth",
  BASIC_AUTH: "basic_auth",
};

function mapPieceAuthType(pieceAuth: unknown): string {
  if (pieceAuth === undefined || pieceAuth === null) return "none";
  const authObj = Array.isArray(pieceAuth) ? pieceAuth[0] : pieceAuth;
  if (typeof authObj === "object" && authObj !== null) {
    const type = (authObj as Record<string, unknown>).type as string | undefined;
    if (type && PIECE_AUTH_TYPE_MAP[type]) return PIECE_AUTH_TYPE_MAP[type];
    if ("authUrl" in authObj && "tokenUrl" in authObj) return "oauth2";
    if (type) return type.toLowerCase();
  }
  return "unknown";
}

// ─── Prop validation ────────────────────────────────────

const KNOWN_PROP_TYPES = new Set([
  "SHORT_TEXT", "LONG_TEXT", "MARKDOWN", "DROPDOWN", "STATIC_DROPDOWN",
  "NUMBER", "CHECKBOX", "OAUTH2", "SECRET_TEXT", "ARRAY", "OBJECT",
  "BASIC_AUTH", "JSON", "MULTI_SELECT_DROPDOWN", "STATIC_MULTI_SELECT_DROPDOWN",
  "DYNAMIC", "CUSTOM_AUTH", "DATE_TIME", "FILE", "CUSTOM", "COLOR",
]);

function validateProp(propName: string, prop: unknown): string[] {
  const errors: string[] = [];
  if (prop === null || prop === undefined) {
    errors.push(`null/undefined`);
    return errors;
  }
  if (typeof prop !== "object") {
    errors.push(`not an object (${typeof prop})`);
    return errors;
  }
  const p = prop as Record<string, unknown>;
  if (!p.type) {
    errors.push(`missing 'type'`);
  } else if (typeof p.type !== "string") {
    errors.push(`type is not a string`);
  } else if (!KNOWN_PROP_TYPES.has(p.type)) {
    errors.push(`unknown type: ${p.type}`);
  }
  if (p.type !== "MARKDOWN" && !p.displayName) {
    errors.push(`missing 'displayName'`);
  }
  return errors;
}

// ─── Mock ActionContext builder ─────────────────────────

function buildMockActionContext(params: {
  auth: unknown;
  props: Record<string, unknown>;
}): Record<string, unknown> {
  const inMemoryStore = new Map<string, unknown>();
  return {
    auth: params.auth,
    propsValue: params.props,
    executionType: "BEGIN",
    store: {
      put: async (key: string, value: unknown) => { inMemoryStore.set(key, value); return value; },
      get: async (key: string) => inMemoryStore.get(key) ?? null,
      delete: async (key: string) => { inMemoryStore.delete(key); },
    },
    files: {
      write: async (params: { fileName: string; data: Buffer }) => `mock://files/${params.fileName}`,
    },
    server: {
      apiUrl: "http://127.0.0.1:4000",
      publicUrl: "http://127.0.0.1:4000",
      token: "mock-token-for-testing",
    },
    connections: {
      read: async () => null,
    },
    tags: { add: async () => {} },
    output: { update: async () => {} },
    agent: { tools: async () => ({}) },
    project: {
      id: "mock-project-id",
      externalId: async () => undefined,
    },
    flows: {
      current: { id: "mock-flow", version: { id: "1" } },
      list: async () => ({ data: [], next: null, previous: null }),
    },
    step: { name: "bulk_test_action" },
    run: {
      id: crypto.randomUUID(),
      stop: () => ({ type: "STOP" }),
      pause: () => ({ type: "PAUSE" }),
      respond: () => ({}),
    },
    generateResumeUrl: () => "",
  };
}

/**
 * Build a mock auth value based on auth type.
 * These are fake credentials that will fail API calls
 * but should not cause TypeErrors in the action code.
 */
function buildMockAuth(authType: string, def: IntegrationDefinition): unknown {
  switch (authType) {
    case "oauth2":
      return {
        access_token: "mock-access-token-for-testing",
        refresh_token: "mock-refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
        claimed_at: Math.floor(Date.now() / 1000),
        data: {},
      };
    case "secret_text":
      return "mock-api-key-for-testing";
    case "custom_auth": {
      // Build object with all custom fields populated
      const obj: Record<string, string> = {};
      if (def.customAuthFields) {
        for (const field of def.customAuthFields) {
          obj[field.name] = `mock-${field.name}-value`;
        }
      } else {
        obj.apiKey = "mock-api-key";
      }
      return obj;
    }
    case "basic_auth":
      return { username: "mock-user", password: "mock-pass" };
    case "none":
      return undefined;
    default:
      return "mock-credentials";
  }
}

// ─── Fuzzy match helper for --fix suggestions ───────────

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function findClosestAction(target: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(target, c);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  // Only suggest if reasonably close (< 50% of target length)
  if (best && bestDist <= Math.ceil(target.length * 0.5)) return best;
  return undefined;
}

// ─── Level 1: Package Loading ───────────────────────────

async function runLevel1(
  registry: Record<string, IntegrationDefinition>,
  ids: string[],
  verbose: boolean,
): Promise<Level1Result[]> {
  const results: Level1Result[] = [];

  for (const id of ids) {
    const def = registry[id];
    if (!def) continue;

    if (verbose) process.stdout.write(`  [L1] ${def.displayName} (${def.piecePackage})... `);

    const { piece, error } = await loadPiece(def.piecePackage);

    if (error || !piece) {
      if (verbose) console.log(error === "not_installed" ? "NOT INSTALLED" : `FAILED: ${error}`);
      results.push({
        id,
        package: def.piecePackage,
        loaded: false,
        hasDisplayName: false,
        hasActions: false,
        hasTriggers: false,
        actionCount: 0,
        triggerCount: 0,
        error: error ?? "unknown error",
      });
      continue;
    }

    const p = piece as Record<string, unknown>;
    const actions = getPieceActions(piece);
    const triggers = getPieceTriggers(piece);

    const result: Level1Result = {
      id,
      package: def.piecePackage,
      loaded: true,
      hasDisplayName: typeof p.displayName === "string" && p.displayName.length > 0,
      hasActions: Object.keys(actions).length > 0,
      hasTriggers: Object.keys(triggers).length > 0,
      actionCount: Object.keys(actions).length,
      triggerCount: Object.keys(triggers).length,
    };

    if (verbose) {
      console.log(
        `OK (${result.actionCount} actions, ${result.triggerCount} triggers)`,
      );
    }

    results.push(result);
  }

  return results;
}

// ─── Level 2: Schema Validation ─────────────────────────

async function runLevel2(
  registry: Record<string, IntegrationDefinition>,
  ids: string[],
  verbose: boolean,
): Promise<Level2Result[]> {
  const results: Level2Result[] = [];

  for (const id of ids) {
    const def = registry[id];
    if (!def) continue;

    const { piece, error } = await loadPiece(def.piecePackage);
    if (error || !piece) continue; // Skip packages that didn't load

    const allActions = getPieceActions(piece);
    const pieceActionNames = Object.keys(allActions);

    const mismatches: ActionMismatch[] = [];
    const propErrors: Array<{ action: string; prop: string; error: string }> = [];

    for (const registryAction of def.actions) {
      const action = getPieceAction(piece, registryAction);
      if (!action) {
        const suggestion = findClosestAction(registryAction, pieceActionNames);
        mismatches.push({
          registryAction,
          found: false,
          suggestion,
        });
        continue;
      }

      // Validate props
      const a = action as Record<string, unknown>;
      if (a.props && typeof a.props === "object") {
        for (const [propName, propDef] of Object.entries(a.props as Record<string, unknown>)) {
          const errors = validateProp(propName, propDef);
          for (const err of errors) {
            propErrors.push({ action: registryAction, prop: propName, error: err });
          }
        }
      }
    }

    const result: Level2Result = {
      id,
      package: def.piecePackage,
      allActionsValid: mismatches.length === 0,
      registeredActionCount: def.actions.length,
      pieceActionCount: pieceActionNames.length,
      mismatches,
      propErrors,
      pieceActions: pieceActionNames,
    };

    if (verbose) {
      const status = result.allActionsValid ? "OK" : `${mismatches.length} mismatches`;
      console.log(
        `  [L2] ${def.displayName}: ${status} (${def.actions.length} registered / ${pieceActionNames.length} available)`,
      );
      for (const m of mismatches) {
        const hint = m.suggestion ? ` (did you mean "${m.suggestion}"?)` : "";
        console.log(`       - "${m.registryAction}" NOT FOUND${hint}`);
      }
    }

    results.push(result);
  }

  return results;
}

// ─── Level 3: Auth Type Validation ──────────────────────

async function runLevel3(
  registry: Record<string, IntegrationDefinition>,
  ids: string[],
  verbose: boolean,
): Promise<Level3Result[]> {
  const results: Level3Result[] = [];

  for (const id of ids) {
    const def = registry[id];
    if (!def) continue;

    const { piece, error } = await loadPiece(def.piecePackage);
    if (error || !piece) continue;

    const pieceAuth = getPieceAuth(piece);
    const pieceAuthType = mapPieceAuthType(pieceAuth);
    const errors: string[] = [];

    // Check if auth types match
    let match: boolean;
    if (def.authType === "none") {
      match = pieceAuth === undefined || pieceAuth === null || pieceAuthType === "none";
    } else {
      match = pieceAuthType === def.authType;
    }

    if (!match) {
      errors.push(`Auth type mismatch: registry="${def.authType}", piece="${pieceAuthType}"`);
    }

    // OAuth2-specific validation
    let oauth2Valid: boolean | undefined;
    let oauth2Errors: string[] | undefined;
    if (def.authType === "oauth2") {
      oauth2Errors = [];
      if (def.oauth2Config) {
        if (def.oauth2Config.authUrl) {
          try {
            new URL(def.oauth2Config.authUrl);
          } catch {
            oauth2Errors.push(`Invalid authUrl: ${def.oauth2Config.authUrl}`);
          }
        } else {
          oauth2Errors.push("Missing authUrl");
        }
        if (def.oauth2Config.tokenUrl) {
          try {
            new URL(def.oauth2Config.tokenUrl);
          } catch {
            oauth2Errors.push(`Invalid tokenUrl: ${def.oauth2Config.tokenUrl}`);
          }
        } else {
          oauth2Errors.push("Missing tokenUrl");
        }
      }
      // Also check piece-level auth for URLs
      if (pieceAuth && typeof pieceAuth === "object") {
        const pa = pieceAuth as Record<string, unknown>;
        if (pa.authUrl && typeof pa.authUrl === "string") {
          try { new URL(pa.authUrl); } catch { oauth2Errors.push(`Piece authUrl invalid: ${pa.authUrl}`); }
        }
        if (pa.tokenUrl && typeof pa.tokenUrl === "string") {
          try { new URL(pa.tokenUrl); } catch { oauth2Errors.push(`Piece tokenUrl invalid: ${pa.tokenUrl}`); }
        }
      }
      oauth2Valid = oauth2Errors.length === 0;
      if (!oauth2Valid) errors.push(...oauth2Errors);
    }

    // Custom auth validation
    let customAuthFields: string[] | undefined;
    if (def.authType === "custom_auth") {
      if (pieceAuth && typeof pieceAuth === "object") {
        const pa = pieceAuth as Record<string, unknown>;
        if (pa.props && typeof pa.props === "object") {
          customAuthFields = Object.keys(pa.props as Record<string, unknown>);
        }
      }
      if (def.customAuthFields && def.customAuthFields.length > 0) {
        const registryFields = def.customAuthFields.map((f) => f.name);
        if (customAuthFields) {
          for (const rf of registryFields) {
            if (!customAuthFields.includes(rf)) {
              errors.push(`Registry custom field "${rf}" not found in piece auth props`);
            }
          }
        }
      }
    }

    const result: Level3Result = {
      id,
      registryAuthType: def.authType,
      pieceAuthType,
      match,
      oauth2Valid,
      oauth2Errors: oauth2Errors && oauth2Errors.length > 0 ? oauth2Errors : undefined,
      customAuthFields,
      errors,
    };

    if (verbose) {
      const status = match ? "OK" : "MISMATCH";
      console.log(
        `  [L3] ${def.displayName}: ${status} (registry="${def.authType}", piece="${pieceAuthType}")`,
      );
      for (const err of errors) {
        console.log(`       - ${err}`);
      }
    }

    results.push(result);
  }

  return results;
}

// ─── Level 4: Dry-Run Action Test ───────────────────────

/** Error types that indicate expected auth/validation failures, not crashes */
const EXPECTED_ERROR_PATTERNS = [
  // Auth-related
  /unauthorized/i,
  /authentication/i,
  /auth.*fail/i,
  /invalid.*api.*key/i,
  /invalid.*token/i,
  /forbidden/i,
  /permission/i,
  /credentials/i,
  /api.*key.*required/i,
  /api.?key.*missing/i,
  /access.*denied/i,
  /not.*authenticated/i,
  /environment.*variable.*missing/i,
  /provide.*api.?key/i,
  /apiKey.*option/i,
  /401/,
  /403/,
  // Network errors
  /ENOTFOUND/,
  /ECONNREFUSED/,
  /fetch.*fail/i,
  /network/i,
  /request.*fail/i,
  /invalid.*url/i,
  /timeout/i,
  /ETIMEDOUT/,
  /getaddrinfo/i,
  /socket.*hang.*up/i,
  /ECONNRESET/,
  /ERR_INVALID_URL/,
  // Validation/input errors
  /missing.*required/i,
  /required.*field/i,
  /validation.*error/i,
  /invalid.*param/i,
  /must.*provide/i,
  /cannot.*be.*empty/i,
  /is.*required/i,
  /invalid.*input/i,
  /expected.*received/i,
  /must.*be.*a/i,
  /cannot.*read.*properties.*of.*undefined.*reading.*'(url|baseUrl|host|endpoint|apiUrl|domain)'/i,
  // Rate limiting
  /rate.*limit/i,
  /too.*many.*requests/i,
  // Mock-related
  /mock-/i,
  // HTTP status
  /status.*code/i,
  /response.*status/i,
  // Common SDK initialization errors (expected when credentials are fake)
  /client.*not.*initialized/i,
  /configuration.*missing/i,
  /missing.*configuration/i,
];

function isExpectedError(err: Error): boolean {
  const msg = err.message || "";
  const name = err.name || "";
  const stack = err.stack || "";

  // Network errors and auth errors are expected
  for (const pattern of EXPECTED_ERROR_PATTERNS) {
    if (pattern.test(msg) || pattern.test(name)) return true;
  }

  // Axios/fetch response errors are expected (any HTTP error)
  if ("response" in err || "status" in err || "statusCode" in err) return true;

  // AxiosError, HTTPError, and similar HTTP client errors are expected
  if (
    name === "AxiosError" ||
    name === "HTTPError" ||
    name === "FetchError" ||
    name === "RequestError" ||
    name === "AbortError"
  ) return true;

  // JSON parse errors from bad API responses are expected
  if (msg.includes("JSON") && (msg.includes("parse") || msg.includes("Unexpected"))) return true;

  // Errors from validation/zod-like libraries are expected
  if (msg.includes('"errors"') && msg.includes('"Invalid input"')) return true;

  return false;
}

function isCrash(err: Error): boolean {
  const name = err.name || "";
  const msg = err.message || "";

  // First check if it's an expected error, regardless of type
  if (isExpectedError(err)) return false;

  // TypeError reading properties of null/undefined is a real bug,
  // UNLESS it's reading a property related to auth/config (expected with mock creds)
  if (name === "TypeError") {
    // Reading properties of undefined/null on auth-related fields is expected
    if (/Cannot read properties of (undefined|null) \(reading '(access_token|token|key|secret|auth|config|credentials|apiKey|api_key)'\)/i.test(msg)) {
      return false;
    }
    // Destructuring errors on expected objects from API responses are expected
    if (/Cannot destructure/i.test(msg)) return false;
    // "X is not a function" when mock objects don't have methods is expected
    if (/is not a function/i.test(msg)) return false;
    // All other TypeErrors are real bugs
    return true;
  }

  // These are always real bugs in action code
  if (name === "ReferenceError" || name === "SyntaxError") return true;

  // RangeError could be a bug
  if (name === "RangeError") return true;

  // Generic Error that isn't expected
  return name === "Error" && !isExpectedError(err);
}

async function runLevel4(
  registry: Record<string, IntegrationDefinition>,
  ids: string[],
  verbose: boolean,
): Promise<Level4Result[]> {
  const results: Level4Result[] = [];

  for (const id of ids) {
    const def = registry[id];
    if (!def) continue;

    const { piece, error } = await loadPiece(def.piecePackage);
    if (error || !piece) continue;

    const actionResults: DryRunActionResult[] = [];
    let ok = 0;
    let expectedErrors = 0;
    let crashes = 0;

    for (const actionName of def.actions) {
      const action = getPieceAction(piece, actionName);
      if (!action) {
        // Action not found - already caught by Level 2
        continue;
      }

      const a = action as Record<string, unknown>;
      if (typeof a.run !== "function") {
        actionResults.push({
          action: actionName,
          outcome: "crash",
          errorType: "MissingRunMethod",
          errorMessage: "Action does not have a run() method",
        });
        crashes++;
        continue;
      }

      const mockAuth = buildMockAuth(def.authType, def);
      const ctx = buildMockActionContext({ auth: mockAuth, props: {} });

      try {
        // Set a timeout so we don't hang on actions that wait for real APIs
        const result = await Promise.race([
          a.run(ctx),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("ETIMEDOUT: dry-run timeout after 10s")), 10000),
          ),
        ]);

        // If the action returns without error, that's OK
        // (Some actions might work with empty props if auth is "none")
        actionResults.push({ action: actionName, outcome: "ok" });
        ok++;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));

        if (isExpectedError(e)) {
          actionResults.push({
            action: actionName,
            outcome: "expected_error",
            errorType: e.name,
            errorMessage: e.message.slice(0, 200),
          });
          expectedErrors++;
        } else if (isCrash(e)) {
          actionResults.push({
            action: actionName,
            outcome: "crash",
            errorType: e.name,
            errorMessage: e.message.slice(0, 200),
          });
          crashes++;
        } else {
          // Unclassified error - treat as expected (API errors, etc.)
          actionResults.push({
            action: actionName,
            outcome: "expected_error",
            errorType: e.name,
            errorMessage: e.message.slice(0, 200),
          });
          expectedErrors++;
        }
      }
    }

    if (verbose) {
      const crashStr = crashes > 0 ? ` ${crashes} CRASHES` : "";
      console.log(
        `  [L4] ${def.displayName}: ${ok} ok, ${expectedErrors} expected errors${crashStr}`,
      );
      for (const ar of actionResults) {
        if (ar.outcome === "crash") {
          console.log(`       CRASH: ${ar.action} - ${ar.errorType}: ${ar.errorMessage}`);
        }
      }
    }

    results.push({
      id,
      actions: actionResults,
      totalActions: actionResults.length,
      ok,
      expectedErrors,
      crashes,
    });
  }

  return results;
}

// ─── Auto-fix ───────────────────────────────────────────

async function runAutoFix(
  registry: Record<string, IntegrationDefinition>,
  level2Results: Level2Result[],
): Promise<{ fixed: number; details: string[] }> {
  const details: string[] = [];
  let fixed = 0;

  // Group fixes by registry file
  // We need to find and update the registry source files
  const registryDir = path.resolve(API_DIR, "src", "integrations", "registry");
  const generatedFile = path.resolve(registryDir, "generated.ts");

  // Read the generated file to perform fixes
  let generatedContent: string;
  try {
    generatedContent = fs.readFileSync(generatedFile, "utf-8");
  } catch {
    details.push("Could not read generated.ts for auto-fix");
    return { fixed, details };
  }

  // Also read category files
  const categoryFiles = [
    "communication.ts",
    "productivity.ts",
    "developer-tools.ts",
    "ai-ml.ts",
    "crm-marketing-social.ts",
    "finance-ecommerce.ts",
  ];

  const fileContents = new Map<string, string>();
  fileContents.set(generatedFile, generatedContent);

  for (const cf of categoryFiles) {
    const filePath = path.resolve(registryDir, cf);
    try {
      fileContents.set(filePath, fs.readFileSync(filePath, "utf-8"));
    } catch {
      // File may not exist, skip
    }
  }

  // Also read the curated registry
  const curatedFile = path.resolve(API_DIR, "src", "integrations", "registry.ts");
  try {
    fileContents.set(curatedFile, fs.readFileSync(curatedFile, "utf-8"));
  } catch {
    // skip
  }

  for (const result of level2Results) {
    if (result.mismatches.length === 0) continue;

    const def = registry[result.id];
    if (!def) continue;

    for (const mismatch of result.mismatches) {
      if (!mismatch.suggestion) {
        details.push(
          `[${result.id}] Cannot auto-fix "${mismatch.registryAction}": no close match found in piece actions: [${result.pieceActions.join(", ")}]`,
        );
        continue;
      }

      // Try to fix in each file
      let didFix = false;
      for (const [filePath, content] of fileContents) {
        // Look for the action string in quotes
        const patterns = [
          `"${mismatch.registryAction}"`,
          `'${mismatch.registryAction}'`,
        ];

        for (const pattern of patterns) {
          if (content.includes(pattern)) {
            const quote = pattern[0];
            const replacement = `${quote}${mismatch.suggestion}${quote}`;
            const updated = content.replace(pattern, replacement);
            fileContents.set(filePath, updated);
            fs.writeFileSync(filePath, updated, "utf-8");
            details.push(
              `[${result.id}] Fixed: "${mismatch.registryAction}" -> "${mismatch.suggestion}" in ${path.basename(filePath)}`,
            );
            fixed++;
            didFix = true;
            break;
          }
        }
        if (didFix) break;
      }

      if (!didFix) {
        details.push(
          `[${result.id}] Could not find "${mismatch.registryAction}" in any registry file`,
        );
      }
    }
  }

  return { fixed, details };
}

// ─── Output formatting ─────────────────────────────────

function printSummary(report: BulkTestReport): void {
  console.log("\n");
  console.log("Integration Test Suite -- Bulk Validation");
  console.log("=========================================");
  console.log(`Total integrations in registry: ${report.totalIntegrations}`);
  console.log(`Levels run: ${report.levelsRun.join(", ")}`);
  console.log();

  if (report.level1) {
    const l1 = report.level1;
    const notInstalled = l1.results.filter((r) => r.error === "not_installed").length;
    const loadErrors = l1.failed - notInstalled;

    console.log("Level 1: Package Loading");
    console.log(`  Total: ${l1.total}`);
    if (l1.loaded > 0) console.log(`  \u2713 ${l1.loaded} packages loaded successfully`);
    if (notInstalled > 0) console.log(`  - ${notInstalled} packages not installed (skipped)`);
    if (loadErrors > 0) {
      console.log(`  \u2717 ${loadErrors} packages failed to load:`);
      for (const r of l1.results) {
        if (!r.loaded && r.error !== "not_installed") {
          console.log(`    - ${r.id}: ${r.error}`);
        }
      }
    }
    console.log();
  }

  if (report.level2) {
    const l2 = report.level2;
    console.log("Level 2: Schema Validation");
    console.log(`  Total tested: ${l2.total}`);
    if (l2.allValid > 0) console.log(`  \u2713 ${l2.allValid} integrations: all actions valid`);
    if (l2.withMismatches > 0) {
      console.log(`  \u2717 ${l2.withMismatches} integrations: action mismatches`);
      for (const r of l2.results) {
        if (r.mismatches.length > 0) {
          for (const m of r.mismatches) {
            const hint = m.suggestion ? ` (did you mean "${m.suggestion}"?)` : "";
            console.log(
              `    - ${r.id}: registry has "${m.registryAction}" but piece does not${hint}`,
            );
          }
        }
      }
    }

    // Report prop errors summary
    const propErrorCount = l2.results.reduce((sum, r) => sum + r.propErrors.length, 0);
    if (propErrorCount > 0) {
      console.log(`  \u26a0 ${propErrorCount} prop schema issues across all integrations`);
    }
    console.log();
  }

  if (report.level3) {
    const l3 = report.level3;
    console.log("Level 3: Auth Type Validation");
    console.log(`  Total tested: ${l3.total}`);
    if (l3.matched > 0) console.log(`  \u2713 ${l3.matched} auth types match`);
    if (l3.mismatched > 0) {
      console.log(`  \u2717 ${l3.mismatched} auth type mismatches:`);
      for (const r of l3.results) {
        if (!r.match) {
          console.log(
            `    - ${r.id}: registry="${r.registryAuthType}", piece="${r.pieceAuthType}"`,
          );
        }
      }
    }
    console.log();
  }

  if (report.level4) {
    const l4 = report.level4;
    console.log("Level 4: Dry-Run (mock credentials)");
    console.log(`  Total integrations tested: ${l4.total}`);

    const totalActions = l4.results.reduce((s, r) => s + r.totalActions, 0);
    const totalOk = l4.results.reduce((s, r) => s + r.ok, 0);
    const totalExpected = l4.results.reduce((s, r) => s + r.expectedErrors, 0);
    const totalCrashes = l4.results.reduce((s, r) => s + r.crashes, 0);

    if (totalOk > 0) console.log(`  \u2713 ${totalOk} actions execute without crashes`);
    if (totalExpected > 0) console.log(`  \u26a0 ${totalExpected} actions threw expected auth/network errors`);
    if (totalCrashes > 0) {
      console.log(`  \u2717 ${totalCrashes} actions crashed unexpectedly:`);
      for (const r of l4.results) {
        for (const ar of r.actions) {
          if (ar.outcome === "crash") {
            console.log(`    - ${r.id}/${ar.action}: ${ar.errorType}: ${ar.errorMessage}`);
          }
        }
      }
    }
    if (totalCrashes === 0 && totalActions > 0) {
      console.log(`  (${totalActions} total actions tested)`);
    }
    console.log();
  }
}

// ─── CLI arg parsing ────────────────────────────────────

function parseArgs(): {
  levels: number[];
  filter?: string[];
  fix: boolean;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const fix = args.includes("--fix");

  // Parse --level
  let levels = [1, 2, 3, 4];
  const levelIdx = args.indexOf("--level");
  if (levelIdx !== -1 && args[levelIdx + 1]) {
    levels = args[levelIdx + 1]
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => n >= 1 && n <= 4);
  }

  // Parse --filter
  let filter: string[] | undefined;
  const filterIdx = args.indexOf("--filter");
  if (filterIdx !== -1 && args[filterIdx + 1]) {
    filter = args[filterIdx + 1].split(",").map((s) => s.trim());
  }

  return { levels, filter, fix, verbose };
}

// ─── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  const { levels, filter, fix, verbose } = parseArgs();

  // Load registry
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

  const allIds = Object.keys(REGISTRY);
  const ids = filter ?? allIds;
  const totalIntegrations = allIds.length;

  console.log(`Loaded registry with ${totalIntegrations} integration(s)`);
  if (filter) {
    console.log(`Filtering to: ${ids.join(", ")}`);
  }
  console.log(`Running levels: ${levels.join(", ")}`);
  console.log();

  const report: BulkTestReport = {
    generatedAt: new Date().toISOString(),
    totalIntegrations,
    levelsRun: levels,
  };

  // ── Level 1: Package Loading ──
  if (levels.includes(1)) {
    console.log("Level 1: Package Loading...");
    const startTime = Date.now();
    const results = await runLevel1(REGISTRY, ids, verbose);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const loaded = results.filter((r) => r.loaded).length;
    const failed = results.filter((r) => !r.loaded).length;

    report.level1 = {
      total: results.length,
      loaded,
      failed,
      notInstalled: results.filter((r) => r.error === "not_installed").length,
      results,
    };

    console.log(
      `  Done in ${elapsed}s: ${loaded} loaded, ${failed} failed/not-installed`,
    );
    console.log();
  }

  // ── Level 2: Schema Validation ──
  if (levels.includes(2)) {
    console.log("Level 2: Schema Validation...");
    const startTime = Date.now();
    const results = await runLevel2(REGISTRY, ids, verbose);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const allValid = results.filter((r) => r.allActionsValid).length;
    const withMismatches = results.filter((r) => !r.allActionsValid).length;

    report.level2 = {
      total: results.length,
      allValid,
      withMismatches,
      results,
    };

    console.log(
      `  Done in ${elapsed}s: ${allValid} valid, ${withMismatches} with mismatches`,
    );
    console.log();

    // ── Auto-fix mode ──
    if (fix && withMismatches > 0) {
      console.log("Auto-fix: Attempting to fix registry action mismatches...");
      const fixResult = await runAutoFix(REGISTRY, results);
      for (const detail of fixResult.details) {
        console.log(`  ${detail}`);
      }
      console.log(`  Fixed ${fixResult.fixed} action name(s)`);
      console.log();
    }
  }

  // ── Level 3: Auth Type Validation ──
  if (levels.includes(3)) {
    console.log("Level 3: Auth Type Validation...");
    const startTime = Date.now();
    const results = await runLevel3(REGISTRY, ids, verbose);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const matched = results.filter((r) => r.match).length;
    const mismatched = results.filter((r) => !r.match).length;

    report.level3 = {
      total: results.length,
      matched,
      mismatched,
      results,
    };

    console.log(
      `  Done in ${elapsed}s: ${matched} matched, ${mismatched} mismatched`,
    );
    console.log();
  }

  // ── Level 4: Dry-Run Action Test ──
  if (levels.includes(4)) {
    console.log("Level 4: Dry-Run (mock credentials)...");
    console.log("  (This may take a while — each action has a 10s timeout)");
    const startTime = Date.now();
    const results = await runLevel4(REGISTRY, ids, verbose);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const totalOk = results.reduce((s, r) => s + r.ok, 0);
    const totalExpected = results.reduce((s, r) => s + r.expectedErrors, 0);
    const totalCrashes = results.reduce((s, r) => s + r.crashes, 0);

    report.level4 = {
      total: results.length,
      ok: totalOk,
      expectedErrors: totalExpected,
      crashes: totalCrashes,
      results,
    };

    console.log(
      `  Done in ${elapsed}s: ${totalOk} ok, ${totalExpected} expected errors, ${totalCrashes} crashes`,
    );
    console.log();
  }

  // ── Print summary ──
  printSummary(report);

  // ── Write JSON report ──
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`Report written to: ${REPORT_PATH}`);

  // Exit with error if any crashes or mismatches found
  const hasCrashes = (report.level4?.crashes ?? 0) > 0;
  const hasMismatches = (report.level2?.withMismatches ?? 0) > 0;
  const hasAuthMismatches = (report.level3?.mismatched ?? 0) > 0;
  const hasLoadErrors =
    (report.level1?.failed ?? 0) - (report.level1?.notInstalled ?? 0) > 0;

  if (hasCrashes || hasLoadErrors) {
    process.exit(1);
  }
  if (hasMismatches || hasAuthMismatches) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(99);
});
