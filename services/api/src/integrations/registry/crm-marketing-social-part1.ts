import type { IntegrationDefinition } from "../types.js";

export const CRM_MARKETING_SOCIAL_PART1: Record<string, IntegrationDefinition> = {

  // ══════════════════════════════════════════════════════
  // ── CRM & Sales ──────────────────────────────────────
  // ══════════════════════════════════════════════════════

  hubspot: {
    id: "hubspot",
    piecePackage: "@activepieces/piece-hubspot",
    displayName: "HubSpot",
    description:
      "Create and manage contacts, deals, and companies in HubSpot CRM.",
    logoUrl: "https://cdn.activepieces.com/pieces/hubspot.png",
    category: "crm_sales",
    tags: ["crm", "sales", "contacts", "deals", "marketing"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      scopes: [
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
        "crm.objects.deals.read",
      ],
    },
    actions: [
      "create_contact",
      "update_contact",
      "create-deal",
      "add_contact",
      "search_contacts",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  salesforce: {
    id: "salesforce",
    piecePackage: "@activepieces/piece-salesforce",
    displayName: "Salesforce",
    description:
      "Create records, run queries, and manage objects in Salesforce CRM.",
    logoUrl: "https://cdn.activepieces.com/pieces/salesforce.png",
    category: "crm_sales",
    tags: ["crm", "sales", "enterprise", "leads", "opportunities"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://login.salesforce.com/services/oauth2/authorize",
      tokenUrl: "https://login.salesforce.com/services/oauth2/token",
      scopes: ["api", "refresh_token"],
    },
    actions: [
      "create_record",
      "update_record",
      "query",
      "list_records",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  pipedrive: {
    id: "pipedrive",
    piecePackage: "@activepieces/piece-pipedrive",
    displayName: "Pipedrive",
    description:
      "Create deals, manage contacts, and track activities in Pipedrive.",
    logoUrl: "https://cdn.activepieces.com/pieces/pipedrive.png",
    category: "crm_sales",
    tags: ["crm", "sales", "pipeline", "deals"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://oauth.pipedrive.com/oauth/authorize",
      tokenUrl: "https://oauth.pipedrive.com/oauth/token",
      scopes: [],
    },
    actions: [
      "create_deal",
      "create_person",
      "find-deal",
      "create-person",
      "create_contact",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  zoho_crm: {
    id: "zoho_crm",
    piecePackage: "@activepieces/piece-zoho-crm",
    displayName: "Zoho CRM",
    description:
      "Create and manage records, search, and list data in Zoho CRM.",
    logoUrl: "https://cdn.activepieces.com/pieces/zoho-crm.png",
    category: "crm_sales",
    tags: ["crm", "sales", "zoho", "leads", "contacts"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://accounts.zoho.com/oauth/v2/auth",
      tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
      scopes: ["ZohoCRM.modules.ALL"],
    },
    actions: [
      "create_record",
      "update_record",
      "search_records",
      "list_records",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  attio: {
    id: "attio",
    piecePackage: "@activepieces/piece-attio",
    displayName: "Attio",
    description:
      "Create, list, and update records in Attio's relationship-driven CRM.",
    logoUrl: "https://cdn.activepieces.com/pieces/attio.png",
    category: "crm_sales",
    tags: ["crm", "contacts", "relationships", "data"],
    authType: "secret_text",
    actions: ["create_record", "list_records", "update_record"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  close: {
    id: "close",
    piecePackage: "@activepieces/piece-close",
    displayName: "Close",
    description:
      "Create leads, log activities, and manage your sales pipeline in Close.",
    logoUrl: "https://cdn.activepieces.com/pieces/close.png",
    category: "crm_sales",
    tags: ["crm", "sales", "leads", "pipeline", "calling"],
    authType: "secret_text",
    actions: ["create_lead", "find_lead", "create-activity"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  freshsales: {
    id: "freshsales",
    piecePackage: "@activepieces/piece-freshsales",
    displayName: "Freshsales",
    description:
      "Create contacts, manage deals, and track your sales in Freshsales.",
    logoUrl: "https://cdn.activepieces.com/pieces/freshsales.png",
    category: "crm_sales",
    tags: ["crm", "sales", "contacts", "deals", "freshworks"],
    authType: "secret_text",
    actions: ["create_contact", "get-contact", "create_deal"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  copper: {
    id: "copper",
    piecePackage: "@activepieces/piece-copper",
    displayName: "Copper",
    description:
      "Create people, track opportunities, and manage relationships in Copper CRM.",
    logoUrl: "https://cdn.activepieces.com/pieces/copper.png",
    category: "crm_sales",
    tags: ["crm", "sales", "google-workspace", "relationships"],
    authType: "secret_text",
    actions: ["create_person", "list_people", "create_opportunity"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  capsule_crm: {
    id: "capsule_crm",
    piecePackage: "@activepieces/piece-capsule-crm",
    displayName: "Capsule CRM",
    description:
      "Create parties, track opportunities, and manage contacts in Capsule CRM.",
    logoUrl: "https://cdn.activepieces.com/pieces/capsule-crm.png",
    category: "crm_sales",
    tags: ["crm", "contacts", "sales", "small-business"],
    authType: "secret_text",
    actions: ["create_party", "list_parties", "create_opportunity"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  folk: {
    id: "folk",
    piecePackage: "@activepieces/piece-folk",
    displayName: "Folk",
    description:
      "Create and list contacts in Folk's collaborative CRM.",
    logoUrl: "https://cdn.activepieces.com/pieces/folk.png",
    category: "crm_sales",
    tags: ["crm", "contacts", "relationships", "collaborative"],
    authType: "secret_text",
    actions: ["create_contact", "list_contacts"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  kommo: {
    id: "kommo",
    piecePackage: "@activepieces/piece-kommo",
    displayName: "Kommo",
    description:
      "Create leads and manage your messenger-based sales pipeline in Kommo.",
    logoUrl: "https://cdn.activepieces.com/pieces/kommo.png",
    category: "crm_sales",
    tags: ["crm", "sales", "messenger", "leads"],
    authType: "secret_text",
    actions: ["create_lead", "list_leads"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  insightly: {
    id: "insightly",
    piecePackage: "@activepieces/piece-insightly",
    displayName: "Insightly",
    description:
      "Create and list contacts in Insightly CRM.",
    logoUrl: "https://cdn.activepieces.com/pieces/insightly.png",
    category: "crm_sales",
    tags: ["crm", "contacts", "projects", "small-business"],
    authType: "secret_text",
    actions: ["create_contact", "list_contacts"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════
  // ── Marketing & Email ────────────────────────────────
  // ══════════════════════════════════════════════════════

  mailchimp: {
    id: "mailchimp",
    piecePackage: "@activepieces/piece-mailchimp",
    displayName: "Mailchimp",
    description:
      "Manage audiences, add subscribers, and send campaigns in Mailchimp.",
    logoUrl: "https://cdn.activepieces.com/pieces/mailchimp.png",
    category: "marketing",
    tags: ["email", "newsletter", "campaigns", "audiences"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://login.mailchimp.com/oauth2/authorize",
      tokenUrl: "https://login.mailchimp.com/oauth2/token",
      scopes: [],
    },
    actions: [
      "add_member_to_list",
      "create_audience",
      "create_campaign",
      "send_campaign",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  activecampaign: {
    id: "activecampaign",
    piecePackage: "@activepieces/piece-activecampaign",
    displayName: "ActiveCampaign",
    description:
      "Create contacts, manage lists, and track deals in ActiveCampaign.",
    logoUrl: "https://cdn.activepieces.com/pieces/activecampaign.png",
    category: "marketing",
    tags: ["email", "automation", "crm", "marketing"],
    authType: "secret_text",
    actions: [
      "create_contact",
      "add_contact_to_list",
      "create_deal",
      "list_contacts",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  convertkit: {
    id: "convertkit",
    piecePackage: "@activepieces/piece-convertkit",
    displayName: "ConvertKit",
    description:
      "Add subscribers, manage tags, and grow your email list with ConvertKit.",
    logoUrl: "https://cdn.activepieces.com/pieces/convertkit.png",
    category: "marketing",
    tags: ["email", "newsletter", "creators", "subscribers"],
    authType: "secret_text",
    actions: ["find_subscriber", "find_subscriber", "add_tag"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  beehiiv: {
    id: "beehiiv",
    piecePackage: "@activepieces/piece-beehiiv",
    displayName: "beehiiv",
    description:
      "Create subscribers, list publications, and manage your newsletter on beehiiv.",
    logoUrl: "https://cdn.activepieces.com/pieces/beehiiv.png",
    category: "marketing",
    tags: ["email", "newsletter", "publishing", "creators"],
    authType: "secret_text",
    actions: ["create_subscription", "tags_tag_subscriber", "list_automations"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  klaviyo: {
    id: "klaviyo",
    piecePackage: "@activepieces/piece-klaviyo",
    displayName: "Klaviyo",
    description:
      "Create profiles, manage lists, and track events in Klaviyo.",
    logoUrl: "https://cdn.activepieces.com/pieces/klaviyo.png",
    category: "marketing",
    tags: ["email", "ecommerce", "sms", "marketing-automation"],
    authType: "secret_text",
    actions: ["createProfile", "add_to_list", "create_event"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  constant_contact: {
    id: "constant_contact",
    piecePackage: "@activepieces/piece-constant-contact",
    displayName: "Constant Contact",
    description:
      "Create contacts, manage lists, and send campaigns with Constant Contact.",
    logoUrl: "https://cdn.activepieces.com/pieces/constant-contact.png",
    category: "marketing",
    tags: ["email", "campaigns", "small-business", "marketing"],
    authType: "oauth2",
    actions: ["create_contact", "list_contacts", "create_campaign"],
    tier: "community",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },
};
