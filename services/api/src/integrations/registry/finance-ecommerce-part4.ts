import type { IntegrationDefinition } from "../types.js";

export const FINANCE_ECOMMERCE_PART4: Record<string, IntegrationDefinition> = {

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
