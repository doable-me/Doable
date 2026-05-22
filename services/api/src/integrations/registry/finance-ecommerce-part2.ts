import type { IntegrationDefinition } from "../types.js";

export const FINANCE_ECOMMERCE_PART2: Record<string, IntegrationDefinition> = {

  saleor: {
    id: "saleor",
    piecePackage: "@activepieces/piece-saleor",
    displayName: "Saleor",
    description:
      "Create and list products in your Saleor headless commerce store.",
    logoUrl: "https://cdn.activepieces.com/pieces/saleor.png",
    category: "ecommerce",
    tags: ["headless", "commerce", "products", "graphql"],
    authType: "secret_text",
    actions: [
      "create_product",
      "list_products",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  vtex: {
    id: "vtex",
    piecePackage: "@activepieces/piece-vtex",
    displayName: "VTEX",
    description:
      "List products and create orders in your VTEX commerce platform.",
    logoUrl: "https://cdn.activepieces.com/pieces/vtex.png",
    category: "ecommerce",
    tags: ["commerce", "marketplace", "orders", "products"],
    authType: "secret_text",
    actions: [
      "list_products",
      "create_order",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  cartloom: {
    id: "cartloom",
    piecePackage: "@activepieces/piece-cartloom",
    displayName: "Cartloom",
    description:
      "List products from your Cartloom storefront.",
    logoUrl: "https://cdn.activepieces.com/pieces/cartloom.png",
    category: "ecommerce",
    tags: ["store", "products", "simple-commerce"],
    authType: "secret_text",
    actions: [
      "list_products",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════════
  //  CONTENT & CMS
  // ══════════════════════════════════════════════════════════

  wordpress: {
    id: "wordpress",
    piecePackage: "@activepieces/piece-wordpress",
    displayName: "WordPress",
    description:
      "Create posts, pages, and upload media to your WordPress site.",
    logoUrl: "https://cdn.activepieces.com/pieces/wordpress.png",
    category: "content",
    tags: ["cms", "blog", "posts", "pages", "media"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "url",
        displayName: "WordPress URL",
        description: "Your WordPress site URL (e.g. https://mysite.com)",
        type: "text",
        required: true,
      },
      {
        name: "username",
        displayName: "Username",
        description: "WordPress username or email",
        type: "text",
        required: true,
      },
      {
        name: "password",
        displayName: "Application Password",
        description: "WordPress application password (not your login password)",
        type: "secret",
        required: true,
      },
    ],
    actions: [
      "create_post",
      "list_posts",
      "update_post",
      "create_page",
      "upload_media",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  webflow: {
    id: "webflow",
    piecePackage: "@activepieces/piece-webflow",
    displayName: "Webflow",
    description:
      "Manage sites, collections, and CMS items in Webflow.",
    logoUrl: "https://cdn.activepieces.com/pieces/webflow.png",
    category: "content",
    tags: ["cms", "website", "design", "no-code"],
    authType: "secret_text",
    actions: [
      "list_sites",
      "find_collection_item",
      "create_item",
      "update_item",
      "list_items",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  contentful: {
    id: "contentful",
    piecePackage: "@activepieces/piece-contentful",
    displayName: "Contentful",
    description:
      "Create, update, and publish entries in your Contentful content infrastructure.",
    logoUrl: "https://cdn.activepieces.com/pieces/contentful.png",
    category: "content",
    tags: ["cms", "headless", "content", "api-first"],
    authType: "secret_text",
    actions: [
      "create_entry",
      "list_entries",
      "update_entry",
      "publish_entry",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  ghostcms: {
    id: "ghostcms",
    piecePackage: "@activepieces/piece-ghostcms",
    displayName: "Ghost",
    description:
      "Create, list, and update posts on your Ghost publication.",
    logoUrl: "https://cdn.activepieces.com/pieces/ghostcms.png",
    category: "content",
    tags: ["cms", "blog", "publishing", "newsletter"],
    authType: "secret_text",
    actions: [
      "create_post",
      "list_posts",
      "update_post",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  drupal: {
    id: "drupal",
    piecePackage: "@activepieces/piece-drupal",
    displayName: "Drupal",
    description:
      "Create and list content nodes in your Drupal site.",
    logoUrl: "https://cdn.activepieces.com/pieces/drupal.png",
    category: "content",
    tags: ["cms", "enterprise", "content", "open-source"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "url",
        displayName: "Drupal URL",
        description: "Your Drupal site URL",
        type: "text",
        required: true,
      },
      {
        name: "username",
        displayName: "Username",
        description: "Drupal admin username",
        type: "text",
        required: true,
      },
      {
        name: "password",
        displayName: "Password",
        description: "Drupal admin password",
        type: "secret",
        required: true,
      },
    ],
    actions: [
      "create_node",
      "list_nodes",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  datocms: {
    id: "datocms",
    piecePackage: "@activepieces/piece-datocms",
    displayName: "DatoCMS",
    description:
      "Create records, list records, and upload assets in DatoCMS.",
    logoUrl: "https://cdn.activepieces.com/pieces/datocms.png",
    category: "content",
    tags: ["cms", "headless", "graphql", "assets"],
    authType: "secret_text",
    actions: [
      "create_record",
      "list_records",
      "upload_asset",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  softr: {
    id: "softr",
    piecePackage: "@activepieces/piece-softr",
    displayName: "Softr",
    description:
      "Create, list, update, and delete records in Softr applications.",
    logoUrl: "https://cdn.activepieces.com/pieces/softr.png",
    category: "content",
    tags: ["no-code", "apps", "airtable", "website"],
    authType: "secret_text",
    actions: [
      "create_record",
      "list_records",
      "update_record",
      "delete_record",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  bubble: {
    id: "bubble",
    piecePackage: "@activepieces/piece-bubble",
    displayName: "Bubble",
    description:
      "Create, list, update, and delete things in your Bubble app.",
    logoUrl: "https://cdn.activepieces.com/pieces/bubble.png",
    category: "content",
    tags: ["no-code", "apps", "visual-programming", "database"],
    authType: "secret_text",
    actions: [
      "create_thing",
      "list_things",
      "update_thing",
      "delete_thing",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },
};
