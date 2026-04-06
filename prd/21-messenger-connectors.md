# 21 — Messenger Connectors: WhatsApp & Telegram for Remote AI Chat

## Executive Summary

Add modular WhatsApp and Telegram connectors to Doable, enabling users to collaborate with their project's AI copilot from any messaging app. A user links their WhatsApp or Telegram account to a Doable project, and from that point forward, messages sent to the bot in that messenger are routed to the project's AI chat — and AI responses are sent back through the messenger. All connectors live under the existing integrations system for a clean UX, but are architecturally distinct: they maintain **persistent connections** (WebSocket for WhatsApp, long polling for Telegram) and handle **bidirectional message routing** — unlike the existing action-based integrations which are fire-and-forget tool calls.

### Why Messenger Connectors

| Scenario | Without Connectors | With Connectors |
|----------|-------------------|-----------------|
| Quick AI question from phone | Open browser → navigate to project → wait for editor load → type | Open WhatsApp → type → get answer |
| CEO reviewing progress | Must log into Doable | Ask in Telegram "what's the status of the landing page?" |
| Team collaboration | Everyone must be in Doable | Designers can interact via their preferred messenger |
| On-the-go iteration | Laptop required | Voice message → transcribed → AI processes → replies in chat |

### Design Principles

1. **Modular** — Each channel is a self-contained module implementing a shared interface. Adding Signal, Discord, or Matrix later = adding one module.
2. **Within Integrations** — Connectors appear in the integration catalog under "Messenger Channels" category. Connect/disconnect UX matches existing integrations.
3. **No New Services** — Runs within the API process. At ~100 user scale, WhatsApp WebSocket connections and Telegram polling are lightweight.
4. **OpenClaw-Inspired** — Borrows the normalized message format, session routing, pairing protocol, and channel lifecycle patterns from OpenClaw's battle-tested architecture.
5. **Open Source Only** — Baileys (MIT) for WhatsApp, grammy (MIT) for Telegram. No Meta Business API costs or business verification required.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              DOABLE API                                  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    MESSENGER CHANNEL SYSTEM (new)                   │ │
│  │                                                                     │ │
│  │  ┌─────────────────┐   ┌─────────────────┐   ┌────────────────┐  │ │
│  │  │ Channel Manager  │   │ Message Router   │   │ Pairing Engine │  │ │
│  │  │ (lifecycle,      │   │ (normalize →     │   │ (code gen,     │  │ │
│  │  │  reconnect,      │   │  route → AI →    │   │  verify,       │  │ │
│  │  │  health monitor) │   │  reply)          │   │  link project) │  │ │
│  │  └────────┬────────┘   └────────┬────────┘   └───────┬────────┘  │ │
│  │           │                     │                     │            │ │
│  │  ┌────────▼─────────────────────▼─────────────────────▼────────┐  │ │
│  │  │              Channel Connector Interface                     │  │ │
│  │  │  connect() | disconnect() | sendMessage() | on('message')   │  │ │
│  │  └────────┬──────────────────────────────┬────────────────────┘  │ │
│  │           │                              │                        │ │
│  │  ┌────────▼────────┐           ┌────────▼────────┐               │ │
│  │  │ WhatsApp Channel │           │ Telegram Channel │              │ │
│  │  │ (@whiskeysockets │           │ (grammy)         │              │ │
│  │  │  /baileys)       │           │                  │              │ │
│  │  │                  │           │ • Bot token auth │              │ │
│  │  │ • QR code auth   │           │ • Long polling   │              │ │
│  │  │ • WebSocket conn │           │ • Webhook (opt)  │              │ │
│  │  │ • Multi-file     │           │ • Sequentialized │              │ │
│  │  │   auth state     │           │   per-chat       │              │ │
│  │  └─────────────────┘           └──────────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────┐   ┌──────────────────────────────────┐ │
│  │ EXISTING: Integration       │   │ EXISTING: AI Chat System          │ │
│  │ Engine (credential vault,   │   │ (Copilot SDK, SSE streaming,     │ │
│  │ registry, tool bridge)      │   │ tool execution, message persist) │ │
│  └────────────────────────────┘   └──────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ EXISTING: WebSocket Server (Yjs, presence, chat broadcast)         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

External:
  WhatsApp (via Baileys WS)  ←→  WhatsApp Channel Connector
  Telegram (via Bot API)     ←→  Telegram Channel Connector
```

### How It Relates to Existing Systems

| System | Relationship |
|--------|-------------|
| **Integration Registry** | Connectors registered as integrations with `category: "messenger_channels"` and `authType: "custom_auth"` |
| **Credential Vault** | Stores encrypted auth state (Baileys creds, Telegram bot tokens) |
| **Integration Catalog UI** | Connect/disconnect UX for channels (QR code flow, bot token entry) |
| **AI Chat (`/routes/chat.ts`)** | Message router calls the same `handleChatMessage()` pipeline, injecting messenger messages as user prompts |
| **WebSocket Server** | AI responses broadcast to both Doable web clients AND routed back to messenger |
| **Tool Bridge** | NOT used — connectors are bidirectional channels, not fire-and-forget tools |

---

## 3. Data Model

### 3.1 New Tables

```sql
-- ============================================================
-- Migration: 038_messenger_channels.sql
-- ============================================================

