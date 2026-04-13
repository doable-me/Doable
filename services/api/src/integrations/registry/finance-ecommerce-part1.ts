import type { IntegrationDefinition } from "../types.js";

export const FINANCE_ECOMMERCE_PART1: Record<string, IntegrationDefinition> = {
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
    envKeyMap: {
      // publishableKey is browser-safe (`pk_*`); secretKey is server-only (`sk_*`).
      // The vault-bridge will silently skip whichever field is absent on a given
      // connection — secret_text connections that only stored a secret key still work.
      client: {
        publishableKey: "VITE_STRIPE_PUBLISHABLE_KEY",
      },
      server: {
        secretKey: "STRIPE_SECRET_KEY",
      },
      runtimeHint: "Stripe payments and subscriptions.",
    },
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
};
