# 08 — AI Framework Awareness (PRD)

> Makes the AI code generator framework-aware so it generates server-side code
> when the project framework supports it, and correctly uses connected
> integration credentials on the server.

---

## 1. Problem Statement

Today, the AI system prompt hardcodes:
```
"The project is a Vite + React 19 + TypeScript app with Tailwind CSS v4"
```

This means:
- AI always generates client-side React code
- AI never generates API routes, server actions, or server components
- Connected integrations with `server.*` credentials are invisible to AI
- AI cannot generate database queries even when the framework supports it

---

## 2. Solution: Dynamic Framework Context in System Prompt

### 2.1 Framework Detection & Description

```typescript
// services/api/src/frameworks/prompt-builder.ts (new)

export function buildFrameworkPrompt(
  adapter: FrameworkAdapter,
  manifest: IntegrationEnvManifest[]
): string {
  const parts: string[] = [];

  // Base framework description
  parts.push(`The project uses ${adapter.displayName}.`);

  // Server capabilities
  if (adapter.capabilities.has("ssr-node") || 
      adapter.capabilities.has("requires-long-lived-process")) {
    parts.push(`
## Server-Side Capabilities
This project has a backend runtime. You can:
- Create server-side code (API routes, server actions, server components)
- Access databases directly using server environment variables
- Import any Node.js module (fs, crypto, pg, etc.)
- Handle authentication on the server

### Code Organization
- Server code: ${adapter.serverCodePattern || "app/api/ or server actions"}
- Client code: ${adapter.clientCodePattern || "app/ components with 'use client'"}
- Shared types: ${adapter.sharedTypesPattern || "types/ or lib/"}

### Environment Variables
- Server-only vars: Use \`process.env.VAR_NAME\` (never exposed to browser)
- Client vars: Use \`process.env.NEXT_PUBLIC_*\` or \`import.meta.env.VITE_*\`
- NEVER put server credentials in client code
`);
  } else {
    parts.push(`
## Client-Side Only
This is a client-side SPA. All code runs in the browser.
- Use \`import.meta.env.VITE_*\` for environment variables
- Database access only through client SDKs with row-level security
- No server-side code execution
`);
  }

  // Connected integrations with server access
  const serverIntegrations = manifest.filter(m => m.serverEnvVars.length > 0);
  if (serverIntegrations.length > 0 && 
      adapter.capabilities.has("requires-long-lived-process")) {
    parts.push(`
## Connected Integrations (Server-Side Access Available)
${serverIntegrations.map(m => `
### ${m.displayName}
- Server env vars: ${m.serverEnvVars.join(', ')}
- Client env vars: ${m.clientEnvVars.join(', ')}
- Use server vars in API routes/server actions for full database access
- Use client vars in browser components for real-time/read-only access
${m.runtimeHint ? `- Hint: ${m.runtimeHint}` : ''}
`).join('')}

### Database Query Pattern
When the user asks to "connect to database" or "fetch data from DB":
1. Create an API route or server action
2. Use the server-side credentials (process.env.*)
3. Return data as JSON
4. Client components fetch from the API route

Example (Next.js + Supabase):
\`\`\`typescript
// app/api/items/route.ts
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
export async function GET() {
  const { data } = await supabase.from('items').select('*')
  return Response.json(data)
}
\`\`\`
`);
  }

  // Build tool specifics
  parts.push(`
## Build Configuration
- Build output: ${adapter.defaults.listIgnore.filter(i => i !== 'node_modules' && i !== '.git').join(', ') || 'dist'}
- Config files (do not modify): ${adapter.defaults.lockedConfigFiles.join(', ')}
- Package manager: ${adapter.family === 'node' ? 'npm' : adapter.family === 'python' ? 'pip' : 'unknown'}
`);

  return parts.join('\n');
}
```

### 2.2 Integration Points

**File: `services/api/src/routes/chat/system-prompts.ts`**

```typescript
// BEFORE:
function buildAgentPrompt(projectContext: string, previewUrl: string | undefined): string {
  return `...The project is a Vite + React 19 + TypeScript app with Tailwind CSS v4...`;
}

