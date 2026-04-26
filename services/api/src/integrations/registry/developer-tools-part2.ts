import type { IntegrationDefinition } from "../types.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const DEVELOPER_TOOLS_PART2: Record<string, IntegrationDefinition> = {

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
