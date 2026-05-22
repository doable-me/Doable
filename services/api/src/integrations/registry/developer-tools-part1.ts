import type { IntegrationDefinition } from "../types.js";

export const DEVELOPER_TOOLS_PART1: Record<string, IntegrationDefinition> = {
  // ── Version Control & Dev Platforms ───────────────────

  github: {
    id: "github",
    piecePackage: "@activepieces/piece-github",
    displayName: "GitHub",
    description:
      "Create issues, manage repos, and open pull requests on GitHub.",
    logoUrl: "https://cdn.activepieces.com/pieces/github.png",
    category: "developer_tools",
    tags: ["git", "vcs", "code", "pull-request", "issues"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "read:user"],
    },
    actions: [
      "create_issue",
      "get_repo",
      "list_repos",
      "create_pull_request",
      "create_issue",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
    envKeyMap: {
      // GitHub OAuth tokens are server-only — never expose to the browser bundle.
      server: { access_token: "GITHUB_TOKEN" },
      runtimeHint: "GitHub API access (repos, issues, PRs).",
    },
  },

  gitlab: {
    id: "gitlab",
    piecePackage: "@activepieces/piece-gitlab",
    displayName: "GitLab",
    description:
      "Create issues, list projects, and open merge requests on GitLab.",
    logoUrl: "https://cdn.activepieces.com/pieces/gitlab.png",
    category: "developer_tools",
    tags: ["git", "vcs", "code", "merge-request", "ci-cd"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://gitlab.com/oauth/authorize",
      tokenUrl: "https://gitlab.com/oauth/token",
      scopes: ["api"],
    },
    actions: [
      "create_issue",
      "list_projects",
      "create_merge_request",
      "list_issues",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  // ── Link & Deployment Tools ───────────────────────────

  bitly: {
    id: "bitly",
    piecePackage: "@activepieces/piece-bitly",
    displayName: "Bitly",
    description:
      "Create and manage shortened links with Bitly.",
    logoUrl: "https://cdn.activepieces.com/pieces/bitly.png",
    category: "developer_tools",
    tags: ["links", "url-shortener", "analytics"],
    authType: "secret_text",
    actions: ["create_short_link", "list_links"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  vercel: {
    id: "vercel",
    piecePackage: "@activepieces/piece-vercel",
    displayName: "Vercel",
    description:
      "Manage deployments and projects on Vercel.",
    logoUrl: "https://cdn.activepieces.com/pieces/vercel.png",
    category: "developer_tools",
    tags: ["hosting", "deployment", "serverless", "frontend"],
    authType: "secret_text",
    actions: ["list_projects", "create_deployment", "list_projects"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  netlify: {
    id: "netlify",
    piecePackage: "@activepieces/piece-netlify",
    displayName: "Netlify",
    description:
      "List sites and trigger deploys on Netlify.",
    logoUrl: "https://cdn.activepieces.com/pieces/netlify.png",
    category: "developer_tools",
    tags: ["hosting", "deployment", "jamstack", "frontend"],
    authType: "secret_text",
    actions: ["list_sites", "start_deploy"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Design & Observability ────────────────────────────

  figma: {
    id: "figma",
    piecePackage: "@activepieces/piece-figma",
    displayName: "Figma",
    description:
      "Retrieve files, list projects, and read comments in Figma.",
    logoUrl: "https://cdn.activepieces.com/pieces/figma.png",
    category: "developer_tools",
    tags: ["design", "ui", "prototyping", "collaboration"],
    authType: "secret_text",
    actions: ["get_file", "list_projects", "get_comments"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  datadog: {
    id: "datadog",
    piecePackage: "@activepieces/piece-datadog",
    displayName: "Datadog",
    description:
      "Send events, list monitors, and create monitors in Datadog.",
    logoUrl: "https://cdn.activepieces.com/pieces/datadog.png",
    category: "developer_tools",
    tags: ["monitoring", "observability", "apm", "logs", "infrastructure"],
    authType: "secret_text",
    actions: ["send_event", "list_monitors", "create_monitor"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Product Analytics ─────────────────────────────────

  posthog: {
    id: "posthog",
    piecePackage: "@activepieces/piece-posthog",
    displayName: "PostHog",
    description:
      "Capture events, list events, and query persons in PostHog.",
    logoUrl: "https://cdn.activepieces.com/pieces/posthog.png",
    category: "analytics",
    tags: ["analytics", "product", "events", "open-source"],
    authType: "secret_text",
    actions: ["capture_event", "list_events", "get_persons"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  logrocket: {
    id: "logrocket",
    piecePackage: "@activepieces/piece-logrocket",
    displayName: "LogRocket",
    description:
      "List user sessions recorded by LogRocket.",
    logoUrl: "https://cdn.activepieces.com/pieces/logrocket.png",
    category: "analytics",
    tags: ["session-replay", "debugging", "frontend", "ux"],
    authType: "secret_text",
    actions: ["list_sessions"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Relational Databases ──────────────────────────────

  postgres: {
    id: "postgres",
    piecePackage: "@activepieces/piece-postgres",
    displayName: "PostgreSQL",
    description:
      "Run queries, insert, update, and delete rows in a PostgreSQL database.",
    logoUrl: "https://cdn.activepieces.com/pieces/postgres.png",
    category: "data_storage",
    tags: ["database", "sql", "relational", "open-source"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "host",
        displayName: "Host",
        description: "Database server hostname or IP address",
        type: "text",
        required: true,
      },
      {
        name: "port",
        displayName: "Port",
        description: "Database server port (default 5432)",
        type: "text",
        required: true,
      },
      {
        name: "user",
        displayName: "User",
        description: "Database username",
        type: "text",
        required: true,
      },
      {
        name: "password",
        displayName: "Password",
        description: "Database password",
        type: "secret",
        required: true,
      },
      {
        name: "database",
        displayName: "Database",
        description: "Database name to connect to",
        type: "text",
        required: true,
      },
    ],
    actions: ["run_query", "insert_row", "update_row", "delete_row"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
    envKeyMap: {
      // Postgres connection details are server-only — DB creds must never reach the browser.
      server: {
        host: "PGHOST",
        port: "PGPORT",
        database: "PGDATABASE",
        user: "PGUSER",
        password: "PGPASSWORD",
      },
      runtimeHint: "PostgreSQL database connection.",
    },
  },

  mysql: {
    id: "mysql",
    piecePackage: "@activepieces/piece-mysql",
    displayName: "MySQL",
    description:
      "Run queries, insert, update, and delete rows in a MySQL database.",
    logoUrl: "https://cdn.activepieces.com/pieces/mysql.png",
    category: "data_storage",
    tags: ["database", "sql", "relational", "open-source"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "host",
        displayName: "Host",
        description: "Database server hostname or IP address",
        type: "text",
        required: true,
      },
      {
        name: "port",
        displayName: "Port",
        description: "Database server port (default 3306)",
        type: "text",
        required: true,
      },
      {
        name: "user",
        displayName: "User",
        description: "Database username",
        type: "text",
        required: true,
      },
      {
        name: "password",
        displayName: "Password",
        description: "Database password",
        type: "secret",
        required: true,
      },
      {
        name: "database",
        displayName: "Database",
        description: "Database name to connect to",
        type: "text",
        required: true,
      },
    ],
    actions: ["run_query", "insert_row", "update_row", "delete_row"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Document & NoSQL Databases ────────────────────────

  mongodb: {
    id: "mongodb",
    piecePackage: "@activepieces/piece-mongodb",
    displayName: "MongoDB",
    description:
      "Find, insert, update, and delete documents in MongoDB collections.",
    logoUrl: "https://cdn.activepieces.com/pieces/mongodb.png",
    category: "data_storage",
    tags: ["database", "nosql", "document", "json"],
    authType: "secret_text",
    actions: [
      "find_documents",
      "insert_document",
      "update_documents",
      "delete_document",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  supabase: {
    id: "supabase",
    piecePackage: "@activepieces/piece-supabase",
    displayName: "Supabase",
    description:
      "Create, update, delete, search rows, upload files, and make custom API calls to Supabase.",
    logoUrl: "https://cdn.activepieces.com/pieces/supabase.png",
    category: "data_storage",
    tags: ["database", "postgres", "backend-as-a-service", "open-source"],
    authType: "custom_auth",
    customAuthFields: [
      { name: "url", displayName: "Project URL", description: "Your Supabase project URL (e.g., https://your-project-ref.supabase.co)", type: "text", required: true },
      { name: "apiKey", displayName: "API Key", description: "Service Role Key (for full access) or Anonymous Key (for read-only)", type: "secret", required: true },
    ],
    actions: ["execute_sql", "upload-file", "create_row", "update_row", "upsert_row", "delete_rows", "search_rows", "custom_api_call"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
    enhancedAuth: {
      providerKey: "supabase",
      connectLabel: "Sign in with Supabase",
      oauthIntegrationKey: "supabase-mgmt",
      oauth2Config: {
        authUrl: "https://api.supabase.com/v1/oauth/authorize",
        tokenUrl: "https://api.supabase.com/v1/oauth/token",
        scopes: ["all"],
        pkce: true,
        pkceMethod: "S256",
      },
      requiresResourceSelection: true,
      resourceLabel: "Select a Supabase project",
      // Phase 2A: Lovable-style one-click project creation. When enabled, the
      // chat UI can call the `provision_supabase` tool to create a brand-new
      // project under the user's own organization without opening the dashboard.
      provisioner: {
        enabled: true,
        requiredScopes: ["projects:create"],
      },
    },
    envKeyMap: {
      // url + anonKey are browser-safe (Vite ships them in import.meta.env.VITE_*).
      // serviceRoleKey is full-access — server-only, NEVER browser-bundled.
      client: {
        url: "VITE_SUPABASE_URL",
        anonKey: "VITE_SUPABASE_ANON_KEY",
      },
      server: {
        // Plain SUPABASE_URL for server-side code (Next.js Server Actions,
        // API routes, etc.) — same value as the client URL but without the
        // VITE_/NEXT_PUBLIC_ prefix so it's available on the server without
        // being leaked into client bundles.
        url: "SUPABASE_URL",
        serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
      },
      runtimeHint: "Postgres DB + auth + storage (Supabase).",
    },
  },
};
