// Per-provider setup guides — surfaced inside the IntegrationConfigForm
// when an admin opens Configure on one of these integrations. Entries here
// are best-effort guidance; if a provider is not listed, the form falls back
// to a generic "Get credentials from the provider console" blurb.
//
// Keep entries concise: the goal is to get admins from "I don't know where to
// click" to "credentials pasted" in under a minute. Long-form docs belong on
// the website, not in the form.

import type { SetupGuide } from "./integration-config-form";

export const PROVIDER_SETUP_GUIDES: Record<string, SetupGuide> = {
  // ─── Communication ──────────────────────────────────────
  slack: {
    consoleUrl: "https://api.slack.com/apps",
    steps: [
      "Create a new Slack app (From scratch)",
      "Under 'OAuth & Permissions', add the required scopes below",
      "Add the redirect URI shown above and Install to Workspace",
      "Copy the Client ID and Client Secret from 'Basic Information'",
    ],
    requiredScopes: ["chat:write", "channels:read", "channels:manage", "users:read", "reactions:write"],
  },

  // ─── Productivity ───────────────────────────────────────
  notion: {
    consoleUrl: "https://www.notion.so/my-integrations",
    steps: [
      "Create a new 'Public' integration",
      "Set the redirect URI shown above",
      "Copy the OAuth Client ID and Client Secret from the integration page",
      "Workspaces will be granted access by the end user during the OAuth flow",
    ],
  },
  google_sheets: {
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "In Google Cloud Console, create OAuth 2.0 Client ID credentials (type: Web application)",
      "Add the redirect URI shown above under 'Authorized redirect URIs'",
      "Enable the Google Sheets API for your project",
      "Copy the generated Client ID and Client Secret",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  },
  google_calendar: {
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "Create OAuth 2.0 Client ID credentials in Google Cloud Console",
      "Add the redirect URI under 'Authorized redirect URIs'",
      "Enable the Google Calendar API",
      "Copy Client ID and Client Secret",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/calendar"],
  },
  gmail: {
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "Create OAuth 2.0 Client ID credentials in Google Cloud Console",
      "Add the redirect URI under 'Authorized redirect URIs'",
      "Enable the Gmail API",
      "Copy Client ID and Client Secret",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify"],
  },

  // ─── Developer Tools ────────────────────────────────────
  github: {
    consoleUrl: "https://github.com/settings/developers",
    steps: [
      "Create a new OAuth App at GitHub Developer Settings",
      "Set the Authorization callback URL to the redirect URI shown above",
      "Generate a Client Secret and copy both Client ID and Secret",
    ],
    requiredScopes: ["repo", "read:user"],
  },
  linear: {
    consoleUrl: "https://linear.app/settings/api/applications",
    steps: [
      "Create a new OAuth application in Linear",
      "Set the callback URL to the redirect URI shown above",
      "Copy the Client ID and Client Secret",
    ],
    requiredScopes: ["read", "write"],
  },
  sentry: {
    consoleUrl: "https://sentry.io/settings/account/api/applications/",
    steps: [
      "Create a new API Application in Sentry",
      "Add the redirect URI to 'Redirect URIs'",
      "Copy Client ID and Client Secret",
    ],
  },

  // ─── AI / ML ────────────────────────────────────────────
  openai: {
    consoleUrl: "https://platform.openai.com/api-keys",
    steps: [
      "Sign in to OpenAI Platform",
      "Create a new API key (give it a descriptive name)",
      "Copy the key now — you won't be able to see it again",
      "Paste it below",
    ],
  },
  anthropic: {
    consoleUrl: "https://console.anthropic.com/settings/keys",
    steps: [
      "Sign in to the Anthropic Console",
      "Create a new API key",
      "Copy the key and paste it below",
    ],
  },

  // ─── Finance / Payments ─────────────────────────────────
  stripe: {
    consoleUrl: "https://dashboard.stripe.com/apikeys",
    steps: [
      "In Stripe Dashboard, go to Developers → API keys",
      "Use the Restricted key flow for least-privilege access",
      "Reveal and copy the Secret key (sk_live_… or sk_test_…)",
      "Paste it below",
    ],
  },

  // ─── Marketing / CRM ────────────────────────────────────
  mailchimp: {
    consoleUrl: "https://us1.admin.mailchimp.com/account/api/",
    steps: [
      "In Mailchimp account settings, navigate to API keys",
      "Create a new API key",
      "Copy the key — it includes the datacenter suffix (e.g. abcd-us1)",
      "Paste it below",
    ],
  },
  hubspot: {
    consoleUrl: "https://app.hubspot.com/developer/",
    steps: [
      "Create a HubSpot developer app",
      "Configure OAuth: add the redirect URI shown above",
      "Copy the Client ID and Client Secret from the app's Auth tab",
    ],
  },
  intercom: {
    consoleUrl: "https://app.intercom.com/a/apps/_/developer-hub/apps",
    steps: [
      "Create a new app in the Intercom Developer Hub",
      "Set the redirect URL to the URI shown above",
      "Copy Client ID and Client Secret",
    ],
  },

  // ─── Scheduling ─────────────────────────────────────────
  calendly: {
    consoleUrl: "https://calendly.com/integrations/api_webhooks",
    steps: [
      "In Calendly, create a Personal Access Token (or OAuth app for multi-user)",
      "Copy the token and paste it below",
    ],
  },

  // ─── Communications ─────────────────────────────────────
  twilio: {
    consoleUrl: "https://console.twilio.com/",
    steps: [
      "From the Twilio Console dashboard, copy the Account SID and Auth Token",
      "Paste them into the corresponding fields below",
    ],
  },
};