// AFTER:
function buildAgentPrompt(
  projectContext: string, 
  previewUrl: string | undefined,
  frameworkPrompt: string  // from buildFrameworkPrompt()
): string {
  return `...${frameworkPrompt}...`;
}
```

**File: `services/api/src/ai/context-builder.ts`**

```typescript
// Add to buildProjectContextForMode():
const adapter = registry.get(project.framework_id);
const manifest = await getIntegrationManifest(workspaceId, projectId, userId);
const frameworkPrompt = buildFrameworkPrompt(adapter, manifest);
context += frameworkPrompt;
```

### 2.3 Per-Framework AI Behavior Rules

| Framework | AI Generates | Database Pattern | Auth Pattern |
|-----------|-------------|------------------|--------------|
| vite-react | Client components only | Client SDK + RLS | OAuth redirect |
| nextjs-app | Server components, API routes, server actions | Direct DB in server code | NextAuth / server session |
| express-react | Express routes + React client | Direct DB in Express handlers | express-session |
| django | Views, templates, models | Django ORM | Django auth |

### 2.4 envKeyMap Enhancement for Framework Awareness

Currently the `envKeyMap` hardcodes `VITE_` prefix for client vars. When
framework changes, prefix changes:

```typescript
// Enhanced envKeyMap resolution
function resolveEnvPrefix(adapter: FrameworkAdapter): string {
  switch (adapter.id) {
    case "nextjs-app": return "NEXT_PUBLIC_";
    case "nuxt": return "NUXT_PUBLIC_";
    case "vite-react":
    case "vite-vue":
    case "vite-svelte": return "VITE_";
    default: return "";  // No prefix convention
  }
}

// vault-bridge.ts modification:
// Instead of hardcoded VITE_ check, use adapter-driven prefix
const clientPrefix = resolveEnvPrefix(adapter);
if (clientPrefix && !envVarName.startsWith(clientPrefix)) {
  log.warn(`Client var ${envVarName} missing ${clientPrefix} prefix`);
}
```

---

## 3. Tool Updates

### 3.1 New Tool: `run_server_command` (for backend frameworks only)

```typescript
// Only available when adapter.capabilities.has("requires-long-lived-process")
{
  name: "run_server_command",
  description: "Run a one-shot server-side command (e.g., database migration, seed script)",
  parameters: {
    command: { type: "string", description: "The command to run" },
    args: { type: "array", items: { type: "string" } },
  }
}
```

### 3.2 Enhanced `install_package` Tool

```typescript
// Update description based on framework
description: adapter.family === "node" 
  ? "Install an npm package and restart the dev server"
  : adapter.family === "python"
  ? "Install a pip package and restart the dev server"
  : "Install a package"
```

### 3.3 Dynamic Tool Availability

```typescript
function getAvailableTools(adapter: FrameworkAdapter): Tool[] {
  const base = [create_file, edit_file, read_file, list_files, install_package];
  
  if (adapter.capabilities.has("requires-long-lived-process")) {
    base.push(run_server_command);
    base.push(restart_dev_server);
  }
  
  if (adapter.capabilities.has("ssr-node")) {
    base.push(run_database_migration);
  }
  
  return base;
}
```

---

## 4. Validation

### Test Cases

1. **Next.js + Supabase connected**: User says "show me my todos from the database"
   - AI creates `app/api/todos/route.ts` using `SUPABASE_SERVICE_ROLE_KEY`
   - AI creates client component that fetches from `/api/todos`
   - ✓ Server credential used correctly

2. **Vite + Supabase connected**: User says "show me my todos from the database"  
   - AI uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` client-side
   - AI sets up RLS or uses anon-key-safe queries
   - ✓ No server credential leaked to client

3. **Next.js + PostgreSQL connected**: User says "connect to my database"
   - AI creates `app/api/db/route.ts` using `DATABASE_URL` from server env
   - AI installs `pg` or `drizzle-orm` via install_package
   - ✓ Direct database connection in server code