-- A connected messenger account (one per WhatsApp number / Telegram bot)
CREATE TABLE messenger_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'telegram')),
  account_id TEXT NOT NULL,              -- WhatsApp: phone JID, Telegram: bot user ID
  display_name TEXT,                     -- "My WhatsApp" or bot username
  
  -- Encrypted channel-specific config
  -- WhatsApp: Baileys auth state (creds.json + app-state-sync keys)
  -- Telegram: { botToken: "123:ABC..." }
  config_encrypted BYTEA NOT NULL,       -- pgp_sym_encrypt
  
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'pairing', 'error', 'banned')),
  status_message TEXT,                   -- Human-readable status detail
  
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(workspace_id, channel_type, account_id)
);

-- Maps an external conversation to a Doable project
CREATE TABLE messenger_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES messenger_channels(id) ON DELETE CASCADE,
  
  external_conversation_id TEXT NOT NULL, -- WhatsApp: chat JID, Telegram: chat_id
  chat_type TEXT NOT NULL DEFAULT 'direct'
    CHECK (chat_type IN ('direct', 'group')),
  
  -- Link to Doable project (NULL = unlinked, awaiting pairing)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Pairing
  pairing_code TEXT,                     -- 8-char alphanumeric code
  pairing_expires_at TIMESTAMPTZ,
  
  -- External metadata
  contact_name TEXT,                     -- Sender display name
  contact_phone TEXT,                    -- E.164 for WhatsApp
  contact_username TEXT,                 -- @username for Telegram
  group_subject TEXT,                    -- Group name if chat_type = 'group'
  
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(channel_id, external_conversation_id)
);

-- Message log for context window & debugging (ring buffer per conversation)
CREATE TABLE messenger_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES messenger_conversations(id) ON DELETE CASCADE,
  
  external_message_id TEXT,              -- For deduplication
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  
  body TEXT,
  media_urls TEXT[],                     -- Stored locally after download
  media_types TEXT[],                    -- MIME types
  
  -- Links to Doable AI message (for outbound AI replies)
  ai_message_id UUID,
  
  metadata JSONB DEFAULT '{}',           -- reply_to, reactions, forwarded, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_mc_workspace ON messenger_channels(workspace_id, status);
