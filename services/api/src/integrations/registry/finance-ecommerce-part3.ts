import type { IntegrationDefinition } from "../types.js";

export const FINANCE_ECOMMERCE_PART3: Record<string, IntegrationDefinition> = {

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
};
