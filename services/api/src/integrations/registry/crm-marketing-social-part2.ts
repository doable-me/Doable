import type { IntegrationDefinition } from "../types.js";

const GOOGLE_OAUTH_BASE = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  // PKCE not needed for confidential clients (server-side with client_secret)
  prompt: "consent" as const,
  extraParams: { access_type: "offline" },
};

export const CRM_MARKETING_SOCIAL_PART2: Record<string, IntegrationDefinition> = {

  mailer_lite: {
    id: "mailer_lite",
    piecePackage: "@activepieces/piece-mailer-lite",
    displayName: "MailerLite",
    description:
      "Create subscribers, manage groups, and grow your email list with MailerLite.",
    logoUrl: "https://cdn.activepieces.com/pieces/mailer-lite.png",
    category: "marketing",
    tags: ["email", "newsletter", "automation", "subscribers"],
    authType: "secret_text",
    actions: ["upsert_subscriber", "find_subscriber", "add_to_group"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  lemlist: {
    id: "lemlist",
    piecePackage: "@activepieces/piece-lemlist",
    displayName: "lemlist",
    description:
      "Add leads to campaigns and manage cold outreach in lemlist.",
    logoUrl: "https://cdn.activepieces.com/pieces/lemlist.png",
    category: "marketing",
    tags: ["email", "outreach", "cold-email", "sales"],
    authType: "secret_text",
    actions: ["add_lead", "list_campaigns"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  campaign_monitor: {
    id: "campaign_monitor",
    piecePackage: "@activepieces/piece-campaign-monitor",
    displayName: "Campaign Monitor",
    description:
      "Add and list subscribers in Campaign Monitor email lists.",
    logoUrl: "https://cdn.activepieces.com/pieces/campaign-monitor.png",
    category: "marketing",
    tags: ["email", "campaigns", "newsletter", "subscribers"],
    authType: "secret_text",
    actions: ["tags_tag_subscriber", "list_subscribers"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  drip: {
    id: "drip",
    piecePackage: "@activepieces/piece-drip",
    displayName: "Drip",
    description:
      "Create subscribers, apply tags, and manage your Drip email marketing.",
    logoUrl: "https://cdn.activepieces.com/pieces/drip.png",
    category: "marketing",
    tags: ["email", "ecommerce", "automation", "tags"],
    authType: "secret_text",
    actions: ["find_subscriber", "upsert_subscriber"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  loops: {
    id: "loops",
    piecePackage: "@activepieces/piece-loops",
    displayName: "Loops",
    description:
      "Create contacts and send events in Loops email platform.",
    logoUrl: "https://cdn.activepieces.com/pieces/loops.png",
    category: "marketing",
    tags: ["email", "transactional", "product-email", "saas"],
    authType: "secret_text",
    actions: ["create_contact", "send_event"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  buttondown: {
    id: "buttondown",
    piecePackage: "@activepieces/piece-buttondown",
    displayName: "Buttondown",
    description:
      "Create and list subscribers in your Buttondown newsletter.",
    logoUrl: "https://cdn.activepieces.com/pieces/buttondown.png",
    category: "marketing",
    tags: ["email", "newsletter", "simple", "indie"],
    authType: "secret_text",
    actions: ["create_subscriber", "list_subscribers"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  getresponse: {
    id: "getresponse",
    piecePackage: "@activepieces/piece-getresponse",
    displayName: "GetResponse",
    description:
      "Create and list contacts in GetResponse email marketing.",
    logoUrl: "https://cdn.activepieces.com/pieces/getresponse.png",
    category: "marketing",
    tags: ["email", "marketing-automation", "landing-pages", "webinars"],
    authType: "secret_text",
    actions: ["create_contact", "list_contacts"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  sendinblue: {
    id: "sendinblue",
    piecePackage: "@activepieces/piece-sendinblue",
    displayName: "Brevo (Sendinblue)",
    description:
      "Create contacts and send transactional emails with Brevo (formerly Sendinblue).",
    logoUrl: "https://cdn.activepieces.com/pieces/sendinblue.png",
    category: "marketing",
    tags: ["email", "transactional", "sms", "marketing"],
    authType: "secret_text",
    actions: ["create_contact", "send_email"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  mailjet: {
    id: "mailjet",
    piecePackage: "@activepieces/piece-mailjet",
    displayName: "Mailjet",
    description:
      "Send transactional emails and manage contacts with Mailjet.",
    logoUrl: "https://cdn.activepieces.com/pieces/mailjet.png",
    category: "marketing",
    tags: ["email", "transactional", "api", "marketing"],
    authType: "secret_text",
    actions: ["send_email", "create_contact"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  // ══════════════════════════════════════════════════════
  // ── Social Media ─────────────────────────────────────
  // ══════════════════════════════════════════════════════

  twitter: {
    id: "twitter",
    piecePackage: "@activepieces/piece-twitter",
    displayName: "X (Twitter)",
    description:
      "Create tweets, search content, and manage your presence on X (Twitter).",
    logoUrl: "https://cdn.activepieces.com/pieces/twitter.png",
    category: "social_media",
    tags: ["social", "twitter", "x", "tweets", "microblogging"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      scopes: ["tweet.read", "tweet.write", "users.read"],
      pkce: true,
      pkceMethod: "S256",
    },
    actions: ["create-tweet", "create-tweet", "get_user"],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  linkedin: {
    id: "linkedin",
    piecePackage: "@activepieces/piece-linkedin",
    displayName: "LinkedIn",
    description:
      "Create posts and manage your professional profile on LinkedIn.",
    logoUrl: "https://cdn.activepieces.com/pieces/linkedin.png",
    category: "social_media",
    tags: ["social", "professional", "networking", "posts"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes: ["w_member_social", "r_liteprofile"],
    },
    actions: ["create_post", "get_profile"],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  instagram_business: {
    id: "instagram_business",
    piecePackage: "@activepieces/piece-instagram-business",
    displayName: "Instagram Business",
    description:
      "Create posts, list media, and manage your Instagram Business profile.",
    logoUrl: "https://cdn.activepieces.com/pieces/instagram-business.png",
    category: "social_media",
    tags: ["social", "photos", "stories", "instagram", "meta"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://api.instagram.com/oauth/authorize",
      tokenUrl: "https://api.instagram.com/oauth/access_token",
      scopes: ["instagram_basic", "instagram_content_publish"],
    },
    actions: ["create_post", "list_media", "get_profile"],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  facebook_pages: {
    id: "facebook_pages",
    piecePackage: "@activepieces/piece-facebook-pages",
    displayName: "Facebook Pages",
    description:
      "Create posts, list content, and manage your Facebook Page.",
    logoUrl: "https://cdn.activepieces.com/pieces/facebook-pages.png",
    category: "social_media",
    tags: ["social", "facebook", "pages", "meta", "community"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
      scopes: ["pages_manage_posts", "pages_read_engagement"],
    },
    actions: ["create_post", "list_posts", "get_page"],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  reddit: {
    id: "reddit",
    piecePackage: "@activepieces/piece-reddit",
    displayName: "Reddit",
    description:
      "Submit posts, search content, and browse subreddits on Reddit.",
    logoUrl: "https://cdn.activepieces.com/pieces/reddit.png",
    category: "social_media",
    tags: ["social", "forum", "community", "subreddits"],
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://www.reddit.com/api/v1/authorize",
      tokenUrl: "https://www.reddit.com/api/v1/access_token",
      scopes: ["submit", "read"],
    },
    actions: ["submit_post", "search", "get_subreddit"],
    tier: "community",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  bluesky: {
    id: "bluesky",
    piecePackage: "@activepieces/piece-bluesky",
    displayName: "Bluesky",
    description:
      "Create posts, view profiles, and search content on Bluesky.",
    logoUrl: "https://cdn.activepieces.com/pieces/bluesky.png",
    category: "social_media",
    tags: ["social", "microblogging", "decentralized", "at-protocol"],
    authType: "custom_auth",
    customAuthFields: [
      {
        name: "handle",
        displayName: "Handle",
        description: "Your Bluesky handle (e.g. user.bsky.social)",
        type: "text",
        required: true,
      },
      {
        name: "appPassword",
        displayName: "App Password",
        description: "Generate an App Password in Bluesky Settings > App Passwords",
        type: "secret",
        required: true,
      },
    ],
    actions: ["create_post", "get_profile", "search"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  pinterest: {
    id: "pinterest",
    piecePackage: "@activepieces/piece-pinterest",
    displayName: "Pinterest",
    description:
      "Create pins, manage boards, and browse your Pinterest content.",
    logoUrl: "https://cdn.activepieces.com/pieces/pinterest.png",
    category: "social_media",
    tags: ["social", "visual", "pins", "boards", "inspiration"],
    authType: "oauth2",
    actions: ["createPin", "list_boards", "list_pins"],
    tier: "community",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  youtube: {
    id: "youtube",
    piecePackage: "@activepieces/piece-youtube",
    displayName: "YouTube",
    description:
      "List videos, search content, and manage your YouTube channel.",
    logoUrl: "https://cdn.activepieces.com/pieces/youtube.png",
    category: "social_media",
    tags: ["video", "social", "google", "streaming", "content"],
    authType: "oauth2",
    oauth2Config: {
      ...GOOGLE_OAUTH_BASE,
      scopes: ["https://www.googleapis.com/auth/youtube"],
    },
    actions: ["list_videos", "search", "get_channel"],
    tier: "built_in",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  mastodon: {
    id: "mastodon",
    piecePackage: "@activepieces/piece-mastodon",
    displayName: "Mastodon",
    description:
      "Create statuses and search content on Mastodon instances.",
    logoUrl: "https://cdn.activepieces.com/pieces/mastodon.png",
    category: "social_media",
    tags: ["social", "fediverse", "microblogging", "open-source", "decentralized"],
    authType: "secret_text",
    actions: ["post_status", "search"],
    tier: "community",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
  },

  twitch: {
    id: "twitch",
    piecePackage: "@activepieces/piece-twitch",
    displayName: "Twitch",
    description:
      "Get channel info, list streams, and manage your Twitch presence.",
    logoUrl: "https://cdn.activepieces.com/pieces/twitch.png",
    category: "social_media",
    tags: ["streaming", "gaming", "live", "chat"],
    authType: "oauth2",
    actions: ["get_channel", "list_streams", "search_channels"],
    tier: "community",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },

  spotify: {
    id: "spotify",
    piecePackage: "@activepieces/piece-spotify",
    displayName: "Spotify",
    description:
      "Search tracks, manage playlists, and browse your Spotify library.",
    logoUrl: "https://cdn.activepieces.com/pieces/spotify.png",
    category: "social_media",
    tags: ["music", "audio", "playlists", "streaming"],
    authType: "oauth2",
    actions: ["search_tracks", "list_playlists", "get_profile"],
    tier: "community",
    requiresOAuthApp: true,
    supportsUserProvidedCredentials: true,
  },
};
