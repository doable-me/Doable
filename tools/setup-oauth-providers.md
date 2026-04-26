# Setting Up OAuth Providers for Doable Integrations

Doable supports 542 integrations. Most work out of the box with user-provided API keys. This guide covers the ~30 that need OAuth apps configured by the platform admin.

---

## What Works Immediately (No Setup Needed)

**~426 integrations** use API keys, tokens, or custom auth fields. Users simply paste their credentials in the connection dialog. Examples: Stripe, Airtable, ClickUp, OpenAI, Discord, Telegram, Shopify, Zendesk, Todoist, SendGrid, etc.

No admin action required for these.

---

## How OAuth Credential Resolution Works

When a user connects an OAuth integration, the API resolves credentials in this order:

1. **Database** -- admin-registered OAuth apps (via `oauth_apps` table, per-workspace or global)
2. **Per-integration env var** -- `OAUTH_{INTEGRATION_ID}_CLIENT_ID` / `_CLIENT_SECRET`
3. **Shared provider fallback** -- `GOOGLE_INTEGRATIONS_CLIENT_ID` for all Google services (separate from login), `GITHUB_CLIENT_ID` for GitHub
4. **Login fallback** -- `GOOGLE_CLIENT_ID` (NOT recommended — mixes login and integration consent screens)
5. If none found, the user sees an error with setup instructions.

**IMPORTANT:** Keep login OAuth (`GOOGLE_CLIENT_ID`) and integration OAuth (`GOOGLE_INTEGRATIONS_CLIENT_ID`) as separate OAuth clients in Google Cloud Console. Login should only request `openid email profile`. Integration OAuth requests service-specific scopes (gmail, drive, etc.) and persists tokens with refresh capability.

The redirect URI for ALL OAuth integrations is:

```
{API_URL}/integrations/oauth/callback
```

For local development: `http://localhost:4000/integrations/oauth/callback`
For production: `https://api.doable.me/integrations/oauth/callback`

Override with `INTEGRATIONS_OAUTH_REDIRECT_URI` env var if using a different public URL.

> **Tip:** Use `localhost` not `127.0.0.1` for local dev redirect URIs — Google treats them differently and `localhost` propagates faster in their systems.

---

## 1. Google Services (1 OAuth App Covers ~10 Integrations)

One Google OAuth app handles: **Gmail, Google Sheets, Google Docs, Google Calendar, Google Drive, Google Contacts, Google Forms, Google Tasks, Google Chat, Google Cloud Storage, YouTube**.

### Step-by-Step

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services > OAuth consent screen**
   - Choose **External** user type
   - Fill in app name: `Doable`
   - Add your support email and developer email
   - Click **Save and Continue**
4. On the **Scopes** page, click **Add or Remove Scopes** and add ALL of these:
   ```
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.compose
   https://www.googleapis.com/auth/spreadsheets
   https://www.googleapis.com/auth/documents
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/drive
   https://www.googleapis.com/auth/contacts
   https://www.googleapis.com/auth/forms.body.readonly
   https://www.googleapis.com/auth/tasks
   https://www.googleapis.com/auth/chat.messages
   https://www.googleapis.com/auth/devstorage.full_control
   https://www.googleapis.com/auth/youtube
   ```
5. Click **Save and Continue**
6. On the **Test users** page (while app is in testing mode), add the email addresses of anyone who needs to connect Google integrations
7. Navigate to **APIs & Services > Credentials**
8. Click **Create Credentials > OAuth client ID**
   - Application type: **Web application**
   - Name: `Doable Integrations`
   - Under **Authorized redirect URIs**, add:
     - `http://localhost:4000/integrations/oauth/callback` (local dev)
     - `https://api.doable.me/integrations/oauth/callback` (production)
9. Copy the **Client ID** and **Client Secret**

### Enable Required APIs

In the Google Cloud Console, go to **APIs & Services > Library** and enable:
- Gmail API
- Google Sheets API
- Google Docs API
- Google Calendar API
- Google Drive API
- People API (for Google Contacts)
- Google Forms API
- Google Tasks API
- Google Chat API
- Cloud Storage API (JSON)
- YouTube Data API v3

### Environment Variables

```env
# Separate from GOOGLE_CLIENT_ID (which is for "Sign in with Google" login only)
GOOGLE_INTEGRATIONS_CLIENT_ID=your-integrations-client-id.apps.googleusercontent.com
GOOGLE_INTEGRATIONS_CLIENT_SECRET=GOCSPX-your-integrations-secret

# Override redirect URI if API is behind a tunnel/proxy
INTEGRATIONS_OAUTH_REDIRECT_URI=http://localhost:4000/integrations/oauth/callback
```

### Publishing the App

While in **Testing** mode, only users listed as test users can authorize. To allow any Google user:
1. Go to OAuth consent screen
2. Click **Publish App**
3. If Google scopes are sensitive, you may need to submit for verification

