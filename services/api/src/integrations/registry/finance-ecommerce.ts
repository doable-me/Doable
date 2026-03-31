import type { IntegrationDefinition } from "../types.js";

// ─── Finance, Payments, E-Commerce & Related Integrations ─
//
// Curated definitions for payments, e-commerce, CMS, support,
// HR, forms, documents, analytics, and scheduling integrations
// backed by Activepieces pieces.

export const FINANCE_ECOMMERCE_INTEGRATIONS: Record<string, IntegrationDefinition> = {
  // ══════════════════════════════════════════════════════════
  //  FINANCE & PAYMENTS
  // ══════════════════════════════════════════════════════════

  stripe: {
    id: "stripe",
    piecePackage: "@activepieces/piece-stripe",
    displayName: "Stripe",
    description:
      "Create payment intents, manage customers, invoices, and subscriptions with Stripe.",
    logoUrl: "https://cdn.activepieces.com/pieces/stripe.png",
    category: "finance_payments",
    tags: ["payments", "billing", "subscriptions", "invoicing"],
    authType: "secret_text",
    actions: [
      "create_payment_intent",
      "create_customer",
      "list_customers",
      "create_invoice",
      "list_subscriptions",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  quickbooks: {
    id: "quickbooks",
    piecePackage: "@activepieces/piece-quickbooks",
    displayName: "QuickBooks",
    description:
      "Create invoices, manage customers, and sync accounting data with QuickBooks Online.",
    logoUrl: "https://cdn.activepieces.com/pieces/quickbooks.png",
    category: "finance_payments",
    tags: ["accounting", "invoicing", "bookkeeping", "finance"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      scopes: ["com.intuit.quickbooks.accounting"],
    },
    actions: [
      "create_invoice",
      "list_invoices",
      "create_customer",
      "list_customers",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  xero: {
    id: "xero",
    piecePackage: "@activepieces/piece-xero",
    displayName: "Xero",
    description:
      "Create invoices, manage contacts, and track transactions in Xero.",
    logoUrl: "https://cdn.activepieces.com/pieces/xero.png",
    category: "finance_payments",
    tags: ["accounting", "invoicing", "finance", "bookkeeping"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://login.xero.com/identity/connect/authorize",
      tokenUrl: "https://identity.xero.com/connect/token",
      scopes: ["openid", "accounting.transactions"],
    },
    actions: [
      "create_invoice",
      "list_invoices",
      "create_contact",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  square: {
    id: "square",
    piecePackage: "@activepieces/piece-square",
    displayName: "Square",
    description:
      "Process payments, manage customers, and create invoices with Square.",
    logoUrl: "https://cdn.activepieces.com/pieces/square.png",
    category: "finance_payments",
    tags: ["payments", "pos", "invoicing", "commerce"],
    authType: "secret_text",
    actions: [
      "create_payment",
      "list_customers",
      "create_invoice",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  mollie: {
    id: "mollie",
    piecePackage: "@activepieces/piece-mollie",
    displayName: "Mollie",
    description:
      "Create and manage payments with the Mollie payment gateway.",
    logoUrl: "https://cdn.activepieces.com/pieces/mollie.png",
    category: "finance_payments",
    tags: ["payments", "gateway", "europe", "billing"],
    authType: "secret_text",
    actions: [
      "create_payment",
      "create_payment",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  "lemon-squeezy": {
    id: "lemon-squeezy",
    piecePackage: "@activepieces/piece-lemon-squeezy",
    displayName: "Lemon Squeezy",
    description:
      "List products and create checkout links with Lemon Squeezy.",
    logoUrl: "https://cdn.activepieces.com/pieces/lemon-squeezy.png",
    category: "finance_payments",
    tags: ["payments", "digital-products", "subscriptions", "checkout"],
    authType: "secret_text",
    actions: [
      "Find Product",
      "create_checkout",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  razorpay: {
    id: "razorpay",
    piecePackage: "@activepieces/piece-razorpay",
    displayName: "Razorpay",
    description:
      "Create payment links and manage payments with Razorpay.",
    logoUrl: "https://cdn.activepieces.com/pieces/razorpay.png",
    category: "finance_payments",
    tags: ["payments", "india", "gateway", "billing"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "keyId",
        displayName: "Key ID",
        description: "Your Razorpay Key ID",
        type: "text",
        required: true,
      },
      {
        name: "keySecret",
        displayName: "Key Secret",
        description: "Your Razorpay Key Secret",
        type: "secret",
        required: true,
      },
    ],
    actions: [
      "create_payment_link",
      "list_payments",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  paywhirl: {
    id: "paywhirl",
    piecePackage: "@activepieces/piece-paywhirl",
    displayName: "PayWhirl",
    description:
      "Manage subscription customers and billing with PayWhirl.",
    logoUrl: "https://cdn.activepieces.com/pieces/paywhirl.png",
    category: "finance_payments",
    tags: ["subscriptions", "billing", "recurring", "payments"],
    authType: "secret_text",
    actions: [
      "create_customer",
      "list_subscriptions",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════════
  //  E-COMMERCE
  // ══════════════════════════════════════════════════════════

  shopify: {
    id: "shopify",
    piecePackage: "@activepieces/piece-shopify",
    displayName: "Shopify",
    description:
      "Create products, manage orders, and update inventory in your Shopify store.",
    logoUrl: "https://cdn.activepieces.com/pieces/shopify.png",
    category: "ecommerce",
    tags: ["store", "products", "orders", "inventory", "shop"],
    authType: "secret_text",
    actions: [
      "create_product",
      "list_products",
      "create_order",
      "list_orders",
      "update_order",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  woocommerce: {
    id: "woocommerce",
    piecePackage: "@activepieces/piece-woocommerce",
    displayName: "WooCommerce",
    description:
      "Create and manage products and orders in your WooCommerce store.",
    logoUrl: "https://cdn.activepieces.com/pieces/woocommerce.png",
    category: "ecommerce",
    tags: ["store", "wordpress", "products", "orders"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "url",
        displayName: "Store URL",
        description: "Your WooCommerce store URL (e.g. https://mystore.com)",
        type: "text",
        required: true,
      },
      {
        name: "consumerKey",
        displayName: "Consumer Key",
        description: "WooCommerce REST API Consumer Key",
        type: "secret",
        required: true,
      },
      {
        name: "consumerSecret",
        displayName: "Consumer Secret",
        description: "WooCommerce REST API Consumer Secret",
        type: "secret",
        required: true,
      },
    ],
    actions: [
      "create_product",
      "list_products",
      "create_order",
      "list_orders",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  bigcommerce: {
    id: "bigcommerce",
    piecePackage: "@activepieces/piece-bigcommerce",
    displayName: "BigCommerce",
    description:
      "Create products, list products, and manage orders in BigCommerce.",
    logoUrl: "https://cdn.activepieces.com/pieces/bigcommerce.png",
    category: "ecommerce",
    tags: ["store", "products", "orders", "enterprise"],
    authType: "secret_text",
    actions: [
      "create_product",
      "list_products",
      "list_orders",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

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

  sanity: {
    id: "sanity",
    piecePackage: "@activepieces/piece-sanity",
    displayName: "Sanity",
    description:
      "Create, read, update, and delete documents in Sanity Studio.",
    logoUrl: "https://cdn.activepieces.com/pieces/sanity.png",
    category: "content",
    tags: ["cms", "headless", "structured-content", "real-time"],
    authType: "secret_text",
    actions: [
      "create_document",
      "findDocument",
      "update_document",
      "delete_document",
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

  // ══════════════════════════════════════════════════════════
  //  CUSTOMER SUPPORT
  // ══════════════════════════════════════════════════════════

  zendesk: {
    id: "zendesk",
    piecePackage: "@activepieces/piece-zendesk",
    displayName: "Zendesk",
    description:
      "Create, update, and search tickets, and add comments in Zendesk.",
    logoUrl: "https://cdn.activepieces.com/pieces/zendesk.png",
    category: "customer_support",
    tags: ["helpdesk", "tickets", "support", "customer-service"],
    authType: "secret_text",
    actions: [
      "create-ticket",
      "get_tickets",
      "find-tickets",
      "add_comment",
      "create-ticket",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  freshdesk: {
    id: "freshdesk",
    piecePackage: "@activepieces/piece-freshdesk",
    displayName: "Freshdesk",
    description:
      "Create and manage support tickets and add notes in Freshdesk.",
    logoUrl: "https://cdn.activepieces.com/pieces/freshdesk.png",
    category: "customer_support",
    tags: ["helpdesk", "tickets", "support", "freshworks"],
    authType: "secret_text",
    actions: [
      "create_ticket",
      "update-ticket",
      "list_tickets",
      "add_note",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  "help-scout": {
    id: "help-scout",
    piecePackage: "@activepieces/piece-help-scout",
    displayName: "Help Scout",
    description:
      "Create conversations, list conversations, and add replies in Help Scout.",
    logoUrl: "https://cdn.activepieces.com/pieces/help-scout.png",
    category: "customer_support",
    tags: ["helpdesk", "email", "support", "shared-inbox"],
    authType: "secret_text",
    actions: [
      "create_conversation",
      "find_conversation",
      "send_reply",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  chatwoot: {
    id: "chatwoot",
    piecePackage: "@activepieces/piece-chatwoot",
    displayName: "Chatwoot",
    description:
      "Create conversations, send messages, and manage contacts in Chatwoot.",
    logoUrl: "https://cdn.activepieces.com/pieces/chatwoot.png",
    category: "customer_support",
    tags: ["live-chat", "support", "open-source", "messaging"],
    authType: "secret_text",
    actions: [
      "create_conversation",
      "send_message",
      "list_contacts",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════════
  //  HR & RECRUITING
  // ══════════════════════════════════════════════════════════

  bamboohr: {
    id: "bamboohr",
    piecePackage: "@activepieces/piece-bamboohr",
    displayName: "BambooHR",
    description:
      "List, get, and create employees in BambooHR.",
    logoUrl: "https://cdn.activepieces.com/pieces/bamboohr.png",
    category: "hr",
    tags: ["hr", "employees", "people-ops", "hris"],
    authType: "secret_text",
    actions: [
      "list_employees",
      "get_employee",
      "create_employee",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  lever: {
    id: "lever",
    piecePackage: "@activepieces/piece-lever",
    displayName: "Lever",
    description:
      "List job postings and create candidates in Lever ATS.",
    logoUrl: "https://cdn.activepieces.com/pieces/lever.png",
    category: "hr",
    tags: ["ats", "recruiting", "hiring", "candidates"],
    authType: "secret_text",
    actions: [
      "list_postings",
      "create_candidate",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  ashby: {
    id: "ashby",
    piecePackage: "@activepieces/piece-ashby",
    displayName: "Ashby",
    description:
      "List and create candidates in Ashby ATS.",
    logoUrl: "https://cdn.activepieces.com/pieces/ashby.png",
    category: "hr",
    tags: ["ats", "recruiting", "hiring", "candidates"],
    authType: "secret_text",
    actions: [
      "getCandidate",
      "create_candidate",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  workable: {
    id: "workable",
    piecePackage: "@activepieces/piece-workable",
    displayName: "Workable",
    description:
      "List candidates and job postings in Workable.",
    logoUrl: "https://cdn.activepieces.com/pieces/workable.png",
    category: "hr",
    tags: ["ats", "recruiting", "jobs", "hiring"],
    authType: "secret_text",
    actions: [
      "list_candidates",
      "list_jobs",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════════
  //  FORMS & SURVEYS
  // ══════════════════════════════════════════════════════════

  typeform: {
    id: "typeform",
    piecePackage: "@activepieces/piece-typeform",
    displayName: "Typeform",
    description:
      "List forms and retrieve responses from Typeform.",
    logoUrl: "https://cdn.activepieces.com/pieces/typeform.png",
    category: "other",
    tags: ["forms", "surveys", "responses", "data-collection"],
    authType: "secret_text",
    actions: [
      "list_forms",
      "list_responses",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  jotform: {
    id: "jotform",
    piecePackage: "@activepieces/piece-jotform",
    displayName: "Jotform",
    description:
      "List forms and retrieve submissions from Jotform.",
    logoUrl: "https://cdn.activepieces.com/pieces/jotform.png",
    category: "other",
    tags: ["forms", "submissions", "data-collection"],
    authType: "secret_text",
    actions: [
      "list_forms",
      "list_submissions",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  tally: {
    id: "tally",
    piecePackage: "@activepieces/piece-tally",
    displayName: "Tally",
    description:
      "List forms and retrieve submissions from Tally.",
    logoUrl: "https://cdn.activepieces.com/pieces/tally.png",
    category: "other",
    tags: ["forms", "surveys", "free", "simple"],
    authType: "secret_text",
    actions: [
      "list_forms",
      "list_submissions",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  surveymonkey: {
    id: "surveymonkey",
    piecePackage: "@activepieces/piece-surveymonkey",
    displayName: "SurveyMonkey",
    description:
      "List surveys and retrieve responses from SurveyMonkey.",
    logoUrl: "https://cdn.activepieces.com/pieces/surveymonkey.png",
    category: "other",
    tags: ["surveys", "responses", "feedback", "research"],
    authType: "secret_text",
    actions: [
      "list_surveys",
      "list_responses",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  "fillout-forms": {
    id: "fillout-forms",
    piecePackage: "@activepieces/piece-fillout-forms",
    displayName: "Fillout Forms",
    description:
      "List forms and retrieve submissions from Fillout.",
    logoUrl: "https://cdn.activepieces.com/pieces/fillout-forms.png",
    category: "other",
    tags: ["forms", "submissions", "no-code"],
    authType: "secret_text",
    actions: [
      "list_forms",
      "list_submissions",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  "cognito-forms": {
    id: "cognito-forms",
    piecePackage: "@activepieces/piece-cognito-forms",
    displayName: "Cognito Forms",
    description:
      "List forms and retrieve entries from Cognito Forms.",
    logoUrl: "https://cdn.activepieces.com/pieces/cognito-forms.png",
    category: "other",
    tags: ["forms", "entries", "data-collection", "payments"],
    authType: "secret_text",
    actions: [
      "list_forms",
      "list_entries",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════════
  //  DOCUMENTS & E-SIGNATURES
  // ══════════════════════════════════════════════════════════

  docusign: {
    id: "docusign",
    piecePackage: "@activepieces/piece-docusign",
    displayName: "DocuSign",
    description:
      "Create, list, and send envelopes for e-signatures with DocuSign.",
    logoUrl: "https://cdn.activepieces.com/pieces/docusign.png",
    category: "other",
    tags: ["e-signature", "documents", "contracts", "legal"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://account-d.docusign.com/oauth/auth",
      tokenUrl: "https://account-d.docusign.com/oauth/token",
      scopes: ["signature"],
    },
    actions: [
      "getEnvelope",
      "listEnvelopes",
      "getEnvelope",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  pandadoc: {
    id: "pandadoc",
    piecePackage: "@activepieces/piece-pandadoc",
    displayName: "PandaDoc",
    description:
      "Create, list, and send documents with PandaDoc.",
    logoUrl: "https://cdn.activepieces.com/pieces/pandadoc.png",
    category: "other",
    tags: ["documents", "proposals", "contracts", "e-signature"],
    authType: "secret_text",
    actions: [
      "create_document",
      "list_documents",
      "send_document",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  "sign-now": {
    id: "sign-now",
    piecePackage: "@activepieces/piece-sign-now",
    displayName: "signNow",
    description:
      "Create documents and send signing invites with signNow.",
    logoUrl: "https://cdn.activepieces.com/pieces/sign-now.png",
    category: "other",
    tags: ["e-signature", "documents", "signing"],
    authType: "secret_text",
    actions: [
      "create_document",
      "send_invite",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════════
  //  ANALYTICS
  // ══════════════════════════════════════════════════════════

  "google-analytics": {
    id: "google-analytics",
    piecePackage: "@activepieces/piece-google-analytics",
    displayName: "Google Analytics",
    description:
      "Run reports and retrieve analytics data from Google Analytics 4.",
    logoUrl: "https://cdn.activepieces.com/pieces/google-analytics.png",
    category: "analytics",
    tags: ["analytics", "tracking", "google", "reports"],
    authType: "secret_text",
    actions: [
      "run_report",
      "get_realtime_report",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  mixpanel: {
    id: "mixpanel",
    piecePackage: "@activepieces/piece-mixpanel",
    displayName: "Mixpanel",
    description:
      "Track events and query analytics data in Mixpanel.",
    logoUrl: "https://cdn.activepieces.com/pieces/mixpanel.png",
    category: "analytics",
    tags: ["analytics", "product-analytics", "events", "funnels"],
    authType: "secret_text",
    actions: [
      "track_event",
      "track_event",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  plausible: {
    id: "plausible",
    piecePackage: "@activepieces/piece-plausible",
    displayName: "Plausible",
    description:
      "Retrieve website analytics stats from Plausible.",
    logoUrl: "https://cdn.activepieces.com/pieces/plausible.png",
    category: "analytics",
    tags: ["analytics", "privacy", "open-source", "stats"],
    authType: "secret_text",
    actions: [
      "get_stats",
      "get_breakdown",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  matomo: {
    id: "matomo",
    piecePackage: "@activepieces/piece-matomo",
    displayName: "Matomo",
    description:
      "Retrieve visits, page views, and reports from Matomo analytics.",
    logoUrl: "https://cdn.activepieces.com/pieces/matomo.png",
    category: "analytics",
    tags: ["analytics", "privacy", "self-hosted", "reports"],
    authType: "secret_text",
    actions: [
      "get_visits",
      "get_page_views",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  segment: {
    id: "segment",
    piecePackage: "@activepieces/piece-segment",
    displayName: "Segment",
    description:
      "Track events and identify users with Segment CDP.",
    logoUrl: "https://cdn.activepieces.com/pieces/segment.png",
    category: "analytics",
    tags: ["cdp", "analytics", "tracking", "data-pipeline"],
    authType: "secret_text",
    actions: [
      "track_event",
      "identifyUser",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════════
  //  SCHEDULING & MEETINGS
  // ══════════════════════════════════════════════════════════

  calendly: {
    id: "calendly",
    piecePackage: "@activepieces/piece-calendly",
    displayName: "Calendly",
    description:
      "List scheduled events and event types from Calendly.",
    logoUrl: "https://cdn.activepieces.com/pieces/calendly.png",
    category: "productivity",
    tags: ["scheduling", "calendar", "meetings", "booking"],
    authType: "secret_text",
    actions: [
      "list_events",
      "list_event_types",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  "cal-com": {
    id: "cal-com",
    piecePackage: "@activepieces/piece-cal-com",
    displayName: "Cal.com",
    description:
      "List bookings and event types from Cal.com.",
    logoUrl: "https://cdn.activepieces.com/pieces/cal-com.png",
    category: "productivity",
    tags: ["scheduling", "calendar", "open-source", "booking"],
    authType: "secret_text",
    actions: [
      "list_bookings",
      "list_event_types",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  zoom: {
    id: "zoom",
    piecePackage: "@activepieces/piece-zoom",
    displayName: "Zoom",
    description:
      "Create and list meetings in Zoom.",
    logoUrl: "https://cdn.activepieces.com/pieces/zoom.png",
    category: "communication",
    tags: ["video", "meetings", "conferencing", "webinars"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://zoom.us/oauth/authorize",
      tokenUrl: "https://zoom.us/oauth/token",
      scopes: [],
    },
    actions: [
      "createMessage",
      "list_meetings",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  webex: {
    id: "webex",
    piecePackage: "@activepieces/piece-webex",
    displayName: "Webex",
    description:
      "Create and list meetings in Cisco Webex.",
    logoUrl: "https://cdn.activepieces.com/pieces/webex.png",
    category: "communication",
    tags: ["video", "meetings", "conferencing", "cisco"],
    authType: "secret_text",
    actions: [
      "zoom_create_meeting",
      "list_meetings",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════════
  //  UTILITIES & MEDIA
  // ══════════════════════════════════════════════════════════

  documerge: {
    id: "documerge",
    piecePackage: "@activepieces/piece-documerge",
    displayName: "Documerge",
    description:
      "Merge data into document templates with Documerge.",
    logoUrl: "https://cdn.activepieces.com/pieces/documerge.png",
    category: "other",
    tags: ["documents", "templates", "merge", "pdf"],
    authType: "secret_text",
    actions: [
      "merge_document",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  cloudconvert: {
    id: "cloudconvert",
    piecePackage: "@activepieces/piece-cloudconvert",
    displayName: "CloudConvert",
    description:
      "Convert files between formats using CloudConvert.",
    logoUrl: "https://cdn.activepieces.com/pieces/cloudconvert.png",
    category: "other",
    tags: ["conversion", "files", "pdf", "media"],
    authType: "secret_text",
    actions: [
      "convert_file",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  cloudinary: {
    id: "cloudinary",
    piecePackage: "@activepieces/piece-cloudinary",
    displayName: "Cloudinary",
    description:
      "Upload and transform images and media with Cloudinary.",
    logoUrl: "https://cdn.activepieces.com/pieces/cloudinary.png",
    category: "other",
    tags: ["images", "media", "cdn", "transformation"],
    authType: "secret_text",
    actions: [
      "upload_image",
      "transformResource",
    ],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  rss: {
    id: "rss",
    piecePackage: "@activepieces/piece-rss",
    displayName: "RSS",
    description:
      "Fetch and parse items from any RSS or Atom feed.",
    logoUrl: "https://cdn.activepieces.com/pieces/rss.png",
    category: "other",
    tags: ["feed", "news", "content", "syndication"],
    authType: "none",
    actions: [
      "get_feed_items",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: false,
  },
};
