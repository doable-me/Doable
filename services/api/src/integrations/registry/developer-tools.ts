import type { IntegrationDefinition } from "../types.js";

// ─── Developer Tools, Databases & Infrastructure ──────
//
// Curated definitions for dev tools, version control,
// databases, object storage, and cloud infrastructure
// integrations backed by Activepieces pieces.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const DEVELOPER_TOOLS_INTEGRATIONS: Record<string, IntegrationDefinition> = {
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

  sentry: {
    id: "sentry",
    piecePackage: "@activepieces/piece-sentry",
    displayName: "Sentry",
    description:
      "List and resolve issues tracked in Sentry.",
    logoUrl: "https://cdn.activepieces.com/pieces/sentry.png",
    category: "developer_tools",
    tags: ["error-tracking", "monitoring", "debugging", "crashes"],
    authType: "secret_text",
    actions: ["list_issues", "resolve_issue"],
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
    actions: ["upload-file", "create_row", "update_row", "upsert_row", "delete_rows", "search_rows", "custom_api_call"],
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
    },
  },

  firebase: {
    id: "firebase",
    piecePackage: "@activepieces/piece-firebase",
    displayName: "Firebase",
    description:
      "Create, get, update documents and query collections in Firebase Firestore.",
    logoUrl: "https://cdn.activepieces.com/pieces/firebase.png",
    category: "data_storage",
    tags: ["database", "nosql", "google", "realtime", "backend-as-a-service"],
    authType: "secret_text",
    actions: [
      "create_document",
      "get_document",
      "update_document",
      "query_collection",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  redis: {
    id: "redis",
    piecePackage: "@activepieces/piece-redis",
    displayName: "Redis",
    description:
      "Set and get values in a Redis key-value store.",
    logoUrl: "https://cdn.activepieces.com/pieces/redis.png",
    category: "data_storage",
    tags: ["cache", "key-value", "in-memory", "open-source"],
    authType: "secret_text",
    actions: ["set_value", "get_value"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  pocketbase: {
    id: "pocketbase",
    piecePackage: "@activepieces/piece-pocketbase",
    displayName: "PocketBase",
    description:
      "List and manage records in PocketBase collections.",
    logoUrl: "https://cdn.activepieces.com/pieces/pocketbase.png",
    category: "data_storage",
    tags: ["database", "backend-as-a-service", "open-source", "self-hosted"],
    authType: "secret_text",
    actions: ["list_records"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Analytical & Warehouse Databases ──────────────────

  snowflake: {
    id: "snowflake",
    piecePackage: "@activepieces/piece-snowflake",
    displayName: "Snowflake",
    description:
      "Run SQL queries against Snowflake data warehouses.",
    logoUrl: "https://cdn.activepieces.com/pieces/snowflake.png",
    category: "data_storage",
    tags: ["data-warehouse", "sql", "analytics", "cloud"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "account",
        displayName: "Account",
        description: "Snowflake account identifier (e.g. xy12345.us-east-1)",
        type: "text",
        required: true,
      },
      {
        name: "username",
        displayName: "Username",
        description: "Snowflake login username",
        type: "text",
        required: true,
      },
      {
        name: "password",
        displayName: "Password",
        description: "Snowflake login password",
        type: "secret",
        required: true,
      },
      {
        name: "database",
        displayName: "Database",
        description: "Default database to use",
        type: "text",
        required: true,
      },
      {
        name: "warehouse",
        displayName: "Warehouse",
        description: "Compute warehouse to use",
        type: "text",
        required: true,
      },
    ],
    actions: ["run_query"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  duckdb: {
    id: "duckdb",
    piecePackage: "@activepieces/piece-duckdb",
    displayName: "DuckDB",
    description:
      "Run analytical SQL queries with embedded DuckDB.",
    logoUrl: "https://cdn.activepieces.com/pieces/duckdb.png",
    category: "data_storage",
    tags: ["database", "sql", "analytics", "embedded", "olap"],
    authType: "none",
    actions: ["run_query"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: false,
  },

  couchbase: {
    id: "couchbase",
    piecePackage: "@activepieces/piece-couchbase",
    displayName: "Couchbase",
    description:
      "Run N1QL queries and upsert documents in Couchbase.",
    logoUrl: "https://cdn.activepieces.com/pieces/couchbase.png",
    category: "data_storage",
    tags: ["database", "nosql", "document", "distributed"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "connectionString",
        displayName: "Connection String",
        description: "Couchbase connection string (e.g. couchbase://localhost)",
        type: "text",
        required: true,
      },
      {
        name: "username",
        displayName: "Username",
        description: "Cluster username",
        type: "text",
        required: true,
      },
      {
        name: "password",
        displayName: "Password",
        description: "Cluster password",
        type: "secret",
        required: true,
      },
      {
        name: "bucketName",
        displayName: "Bucket Name",
        description: "Default bucket to operate on",
        type: "text",
        required: true,
      },
    ],
    actions: ["run_query", "upsert_document"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Vector Databases ──────────────────────────────────

  pinecone: {
    id: "pinecone",
    piecePackage: "@activepieces/piece-pinecone",
    displayName: "Pinecone",
    description:
      "Upsert and query vector embeddings in Pinecone indexes.",
    logoUrl: "https://cdn.activepieces.com/pieces/pinecone.png",
    category: "data_storage",
    tags: ["vector", "embeddings", "ai", "similarity-search"],
    authType: "secret_text",
    actions: ["upsert_vectors", "query_vectors"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  qdrant: {
    id: "qdrant",
    piecePackage: "@activepieces/piece-qdrant",
    displayName: "Qdrant",
    description:
      "Upsert points and run similarity searches in Qdrant collections.",
    logoUrl: "https://cdn.activepieces.com/pieces/qdrant.png",
    category: "data_storage",
    tags: ["vector", "embeddings", "ai", "similarity-search", "open-source"],
    authType: "secret_text",
    actions: ["get_points", "search_points"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Cloud Object Storage ──────────────────────────────

  "amazon-s3": {
    id: "amazon-s3",
    piecePackage: "@activepieces/piece-amazon-s3",
    displayName: "Amazon S3",
    description:
      "Upload, download, list, and delete objects in Amazon S3 buckets.",
    logoUrl: "https://cdn.activepieces.com/pieces/amazon-s3.png",
    category: "data_storage",
    tags: ["storage", "cloud", "aws", "files", "objects"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "accessKeyId",
        displayName: "Access Key ID",
        description: "AWS access key ID",
        type: "text",
        required: true,
      },
      {
        name: "secretAccessKey",
        displayName: "Secret Access Key",
        description: "AWS secret access key",
        type: "secret",
        required: true,
      },
      {
        name: "region",
        displayName: "Region",
        description: "AWS region (e.g. us-east-1)",
        type: "text",
        required: true,
      },
    ],
    actions: ["upload_file", "download_file", "clone_object", "delete_object"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  google_cloud_storage: {
    id: "google_cloud_storage",
    piecePackage: "@activepieces/piece-google-cloud-storage",
    displayName: "Google Cloud Storage",
    description:
      "Upload, download, and list objects in Google Cloud Storage buckets.",
    logoUrl: "https://cdn.activepieces.com/pieces/google-cloud-storage.png",
    category: "data_storage",
    tags: ["storage", "cloud", "gcp", "files", "objects"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: GOOGLE_AUTH_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      scopes: ["https://www.googleapis.com/auth/devstorage.full_control"],
      // PKCE not needed for confidential clients (server-side with client_secret)
      prompt: "consent",
      extraParams: {
        access_type: "offline",
      },
    },
    actions: ["upload_file", "download_file", "list-files"],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  azure_blob_storage: {
    id: "azure_blob_storage",
    piecePackage: "@activepieces/piece-azure-blob-storage",
    displayName: "Azure Blob Storage",
    description:
      "Upload, download, and list blobs in Azure Blob Storage containers.",
    logoUrl: "https://cdn.activepieces.com/pieces/azure-blob-storage.png",
    category: "data_storage",
    tags: ["storage", "cloud", "azure", "microsoft", "blobs"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "accountName",
        displayName: "Account Name",
        description: "Azure storage account name",
        type: "text",
        required: true,
      },
      {
        name: "accountKey",
        displayName: "Account Key",
        description: "Azure storage account key",
        type: "secret",
        required: true,
      },
    ],
    actions: ["readBlob", "download_blob", "listBlobs"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── File Sync & Sharing ───────────────────────────────

  dropbox: {
    id: "dropbox",
    piecePackage: "@activepieces/piece-dropbox",
    displayName: "Dropbox",
    description:
      "Upload, download, list, and share files in Dropbox.",
    logoUrl: "https://cdn.activepieces.com/pieces/dropbox.png",
    category: "data_storage",
    tags: ["storage", "files", "sync", "sharing"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      scopes: [],
    },
    actions: [
      "upload_file",
      "download_file",
      "list_folder",
      "create_folder",
      "share_file",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  box: {
    id: "box",
    piecePackage: "@activepieces/piece-box",
    displayName: "Box",
    description:
      "Upload, download, and list items in Box cloud storage.",
    logoUrl: "https://cdn.activepieces.com/pieces/box.png",
    category: "data_storage",
    tags: ["storage", "files", "enterprise", "collaboration"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token",
      scopes: [],
    },
    actions: ["upload_file", "download_file", "list_items"],
    tier: "community",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  backblaze: {
    id: "backblaze",
    piecePackage: "@activepieces/piece-backblaze",
    displayName: "Backblaze B2",
    description:
      "Upload and list files in Backblaze B2 cloud storage.",
    logoUrl: "https://cdn.activepieces.com/pieces/backblaze.png",
    category: "data_storage",
    tags: ["storage", "cloud", "backup", "files"],
    authType: "secret_text",
    actions: ["upload_file", "list_files"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Cloud Infrastructure ──────────────────────────────

  "digital-ocean": {
    id: "digital-ocean",
    piecePackage: "@activepieces/piece-digital-ocean",
    displayName: "DigitalOcean",
    description:
      "List and create droplets on DigitalOcean.",
    logoUrl: "https://cdn.activepieces.com/pieces/digital-ocean.png",
    category: "developer_tools",
    tags: ["cloud", "infrastructure", "hosting", "droplets", "vps"],
    authType: "secret_text",
    actions: ["list_droplets", "create_droplet"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },
};