CREATE INDEX idx_mc_user ON messenger_channels(user_id);
CREATE INDEX idx_mconv_channel ON messenger_conversations(channel_id, status);
CREATE INDEX idx_mconv_project ON messenger_conversations(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_mconv_pairing ON messenger_conversations(pairing_code) WHERE pairing_code IS NOT NULL;
CREATE INDEX idx_mmsg_conversation ON messenger_messages(conversation_id, created_at DESC);
CREATE UNIQUE INDEX idx_mmsg_dedup ON messenger_messages(conversation_id, external_message_id) 
  WHERE external_message_id IS NOT NULL;

-- Auto-update updated_at
CREATE TRIGGER messenger_channels_updated_at
  BEFORE UPDATE ON messenger_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Retention: keep last 500 messages per conversation (cron job or on-insert trigger)
```

### 3.2 Why Separate Tables (Not Reusing `integration_connections`)

| Concern | `integration_connections` | `messenger_channels` |
|---------|--------------------------|---------------------|
| Lifecycle | Stateless (store creds, use when needed) | Stateful (persistent connection, health monitoring) |
| Session Mapping | N/A | Maps external conversations → projects |
| Message History | N/A | Stores inbound/outbound for AI context |
| Pairing | N/A | Challenge-response linking flow |
| Status | connected/revoked | connected/disconnected/pairing/error/banned |

However, messenger channels **still register in the integration catalog** via the registry — they just use custom connect/disconnect flows and store state in their own tables.

---

## 4. Channel Connector Interface

### 4.1 Core Interface

```typescript
// services/api/src/messenger-channels/types.ts

export interface NormalizedMessage {
  id: string;                            // Internal UUID
  externalId: string;                    // Provider's message ID
  channelType: 'whatsapp' | 'telegram';
  channelId: string;                     // messenger_channels.id
  
  conversationId: string;                // External conversation identifier
  chatType: 'direct' | 'group';
  
  body: string;                          // Plain text content
  
  sender: {
    id: string;                          // External sender ID
    name?: string;                       // Display name
    username?: string;                   // @username (Telegram)
    phone?: string;                      // E.164 (WhatsApp)
  };
  
  media?: Array<{
    url: string;                         // Local URL after download
    mimeType: string;
    filename?: string;
    size?: number;
  }>;
  
  replyTo?: {
    externalId: string;
    body?: string;
    senderName?: string;
  };
  
  group?: {
    id: string;
    subject?: string;
  };
  
  timestamp: Date;
  raw: unknown;                          // Original provider payload
}

export interface SendOptions {
  replyToExternalId?: string;            // Quote a specific message
  markdown?: boolean;                    // Format as markdown (Telegram)
  buttons?: Array<{                      // Inline buttons (Telegram)
    text: string;
    callbackData: string;
  }>;
}

export type ChannelStatus = 
  | { state: 'connected'; since: Date }
  | { state: 'disconnected'; reason?: string }
  | { state: 'pairing'; data: PairingData }
  | { state: 'error'; message: string; retryAt?: Date }
  | { state: 'banned'; message: string };

export interface PairingData {
  type: 'qr_code';                       // WhatsApp
  qrDataUrl: string;                     // base64 QR image
  expiresAt: Date;
} | {
  type: 'bot_token';                     // Telegram
  instructions: string;
};

export interface ChannelConnector {
  readonly channelType: string;
  readonly channelId: string;            // messenger_channels.id
  
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ChannelStatus;
  
  // Pairing (WhatsApp only — Telegram validates on connect)
  startPairing(): Promise<PairingData>;
  
  // Outbound
  sendMessage(conversationId: string, text: string, opts?: SendOptions): Promise<string>;
  sendTypingIndicator(conversationId: string): Promise<void>;
  
  // Events
  on(event: 'message', handler: (msg: NormalizedMessage) => void): void;
  on(event: 'status', handler: (status: ChannelStatus) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  
  off(event: string, handler: Function): void;
  
  // Cleanup
  destroy(): Promise<void>;
}
```

### 4.2 Channel Factory

```typescript
// services/api/src/messenger-channels/factory.ts

export function createChannelConnector(
  channelType: string,
  channelId: string,
  config: DecryptedChannelConfig
): ChannelConnector {
  switch (channelType) {
    case 'whatsapp':
      return new WhatsAppConnector(channelId, config);
    case 'telegram':
      return new TelegramConnector(channelId, config);
    default:
      throw new Error(`Unknown channel type: ${channelType}`);
  }
}
```

---

## 5. WhatsApp Connector (Baileys)

### 5.1 Library & Approach

- **Library:** `@whiskeysockets/baileys` (MIT, ~15K stars)
- **Protocol:** WhatsApp Web multi-device (reverse-engineered WebSocket)
- **Auth:** QR code scan from WhatsApp app → "Linked Devices"
- **Persistence:** Multi-file auth state, encrypted and stored in DB

### 5.2 Connection Lifecycle

```
User clicks "Connect WhatsApp" in Integrations panel
  │
  ├─ 1. API creates messenger_channels row (status: 'pairing')
  ├─ 2. Creates Baileys socket with fresh auth state
  ├─ 3. Baileys emits QR code → sent to frontend via SSE
  │
  ▼
Frontend displays QR code in modal (auto-refreshes every 20s)
  │
  ├─ User scans QR in WhatsApp → "Link a device"
  ├─ Baileys receives connection.update → status: 'connected'
  ├─ Auth state (creds + keys) encrypted → stored in messenger_channels.config_encrypted
  │
  ▼
Channel is live
  │
  ├─ Baileys WebSocket stays open
  ├─ messages.upsert events → normalized → routed
  ├─ On disconnect: exponential backoff reconnect (5s → 10s → 30s → 60s → 5min max)
  ├─ On code 401 (logged out): mark as 'disconnected', notify user
  ├─ On code 515 (restart): auto-reconnect with saved state
  │
  ▼
User clicks "Disconnect WhatsApp"
  │
  ├─ Baileys logout (unlinks device)
  ├─ Auth state wiped from DB
  ├─ Channel status → 'disconnected'
  └─ All conversation mappings preserved (can reconnect later)
```

### 5.3 Message Processing Pipeline

```
Baileys messages.upsert event
  │
  ├─ 1. DEDUP — Check external_message_id against messenger_messages (skip if exists)
  ├─ 2. ECHO FILTER — Skip messages sent by our own JID
  ├─ 3. UNWRAP — Handle ephemeral, viewOnce, documentWithCaption wrappers
  ├─ 4. EXTRACT — Get text from conversation/extendedText/image/video/document messages
  ├─ 5. MEDIA — Download media → store locally → get URL
  ├─ 6. NORMALIZE — Build NormalizedMessage with sender info, reply context, group metadata
  ├─ 7. DEBOUNCE — Batch rapid messages from same sender within 2s window
  ├─ 8. ROUTE — Pass to Message Router
  └─ 9. PERSIST — Save to messenger_messages
```

### 5.4 WhatsApp-Specific Features

| Feature | Implementation |
|---------|---------------|
| Read receipts | Send read receipt after AI responds |
| Typing indicator | `sendPresenceUpdate('composing')` while AI is generating |
| Media messages | Download via `downloadMediaMessage()`, store locally, pass URL to AI as attachment |
| Voice messages | Download OGG → transcribe via Whisper (if available) → pass text to AI |
| Group support | Filter by `@mention` of the linked device number |
| Reply threading | Use `quoted` message parameter for AI replies to maintain context |
| Status updates | Ignore (not relevant) |
| Reactions | Map to emoji feedback on AI messages |

### 5.5 Auth State Management

```
Baileys Auth State (multi-file):
├── creds.json — Device credentials (noiseKey, signedIdentityKey, etc.)
├── app-state-sync-key-*.json — Signal Protocol state
├── pre-key-*.json — Pre-keys for E2E encryption
└── session-*.json — Active session data

Storage approach:
  - Serialize entire auth dir as JSON blob
  - Encrypt with pgp_sym_encrypt (same ENCRYPTION_KEY as credential vault)
  - Store in messenger_channels.config_encrypted
  - On connect: decrypt → write to temp dir → pass to Baileys
  - On creds update: re-encrypt → update DB row
  - On disconnect/logout: wipe from DB + temp dir
```

---

## 6. Telegram Connector (grammy)

### 6.1 Library & Approach

- **Library:** `grammy` (MIT, ~2K stars, TypeScript-native)
- **Protocol:** Telegram Bot API (official REST API)
- **Auth:** Bot token from @BotFather
- **Transport:** Long polling (no public URL required)

### 6.2 Connection Lifecycle

```
User clicks "Connect Telegram" in Integrations panel
  │
  ├─ 1. Frontend shows input for Bot Token with instructions:
  │     "1. Open @BotFather in Telegram
  │      2. Send /newbot and follow prompts
  │      3. Copy the token and paste here"
  │
  ├─ 2. API validates token: GET https://api.telegram.org/bot<token>/getMe
  ├─ 3. Creates messenger_channels row (status: 'connected')
  ├─ 4. Encrypts bot token → config_encrypted
  ├─ 5. Starts long polling via grammy runner
  │
  ▼
Bot is live
  │
  ├─ grammy polls getUpdates in background
  ├─ Updates sequentialized per-chat (ordered processing)
  ├─ On polling error: exponential backoff (2s initial, 30s max)
  ├─ Stall watchdog: force restart after 90s of no updates
  │
  ▼
User clicks "Disconnect Telegram"
  │
  ├─ Stop polling
  ├─ Delete webhook if set
  ├─ Channel status → 'disconnected'
  └─ Bot token wiped from DB
```

### 6.3 Telegram-Specific Features

| Feature | Implementation |
|---------|---------------|
| Markdown formatting | AI responses formatted as Telegram MarkdownV2 |
| Inline keyboards | Optional action buttons below AI responses |
| Forum/topic support | Thread-aware: `chat_id + message_thread_id` as conversation key |
| Group mentions | Only respond when bot is `@mentioned` or replied to |
| Commands | `/start` → welcome + pairing, `/link <code>` → pair to project, `/unlink` → remove pairing |
| Media | `getFile()` → download → pass to AI as attachment |
| Stickers | Convert to emoji or description text |
| Voice/video notes | Download OGG → transcribe if possible |
| Edit messages | Update AI responses if user edits their message (re-process) |

---

## 7. Message Router

The message router is the central hub that connects external messages to Doable's AI chat system.

### 7.1 Routing Flow

```typescript
// services/api/src/messenger-channels/router.ts

async function routeInboundMessage(msg: NormalizedMessage): Promise<void> {
  // 1. Find or create conversation record
  const conversation = await findOrCreateConversation(msg);
  
  // 2. Check if conversation is linked to a project
  if (!conversation.project_id) {
    // Not paired yet — initiate or check pairing
    await handleUnpairedMessage(msg, conversation);
    return;
  }
  
  // 3. Load project context
  const project = await getProject(conversation.project_id);
  if (!project) {
    await sendReply(msg, "⚠️ This project no longer exists. Send /link to pair a new project.");
    return;
  }
  
  // 4. Resolve the user who owns this channel
  const channel = await getChannel(msg.channelId);
  
  // 5. Build chat context (same as web chat)
  // Inject recent messenger history as context
  const recentHistory = await getRecentMessages(conversation.id, 20);
  
  // 6. Send typing indicator
  await sendTypingIndicator(msg);
  
  // 7. Call AI chat pipeline (reuse existing chat.ts logic)
  const response = await processAiChat({
    projectId: conversation.project_id,
    userId: channel.user_id,
    workspaceId: channel.workspace_id,
    content: msg.body,
    attachments: msg.media?.map(m => ({ url: m.url, mimeType: m.mimeType })),
    source: 'messenger',              // New field to track origin
    messengerContext: {
      channelType: msg.channelType,
      conversationId: conversation.id,
      senderName: msg.sender.name,
    }
  });
  
  // 8. Send AI response back through messenger
  await sendAiResponse(msg, response);
  
  // 9. Broadcast to Doable web clients (so they see the conversation)
  await broadcastToWebClients(conversation.project_id, {
    type: 'messenger:message',
    channelType: msg.channelType,
    sender: msg.sender.name,
    body: msg.body,
    aiResponse: response.content,
  });
}
```

### 7.2 AI Chat Integration

The key insight: **reuse the existing chat pipeline**. The messenger router calls the same AI engine resolution, context building, tool creation, and Copilot SDK flow as the web chat. The only differences are:

1. **Input**: Message comes from messenger instead of HTTP POST
2. **Output**: Response goes to messenger instead of SSE stream
3. **Context**: System prompt includes "User is chatting via {WhatsApp/Telegram}. Keep responses concise and mobile-friendly."
4. **Streaming**: Collect full response, then send as single message (messengers don't support token-by-token streaming)
5. **Tools**: Same tools available — AI can still edit files, run builds, call integrations
6. **Broadcast**: AI responses also appear in the Doable web chat for collaborators to see

```typescript
// Minimal integration point in existing chat.ts:

// Add to the chat route handler:
export async function processAiChat(params: {
  projectId: string;
  userId: string;
  workspaceId: string;
  content: string;
  attachments?: Attachment[];
  source?: 'web' | 'messenger';
  messengerContext?: MessengerContext;
}): Promise<AiChatResponse> {
  // ... existing logic ...
  // Only difference: if source === 'messenger', collect full response
  // instead of streaming, and add messenger context to system prompt
}
```

---

## 8. Pairing Protocol

Inspired by OpenClaw's challenge-response pairing, adapted for Doable's project-centric model.

### 8.1 Pairing Flow

```
┌──────────────────────┐     ┌──────────────────────┐
│    DOABLE WEB APP    │     │   MESSENGER (WA/TG)  │
└──────────┬───────────┘     └──────────┬───────────┘
           │                            │
           │  1. User clicks "Link      │
           │     Messenger" on project  │
           │     settings               │
           │                            │
           │  2. System generates       │
           │     8-char pairing code    │
           │     (e.g., "AXBK-3N7P")   │
           │                            │
           │  3. Code displayed in UI   │
           │     with instructions      │
           │                            │
           │                            │  4. User opens messenger,
           │                            │     sends code to bot:
           │                            │     "/link AXBK-3N7P"
           │                            │
           │                            │  5. Bot receives message,
           │                            │     looks up code in
           │                            │     messenger_conversations
           │                            │
           │  6. Code matches →         │
           │     Set project_id on      │
           │     conversation record    │
           │                            │
           │  7. UI updates: "Linked!"  │  7. Bot replies: "✓ Linked
           │     Shows active link      │     to project: My App"
           │                            │
           │         PAIRED             │         PAIRED
           │                            │
           │  Messages now route ←────→ │  Messages now route
           │  to project AI chat        │  to project AI chat
```

### 8.2 Pairing Code Generation

```typescript
// Alphabet: no ambiguous chars (0/O, 1/I/L, 5/S)
const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ2346789';

function generatePairingCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) {
    code += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
  }
  // Format: XXXX-XXXX for readability
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
```

### 8.3 Pairing Rules

- Codes expire after **1 hour**
- Max **3 pending pairing codes** per channel (prevent abuse)
- One conversation can only be linked to **one project** at a time
- Multiple conversations can link to the **same project** (e.g., WhatsApp DM + Telegram group both → same project)
- Users can **unlink** via `/unlink` in messenger or from Doable project settings
- **Auto-pairing option**: workspace admin can enable "auto-pair DMs to default project" to skip manual pairing

### 8.4 First-Contact Experience

When someone messages the bot for the first time (no existing conversation record):

**WhatsApp:**
> 👋 Hi! I'm your Doable AI assistant.
> 
> To get started, link this chat to a Doable project:
> 1. Open your project in Doable
> 2. Go to Settings → Messenger Links
> 3. Click "Generate Link Code"  
> 4. Send me the code (e.g., "AXBK-3N7P")

**Telegram:**
> 👋 Welcome! I'm your Doable AI assistant.
> 
> Use /link CODE to connect this chat to a Doable project.
> Get your link code from Project Settings → Messenger Links in Doable.

---

## 9. Channel Manager

### 9.1 Lifecycle Management

```typescript
// services/api/src/messenger-channels/channel-manager.ts

class ChannelManager {
  private connectors = new Map<string, ChannelConnector>();  // channelId → connector
  
  // Called on API server start
  async initialize(): Promise<void> {
    // Load all channels with status 'connected' from DB
    const channels = await db.query(`
      SELECT * FROM messenger_channels WHERE status = 'connected'
    `);
    
    // Reconnect each one
    for (const channel of channels) {
      await this.startChannel(channel);
    }
  }
  
  async startChannel(channel: MessengerChannel): Promise<void> {
    const config = await decryptConfig(channel.config_encrypted);
    const connector = createChannelConnector(channel.channel_type, channel.id, config);
    
    // Wire up message routing
    connector.on('message', (msg) => messageRouter.routeInboundMessage(msg));
    connector.on('status', (status) => this.handleStatusChange(channel.id, status));
    connector.on('error', (err) => this.handleError(channel.id, err));
    
    // Connect with retry
    await this.connectWithRetry(connector, channel.id);
    
    this.connectors.set(channel.id, connector);
  }
  
  // Exponential backoff: 5s → 10s → 30s → 60s → 5min max, 10 max attempts
  private async connectWithRetry(connector: ChannelConnector, channelId: string) {
    const delays = [5000, 10000, 30000, 60000, 300000];
    let attempt = 0;
    
    while (attempt < 10) {
      try {
        await connector.connect();
        await updateChannelStatus(channelId, 'connected');
        return;
      } catch (err) {
        attempt++;
        const delay = delays[Math.min(attempt - 1, delays.length - 1)];
        await sleep(delay);
      }
    }
    
    await updateChannelStatus(channelId, 'error', 'Max reconnect attempts reached');
  }
  
  async stopChannel(channelId: string): Promise<void> {
    const connector = this.connectors.get(channelId);
    if (connector) {
      await connector.disconnect();
      await connector.destroy();
      this.connectors.delete(channelId);
    }
  }
  
  // Get connector for sending outbound messages
  getConnector(channelId: string): ChannelConnector | undefined {
    return this.connectors.get(channelId);
  }
  
  // Health check (called periodically)
  async healthCheck(): Promise<Map<string, ChannelStatus>> {
    const statuses = new Map();
    for (const [id, connector] of this.connectors) {
      statuses.set(id, connector.getStatus());
    }
    return statuses;
  }
  
  // Graceful shutdown
  async shutdown(): Promise<void> {
    const promises = Array.from(this.connectors.values()).map(c => c.destroy());
    await Promise.allSettled(promises);
    this.connectors.clear();
  }
}

export const channelManager = new ChannelManager();
```

### 9.2 Health Monitoring

```
Every 60 seconds:
  ├─ Check all connectors' status
  ├─ For 'disconnected' connectors: attempt reconnect
  ├─ For 'error' connectors: check if retry window has passed
  ├─ Update messenger_channels.status in DB
  └─ Log health metrics
```

---

## 10. Integration with Existing Systems

### 10.1 Integration Registry Entry

```typescript
// services/api/src/integrations/registry/messenger-channels.ts

export const messengerChannelEntries: IntegrationDefinition[] = [
  {
    id: 'whatsapp-channel',
    piecePackage: null,                  // Not an Activepieces piece
    displayName: 'WhatsApp',
    description: 'Connect WhatsApp to chat with your project AI from your phone',
    logoUrl: '/integrations/whatsapp.svg',
    category: 'messenger_channels',      // New category
    tags: ['messenger', 'chat', 'whatsapp', 'mobile'],
    authType: 'custom_auth',
    customAuthFields: [],                // Custom UI flow (QR code)
    actions: [],                         // No tool actions — this is a channel
    tier: 'built_in',
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: false,
    isChannel: true,                     // New flag: marks this as a channel connector
  },
  {
    id: 'telegram-channel',
    piecePackage: null,
    displayName: 'Telegram',
    description: 'Connect a Telegram bot to chat with your project AI',
    logoUrl: '/integrations/telegram.svg',
    category: 'messenger_channels',
    tags: ['messenger', 'chat', 'telegram', 'bot'],
    authType: 'custom_auth',
    customAuthFields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'password',
        placeholder: '123456789:ABCdefGHIjklmnop...',
        helpText: 'Get this from @BotFather in Telegram',
        required: true,
      }
    ],
    actions: [],
    tier: 'built_in',
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
    isChannel: true,
  },
];
```

### 10.2 Integration Catalog UI

The messenger channels appear in the catalog under a "Messenger Channels" section, but with custom connect flows:

```
┌─────────────────────────────────────────────────┐
│  INTEGRATIONS                                    │
│                                                   │
│  ── Messenger Channels ──────────────────────── │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ 📱 WhatsApp  │  │ ✈ Telegram   │             │
│  │              │  │              │             │
│  │ [Connect]    │  │ [Connect]    │             │
│  └──────────────┘  └──────────────┘             │
│                                                   │
│  ── Communication ───────────────────────────── │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Slack        │  │ Discord      │  ...        │
│  └──────────────┘  └──────────────┘             │
│                                                   │
│  ── Productivity ────────────────────────────── │
│  ...                                              │
└─────────────────────────────────────────────────┘
```

**WhatsApp connect flow** (custom):
1. Click "Connect" → modal opens
2. API creates channel + starts Baileys pairing → returns QR code
3. Modal shows QR with instructions + auto-refresh
4. User scans → modal updates to "Connected! ✓"
5. Shows linked phone number + "Disconnect" option

**Telegram connect flow** (standard custom_auth form):
1. Click "Connect" → form shows Bot Token input
2. User pastes token → API validates via `getMe`
3. Success → shows bot name + "Disconnect" option

### 10.3 Project Settings — Messenger Links

New section in project settings:

```
┌─────────────────────────────────────────────────┐
│  PROJECT SETTINGS                                │
│                                                   │
│  ── Messenger Links ────────────────────────── │
│                                                   │
│  Link a messenger chat to this project so you   │
│  can chat with AI from WhatsApp or Telegram.    │
│                                                   │
│  Active Links:                                    │
│  ┌─────────────────────────────────────────┐    │
│  │ 📱 WhatsApp DM with +1 (555) 123-4567  │    │
│  │   Linked 2 hours ago · 14 messages      │    │
│  │   [Unlink]                              │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │ ✈ Telegram @doable_ai_bot              │    │
│  │   Group: "Design Team"                  │    │
│  │   Linked 3 days ago · 89 messages       │    │
│  │   [Unlink]                              │    │
│  └─────────────────────────────────────────┘    │
│                                                   │
│  [Generate Link Code]                            │
│  → Code: AXBK-3N7P (expires in 58 min)          │
│  → Send this code to your bot in WhatsApp        │
│    or Telegram to link that chat here.           │
│                                                   │
└─────────────────────────────────────────────────┘
```

### 10.4 Web Chat — Messenger Activity Feed

When messages come in from external messengers, they should be visible in the Doable web chat panel:

```
┌─────────────────────────────────────────┐
│  AI Chat                                 │
│                                          │
│  [You] Create a hero section with...     │
│  [AI] I'll create a hero section...      │
│                                          │
│  ── via WhatsApp · John ──────────────  │
│  [📱] Can you make the button bigger?    │
│  [AI] Sure, I'll increase the button...  │
│                                          │
│  [You] Looks good, also add a footer     │
│  [AI] Adding a footer component...       │
│                                          │
│  ── via Telegram · Design Team ────────  │
│  [✈] What's the current color palette?  │
│  [AI] The current palette uses...        │
│                                          │
└─────────────────────────────────────────┘
```

This is achieved by broadcasting `messenger:message` events through the existing WebSocket system. The frontend chat component renders these with a visual indicator of the source channel.

---

## 11. API Routes

### 11.1 New Routes

```
POST   /messenger-channels                    Create a new channel (start pairing)
GET    /messenger-channels?workspaceId=X      List user's channels
GET    /messenger-channels/:id                Get channel details + status
DELETE /messenger-channels/:id                Disconnect and remove channel
POST   /messenger-channels/:id/reconnect     Force reconnect