---

## 2. Microsoft Services (1 OAuth App Covers ~3 Integrations)

One Azure AD app handles: **Microsoft Teams, Microsoft Outlook, Microsoft OneDrive** (and future Microsoft integrations).

### Step-by-Step

1. Go to [Azure Portal - App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
   - Name: `Doable Integrations`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: **Web** platform, add `http://127.0.0.1:4000/integrations/oauth/callback`
3. After creation, note the **Application (client) ID**
4. Go to **Certificates & secrets > New client secret**
   - Description: `Doable`
   - Expiry: choose duration (recommended: 24 months)
   - Copy the **Value** (this is the client secret -- it only shows once)
5. Go to **API permissions > Add a permission > Microsoft Graph**
   - Delegated permissions, add:
     - `Chat.ReadWrite`
     - `ChannelMessage.Send`
     - `User.Read`
     - `Mail.Send`
     - `Mail.Read`
6. Click **Grant admin consent** if you are a tenant admin (otherwise each user consents individually)
7. Add the production redirect URI:
   - Go to **Authentication > Add a platform > Web**
   - Add `https://api.doable.me/integrations/oauth/callback`

### Environment Variables

Since there is no shared Microsoft fallback in the codebase yet, set per-integration env vars:

```env
OAUTH_MICROSOFT_TEAMS_CLIENT_ID=your-azure-app-id
OAUTH_MICROSOFT_TEAMS_CLIENT_SECRET=your-secret
OAUTH_MICROSOFT_OUTLOOK_CLIENT_ID=your-azure-app-id
OAUTH_MICROSOFT_OUTLOOK_CLIENT_SECRET=your-secret
```

(Both point to the same Azure app -- the env vars just need to be set for each integration ID.)

---

## 3. GitHub (Already Configured for Git Sync)

If Doable already has a GitHub OAuth app for git sync, you just need to ensure the redirect URI includes the integrations callback.

### Step-by-Step

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Open your existing OAuth App (or create new one)
3. Ensure **Authorization callback URL** includes: `http://127.0.0.1:4000/integrations/oauth/callback`
4. Note: GitHub only allows one callback URL per OAuth app. If the git sync uses a different callback, you may need a separate OAuth app for integrations.

### Environment Variables

```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

---

## 4. Individual OAuth Apps

Each of these requires its own OAuth app created in the provider's developer portal.

### Slack

- **Portal:** [https://api.slack.com/apps](https://api.slack.com/apps)
- Click **Create New App > From scratch**
- App Name: `Doable`, select your workspace
- Go to **OAuth & Permissions**
  - Add redirect URL: `http://127.0.0.1:4000/integrations/oauth/callback`
  - Under **Scopes > Bot Token Scopes**, add: `chat:write`, `channels:read`, `channels:manage`, `users:read`, `reactions:write`
- Go to **Manage Distribution** if you want users from other workspaces to install

```env
OAUTH_SLACK_CLIENT_ID=your-slack-client-id
OAUTH_SLACK_CLIENT_SECRET=your-slack-client-secret
```

### Notion

- **Portal:** [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
- Click **New integration**
- Type: **Public** (for OAuth) -- internal integrations use API keys
- Fill in name, logo, redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Copy the OAuth client ID and client secret from the Secrets tab

```env
OAUTH_NOTION_CLIENT_ID=your-notion-oauth-client-id
OAUTH_NOTION_CLIENT_SECRET=your-notion-oauth-client-secret
```

### HubSpot

- **Portal:** [https://developers.hubspot.com/](https://developers.hubspot.com/)
- Create a developer account, then create an app
- Go to **Auth** tab
  - Add redirect URL: `http://127.0.0.1:4000/integrations/oauth/callback`
  - Scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`

```env
OAUTH_HUBSPOT_CLIENT_ID=your-hubspot-client-id
OAUTH_HUBSPOT_CLIENT_SECRET=your-hubspot-client-secret
```

### Salesforce

- **Portal:** [https://developer.salesforce.com/](https://developer.salesforce.com/)
- Setup > Apps > App Manager > New Connected App
- Enable OAuth Settings
  - Callback URL: `http://127.0.0.1:4000/integrations/oauth/callback`
  - Scopes: `api`, `refresh_token`

```env
OAUTH_SALESFORCE_CLIENT_ID=your-consumer-key
OAUTH_SALESFORCE_CLIENT_SECRET=your-consumer-secret
```

### Pipedrive

- **Portal:** [https://developers.pipedrive.com/](https://developers.pipedrive.com/)
- Create an app in the Marketplace Manager
- Set callback URL: `http://127.0.0.1:4000/integrations/oauth/callback`

```env
OAUTH_PIPEDRIVE_CLIENT_ID=your-pipedrive-client-id
OAUTH_PIPEDRIVE_CLIENT_SECRET=your-pipedrive-client-secret
```

### Zoho CRM

- **Portal:** [https://api-console.zoho.com/](https://api-console.zoho.com/)
- Create a Server-based Application
- Authorized Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Scope: `ZohoCRM.modules.ALL`

```env
OAUTH_ZOHO_CRM_CLIENT_ID=your-zoho-client-id
OAUTH_ZOHO_CRM_CLIENT_SECRET=your-zoho-client-secret
```

### Mailchimp

- **Portal:** [https://admin.mailchimp.com/account/oauth2/](https://admin.mailchimp.com/account/oauth2/)
- Register a new app
- Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`

```env
OAUTH_MAILCHIMP_CLIENT_ID=your-mailchimp-client-id
OAUTH_MAILCHIMP_CLIENT_SECRET=your-mailchimp-client-secret
```

### Linear

- **Portal:** [https://linear.app/settings/api](https://linear.app/settings/api)
- Create an OAuth application
- Callback URL: `http://127.0.0.1:4000/integrations/oauth/callback`
- Scopes: `read`, `write`

```env
OAUTH_LINEAR_CLIENT_ID=your-linear-client-id
OAUTH_LINEAR_CLIENT_SECRET=your-linear-client-secret
```

### Atlassian (Jira Cloud + Confluence)

One Atlassian OAuth app covers both Jira and Confluence.

- **Portal:** [https://developer.atlassian.com/console/myapps/](https://developer.atlassian.com/console/myapps/)
- Create a new OAuth 2.0 app
- Authorization > Add callback URL: `http://127.0.0.1:4000/integrations/oauth/callback`
- Permissions: enable Jira (`read:jira-work`, `write:jira-work`) and Confluence (`read:confluence-content.all`, `write:confluence-content`)

```env
OAUTH_JIRA_CLOUD_CLIENT_ID=your-atlassian-client-id
OAUTH_JIRA_CLOUD_CLIENT_SECRET=your-atlassian-client-secret
OAUTH_CONFLUENCE_CLIENT_ID=your-atlassian-client-id
OAUTH_CONFLUENCE_CLIENT_SECRET=your-atlassian-client-secret
```

### Asana

- **Portal:** [https://app.asana.com/0/developer-console](https://app.asana.com/0/developer-console)
- Create a new app
- Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Default scope: `default`

```env
OAUTH_ASANA_CLIENT_ID=your-asana-client-id
OAUTH_ASANA_CLIENT_SECRET=your-asana-client-secret
```

### Dropbox

- **Portal:** [https://www.dropbox.com/developers/apps](https://www.dropbox.com/developers/apps)
- Create an app > Scoped access > Full Dropbox
- OAuth2 redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`

```env
OAUTH_DROPBOX_CLIENT_ID=your-dropbox-app-key
OAUTH_DROPBOX_CLIENT_SECRET=your-dropbox-app-secret
```

### Box

- **Portal:** [https://app.box.com/developers/console](https://app.box.com/developers/console)
- Create a new Custom App > OAuth 2.0
- Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`

```env
OAUTH_BOX_CLIENT_ID=your-box-client-id
OAUTH_BOX_CLIENT_SECRET=your-box-client-secret
```

### X (Twitter)

- **Portal:** [https://developer.twitter.com/en/portal/dashboard](https://developer.twitter.com/en/portal/dashboard)
- Create a project and app
- Set up OAuth 2.0 with PKCE
  - Callback URL: `http://127.0.0.1:4000/integrations/oauth/callback`
  - Type: Web App
  - Scopes: `tweet.read`, `tweet.write`, `users.read`

```env
OAUTH_TWITTER_CLIENT_ID=your-twitter-client-id
OAUTH_TWITTER_CLIENT_SECRET=your-twitter-client-secret
```

### LinkedIn

- **Portal:** [https://www.linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
- Create an app
- Under **Auth** tab, add redirect URL: `http://127.0.0.1:4000/integrations/oauth/callback`
- Request access to `w_member_social` and `r_liteprofile` products

```env
OAUTH_LINKEDIN_CLIENT_ID=your-linkedin-client-id
OAUTH_LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
```

### Instagram Business

- **Portal:** [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/)
- Create a Business app, add Instagram Basic Display product
- Valid OAuth Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Scopes: `instagram_basic`, `instagram_content_publish`

```env
OAUTH_INSTAGRAM_BUSINESS_CLIENT_ID=your-instagram-app-id
OAUTH_INSTAGRAM_BUSINESS_CLIENT_SECRET=your-instagram-app-secret
```

### Facebook Pages

- **Portal:** [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/)
- Same Meta app as Instagram (or separate)
- Valid OAuth Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Permissions: `pages_manage_posts`, `pages_read_engagement`

```env
OAUTH_FACEBOOK_PAGES_CLIENT_ID=your-facebook-app-id
OAUTH_FACEBOOK_PAGES_CLIENT_SECRET=your-facebook-app-secret
```

### Intercom

- **Portal:** [https://developers.intercom.com/](https://developers.intercom.com/)
- Create an app
- Redirect URL: `http://127.0.0.1:4000/integrations/oauth/callback`

```env
OAUTH_INTERCOM_CLIENT_ID=your-intercom-client-id
OAUTH_INTERCOM_CLIENT_SECRET=your-intercom-client-secret
```

### GitLab

- **Portal:** [https://gitlab.com/-/user_settings/applications](https://gitlab.com/-/user_settings/applications) (or group/admin settings)
- Create a new application
- Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Scopes: `api`

```env
OAUTH_GITLAB_CLIENT_ID=your-gitlab-application-id
OAUTH_GITLAB_CLIENT_SECRET=your-gitlab-secret
```

### DocuSign

- **Portal:** [https://admindemo.docusign.com/apps-and-keys](https://admindemo.docusign.com/apps-and-keys) (sandbox) or [admin.docusign.com](https://admin.docusign.com) (production)
- Create a new app
- Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Scopes: `signature`

```env
OAUTH_DOCUSIGN_CLIENT_ID=your-integration-key
OAUTH_DOCUSIGN_CLIENT_SECRET=your-secret-key
```

### QuickBooks

- **Portal:** [https://developer.intuit.com/app/developer/dashboard](https://developer.intuit.com/app/developer/dashboard)
- Create an app > QuickBooks Online and Payments
- Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Scopes: `com.intuit.quickbooks.accounting`

```env
OAUTH_QUICKBOOKS_CLIENT_ID=your-quickbooks-client-id
OAUTH_QUICKBOOKS_CLIENT_SECRET=your-quickbooks-client-secret
```

### Xero

- **Portal:** [https://developer.xero.com/app/manage](https://developer.xero.com/app/manage)
- Create a Web app
- Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Scopes: `openid`, `accounting.transactions`

```env
OAUTH_XERO_CLIENT_ID=your-xero-client-id
OAUTH_XERO_CLIENT_SECRET=your-xero-client-secret
```

### Zoom

- **Portal:** [https://marketplace.zoom.us/develop/create](https://marketplace.zoom.us/develop/create)
- Create a General App (OAuth)
- Redirect URL: `http://127.0.0.1:4000/integrations/oauth/callback`

```env
OAUTH_ZOOM_CLIENT_ID=your-zoom-client-id
OAUTH_ZOOM_CLIENT_SECRET=your-zoom-client-secret
```

### Reddit

- **Portal:** [https://www.reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
- Create a web app
- Redirect URI: `http://127.0.0.1:4000/integrations/oauth/callback`
- Scopes: `submit`, `read`

```env
OAUTH_REDDIT_CLIENT_ID=your-reddit-client-id
OAUTH_REDDIT_CLIENT_SECRET=your-reddit-client-secret
```

### Remaining OAuth Integrations

These follow the same pattern. Set env vars and register the redirect URI in the provider's portal:

| Integration | Portal | Env Prefix |
|-------------|--------|------------|
| Constant Contact | [developer.constantcontact.com](https://developer.constantcontact.com/) | `OAUTH_CONSTANT_CONTACT_` |
| Pinterest | [developers.pinterest.com](https://developers.pinterest.com/) | `OAUTH_PINTEREST_` |
| TikTok | [developers.tiktok.com](https://developers.tiktok.com/) | `OAUTH_TIKTOK_` |
| Twitch | [dev.twitch.tv/console](https://dev.twitch.tv/console) | `OAUTH_TWITCH_` |
| Spotify | [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) | `OAUTH_SPOTIFY_` |

---

## 5. Environment Variable Format

The env var naming convention is:

```
OAUTH_{INTEGRATION_ID}_CLIENT_ID=xxx
OAUTH_{INTEGRATION_ID}_CLIENT_SECRET=xxx
```

Where `INTEGRATION_ID` is the integration's `id` field uppercased with hyphens replaced by underscores.

Exceptions (shared provider shortcuts):
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` -- covers all Google integrations
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` -- covers GitHub

To generate a complete `.env.integrations.example` template:

```bash
npx tsx tools/generate-env-template.ts
```

---

## 6. Quick Priority Checklist

If you want to get the most popular integrations working first:

1. **Google** (1 app, ~10 integrations) -- Gmail, Sheets, Calendar, Drive
2. **Slack** (1 app) -- most requested chat integration
3. **Notion** (1 app) -- popular knowledge base
4. **GitHub** (already have it)
5. **HubSpot** / **Salesforce** -- CRM power users
6. **Zoom** -- meeting scheduling
7. **Linear** / **Jira** -- engineering teams
8. Everything else as users request
