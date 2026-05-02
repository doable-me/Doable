import type { FrameworkPrompt } from "./index.js";

export const honoPrompt: FrameworkPrompt = {
  systemIntro:
    "The project is a Hono + TypeScript backend API server. Hono is a lightweight, fast web framework for Node.js (similar to Express but with better TypeScript support and middleware). The dev server runs via `tsx watch` for hot-reloading. There is NO frontend framework — this is a pure API/backend project.",

  envConventions: [
    "0. **🔌 USE CONNECTED INTEGRATIONS**: If a `<connected-integrations>` block appears above, use the listed env vars and tools. NEVER ask for API keys.",
    "",
    "0a. **ENV VAR RULES (Hono)**:",
    "   - ALL env vars are server-only (there is no browser bundle).",
    "   - Access via `process.env.X` or Hono's `c.env.X` (when using adapter bindings).",
    "   - There is NO client prefix requirement — all env vars are safe since nothing runs in a browser.",
    "",
    "1. **DATABASE PATTERNS (Hono)**:",
    "   - Direct database connections: use `process.env.DATABASE_URL` or individual PG* vars.",
    "   - Supabase server-side: `createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)`",
    "   - ORMs: Drizzle, Prisma, or raw `pg` client are all appropriate.",
  ].join("\n"),

  routing: [
    "2. **HONO ROUTING**: Routes are defined programmatically in TypeScript.",
    "   - Main entry: `src/index.ts` — creates the Hono app and mounts routes.",
    "   - Route groups: `const api = new Hono(); api.get('/items', handler); app.route('/api', api);`",
    "   - Path params: `app.get('/items/:id', (c) => { const id = c.req.param('id'); ... })`",
    "   - Request body: `const body = await c.req.json();`",
    "   - Response: `return c.json({ data })` or `return c.text('ok')`",
    "   - Middleware: `app.use('*', cors()); app.use('/api/*', authMiddleware);`",
    "   - There is NO file-based routing — all routes are explicit in code.",
    "",
    "**Structure suggestion:**",
    "   - `src/index.ts` — app creation + server start",
    "   - `src/routes/` — route handlers grouped by domain",
    "   - `src/middleware/` — auth, cors, logging middleware",
    "   - `src/db/` — database client + queries",
  ].join("\n"),

  styling:
    "6. **NO STYLING**: This is a backend-only project. There is no CSS, no Tailwind, no HTML templates. If the user asks for a frontend, suggest creating a separate project with a frontend framework (Vite+React, Next.js, etc.) that calls this API.",

  fileShape: [
    "7. **TYPESCRIPT PROJECT**: Use `.ts` files exclusively. The project compiles with `tsc` for production.",
    "",
    "8. **HONO PATTERNS**:",
    "   ```ts",
    "   import { Hono } from 'hono';",
    "   import { cors } from 'hono/cors';",
    "   const app = new Hono();",
    "   app.use('*', cors());",
    "   app.get('/health', (c) => c.json({ status: 'ok' }));",
    "   export default app;",
    "   ```",
    "",
    "9. **SERVER ENTRY**: `src/index.ts` should export the app AND start the server:",
    "   ```ts",
    "   import { serve } from '@hono/node-server';",
    "   import app from './app.js';",
    "   serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: process.env.HOST ?? '127.0.0.1' });",
    "   ```",
  ].join("\n"),
};