-- WhatsApp-specific
GET    /messenger-channels/:id/qr            Get current QR code (SSE stream for live updates)

-- Pairing
POST   /projects/:id/messenger-links          Generate pairing code for project
GET    /projects/:id/messenger-links          List linked conversations
DELETE /projects/:id/messenger-links/:convId  Unlink a conversation

-- Message history (for debugging / context review)
GET    /messenger-conversations/:id/messages  Get message history
```

### 11.2 Route Design Rationale

Separate from `/integrations/*` routes because:
1. Channels have persistent lifecycle state (not just credentials)
2. QR code streaming needs SSE endpoint
3. Pairing is project-scoped (not just workspace/user-scoped)
4. Message history is conversation-scoped

But they **appear in** the integration catalog UI via the registry entry.

---

## 12. File Structure

```
services/api/src/
├── messenger-channels/
│   ├── types.ts                    # NormalizedMessage, ChannelConnector interface, etc.
│   ├── channel-manager.ts          # Singleton lifecycle manager
│   ├── message-router.ts           # Inbound message → AI chat pipeline
│   ├── pairing.ts                  # Pairing code generation, validation, linking
│   ├── factory.ts                  # Channel connector factory
│   ├── debouncer.ts                # Message debouncing (batch rapid messages)
│   │
│   ├── channels/
│   │   ├── whatsapp/
│   │   │   ├── connector.ts        # WhatsAppConnector implements ChannelConnector
│   │   │   ├── auth-state.ts       # Baileys auth state ↔ encrypted DB storage
│   │   │   ├── message-extract.ts  # WhatsApp message → NormalizedMessage
│   │   │   └── media.ts            # Media download + storage
│   │   │
│   │   └── telegram/
│   │       ├── connector.ts        # TelegramConnector implements ChannelConnector
│   │       ├── polling.ts          # Long polling with grammy runner
│   │       ├── message-extract.ts  # Telegram update → NormalizedMessage
│   │       └── commands.ts         # /start, /link, /unlink command handlers
│   │
│   └── __tests__/                  # Tests for router, pairing, normalization
│
├── routes/
│   └── messenger-channels.ts       # API routes (Hono)
│
├── integrations/
│   └── registry/
│       └── messenger-channels.ts   # Registry entries for catalog

apps/web/src/
├── modules/
│   ├── integrations/
│   │   └── (existing — messenger channels appear here via catalog)
│   │
│   └── editor/
│       └── chat/
│           └── messenger-indicator.tsx  # Visual indicator for messenger-sourced messages

packages/db/
├── migrations/
│   └── 038_messenger_channels.sql
└── src/
    └── queries/
        └── messenger-channels.ts    # DB query functions
```

---

## 13. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Bot token exposure | Encrypted at rest via pgp_sym_encrypt (same as all credentials) |
| WhatsApp auth state | Encrypted in DB, temp files cleaned up after use |
| Message content privacy | Messages stored in DB with project-level access control; deleted on conversation unlink if user chooses |
| Unauthorized access | Pairing protocol ensures only workspace members can link |
| Rate limiting | Debounce inbound messages; rate limit AI calls per conversation (e.g., 30/hour) |
| Spam prevention | Unpaired conversations get one welcome message; ignore further until paired |
| WhatsApp ToS | Baileys is unofficial — add clear warning in UI that this uses WhatsApp Web protocol |
| Group data leakage | In groups, only respond to @mentions; don't leak project info to non-members |
| Media handling | Scan/size-limit media before processing; store locally (not externally) |

---

## 14. Implementation Phases

### Phase 1: Core Infrastructure (5-7 days)

- [ ] Database migration (`038_messenger_channels.sql`)
- [ ] `messenger-channels/types.ts` — All TypeScript types and interfaces
- [ ] `messenger-channels/channel-manager.ts` — Lifecycle manager singleton
- [ ] `messenger-channels/message-router.ts` — Routing logic (without AI integration yet)
- [ ] `messenger-channels/pairing.ts` — Code generation, validation, project linking
- [ ] `messenger-channels/debouncer.ts` — Message batching
- [ ] `messenger-channels/factory.ts` — Connector factory
- [ ] `routes/messenger-channels.ts` — API routes
- [ ] DB query functions in `packages/db`

### Phase 2: Telegram Connector (3-4 days)

Start with Telegram because it's simpler (official API, no QR codes):

- [ ] `channels/telegram/connector.ts` — TelegramConnector class
- [ ] `channels/telegram/polling.ts` — Long polling with grammy
- [ ] `channels/telegram/message-extract.ts` — Message normalization
- [ ] `channels/telegram/commands.ts` — Bot commands (/start, /link, /unlink)
- [ ] Integration registry entry
- [ ] Test end-to-end: create bot → connect → pair → chat with AI → get response

### Phase 3: WhatsApp Connector (4-5 days)

- [ ] `channels/whatsapp/connector.ts` — WhatsAppConnector class
- [ ] `channels/whatsapp/auth-state.ts` — Encrypted auth state persistence
- [ ] `channels/whatsapp/message-extract.ts` — Message normalization (handle all wrapper types)
- [ ] `channels/whatsapp/media.ts` — Media download and storage
- [ ] QR code SSE endpoint
- [ ] Integration registry entry
- [ ] Test end-to-end: QR scan → pair → chat → media messages

### Phase 4: AI Chat Integration (3-4 days)

- [ ] Refactor `chat.ts` to extract `processAiChat()` as shared function
- [ ] Message router → AI pipeline integration
- [ ] Messenger-specific system prompt context
- [ ] Response collection (non-streaming for messenger output)
- [ ] WebSocket broadcast for messenger activity in web UI
- [ ] Typing indicators (both directions)

### Phase 5: Frontend UI (3-4 days)

- [ ] Messenger channels in integration catalog (custom connect flows)
- [ ] WhatsApp QR code modal with SSE live updates
- [ ] Telegram bot token form
- [ ] Project settings → Messenger Links section
- [ ] Pairing code generation UI
- [ ] Active links management (view, unlink)
- [ ] Chat panel — messenger message indicators
- [ ] Channel status indicators (connected/disconnected/error)

### Phase 6: Polish & Edge Cases (2-3 days)

- [ ] Reconnection handling (server restart, network drops)
- [ ] Message retry queue (if AI is slow, don't lose messages)
- [ ] Rate limiting per conversation
- [ ] Media transcription (voice messages → text, if Whisper available)
- [ ] Group chat mention filtering
- [ ] Error UX (banned accounts, expired sessions, etc.)
- [ ] Message retention cleanup (keep last N messages per conversation)

**Total estimate: ~20-27 days for full implementation**

---

## 15. Dependencies

### npm packages to add:

```json
{
  "@whiskeysockets/baileys": "^6.x",   // WhatsApp Web connector (MIT)
  "grammy": "^1.x",                     // Telegram Bot API (MIT)
  "@grammyjs/runner": "^2.x",           // Concurrent update processing (MIT)
  "qrcode": "^1.x",                     // QR code generation for WhatsApp (MIT)
  "link-preview-js": "^3.x"             // Optional: rich link previews (MIT)
}
```

All MIT licensed, all open source — compliant with project requirements.

---

## 16. Future Extensions

Once the core channel system is in place, these become straightforward additions:

| Extension | Effort | Description |
|-----------|--------|-------------|
| **Discord channel** | 3-4 days | `discord.js` library, bot token auth, similar to Telegram |
| **Slack channel** | 3-4 days | Slack Events API, OAuth-based, builds on existing Slack integration |
| **Signal channel** | 4-5 days | `libsignal-client`, requires phone number registration |
| **Matrix bridge** | 2-3 days | `matrix-js-sdk`, bridges Matrix rooms to projects |
| **SMS (Twilio)** | 2-3 days | Twilio webhook, phone number pairing |
| **Email channel** | 3-4 days | IMAP listener + SMTP sender, email → project mapping |
| **Voice calls** | 5+ days | Twilio Voice or WebRTC, speech-to-text → AI → text-to-speech |
| **Multi-project routing** | 2 days | Let one bot handle multiple projects via conversation-level routing |
| **Webhook channel** | 1-2 days | Generic HTTP webhook for custom integrations |

The `ChannelConnector` interface ensures each new channel is a self-contained module — no changes to the router, pairing, or AI pipeline needed.

---

## 17. Open Questions for Discussion

1. **WhatsApp ToS risk**: Baileys is unofficial. Should we also support WhatsApp Cloud API as an alternative for users who want official compliance? (Would require Meta Business verification)

2. **Multi-user channels**: If a workspace has multiple users, should each get their own WhatsApp connection, or share one bot number? (Recommendation: one per user, like OpenClaw)

3. **Message persistence**: How long should messenger messages be retained? Options: forever, 30 days, last 500 per conversation, user configurable.

4. **AI response length**: Messenger messages have length limits (WhatsApp: 65536 chars, Telegram: 4096 chars). Should long AI responses be split into multiple messages or truncated with a "view full response in Doable" link?

5. **Offline behavior**: When a channel's AI chat project is being edited by someone, should messenger messages queue or get a "busy" response?

6. **Cost considerations**: Each AI chat from messenger consumes tokens. Should there be per-conversation rate limits? Per-workspace quotas?
