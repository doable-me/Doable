import { defineTool, type Tool } from "@github/copilot-sdk";
import { getIntegration } from "./registry/index.js";
import { credentialVault } from "./credential-vault.js";
import { runAction, getIntegrationActions } from "./runner.js";

// ─── Types ──────────────────────────────────────────────

interface IntegrationToolOptions {
  workspaceId: string;
  projectId?: string;
  userId: string;
}

interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
  additionalProperties?: boolean;
}

interface JsonSchema {
  type: string;
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  [key: string]: unknown;
}

// ─── Activepieces Property Type Constants ────────────────
//
// Activepieces defines property types as string enums.
// We map them to JSON Schema for the Copilot SDK.

const PROP_TYPE = {
  SHORT_TEXT: "SHORT_TEXT",
  LONG_TEXT: "LONG_TEXT",
  DATE_TIME: "DATE_TIME",
  COLOR: "COLOR",
  NUMBER: "NUMBER",
  CHECKBOX: "CHECKBOX",
  JSON: "JSON",
  OBJECT: "OBJECT",
  ARRAY: "ARRAY",
  STATIC_DROPDOWN: "STATIC_DROPDOWN",
  DROPDOWN: "DROPDOWN",
  MULTI_SELECT_DROPDOWN: "MULTI_SELECT_DROPDOWN",
  STATIC_MULTI_SELECT_DROPDOWN: "STATIC_MULTI_SELECT_DROPDOWN",
  FILE: "FILE",
  DYNAMIC: "DYNAMIC",
  MARKDOWN: "MARKDOWN",
} as const;

// ─── Property Conversion ────────────────────────────────

/**
 * Convert Activepieces property definitions to a JSON Schema object
 * suitable for the Copilot SDK's `parameters` field.
 *
 * Each Activepieces action has a `props` record where keys are param names
 * and values describe the type, description, required flag, etc.
 */
export function actionPropsToJsonSchema(props: Record<string, unknown>): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const [key, rawProp] of Object.entries(props)) {
    const prop = rawProp as Record<string, unknown> | null;
    if (!prop) continue;

    const propType = prop.type as string | undefined;

    // Skip display-only markdown properties
    if (propType === PROP_TYPE.MARKDOWN) continue;

    // Skip the built-in auth property (handled separately by the runner)
    if (key === "auth") continue;

    const schema = propTypeToJsonSchema(propType, prop);

    // Use description or fall back to displayName
    const description =
      (prop.description as string) ??
      (prop.displayName as string) ??
      undefined;
    if (description) {
      schema.description = description;
    }

    properties[key] = schema;

    if (prop.required === true) {
      required.push(key);
    }
  }

  return { type: "object", properties, required };
}

/**
 * Map a single Activepieces property type to a JSON Schema property definition.
 */
function propTypeToJsonSchema(
  propType: string | undefined,
  prop: Record<string, unknown>,
): JsonSchemaProperty {
  switch (propType) {
    case PROP_TYPE.SHORT_TEXT:
    case PROP_TYPE.LONG_TEXT:
    case PROP_TYPE.DATE_TIME:
    case PROP_TYPE.COLOR:
      return { type: "string" };

    case PROP_TYPE.NUMBER:
      return { type: "number" };

    case PROP_TYPE.CHECKBOX:
      return { type: "boolean" };

    case PROP_TYPE.JSON:
    case PROP_TYPE.OBJECT:
      return { type: "object" };

    case PROP_TYPE.ARRAY:
      return { type: "array" };

    case PROP_TYPE.STATIC_DROPDOWN: {
      // Extract enum values from the options array
      const options = prop.options as
        | Array<{ value: string; label: string }>
        | undefined;
      if (options && Array.isArray(options) && options.length > 0) {
        return {
          type: "string",
          enum: options.map((o) =>
            typeof o === "object" && o !== null ? String(o.value) : String(o),
          ),
        };
      }
      return { type: "string" };
    }

    case PROP_TYPE.DROPDOWN:
      // Dynamic dropdown; AI discovers values via list actions
      return { type: "string" };

    case PROP_TYPE.MULTI_SELECT_DROPDOWN:
    case PROP_TYPE.STATIC_MULTI_SELECT_DROPDOWN:
      return { type: "array", items: { type: "string" } };

    case PROP_TYPE.FILE:
      return {
        type: "string",
        description: "File content as a URL or base64-encoded data",
      };

    case PROP_TYPE.DYNAMIC:
      return { type: "object", additionalProperties: true };

    default:
      return { type: "string" };
  }
}

