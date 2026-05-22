import type { IntegrationDefinition } from "../types.js";

// ─── Communication & Messaging Integrations ─────────────
//
// Curated definitions for chat, email, SMS, and push
// notification integrations backed by Activepieces pieces.
// Slack is intentionally omitted — it lives in the main registry.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const MICROSOFT_AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export const COMMUNICATION_INTEGRATIONS: Record<string, IntegrationDefinition> = {
  // ── Chat & Team Messaging ──────────────────────────────

  discord: {
    id: "discord",
    piecePackage: "@activepieces/piece-discord",
    displayName: "Discord",
    description:
      "Send messages, manage channels, and moderate members in Discord servers.",
    logoUrl: "https://cdn.activepieces.com/pieces/discord.png",
    category: "communication",
    tags: ["chat", "community", "gaming", "voice"],
    authType: "secret_text",
    actions: [
      "send_message_webhook",
      "ban_guild_member",
      "create_channel",
      "add_role",
      "remove_role",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  microsoft_teams: {
    id: "microsoft_teams",
    piecePackage: "@activepieces/piece-microsoft-teams",
    displayName: "Microsoft Teams",
    description:
      "Send messages, create channels, and collaborate in Microsoft Teams.",
    logoUrl: "https://cdn.activepieces.com/pieces/microsoft-teams.png",
    category: "communication",
    tags: ["chat", "team", "microsoft", "enterprise"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: MICROSOFT_AUTH_URL,
      tokenUrl: MICROSOFT_TOKEN_URL,
      scopes: ["Chat.ReadWrite", "ChannelMessage.Send", "User.Read"],
    },
    actions: ["send_message", "create_channel", "listUsers"],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  telegram_bot: {
    id: "telegram_bot",
    piecePackage: "@activepieces/piece-telegram-bot",
    displayName: "Telegram Bot",
    description:
      "Send messages, photos, and documents via a Telegram bot.",
    logoUrl: "https://cdn.activepieces.com/pieces/telegram-bot.png",
    category: "communication",
    tags: ["chat", "messaging", "bot", "telegram"],
    authType: "secret_text",
    actions: [
      "send_text_message",
      "send_media",
      "send_media",
      "get_chat_member",
    ],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  whatsapp: {
    id: "whatsapp",
    piecePackage: "@activepieces/piece-whatsapp",
    displayName: "WhatsApp",
    description:
      "Send messages, templates, and media through the WhatsApp Business API.",
    logoUrl: "https://cdn.activepieces.com/pieces/whatsapp.png",
    category: "communication",
    tags: ["messaging", "chat", "mobile", "business"],
    authType: "secret_text",
    actions: ["send_message", "send_template_message", "send_media"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  mattermost: {
    id: "mattermost",
    piecePackage: "@activepieces/piece-mattermost",
    displayName: "Mattermost",
    description:
      "Send messages and manage channels in Mattermost.",
    logoUrl: "https://cdn.activepieces.com/pieces/mattermost.png",
    category: "communication",
    tags: ["chat", "open-source", "team", "self-hosted"],
    authType: "secret_text",
    actions: ["send_message", "create_channel"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  googlechat: {
    id: "googlechat",
    piecePackage: "@activepieces/piece-googlechat",
    displayName: "Google Chat",
    description:
      "Send messages in Google Chat spaces and conversations.",
    logoUrl: "https://cdn.activepieces.com/pieces/googlechat.png",
    category: "communication",
    tags: ["chat", "google", "workspace", "team"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: GOOGLE_AUTH_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      scopes: ["https://www.googleapis.com/auth/chat.messages"],
    },
    actions: ["send_message"],
    tier: "community",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  line: {
    id: "line",
    piecePackage: "@activepieces/piece-line",
    displayName: "LINE",
    description:
      "Send messages and replies through the LINE Messaging API.",
    logoUrl: "https://cdn.activepieces.com/pieces/line.png",
    category: "communication",
    tags: ["messaging", "chat", "mobile", "asia"],
    authType: "secret_text",
    actions: ["send_message", "send_reply"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Email ──────────────────────────────────────────────

  gmail: {
    id: "gmail",
    piecePackage: "@activepieces/piece-gmail",
    displayName: "Gmail",
    description:
      "Send, reply, search, and read emails in Gmail. Create drafts, request approvals, and manage your inbox.",
    logoUrl: "https://cdn.activepieces.com/pieces/gmail.png",
    category: "communication",
    tags: ["email", "google", "inbox", "mail", "send", "read"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: GOOGLE_AUTH_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      scopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
      ],
      // PKCE not needed for confidential clients (server-side with client_secret)
    },
    actions: [
      "send_email",
      "reply_to_email",
      "create_draft_reply",
      "gmail_get_mail",
      "gmail_search_mail",
      "request_approval_in_mail",
      "custom_api_call",
    ],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  microsoft_outlook: {
    id: "microsoft_outlook",
    piecePackage: "@activepieces/piece-microsoft-outlook",
    displayName: "Microsoft Outlook",
    description:
      "Send, search, and read emails in Microsoft Outlook.",
    logoUrl: "https://cdn.activepieces.com/pieces/microsoft-outlook.png",
    category: "communication",
    tags: ["email", "microsoft", "inbox", "mail", "enterprise"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: MICROSOFT_AUTH_URL,
      tokenUrl: MICROSOFT_TOKEN_URL,
      scopes: ["Mail.Send", "Mail.Read", "User.Read"],
    },
    actions: ["send_email", "send-email", "get_email", "list_folders"],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  sendgrid: {
    id: "sendgrid",
    piecePackage: "@activepieces/piece-sendgrid",
    displayName: "SendGrid",
    description:
      "Send transactional emails and manage contacts via SendGrid.",
    logoUrl: "https://cdn.activepieces.com/pieces/sendgrid.png",
    category: "marketing",
    tags: ["email", "transactional", "marketing", "contacts"],
    authType: "secret_text",
    actions: ["send_email", "create_contact", "add_contact_to_list"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  resend: {
    id: "resend",
    piecePackage: "@activepieces/piece-resend",
    displayName: "Resend",
    description:
      "Send transactional and marketing emails with the Resend API.",
    logoUrl: "https://cdn.activepieces.com/pieces/resend.png",
    category: "communication",
    tags: ["email", "transactional", "developer", "api"],
    authType: "secret_text",
    actions: ["send_email"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── SMS & Voice ────────────────────────────────────────

  twilio: {
    id: "twilio",
    piecePackage: "@activepieces/piece-twilio",
    displayName: "Twilio",
    description:
      "Send SMS messages and make phone calls with Twilio.",
    logoUrl: "https://cdn.activepieces.com/pieces/twilio.png",
    category: "communication",
    tags: ["sms", "voice", "phone", "messaging"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "accountSid",
        displayName: "Account SID",
        description: "Your Twilio Account SID",
        type: "text",
        required: true,
      },
      {
        name: "authToken",
        displayName: "Auth Token",
        description: "Your Twilio Auth Token",
        type: "secret",
        required: true,
      },
    ],
    actions: ["send_sms", "make_call", "get_message"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Customer Messaging ─────────────────────────────────

  crisp: {
    id: "crisp",
    piecePackage: "@activepieces/piece-crisp",
    displayName: "Crisp",
    description:
      "Send messages and manage conversations in Crisp live chat.",
    logoUrl: "https://cdn.activepieces.com/pieces/crisp.png",
    category: "customer_support",
    tags: ["live-chat", "support", "messaging", "customer"],
    authType: "secret_text",
    actions: ["send_message", "create_conversation"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  intercom: {
    id: "intercom",
    piecePackage: "@activepieces/piece-intercom",
    displayName: "Intercom",
    description:
      "Create contacts, send messages, and manage conversations in Intercom.",
    logoUrl: "https://cdn.activepieces.com/pieces/intercom.png",
    category: "customer_support",
    tags: ["support", "messaging", "crm", "live-chat"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://app.intercom.com/oauth",
      tokenUrl: "https://api.intercom.com/auth/eagle/token",
      scopes: [],
    },
    actions: ["create_contact", "send_message", "findConversation"],
    tier: "community",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  front: {
    id: "front",
    piecePackage: "@activepieces/piece-front",
    displayName: "Front",
    description:
      "Send messages, list conversations, and manage tags in Front.",
    logoUrl: "https://cdn.activepieces.com/pieces/front.png",
    category: "customer_support",
    tags: ["inbox", "support", "email", "team"],
    authType: "secret_text",
    actions: ["send_message", "find-conversation", "create_tag"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ── Push Notifications ─────────────────────────────────

  pushover: {
    id: "pushover",
    piecePackage: "@activepieces/piece-pushover",
    displayName: "Pushover",
    description:
      "Send push notifications to mobile and desktop devices via Pushover.",
    logoUrl: "https://cdn.activepieces.com/pieces/pushover.png",
    category: "communication",
    tags: ["push", "notifications", "alerts", "mobile"],
    authType: "secret_text",
    actions: ["send_notification"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  ntfy: {
    id: "ntfy",
    piecePackage: "@activepieces/piece-ntfy",
    displayName: "ntfy",
    description:
      "Send push notifications to any device using the ntfy pub/sub service.",
    logoUrl: "https://cdn.activepieces.com/pieces/ntfy.png",
    category: "communication",
    tags: ["push", "notifications", "open-source", "self-hosted"],
    authType: "none",
    actions: ["send_notification"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: false,
  },

  pushbullet: {
    id: "pushbullet",
    piecePackage: "@activepieces/piece-pushbullet",
    displayName: "Pushbullet",
    description:
      "Send pushes and notifications across devices with Pushbullet.",
    logoUrl: "https://cdn.activepieces.com/pieces/pushbullet.png",
    category: "communication",
    tags: ["push", "notifications", "cross-device", "sync"],
    authType: "secret_text",
    actions: ["send_push"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  gotify: {
    id: "gotify",
    piecePackage: "@activepieces/piece-gotify",
    displayName: "Gotify",
    description:
      "Send messages and notifications via a self-hosted Gotify server.",
    logoUrl: "https://cdn.activepieces.com/pieces/gotify.png",
    category: "communication",
    tags: ["push", "notifications", "self-hosted", "open-source"],
    authType: "secret_text",
    actions: ["send_message"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },
};