// ─── Tool Creation ──────────────────────────────────────

/**
 * Create Copilot SDK tools for all connected integrations.
 *
 * For each active connection, loads the backing Activepieces piece,
 * enumerates its actions, and wraps each one as a `defineTool()` call.
 *
 * Naming: `{integration_id}_{action_name}` (e.g. `slack_send_channel_message`)
 * No prefix -- these are first-class integration tools.
 */
export async function createIntegrationTools(
  opts: IntegrationToolOptions,
): Promise<Tool[]> {
  // 1. Get all active connections for this scope
  const connections = await credentialVault.getEffective(
    opts.workspaceId,
    opts.projectId,
    opts.userId,
  );

  const tools: Tool[] = [];

  // Deduplicate by integration_id: use the first (highest-priority) connection
  // per integration since getEffective returns them ordered by scope DESC.
  const seen = new Set<string>();

  for (const conn of connections) {
    if (seen.has(conn.integration_id)) continue;
    seen.add(conn.integration_id);

    const def = getIntegration(conn.integration_id);
    if (!def) continue;

    // Load the piece's action metadata (gracefully skip if not installed)
    let pieceActions: Array<{
      name: string;
      displayName: string;
      description: string;
      props: Record<string, unknown>;
    }> = [];

    try {
      pieceActions = await getIntegrationActions(conn.integration_id);
    } catch (err) {
      console.warn(
        `[IntegrationToolBridge] Failed to load actions for ${conn.integration_id}:`,
        err,
      );
      continue;
    }

    for (const action of pieceActions) {
      // Sanitize names for Copilot SDK (alphanumeric + underscores)
      const safeIntegrationId = conn.integration_id
        .replace(/[^a-zA-Z0-9]/g, "_")
        .toLowerCase();
      const safeActionName = action.name
        .replace(/[^a-zA-Z0-9]/g, "_")
        .toLowerCase();
      const toolName = `${safeIntegrationId}_${safeActionName}`;

      // Use action override description if present, otherwise the piece's own
      const description =
        def.actionOverrides?.[action.name]?.description ??
        action.description ??
        `${def.displayName}: ${action.displayName}`;

      const parameters = actionPropsToJsonSchema(action.props);

      tools.push(
        defineTool(toolName, {
          description,
          parameters,
          handler: async (args: Record<string, unknown>) => {
            try {
              const result = await runAction({
                integrationId: conn.integration_id,
                actionName: action.name,
                props: args,
                userId: opts.userId,
                workspaceId: opts.workspaceId,
                projectId: opts.projectId,
              });

              return {
                success: result.success,
                output:
                  typeof result.output === "string"
                    ? result.output
                    : JSON.stringify(result.output, null, 2),
                ...(result.error ? { error: result.error } : {}),
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              // Phase 1H: detect "credentials missing / not connected" style
              // errors from the Activepieces runner and tag them so the
              // chat.ts onToolEnd sniffer emits an `integration_required`
              // SSE event instead of surfacing a bare error string.
              const isMissing =
                /credentials?_missing|not connected to/i.test(msg) ||
                (err as { code?: string } | null)?.code === "credentials_missing";
              if (isMissing) {
                return {
                  success: false,
                  output: "",
                  error: msg,
                  _sseHint: "integration_required" as const,
                  integrationId: conn.integration_id,
                  displayName: def.displayName,
                  logoUrl: def.logoUrl,
                  reason: `to call ${action.name}`,
                };
              }
              return {
                success: false,
                output: "",
                error: msg,
              };
            }
          },
        }) as Tool,
      );
    }
  }

  if (tools.length > 0) {
    console.log(`[IntegrationToolBridge] Created ${tools.length} integration tools:\n${tools.map((t: any) =>
      `  ${t.name} — ${(t.description ?? "").slice(0, 100)} params=${JSON.stringify(Object.keys(t.parameters?.properties ?? {}))}`
    ).join("\n")}`);
  }

  return tools;
}
