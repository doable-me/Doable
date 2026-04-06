# 22 — Messenger Connectors Deep Dive: ToS Risk, Multi-Purpose Architecture, Screenshots

> Companion to [PRD 21 — Messenger Connectors](./21-messenger-connectors.md).
> PRD 21 covers the core architecture, data model, pairing protocol, and implementation phases.
> This document goes deeper on three critical areas: WhatsApp compliance, multi-purpose capability design, and preview screenshot delivery.

---

## Table of Contents

0. [Integration Kind System: Why Channels ≠ Actions](#0-integration-kind-system-why-channels--actions)
1. [WhatsApp ToS Risk Management](#1-whatsapp-tos-risk-management)
2. [Provider Abstraction: Baileys ↔ Cloud API](#2-provider-abstraction-baileys--cloud-api)
3. [Multi-Purpose Capability Architecture](#3-multi-purpose-capability-architecture)
4. [Message Router: One Connection, Many Purposes](#4-message-router-one-connection-many-purposes)
5. [AI Chat Over Messenger](#5-ai-chat-over-messenger)
6. [User-to-User Chat Bridging](#6-user-to-user-chat-bridging)
7. [Preview Screenshot Delivery](#7-preview-screenshot-delivery)
8. [Notifications & Alerts Over Messenger](#8-notifications--alerts-over-messenger)
9. [Updated Data Model](#9-updated-data-model)
10. [Updated File Structure](#10-updated-file-structure)
11. [Revised Implementation Phases](#11-revised-implementation-phases)

---

## 0. Integration Kind System: Why Channels ≠ Actions

### 0.1 The Problem

Right now, **every integration in Doable is treated identically**. The `IntegrationDefinition` type has a `category` field (`communication`, `productivity`, `data_storage`, etc.) — but `category` is purely cosmetic. It controls:
- Which tab/pill filter the integration shows under in the catalog UI
- The label badge on the integration card

It does **not** control:
- How the integration behaves at runtime
- Whether it creates AI tools or persistent connections
- What UI flows are available (QR code vs API key vs OAuth)
- Whether the system routes messages through it
- What capabilities it exposes to other Doable subsystems

A Slack integration (category: `communication`) and a Supabase integration (category: `data_storage`) behave identically under the hood: both register Activepieces actions that become fire-and-forget AI tools like `slack_send_channel_message` or `supabase_insert_row`. That's fine for action-based integrations. But WhatsApp and Telegram connectors are **fundamentally different**:

| | Action Integration (Slack, Supabase, Google Drive) | Channel Integration (WhatsApp, Telegram) |
|---|---|---|
| **Lifecycle** | Stateless — credentials stored, used when needed | Stateful — persistent connection, health monitoring |
| **Direction** | Outbound only (AI calls an action) | Bidirectional (receives AND sends messages) |
| **Connection** | OAuth/API key, then forget | WebSocket (WhatsApp) or polling (Telegram) — always running |
| **AI relationship** | AI calls it as a tool | Messages route TO the AI and responses route BACK |
| **Session** | None | Conversation mapping, pairing, routing |
| **Purpose** | Single (execute an action) | Multi (AI chat, user chat, screenshots, notifications) |
| **Reconnection** | N/A | Circuit breaker, exponential backoff, health monitoring |
| **Message history** | N/A | Stores inbound/outbound for context |

**The system needs to understand this distinction at the type level, the registry level, the UI level, and the runtime level.**

### 0.2 Introducing `IntegrationKind`

We add a `kind` discriminator to the integration type system:

```typescript
// services/api/src/integrations/types.ts — ADDITIONS

/**
 * The fundamental behavior type of an integration.
 * This is NOT the same as category (which is for UI grouping).
 * 
 * - "action": Fire-and-forget tools. AI calls them, gets results. (Supabase, Slack, Google Drive)
 * - "channel": Persistent bidirectional connections. Receive messages, route them, send responses.
 *              (WhatsApp, Telegram, future: Discord bot, SMS, Matrix bridge)
 */
export type IntegrationKind = "action" | "channel";

/**
 * For channel-kind integrations, what capabilities does this channel support?
 * This tells the system what this channel CAN do — not what's enabled.
 */
export interface ChannelCapabilities {
  /** Can send outbound text messages */
  send: boolean;
  /** Can receive inbound messages (persistent listener) */
  listen: boolean;
  /** Can send/receive media (images, documents) */
  media: boolean;
  /** Can show typing indicators and read receipts */
  presence: boolean;
  /** Can interact with groups (metadata, members) */
  groups: boolean;
  /** Supports inline buttons / interactive responses */
  interactiveButtons: boolean;
}

/**
 * Channel-specific configuration for channel-kind integrations.
 * Only present when kind === 'channel'.
 */
export interface ChannelConfig {
  /** How the channel maintains its connection */
  connectionType: "persistent_websocket" | "long_polling" | "webhook";
  /** What this channel can do */
  capabilities: ChannelCapabilities;
  /** Max message length before splitting */
  maxMessageLength: number;
  /** Supported media types */
  supportedMediaTypes: string[];
  /** Max media size in bytes */
  maxMediaSize: number;
  /** Whether this channel supports multiple provider backends */
  hasProviderAbstraction: boolean;
  /** Available providers (e.g., ['baileys', 'cloud_api'] for WhatsApp) */
  providers?: string[];
  /** Requires anti-ban middleware */
  requiresAntiBan: boolean;
}
```

### 0.3 Updated `IntegrationDefinition`

```typescript
export interface IntegrationDefinition {
  id: string;
  piecePackage: string | null;           // null for channel-kind (no Activepieces piece)
  displayName: string;
  description: string;
  logoUrl: string;
  category: IntegrationCategory;         // UI grouping (unchanged)
  tags: string[];
  
  // ─── NEW: Kind discriminator ─────────
  kind: IntegrationKind;                 // "action" or "channel"
  channelConfig?: ChannelConfig;         // Only for kind === "channel"
  // ─────────────────────────────────────
  
  authType: AuthType;
  oauth2Config?: OAuth2Config;
  customAuthFields?: CustomAuthField[];
  actions: string[];                     // Empty for channels (they don't expose actions as AI tools)
  actionOverrides?: Record<string, { description?: string; hidden?: boolean }>;
  triggers?: string[];
  tier: "built_in" | "community";
  requiresOAuthApp: boolean;
  supportsUserProvidedCredentials: boolean;
  enhancedAuth?: EnhancedAuthConfig;
}
```

### 0.4 How the System Uses `kind`

Every part of Doable that touches integrations now checks `kind`:

**1. Tool Bridge (`tool-bridge.ts`) — SKIP channels**

```typescript
export async function createIntegrationTools(opts: IntegrationToolOptions): Promise<Tool[]> {
  const connections = await credentialVault.getEffective(opts.workspaceId, opts.projectId, opts.userId);
  const tools: Tool[] = [];
  
  for (const conn of connections) {
    const def = getIntegration(conn.integration_id);
    if (!def) continue;
    
    // ─── NEW: Skip channel integrations — they're not AI tools ───
    if (def.kind === 'channel') continue;
    // ─────────────────────────────────────────────────────────────
    
    // ... existing action tool creation logic ...
  }
  
  return tools;
}
```

Channels are NOT fire-and-forget tools. The AI doesn't call `whatsapp_send_message` as a tool — instead, the AI's natural response gets routed BACK to WhatsApp by the message router. This is a fundamental difference.

**2. Integration Catalog API — expose `kind` in response**

```typescript
// GET /integrations/catalog response:
interface CatalogItem {
  id: string;
  displayName: string;
  // ...existing fields...
  kind: "action" | "channel";           // NEW
  channelConfig?: {                      // NEW (only for channels)
    capabilities: ChannelCapabilities;
    connectionType: string;
    hasProviderAbstraction: boolean;
    providers?: string[];
  };
}
```

**3. Frontend Catalog UI — different rendering and connect flows**

```typescript
// use-integration-catalog.ts — NEW category for channels
export const CATEGORY_LABELS: Record<string, string> = {
  // ...existing...
  messenger_channels: "Messenger Channels",  // NEW
};

// integration-catalog.tsx — channels rendered in their own section
// Action integrations: show action count, "Connect" button opens OAuth/API key flow
// Channel integrations: show capabilities badges, "Connect" button opens:
//   - WhatsApp: QR code modal with ToS disclaimer
//   - Telegram: Bot token form
//   - Status indicator (connected/disconnected/pairing/error)
//   - Link to project settings for pairing
```

**4. Connect/Disconnect routes — different flows**

```
POST /integrations/connect (action kind):
  → Store credentials in integration_connections
  → Done. AI tools available on next chat.

POST /messenger-channels (channel kind):
  → Create messenger_channels row
  → Start persistent connection (Baileys/grammy)
  → Return pairing UI (QR code or confirmation)
  → Channel manager keeps connection alive
```

**5. Health monitoring — channels only**

```
GET /integrations/connections (action kind):
  → Returns connection status (active/error/revoked)
  → Passive — just credential state

GET /messenger-channels/:id (channel kind):
  → Returns live connection status (connected/disconnected/pairing/error/banned)
  → Active — channel manager monitors in real-time
  → Includes health metrics (messages sent, warm-up progress, circuit breaker state)
```

### 0.5 Registry Entries: Actions vs Channels

**Existing action integration (no changes):**
```typescript
{
  id: 'slack',
  kind: 'action',                        // Explicit — was implicit before
  piecePackage: '@activepieces/piece-slack',
  category: 'communication',
  actions: ['send_channel_message', 'send_direct_message', ...],
  // ... AI calls slack_send_channel_message as a tool
}
```

**New channel integration:**
```typescript
{
  id: 'whatsapp-channel',
  kind: 'channel',                       // System knows this is different
  piecePackage: null,                    // No Activepieces piece
  category: 'messenger_channels',       // UI grouping
  channelConfig: {
    connectionType: 'persistent_websocket',
    capabilities: {
      send: true, listen: true, media: true,
      presence: true, groups: true, interactiveButtons: false,
    },
    maxMessageLength: 65536,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'audio/ogg', 'application/pdf'],
    maxMediaSize: 64 * 1024 * 1024,     // 64 MB
    hasProviderAbstraction: true,
    providers: ['baileys', 'cloud_api'],
    requiresAntiBan: true,
  },
  actions: [],                           // No AI tool actions
  // ...
}
```

```typescript
{
  id: 'telegram-channel',
  kind: 'channel',
  piecePackage: null,
  category: 'messenger_channels',
  channelConfig: {
    connectionType: 'long_polling',
    capabilities: {
      send: true, listen: true, media: true,
      presence: true, groups: true, interactiveButtons: true,
    },
    maxMessageLength: 4096,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'audio/ogg', 'application/pdf'],
    maxMediaSize: 50 * 1024 * 1024,     // 50 MB (Telegram bot limit)
    hasProviderAbstraction: false,
    requiresAntiBan: false,
  },
  actions: [],
  // ...
}
```

### 0.6 But What About Slack-the-Action vs Slack-the-Channel?

Good question. Right now Slack is an action integration: the AI can call `slack_send_channel_message`. But what if someone wants Slack to also be a **channel** — receiving messages from a Slack channel and routing them to AI chat?

The answer: **they can coexist**. Same external service, different integration entries:

```
slack           (kind: "action")  → AI tool: slack_send_channel_message
slack-channel   (kind: "channel") → Persistent: Slack Events API → message router → AI → reply
```

This is exactly how OpenClaw works — they have both "Slack tool" (send messages) and "Slack channel" (receive + route messages). The `kind` system makes this clean.

### 0.7 Migration Plan

Since every existing integration is implicitly `kind: "action"`, migration is simple:

1. Add `kind` field to `IntegrationDefinition` type with default `"action"`
2. Add `kind: "action"` to all existing registry entries (or make it optional with `"action"` as default)
3. Tool bridge already works — just add the `if (def.kind === 'channel') continue;` guard
4. Catalog API already returns category — add `kind` to the response
5. Frontend: add `messenger_channels` to `CATEGORY_LABELS`, render channel cards differently

**Zero breaking changes to existing integrations.** The `kind` field is additive.

### 0.8 Visual: How the System Sees Integrations Now

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTEGRATION REGISTRY                          │
│                                                                   │
│  kind: "action"                    kind: "channel"               │
│  ┌──────────────────────┐          ┌──────────────────────────┐ │
│  │ Slack (communication) │          │ WhatsApp (messenger)      │ │
│  │ Notion (productivity) │          │ Telegram (messenger)      │ │
│  │ Supabase (data)       │          │ Future: Discord bot       │ │
│  │ Google Drive (data)   │          │ Future: Matrix bridge     │ │
│  │ OpenAI (ai_ml)        │          │ Future: SMS (Twilio)      │ │
│  │ Stripe (finance)      │          │                           │ │
│  │ ... 630+ total        │          │                           │ │
│  └──────────┬───────────┘          └──────────┬───────────────┘ │
│             │                                  │                  │
│             ▼                                  ▼                  │
│  ┌──────────────────────┐          ┌──────────────────────────┐ │
│  │ Tool Bridge           │          │ Channel Manager           │ │
│  │ → AI tools            │          │ → Persistent connections  │ │
│  │ → Fire-and-forget     │          │ → Message routing         │ │
│  │ → Action runner       │          │ → Capability system       │ │
│  │ → Activepieces pieces │          │ → Custom connectors       │ │
│  └──────────────────────┘          └──────────────────────────┘ │
│                                                                   │
│  category is for UI grouping only (unchanged):                   │
│  communication | productivity | developer_tools | ai_ml | ...    │
│  messenger_channels (new, used by channel-kind integrations)     │
└─────────────────────────────────────────────────────────────────┘
```

### 0.9 Updated CatalogItem for Frontend

```typescript
// Frontend type
export interface CatalogItem {
  id: string;
  displayName: string;
  description: string;
  logoUrl: string;
  category: string;
  kind: "action" | "channel";            // NEW
  authType: string;
  tier: "built_in" | "community";
  connected: boolean;
  actionCount: number;                   // 0 for channels
  // For channels:
  channelStatus?: "connected" | "disconnected" | "pairing" | "error" | "banned";
  channelCapabilities?: string[];        // ["send", "listen", "media", "presence"]
  customAuthFields?: CustomAuthField[];
  enhancedAuth?: EnhancedAuthInfo;
}
```

The frontend catalog component then renders differently based on `kind`:

```
┌─────────────────────────────────────────────────────┐
│  INTEGRATIONS                                        │
│                                                       │
│  ── Messenger Channels ────────────────────────────  │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ 📱 WhatsApp           │  │ ✈️ Telegram           │ │
│  │ ● Connected           │  │ ○ Not connected      │ │
│  │ +1 (555) 123-4567     │  │                      │ │
│  │ 📡 send listen media  │  │ 📡 send listen media │ │
│  │                        │  │    buttons groups    │ │
│  │ [Manage] [Disconnect] │  │ [Connect]            │ │
│  └──────────────────────┘  └──────────────────────┘ │
│                                                       │
│  ── Communication ──────────────────────────────────  │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │ Slack         │  │ Discord      │  ...             │
│  │ 12 actions    │  │ 8 actions    │                  │
│  │ [Connected ✓] │  │ [Connect]    │                  │
│  └──────────────┘  └──────────────┘                  │
│                                                       │
│  ── Data & Storage ─────────────────────────────────  │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │ Supabase      │  │ Google Drive │  ...             │
│  │ 15 actions    │  │ 9 actions    │                  │
│  │ [Connect]     │  │ [Connected ✓]│                  │
│  └──────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────┘
```

Notice:
- **Channels** show live status (● Connected), linked account info, capability badges, and Manage/Disconnect buttons
- **Actions** show action count, connection state, and Connect button
- **Messenger Channels section appears first** (pinned at top when any are connected)
- The distinction is driven by `kind`, not `category`

---

## 1. WhatsApp ToS Risk Management

### 1.1 The Reality: Baileys + WhatsApp in 2026

Baileys (`@whiskeysockets/baileys`) reverse-engineers the WhatsApp Web multi-device protocol. This is **unofficial and violates WhatsApp's Terms of Service**. Here's what the research shows:

**OpenClaw's experience** (348K+ stars, largest open-source Baileys consumer):
- They acknowledge the risk explicitly in docs and recommend **dedicated phone numbers** — never your personal number
- They do NOT implement built-in anti-ban middleware (no rate limiting, no human-like delays, no warm-up periods)
- Their only safety layer is `dmPolicy` (pairing/allowlist/open/disabled) which controls who can message the bot
- A documented incident (GitHub issue #16270) showed 3,500+ Baileys reconnection cycles in 3 hours caused a **72-hour account restriction** — and the proposed circuit breaker fix was closed as "not planned"

**WhatsApp's enforcement escalation (late 2025–2026)**:
- Baileys issue #1869: Users report bots that ran 3+ years without issues suddenly getting banned
- WhatsApp deployed new anti-bot detection targeting: server/datacenter IPs, 24/7 online presence, messaging patterns, reconnection frequency
- VoIP/virtual numbers (Google Voice etc.) get flagged aggressively
- Being reported by even a single recipient can trigger a ban

**Known ban triggers ranked by risk**:

| Trigger | Risk | Mitigation |
|---------|------|-----------|
| VoIP/virtual phone number | Very High | Use real SIM cards only |
| Rapid connect/disconnect cycles | Very High | Circuit breaker (max 10 failures → 30min cooldown) |
| Being reported by recipients | Very High | Only message opted-in users (pairing protocol) |
| Bulk messaging (>20 msgs/min) | Very High | Rate limit to 8 msgs/min max |
| New number + immediate high activity | Very High | 7-day warm-up period |
| Server/datacenter IP | High | Residential proxy or cloud provider with residential IPs |
| 24/7 online presence | High | Periodic disconnects simulating phone sleep |
| Identical message content to many | High | Template variation |
| Multiple accounts on same IP | Medium-High | One account per IP |
| Posting status from server | High | Never post status updates |

### 1.2 Our Anti-Ban Strategy (Beyond OpenClaw)

OpenClaw provides zero built-in anti-ban protection. We will do better by integrating `baileys-antiban` middleware patterns and our own safeguards:

```typescript
// services/api/src/messenger-channels/channels/whatsapp/anti-ban.ts

export interface AntiBanConfig {
  // Rate limiting
  maxMessagesPerMinute: number;      // Default: 8
  maxMessagesPerHour: number;        // Default: 200
  maxMessagesPerDay: number;         // Default: 1500
  
  // Human-like timing
  minDelayBetweenMessages: number;   // Default: 3000ms
  typingSimulationMs: [number, number]; // Default: [1000, 3000] (random range)
  jitterFactor: number;              // Default: 0.3 (gaussian jitter on all delays)
  
  // Warm-up (for new numbers)
  warmUpEnabled: boolean;            // Default: true
  warmUpDays: number;                // Default: 7
  warmUpStartRate: number;           // Default: 5 msgs/day
  warmUpEndRate: number;             // Default: 1500 msgs/day
  
  // Circuit breaker
  maxConsecutiveFailures: number;    // Default: 10
  circuitBreakerCooldownMs: number;  // Default: 1800000 (30 min)
  maxReconnectAttempts: number;      // Default: 50 (not unlimited like OpenClaw)
  
  // Session health
  periodicDisconnectEnabled: boolean; // Default: true — simulate phone going offline
  disconnectIntervalMs: number;       // Default: 21600000 (6 hours)
  disconnectDurationMs: number;       // Default: 300000 (5 min)
}

const DEFAULT_CONFIG: AntiBanConfig = {
  maxMessagesPerMinute: 8,
  maxMessagesPerHour: 200,
  maxMessagesPerDay: 1500,
  minDelayBetweenMessages: 3000,
  typingSimulationMs: [1000, 3000],
  jitterFactor: 0.3,
  warmUpEnabled: true,
  warmUpDays: 7,
  warmUpStartRate: 5,
  warmUpEndRate: 1500,
  maxConsecutiveFailures: 10,
  circuitBreakerCooldownMs: 1800000,
  maxReconnectAttempts: 50,
  periodicDisconnectEnabled: true,
  disconnectIntervalMs: 21600000,
  disconnectDurationMs: 300000,
};
```

**Implementation layers:**

```
Outbound message
  │
  ├─ 1. Rate Limiter (sliding window: 8/min, 200/hr, 1500/day)
  │     If over limit → queue with backpressure, notify sender "message queued"
  │
  ├─ 2. Warm-Up Check (first 7 days of new number)
  │     Daily limit = lerp(warmUpStartRate, warmUpEndRate, day/warmUpDays)
  │     If over warm-up limit → reject with "warming up, try again tomorrow"
  │
  ├─ 3. Typing Simulation
  │     sendPresenceUpdate('composing', jid)
  │     await sleep(random(1000, 3000) * gaussianJitter(0.3))
  │
  ├─ 4. Send with Delay
  │     await sleep(max(minDelayBetweenMessages, timeSinceLastSend))
  │     sock.sendMessage(jid, content)
  │
  ├─ 5. Echo Track (mark as our own message for dedup)
  │
  └─ 6. Health Monitor
        If send fails → increment failure counter
        If failures >= maxConsecutiveFailures → CIRCUIT OPEN
        Wait circuitBreakerCooldownMs → attempt reconnect
        If reconnect fails after maxReconnectAttempts → mark channel 'error', notify user
```

**Reconnection circuit breaker** (fixing OpenClaw's biggest gap):

```typescript
class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private nextAttemptAt: Date | null = null;
  
  async execute(fn: () => Promise<void>): Promise<void> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttemptAt!.getTime()) {
        throw new Error(`Circuit open. Next attempt at ${this.nextAttemptAt}`);
      }
      this.state = 'half-open';
    }
    
    try {
      await fn();
      this.failures = 0;
      this.state = 'closed';
    } catch (err) {
      this.failures++;
      if (this.failures >= this.config.maxConsecutiveFailures) {
        this.state = 'open';
        this.nextAttemptAt = new Date(Date.now() + this.config.circuitBreakerCooldownMs);
        // Notify user: "WhatsApp connection failed repeatedly. Pausing for 30 minutes."
        await this.notifyUser('circuit_open');
      }
      throw err;
    }
  }
}
```

### 1.3 User-Facing Disclaimers

When a user connects WhatsApp via Baileys, show this clearly in the UI:

```
┌─────────────────────────────────────────────────────┐
│  ⚠️ WhatsApp Connection — Important Notice           │
│                                                       │
│  This uses WhatsApp Web protocol (unofficial).        │
│  WhatsApp may restrict or ban accounts that use       │
│  automated tools.                                     │
│                                                       │
│  Recommendations:                                     │
│  • Use a dedicated phone number (not your personal)   │
│  • Use a real SIM card (not VoIP/virtual numbers)     │
│  • Keep messaging volume low (<200 msgs/day)          │
│  • Don't send bulk/spam messages                      │
│                                                       │
│  For official, compliant WhatsApp access, use         │
│  WhatsApp Business API mode instead. [Learn more]     │
│                                                       │
│  ☐ I understand the risks                             │
│                                                       │
│  [Continue with WhatsApp Web]  [Use Business API]     │
└─────────────────────────────────────────────────────┘
```

### 1.4 Telegram: No ToS Risk

Telegram's Bot API is **official and encouraged**. No risk of bans for normal usage. Rate limits are documented (30 msgs/sec to different chats, 20 msgs/min to same group). grammy handles these automatically with its built-in throttling.

---

## 2. Provider Abstraction: Baileys ↔ Cloud API

### 2.1 Why Both Providers

| | Baileys (Unofficial) | WhatsApp Cloud API (Official) |
|--|---------------------|-------------------------------|
| **Cost** | Free | Per-message (service msgs free, utility $0.004-0.046, marketing $0.025-0.14) |
| **Setup** | QR code scan, 30 seconds | Meta Business verification, hours-days |
| **Ban risk** | Real and increasing | Zero (official) |
| **Features** | Full WhatsApp Web feature set | Template-based outbound, webhooks |
| **Best for** | Personal AI assistant, dev/testing | Production, business use |
| **Infrastructure** | Persistent WebSocket process | Stateless webhooks |
| **Scale** | ~1 account per process | Multi-agent, enterprise scale |

**Our approach**: Build a `WhatsAppProvider` interface that both implementations satisfy. Start with Baileys for development and personal use. Support Cloud API as a first-class alternative for users who want compliance.

### 2.2 Provider Interface (inspired by Evolution API)

```typescript
// services/api/src/messenger-channels/channels/whatsapp/provider.ts

export interface WhatsAppProvider {
  readonly providerType: 'baileys' | 'cloud_api';
  
  // Lifecycle
  connect(config: WhatsAppProviderConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ProviderStatus;
  
  // Auth
  startPairing(): Promise<PairingResult>;  
  // Baileys: returns QR code data
  // Cloud API: returns webhook registration URL
  
  // Messaging
  sendText(jid: string, text: string, opts?: SendOpts): Promise<string>;
  sendImage(jid: string, image: Buffer, caption?: string): Promise<string>;
  sendDocument(jid: string, doc: Buffer, filename: string, mime: string): Promise<string>;
  sendTyping(jid: string): Promise<void>;
  sendReadReceipt(jid: string, messageIds: string[]): Promise<void>;
  
  // Inbound
  onMessage(handler: (msg: RawWhatsAppMessage) => void): void;
  onStatusChange(handler: (status: ProviderStatus) => void): void;
  
  // Info
  getContactInfo(jid: string): Promise<ContactInfo | null>;
  getGroupMetadata(jid: string): Promise<GroupMetadata | null>;
}

// Config discriminated by provider type
export type WhatsAppProviderConfig = 
  | { type: 'baileys'; authState: BaileysAuthState; antiBan: AntiBanConfig }
  | { type: 'cloud_api'; phoneNumberId: string; accessToken: string; webhookSecret: string; bspConfig?: BSPConfig };

// BSP options for Cloud API
export interface BSPConfig {
  provider: 'meta_direct' | 'kapso' | '360dialog' | 'twilio';
  apiBaseUrl?: string;  // Override for BSP-specific endpoints
  extraHeaders?: Record<string, string>;
}
```

### 2.3 Provider Factory

```typescript
// services/api/src/messenger-channels/channels/whatsapp/provider-factory.ts

export function createWhatsAppProvider(config: WhatsAppProviderConfig): WhatsAppProvider {
  switch (config.type) {
    case 'baileys':
      return new BaileysProvider(config);
    case 'cloud_api':
      return new CloudApiProvider(config);
  }
}
```

### 2.4 Cloud API Provider Sketch

```typescript
// services/api/src/messenger-channels/channels/whatsapp/providers/cloud-api.ts

class CloudApiProvider implements WhatsAppProvider {
  readonly providerType = 'cloud_api';
  private accessToken: string;
  private phoneNumberId: string;
  private messageHandlers: Array<(msg: RawWhatsAppMessage) => void> = [];
  
  async connect(config: WhatsAppProviderConfig & { type: 'cloud_api' }) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    // Verify token
    const resp = await fetch(`https://graph.facebook.com/v21.0/${this.phoneNumberId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!resp.ok) throw new Error('Invalid Cloud API credentials');
  }
  
  async sendText(jid: string, text: string): Promise<string> {
    // Cloud API uses phone numbers directly, not JIDs
    const phone = jidToPhone(jid);
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: text },
        }),
      }
    );
    const data = await resp.json();
    return data.messages[0].id;
  }
  
  async sendImage(jid: string, image: Buffer, caption?: string): Promise<string> {
    // Upload media first, then send
    const mediaId = await this.uploadMedia(image, 'image/png');
    const phone = jidToPhone(jid);
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'image',
          image: { id: mediaId, caption },
        }),
      }
    );
    const data = await resp.json();
    return data.messages[0].id;
  }
  
  // Webhook handler (called from API route)
  handleWebhook(body: CloudApiWebhookPayload): void {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages') {
          for (const msg of change.value.messages || []) {
            const normalized = this.normalizeCloudApiMessage(msg, change.value);
            for (const handler of this.messageHandlers) {
              handler(normalized);
            }
          }
        }
      }
    }
  }
  
  startPairing(): Promise<PairingResult> {
    // Cloud API doesn't need QR pairing — it's webhook-based
    return Promise.resolve({
      type: 'webhook_setup',
      instructions: 'Configure your Meta webhook URL and verify the token.',
      webhookUrl: `${API_URL}/messenger-channels/whatsapp/webhook`,
    });
  }
}
```

### 2.5 Migration Path

Users can start with Baileys for free and migrate to Cloud API without any changes to their conversation history, pairing, or project links:

```
messenger_channels row:
  channel_type: 'whatsapp'
  config_encrypted: { 
    providerType: 'baileys',    ← change this to 'cloud_api'
    ...baileys_auth_state        ← replace with cloud_api_credentials
  }

Everything else (conversations, messages, project links) stays unchanged.
The WhatsApp connector detects providerType and instantiates the right provider.
```

UI flow for migration:
1. User goes to channel settings → "Switch to Business API"
2. Enter Cloud API credentials (phone number ID, access token)
3. System validates credentials
4. Updates config_encrypted, reconnects with CloudApiProvider
5. All existing conversations continue seamlessly

---

## 3. Multi-Purpose Capability Architecture

### 3.1 The Problem with Single-Purpose Channels

PRD 21 designed channels as single-purpose AI chat pipes. But a connected WhatsApp/Telegram account is a **general-purpose communication channel** that should serve multiple needs:

| Purpose | Example |
|---------|---------|
| **AI Chat** | "Make the button bigger" → AI edits code → responds |
| **User Chat** | Team member sends message → appears in Doable team chat |
| **Screenshots** | Scheduled or on-demand preview screenshots delivered to messenger |
| **Notifications** | "Build failed" / "John deployed v2.1" / "New comment on your project" |
| **Approvals** | "AI wants to delete 3 files. Approve? [Yes] [No]" |

All of these should flow through the **same WhatsApp/Telegram connection** — no need for separate bots or numbers per purpose.

### 3.2 Capability System

Instead of a monolithic `ChannelConnector`, we split functionality into composable **capabilities** that different parts of Doable consume independently:

```typescript
// services/api/src/messenger-channels/capabilities/types.ts

// ─── Core Capability Interfaces ──────────────────────────

export interface SendCapability {
  readonly type: 'send';
  sendText(conversationId: string, text: string, opts?: SendOpts): Promise<string>;
}

export interface ListenCapability {
  readonly type: 'listen';
  onMessage(handler: (msg: NormalizedMessage) => void): void;
  removeHandler(handler: Function): void;
}

export interface MediaCapability {
  readonly type: 'media';
  sendImage(conversationId: string, image: Buffer, caption?: string): Promise<string>;
  sendDocument(conversationId: string, doc: Buffer, filename: string, mime: string): Promise<string>;
  downloadMedia(message: NormalizedMessage): Promise<Buffer>;
}

export interface PresenceCapability {
  readonly type: 'presence';
  sendTyping(conversationId: string): Promise<void>;
  sendReadReceipt(conversationId: string, messageIds: string[]): Promise<void>;
}

export interface GroupCapability {
  readonly type: 'group';
  getGroupInfo(groupId: string): Promise<GroupInfo>;
  getGroupMembers(groupId: string): Promise<GroupMember[]>;
}

// ─── Capability Registry ─────────────────────────────────

export type ChannelCapability = 
  | SendCapability 
  | ListenCapability 
  | MediaCapability 
  | PresenceCapability 
  | GroupCapability;

export type CapabilityType = ChannelCapability['type'];

// ─── Channel with Capabilities ───────────────────────────

export interface CapableChannel {
  readonly channelId: string;
  readonly channelType: 'whatsapp' | 'telegram';
  readonly status: ChannelStatus;
  
  getCapability<T extends ChannelCapability>(type: T['type']): T | null;
  hasCapability(type: CapabilityType): boolean;
  listCapabilities(): CapabilityType[];
}
```

### 3.3 How Each Channel Exposes Capabilities

**WhatsApp (Baileys):**
- `send` ✓ — `sock.sendMessage(jid, { text })`
- `listen` ✓ — `sock.ev.on('messages.upsert', ...)`
- `media` ✓ — `sock.sendMessage(jid, { image: buffer })`, `downloadMediaMessage(msg)`
- `presence` ✓ — `sock.sendPresenceUpdate('composing', jid)`, `sock.readMessages([key])`
- `group` ✓ — `sock.groupMetadata(jid)`, `sock.groupFetchAllParticipating()`

**WhatsApp (Cloud API):**
- `send` ✓ — POST `/messages` with text payload
- `listen` ✓ — Webhook handler for incoming messages
- `media` ✓ — Upload media → POST `/messages` with media ID
- `presence` ✗ — Cloud API doesn't support typing indicators or read receipts outbound
- `group` ✗ — Cloud API doesn't support group management

**Telegram (grammy):**
- `send` ✓ — `bot.api.sendMessage(chatId, text)`
- `listen` ✓ — `bot.on('message', ...)`
- `media` ✓ — `bot.api.sendPhoto(chatId, buffer)`, `bot.api.getFile(fileId)`
- `presence` ✓ — `bot.api.sendChatAction(chatId, 'typing')`
- `group` ✓ — `bot.api.getChat(chatId)`, `bot.api.getChatMemberCount(chatId)`

### 3.4 Consumers of Capabilities

Each part of Doable that needs messenger access requests specific capabilities — it never touches the raw channel:

```
┌─────────────────────────────────────────────────────────┐
│                    DOABLE SYSTEMS                         │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ AI Chat      │  │ User Chat    │  │ Screenshot    │ │
│  │ Bridge       │  │ Bridge       │  │ Delivery      │ │
│  │              │  │              │  │               │ │
│  │ needs:       │  │ needs:       │  │ needs:        │ │
│  │ • listen     │  │ • listen     │  │ • media       │ │
│  │ • send       │  │ • send       │  │ • send        │ │
│  │ • media      │  │ • presence   │  │               │ │
│  │ • presence   │  │              │  │               │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘ │
│         │                 │                   │          │
│  ┌──────▼─────────────────▼───────────────────▼───────┐ │
│  │              Message Router                         │ │
│  │  (routes inbound messages to correct consumer)      │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                 │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │           Capability Registry                        │ │
│  │  channel.getCapability('send') → SendCapability      │ │
│  │  channel.getCapability('media') → MediaCapability    │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                 │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │     WhatsApp Channel    │    Telegram Channel        │ │
│  │     (Baileys / Cloud)   │    (grammy)                │ │
│  └─────────────────────────┴────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Message Router: One Connection, Many Purposes

### 4.1 Purpose-Based Routing

When a message arrives from WhatsApp/Telegram, the router must decide: is this for the AI? For team chat? A command? The router uses a **priority-ordered rule chain** (inspired by Enterprise Integration Patterns' Content-Based Router):

```typescript
// services/api/src/messenger-channels/router/types.ts

export type MessagePurpose = 
  | 'ai_chat'        // Route to AI copilot
  | 'team_chat'      // Bridge to Doable team chat
  | 'command'         // Bot command (/link, /unlink, /screenshot, /help)
  | 'approval'        // Response to an approval request
  | 'ignore';         // Don't process (echo, system message, etc.)

export interface RoutingRule {
  id: string;
  priority: number;   // Higher = checked first
  matches(ctx: InboundContext): boolean;
  purpose: MessagePurpose;
}

export interface InboundContext {
  message: NormalizedMessage;
  conversation: MessengerConversation;  // DB record with project_id, chat_type, etc.
  channel: MessengerChannel;            // DB record with channel_type, user_id, etc.
}
```

### 4.2 Default Routing Rules

```typescript
// services/api/src/messenger-channels/router/default-rules.ts

export const defaultRules: RoutingRule[] = [
  // ── Priority 100: Commands always take precedence ──
  {
    id: 'commands',
    priority: 100,
    matches: (ctx) => ctx.message.body.startsWith('/'),
    purpose: 'command',
  },
  
  // ── Priority 90: Approval responses ──
  {
    id: 'approvals',
    priority: 90,
    matches: (ctx) => {
      // Check if there's a pending approval for this conversation
      return ctx.message.metadata?.callbackData?.startsWith('approval:') ?? false;
    },
    purpose: 'approval',
  },
  
  // ── Priority 80: Explicit AI prefix ──
  {
    id: 'ai_explicit',
    priority: 80,
    matches: (ctx) => {
      const body = ctx.message.body.toLowerCase();
      return body.startsWith('@ai ') || body.startsWith('ai:');
    },
    purpose: 'ai_chat',
  },
  
  // ── Priority 50: DMs default to AI chat (when project is linked) ──
  {
    id: 'dm_to_ai',
    priority: 50,
    matches: (ctx) => {
      return ctx.message.chatType === 'direct' 
        && ctx.conversation.project_id !== null;
    },
    purpose: 'ai_chat',
  },
  
  // ── Priority 40: Group messages with @mention → AI ──
  {
    id: 'group_mention_ai',
    priority: 40,
    matches: (ctx) => {
      return ctx.message.chatType === 'group'
        && ctx.message.wasMentioned === true;
    },
    purpose: 'ai_chat',
  },
  
  // ── Priority 30: Group messages without @mention → team chat ──
  {
    id: 'group_to_team_chat',
    priority: 30,
    matches: (ctx) => {
      return ctx.message.chatType === 'group'
        && ctx.conversation.project_id !== null;
    },
    purpose: 'team_chat',
  },
  
  // ── Priority 0: Fallback — unlinked conversations get welcome ──
  {
    id: 'fallback',
    priority: 0,
    matches: () => true,
    purpose: 'command',  // Routes to command handler which shows pairing instructions
  },
];
```

### 4.3 Router Implementation

```typescript
// services/api/src/messenger-channels/router/message-router.ts

export class MessageRouter {
  private rules: RoutingRule[];
  private handlers: Map<MessagePurpose, PurposeHandler>;
  
  constructor() {
    this.rules = [...defaultRules].sort((a, b) => b.priority - a.priority);
    this.handlers = new Map();
  }
  
  registerHandler(purpose: MessagePurpose, handler: PurposeHandler): void {
    this.handlers.set(purpose, handler);
  }
  
  // Extensible: users/plugins can add custom rules
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }
  
  async route(ctx: InboundContext): Promise<void> {
    // Find matching rule
    for (const rule of this.rules) {
      if (rule.matches(ctx)) {
        const handler = this.handlers.get(rule.purpose);
        if (handler) {
          await handler.handle(ctx);
          return;
        }
      }
    }
    // Should never reach here (fallback rule catches all)
  }
}
```

### 4.4 Routing Summary by Scenario

| Scenario | Message | Routed To |
|----------|---------|-----------|
| DM to bot: "make the button red" | Direct, no prefix | **AI Chat** (DMs default to AI) |
| DM to bot: "/link AXBK-3N7P" | Direct, command prefix | **Command** (pair to project) |
| DM to bot: "/screenshot" | Direct, command prefix | **Command** (capture & send preview) |
| Group msg: "@bot fix the header" | Group, bot mentioned | **AI Chat** (explicit mention) |
| Group msg: "hey team, the design looks good" | Group, no mention | **Team Chat** (bridge to Doable) |
| Group msg: "/help" | Group, command prefix | **Command** (show help) |
| Inline button: "[Approve]" | Callback data | **Approval** (process approval) |

---

## 5. AI Chat Over Messenger

### 5.1 Integration with Existing Chat Pipeline

The AI Chat handler reuses the existing `chat.ts` pipeline — specifically the core AI processing logic — but adapts input/output for messenger:

```typescript
// services/api/src/messenger-channels/handlers/ai-chat-handler.ts

export class AiChatHandler implements PurposeHandler {
  async handle(ctx: InboundContext): Promise<void> {
    const { message, conversation, channel } = ctx;
    const connector = channelManager.getConnector(channel.id);
    
    // 1. Send typing indicator
    const presence = connector?.getCapability<PresenceCapability>('presence');
    await presence?.sendTyping(message.conversationId);
    
    // 2. Download any media attachments
    const attachments = await this.processMedia(message, connector);
    
    // 3. Build messenger-specific context for the AI
    const messengerContext = this.buildContext(message, conversation);
    
    // 4. Call the SAME AI pipeline as web chat
    //    (refactored from chat.ts into a shared function)
    const response = await processAiChat({
      projectId: conversation.project_id!,
      userId: channel.user_id,
      workspaceId: channel.workspace_id,
      content: message.body,
      attachments,
      source: 'messenger',
      sourceContext: messengerContext,
      // Collect full response (no streaming for messenger)
      streamingMode: 'collect',
    });
    
    // 5. Format response for messenger
    const formatted = this.formatForMessenger(response, message.channelType);
    
    // 6. Send response back through messenger
    const send = connector?.getCapability<SendCapability>('send');
    const media = connector?.getCapability<MediaCapability>('media');
    
    for (const part of formatted) {
      // Keep typing while sending multi-part responses
      await presence?.sendTyping(message.conversationId);
      
      if (part.type === 'text') {
        await send?.sendText(message.conversationId, part.text);
      } else if (part.type === 'image') {
        await media?.sendImage(message.conversationId, part.buffer, part.caption);
      }
      
      // Anti-ban: delay between parts
      await sleep(randomBetween(1000, 2000));
    }
    
    // 7. Mark as read
    await presence?.sendReadReceipt(message.conversationId, [message.externalId]);
    
    // 8. Broadcast to Doable web clients
    await broadcastToRoom(conversation.project_id!, {
      type: 'messenger:ai_chat',
      channelType: message.channelType,
      senderName: message.sender.name || 'Unknown',
      userMessage: message.body,
      aiResponse: response.content,
      timestamp: Date.now(),
    });
  }
  
  private buildContext(msg: NormalizedMessage, conv: MessengerConversation): string {
    return [
      `User is chatting via ${msg.channelType === 'whatsapp' ? 'WhatsApp' : 'Telegram'}.`,
      `Sender: ${msg.sender.name || 'Unknown'}${msg.sender.phone ? ` (${msg.sender.phone})` : ''}.`,
      msg.chatType === 'group' ? `This is a group chat: "${conv.group_subject}". Only respond to messages that mention you.` : '',
      'Keep responses concise and mobile-friendly.',
      'Use plain text — no HTML. Markdown is OK for Telegram, use sparingly for WhatsApp.',
      'For code blocks, keep them short. Long code should be summarized with key changes noted.',
    ].filter(Boolean).join('\n');
  }
  
  private formatForMessenger(
    response: AiChatResponse, 
    channelType: 'whatsapp' | 'telegram'
  ): MessagePart[] {
    const parts: MessagePart[] = [];
    let text = response.content;
    
    // Split long responses into chunks
    const maxLen = channelType === 'whatsapp' ? 4096 : 4096; // Both have practical limits
    
    if (text.length <= maxLen) {
      parts.push({ type: 'text', text });
    } else {
      // Split at paragraph boundaries
      const chunks = this.splitAtParagraphs(text, maxLen);
      for (const chunk of chunks) {
        parts.push({ type: 'text', text: chunk });
      }
    }
    
    // If AI generated/modified files, offer to send a screenshot
    if (response.hadToolCalls && response.modifiedFiles?.length) {
      const lastChunk = parts[parts.length - 1];
      if (lastChunk.type === 'text') {
        lastChunk.text += '\n\n📸 Send /screenshot to see the live preview.';
      }
    }
    
    return parts;
  }
}
```

### 5.2 Messenger System Prompt Injection

The existing `buildProjectContextForMode()` in `chat.ts` gets a new section when `source === 'messenger'`:

```
## Messenger Context

The user is chatting from {WhatsApp/Telegram}. Adapt your responses:

- Keep responses concise. Mobile screens are small.
- Avoid large code blocks. Summarize changes: "I updated the header component to use a 
  gradient background and increased the font size to 2rem."
- When you make changes, briefly describe what you did. They can see the live preview 
  in Doable or request a screenshot via /screenshot.
- Use plain text for WhatsApp. Telegram supports Markdown.
- If the task requires seeing the UI, suggest: "Send /screenshot to see the current preview."
- Multiple rapid tool calls are fine — the user won't see them individually. 
  They'll only see your final response.
```

---

## 6. User-to-User Chat Bridging

### 6.1 Concept

When a group chat on WhatsApp/Telegram is linked to a Doable project, messages that **don't** trigger the AI should be bridged to Doable's team chat — and vice versa. This lets team members who aren't in Doable participate in project discussions.

```
WhatsApp Group: "Design Team"          Doable Project: "Landing Page"
  │                                       │
  │ Alice: "The hero looks great!"        │
  │    ↓ bridge ↓                         │
  │                                       │ [📱 Alice]: "The hero looks great!"
  │                                       │
  │                                       │ Bob: "Thanks! I'll add the CTA next"
  │                                       │    ↓ bridge ↓
  │ [Doable] Bob: "Thanks! I'll add      │
  │  the CTA next"                        │
  │                                       │
  │ Alice: "@bot make the CTA red"        │
  │    ↓ AI route (mentioned) ↓           │
  │                                       │ [📱 Alice → AI]: "make the CTA red"
  │ [AI]: "Done! Updated the CTA..."      │ [AI]: "Done! Updated the CTA..."
```

### 6.2 Team Chat Bridge Handler

```typescript
// services/api/src/messenger-channels/handlers/team-chat-handler.ts

export class TeamChatHandler implements PurposeHandler {
  async handle(ctx: InboundContext): Promise<void> {
    const { message, conversation, channel } = ctx;
    
    if (!conversation.project_id) return;
    
    // 1. Persist as team chat message (existing team-chat system)
    const teamMessage = await createTeamChatMessage({
      projectId: conversation.project_id,
      userId: channel.user_id,       // The Doable user who owns this channel
      content: message.body,
      metadata: {
        source: 'messenger',
        channelType: message.channelType,
        senderName: message.sender.name,
        senderPhone: message.sender.phone,
        senderUsername: message.sender.username,
        externalMessageId: message.externalId,
      },
    });
    
    // 2. Broadcast to Doable web clients via WebSocket
    await broadcastToRoom(conversation.project_id, {
      type: 'team-chat:message',
      message: {
        id: teamMessage.id,
        content: message.body,
        sender: {
          name: message.sender.name || 'Unknown',
          source: message.channelType,
          avatar: null,
        },
        timestamp: message.timestamp.toISOString(),
      },
    });
    
    // 3. If there are media attachments, download and include
    if (message.media?.length) {
      const connector = channelManager.getConnector(channel.id);
      const mediaCap = connector?.getCapability<MediaCapability>('media');
      
      for (const m of message.media) {
        const buffer = await mediaCap?.downloadMedia(message);
        if (buffer) {
          // Store locally and create attachment record
          await storeTeamChatAttachment(teamMessage.id, buffer, m.mimeType, m.filename);
        }
      }
    }
  }
}
```

### 6.3 Reverse Bridge: Doable → Messenger

When a Doable user sends a team chat message in the web app, it should also appear in the linked messenger group:

```typescript
// services/api/src/messenger-channels/bridges/outbound-team-chat.ts

export class OutboundTeamChatBridge {
  // Called when a team chat message is created in Doable web UI
  async onTeamChatMessage(projectId: string, message: TeamChatMessage): Promise<void> {
    // Skip if this message originated from messenger (prevent echo)
    if (message.metadata?.source === 'messenger') return;
    
    // Find all messenger conversations linked to this project with team_chat bridging enabled
    const conversations = await getLinkedConversations(projectId, { 
      chatType: 'group',
      bridgeTeamChat: true,
    });
    
    for (const conv of conversations) {
      const connector = channelManager.getConnector(conv.channel_id);
      const send = connector?.getCapability<SendCapability>('send');
      
      if (send) {
        const formatted = `[Doable] ${message.senderName}: ${message.content}`;
        await send.sendText(conv.external_conversation_id, formatted);
      }
    }
  }
}
```

### 6.4 Bridge Configuration

Not all linked groups should bridge team chat. The conversation record has a `config` field:

```sql
-- Added to messenger_conversations
ALTER TABLE messenger_conversations ADD COLUMN config JSONB DEFAULT '{}';

-- Config shape:
-- {
--   "bridge_team_chat": true,       -- Bridge group messages to Doable team chat
--   "bridge_doable_to_messenger": true, -- Bridge Doable messages to messenger group
--   "ai_requires_mention": true,    -- Only trigger AI when @mentioned (groups)
--   "screenshot_on_deploy": false,  -- Auto-send screenshot after deploy
--   "notifications": ["deploy", "error", "comment"]  -- Which notifications to send
-- }
```

Users configure this in the Doable project settings → Messenger Links section.

---

## 7. Preview Screenshot Delivery

### 7.1 Existing Screenshot Pipeline

Doable already has a **full Puppeteer screenshot system** in `services/api/src/thumbnails/capture.ts`:

- `captureProjectThumbnail(projectId, previewUrl, options)` — navigates to preview URL, waits for `networkidle0`, captures PNG
- `getBrowser()` — lazy-loaded shared Puppeteer instance
- Viewport: 1280x720
- Health check: verifies no Vite error overlays before capture
- Stored at `./thumbnails/{projectId}.png`

The preview system uses a **reverse proxy** at `/preview/:projectId/` that forwards to per-project Vite dev servers (ports 3100-3200).

### 7.2 Screenshot Delivery Pipeline

```
Trigger (command, schedule, or auto)
  │
  ├─ 1. Capture screenshot via existing Puppeteer pipeline
  │     captureProjectThumbnail(projectId, previewUrl, { fresh: true })
  │
  ├─ 2. Optimize for mobile messenger viewing
  │     Sharp: resize to 1280px max width, WebP quality 80
  │     For text-heavy UIs: keep PNG (JPEG/WebP destroys text readability)
  │
  ├─ 3. Send via channel's MediaCapability
  │     WhatsApp: sock.sendMessage(jid, { image: buffer, caption })
  │     Telegram: bot.api.sendPhoto(chatId, InputFile.fromBuffer(buffer))
  │
  └─ 4. Log delivery in messenger_messages table
```

### 7.3 Screenshot Handler Implementation

```typescript
// services/api/src/messenger-channels/handlers/screenshot-handler.ts

import { captureProjectThumbnail, getBrowser } from '../../thumbnails/capture';
import sharp from 'sharp';

export class ScreenshotHandler {
  /**
   * Capture and send a preview screenshot to a messenger conversation.
   * Can be triggered by:
   * - /screenshot command from messenger
   * - AI suggesting "send /screenshot to see preview"
   * - Automated trigger after deploy
   * - Scheduled delivery
   */
  async captureAndSend(params: {
    projectId: string;
    conversationId: string;  // external conversation ID
    channelId: string;       // messenger_channels.id
    caption?: string;
    viewport?: { width: number; height: number };
    fullPage?: boolean;
  }): Promise<void> {
    const { projectId, conversationId, channelId, caption, viewport, fullPage } = params;
    
    const connector = channelManager.getConnector(channelId);
    const media = connector?.getCapability<MediaCapability>('media');
    const send = connector?.getCapability<SendCapability>('send');
    
    if (!media) {
      await send?.sendText(conversationId, 'Screenshot not available for this channel.');
      return;
    }
    
    // 1. Capture using existing Puppeteer pipeline
    const previewUrl = `http://127.0.0.1:4000/preview/${projectId}/`;
    
    try {
      // Use a dedicated capture (not the thumbnail cache) for fresh screenshots
      const screenshotBuffer = await this.capturePreview(previewUrl, {
        viewport: viewport || { width: 1280, height: 720 },
        fullPage: fullPage || false,
      });
      
      // 2. Optimize for messenger
      const optimized = await this.optimizeForMessenger(
        screenshotBuffer, 
        connector!.channelType
      );
      
      // 3. Send via messenger
      const messageCaption = caption || `📸 Preview — ${new Date().toLocaleString()}`;
      await media.sendImage(conversationId, optimized, messageCaption);
      
    } catch (err) {
      await send?.sendText(
        conversationId, 
        `⚠️ Couldn't capture screenshot: ${err instanceof Error ? err.message : 'Unknown error'}. The preview might not be running.`
      );
    }
  }
  
  private async capturePreview(
    url: string, 
    opts: { viewport: { width: number; height: number }; fullPage: boolean }
  ): Promise<Buffer> {
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    try {
      await page.setViewport(opts.viewport);
      await page.goto(url, { 
        waitUntil: 'networkidle0', 
        timeout: 30000 
      });
      
      // Wait an extra second for animations/transitions
      await new Promise(r => setTimeout(r, 1000));
      
      // Check for Vite error overlay
      const hasError = await page.evaluate(() => {
        return !!document.querySelector('vite-error-overlay');
      });
      
      if (hasError) {
        throw new Error('Preview has build errors. Fix them first, then try again.');
      }
      
      return await page.screenshot({ 
        type: 'png',
        fullPage: opts.fullPage,
        encoding: 'binary',
      }) as Buffer;
      
    } finally {
      await page.close();
    }
  }
  
  private async optimizeForMessenger(
    screenshot: Buffer, 
    channelType: 'whatsapp' | 'telegram'
  ): Promise<Buffer> {
    // Analyze if this is text-heavy (code/UI) or photo-like
    const metadata = await sharp(screenshot).metadata();
    
    // For both WhatsApp and Telegram, resize to reasonable mobile dimensions
    // WhatsApp aggressively recompresses anyway, so keep quality high
    let pipeline = sharp(screenshot)
      .resize(1280, null, { 
        withoutEnlargement: true, 
        fit: 'inside' 
      });
    
    if (channelType === 'whatsapp') {
      // WhatsApp recompresses everything, so send as high-quality PNG
      // to minimize double-compression artifacts
      return pipeline.png({ quality: 90 }).toBuffer();
    } else {
      // Telegram preserves quality better, WebP is fine
      return pipeline.webp({ quality: 85 }).toBuffer();
    }
  }
}
```

### 7.4 Screenshot Command

```typescript
// In the command handler:

case '/screenshot': {
  if (!conversation.project_id) {
    await send('Link this chat to a project first: /link CODE');
    return;
  }
  
  // Parse optional args: /screenshot full (full page) or /screenshot 1920x1080
  const args = message.body.split(' ').slice(1);
  let fullPage = false;
  let viewport = { width: 1280, height: 720 };
  
  for (const arg of args) {
    if (arg === 'full') fullPage = true;
    const match = arg.match(/^(\d+)x(\d+)$/);
    if (match) viewport = { width: +match[1], height: +match[2] };
  }
  
  await send('📸 Capturing preview...');
  
  await screenshotHandler.captureAndSend({
    projectId: conversation.project_id,
    conversationId: conversation.external_conversation_id,
    channelId: channel.id,
    viewport,
    fullPage,
  });
  break;
}
```

### 7.5 Auto-Screenshot After AI Changes

When the AI makes visual changes (edits CSS, modifies components), automatically offer or send a screenshot:

```typescript
// In the AI Chat handler, after AI response:

if (response.hadToolCalls && response.modifiedFiles?.some(f => 
  f.endsWith('.css') || f.endsWith('.tsx') || f.endsWith('.jsx') || f.endsWith('.html')
)) {
  // Auto-send screenshot for visual changes
  // Small delay to let HMR/rebuild finish
  setTimeout(async () => {
    await screenshotHandler.captureAndSend({
      projectId: conversation.project_id!,
      conversationId: message.conversationId,
      channelId: channel.id,
      caption: '📸 Here\'s how it looks now',
    });
  }, 3000);  // 3s delay for Vite HMR
}
```

### 7.6 Scheduled Screenshot Delivery

For conversations configured with `screenshot_on_deploy: true`:

```typescript
// Called by the deploy pipeline after a successful deploy
export async function sendDeployScreenshots(projectId: string): Promise<void> {
  const conversations = await getLinkedConversations(projectId, {
    configFilter: { screenshot_on_deploy: true },
  });
  
  for (const conv of conversations) {
    await screenshotHandler.captureAndSend({
      projectId,
      conversationId: conv.external_conversation_id,
      channelId: conv.channel_id,
      caption: '🚀 Deployed! Here\'s the latest version.',
    });
  }
}
```

---

## 8. Notifications & Alerts Over Messenger

### 8.1 Notification Types

Linked conversations can opt into notifications via the `config.notifications` array:

| Event | Message |
|-------|---------|
| `deploy` | "🚀 Project deployed by {user}" + optional screenshot |
| `error` | "❌ Build error: {error summary}" |
| `comment` | "💬 {user} commented: {text}" |
| `collaborator_joined` | "👋 {user} joined the project" |
| `ai_completed` | "✅ AI finished: {summary of changes}" |
| `approval_needed` | "🔔 AI wants to {action}. Approve? [Yes] [No]" (inline keyboard for Telegram) |

### 8.2 Notification Dispatcher

```typescript
// services/api/src/messenger-channels/notifications/dispatcher.ts

export class MessengerNotificationDispatcher {
  async dispatch(event: ProjectEvent): Promise<void> {
    // Find all conversations subscribed to this event type
    const conversations = await getLinkedConversations(event.projectId, {
      configFilter: { notifications: { $contains: event.type } },
    });
    
    for (const conv of conversations) {
      const connector = channelManager.getConnector(conv.channel_id);
      const send = connector?.getCapability<SendCapability>('send');
      
      if (!send) continue;
      
      const message = this.formatNotification(event, conv);
      await send.sendText(conv.external_conversation_id, message);
      
      // For deploy events with screenshot config, also send screenshot
      if (event.type === 'deploy' && conv.config?.screenshot_on_deploy) {
        await screenshotHandler.captureAndSend({
          projectId: event.projectId,
          conversationId: conv.external_conversation_id,
          channelId: conv.channel_id,
          caption: '🚀 Latest deploy preview',
        });
      }
    }
  }
  
  private formatNotification(event: ProjectEvent, conv: MessengerConversation): string {
    switch (event.type) {
      case 'deploy':
        return `🚀 *Deploy* — ${event.data.userName} deployed the project.`;
      case 'error':
        return `❌ *Build Error*\n\`${event.data.error}\`\n\nFix it by chatting here or in Doable.`;
      case 'comment':
        return `💬 *${event.data.userName}*: ${event.data.text}`;
      case 'collaborator_joined':
        return `👋 ${event.data.userName} joined the project.`;
      case 'ai_completed':
        return `✅ AI finished: ${event.data.summary}`;
      default:
        return `📌 ${event.type}: ${JSON.stringify(event.data)}`;
    }
  }
}
```

### 8.3 Approval Requests (Telegram Only — Inline Keyboards)

Telegram supports inline keyboards, enabling interactive approvals:

```typescript
// When AI needs approval for a destructive action:
async function requestApproval(
  conv: MessengerConversation,
  action: string,
  details: string
): Promise<void> {
  const connector = channelManager.getConnector(conv.channel_id);
  
  if (connector?.channelType === 'telegram') {
    // Telegram: send with inline keyboard buttons
    const send = connector.getCapability<SendCapability>('send');
    await send?.sendText(
      conv.external_conversation_id,
      `🔔 *Approval needed*\n\nAI wants to: ${action}\n\n${details}`,
      {
        buttons: [
          { text: '✅ Approve', callbackData: `approval:${action}:approve` },
          { text: '❌ Deny', callbackData: `approval:${action}:deny` },
        ]
      }
    );
  } else {
    // WhatsApp: no inline buttons, use text-based approval
    const send = connector?.getCapability<SendCapability>('send');
    await send?.sendText(
      conv.external_conversation_id,
      `🔔 Approval needed\n\nAI wants to: ${action}\n${details}\n\nReply "yes" to approve or "no" to deny.`
    );
  }
}
```

---

## 9. Updated Data Model

These additions extend the schema from PRD 21:

```sql
-- ============================================================
-- Additions to 038_messenger_channels.sql
-- ============================================================

-- Add config column to messenger_conversations for per-conversation settings
-- (already defined in PRD 21, but expanded config shape)
-- Config JSON shape:
-- {
--   "bridge_team_chat": boolean,          -- Bridge group msgs to Doable team chat
--   "bridge_doable_to_messenger": boolean,-- Bridge Doable msgs to messenger
--   "ai_requires_mention": boolean,       -- Only trigger AI on @mention (groups)
--   "screenshot_on_deploy": boolean,      -- Auto-screenshot after deploy
--   "auto_screenshot_after_ai": boolean,  -- Auto-screenshot after AI visual changes
--   "notifications": string[],            -- Event types to notify about
--   "routing_mode": string                -- "ai_only" | "team_bridge" | "both"
-- }

-- Add provider_type to messenger_channels for WhatsApp provider abstraction
ALTER TABLE messenger_channels ADD COLUMN provider_type TEXT;
-- 'baileys' | 'cloud_api' for whatsapp channels, NULL for telegram

-- Notification subscription table (optional, for more granular control)
CREATE TABLE messenger_notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES messenger_conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,              -- 'deploy', 'error', 'comment', etc.
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, event_type)
);

-- Anti-ban state tracking for WhatsApp channels
CREATE TABLE messenger_channel_health (
  channel_id UUID PRIMARY KEY REFERENCES messenger_channels(id) ON DELETE CASCADE,
  messages_sent_today INTEGER DEFAULT 0,
  messages_sent_this_hour INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  warm_up_started_at TIMESTAMPTZ,        -- When the number was first connected
  warm_up_complete BOOLEAN DEFAULT false,
  circuit_breaker_state TEXT DEFAULT 'closed', -- 'closed' | 'open' | 'half_open'
  circuit_breaker_failures INTEGER DEFAULT 0,
  circuit_breaker_next_attempt TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Reset daily/hourly counters (run via pg_cron or application cron)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('reset_hourly_msg_count', '0 * * * *', 
--   $$UPDATE messenger_channel_health SET messages_sent_this_hour = 0$$);
-- SELECT cron.schedule('reset_daily_msg_count', '0 0 * * *', 
--   $$UPDATE messenger_channel_health SET messages_sent_today = 0$$);
```

---

## 10. Updated File Structure

Expanding the file structure from PRD 21 to reflect the multi-purpose capability system:

```
services/api/src/
├── messenger-channels/
│   ├── types.ts                          # All shared types
│   ├── channel-manager.ts                # Singleton lifecycle manager
│   ├── factory.ts                        # Channel connector factory
│   │
│   ├── capabilities/
│   │   ├── types.ts                      # Capability interfaces
│   │   ├── send.ts                       # SendCapability
│   │   ├── listen.ts                     # ListenCapability
│   │   ├── media.ts                      # MediaCapability
│   │   ├── presence.ts                   # PresenceCapability
│   │   └── group.ts                      # GroupCapability
│   │
│   ├── router/
│   │   ├── types.ts                      # RoutingRule, MessagePurpose, InboundContext
│   │   ├── message-router.ts             # Priority-based content router
│   │   ├── default-rules.ts              # Default routing rules
│   │   └── debouncer.ts                  # Batch rapid messages (2s window)
│   │
│   ├── handlers/
│   │   ├── ai-chat-handler.ts            # AI chat purpose handler
│   │   ├── team-chat-handler.ts          # User chat bridge handler
│   │   ├── command-handler.ts            # /link, /unlink, /screenshot, /help
│   │   ├── approval-handler.ts           # Process approval responses
│   │   └── screenshot-handler.ts         # Capture & send preview screenshots
│   │
│   ├── bridges/
│   │   ├── outbound-team-chat.ts         # Doable team chat → messenger
│   │   └── outbound-notifications.ts     # Project events → messenger
│   │
│   ├── notifications/
│   │   └── dispatcher.ts                 # Event → notification routing
│   │
│   ├── pairing/
│   │   ├── pairing.ts                    # Code gen, validation, project linking
│   │   └── welcome.ts                    # First-contact messages
│   │
│   ├── anti-ban/
│   │   ├── rate-limiter.ts               # Sliding window rate limiting
│   │   ├── warm-up.ts                    # 7-day gradual activity ramp
│   │   ├── circuit-breaker.ts            # Reconnection protection
│   │   └── typing-simulator.ts           # Human-like delays + jitter
│   │
│   ├── channels/
│   │   ├── whatsapp/
│   │   │   ├── connector.ts              # WhatsAppConnector (capability provider)
│   │   │   ├── provider.ts               # WhatsAppProvider interface
│   │   │   ├── provider-factory.ts       # Baileys vs Cloud API factory
│   │   │   ├── providers/
│   │   │   │   ├── baileys.ts            # BaileysProvider implementation
│   │   │   │   └── cloud-api.ts          # CloudApiProvider implementation
│   │   │   ├── auth-state.ts             # Baileys auth ↔ encrypted DB
│   │   │   ├── message-extract.ts        # WA message → NormalizedMessage
│   │   │   └── media.ts                  # Media download/upload
│   │   │
│   │   └── telegram/
│   │       ├── connector.ts              # TelegramConnector (capability provider)
│   │       ├── polling.ts                # grammy long polling
│   │       ├── message-extract.ts        # TG update → NormalizedMessage
│   │       ├── commands.ts               # Bot command registration
│   │       └── keyboards.ts              # Inline keyboard builders
│   │
│   └── __tests__/
│       ├── router.test.ts
│       ├── pairing.test.ts
│       ├── screenshot.test.ts
│       ├── anti-ban.test.ts
│       └── normalization.test.ts
│
├── routes/
│   └── messenger-channels.ts             # API routes
│
├── integrations/
│   └── registry/
│       └── messenger-channels.ts         # Catalog entries (WhatsApp, Telegram)

apps/web/src/
├── modules/
│   ├── integrations/
│   │   ├── messenger-connect-whatsapp.tsx # QR code modal + disclaimer
│   │   ├── messenger-connect-telegram.tsx # Bot token form
│   │   └── messenger-channel-status.tsx   # Connected channel status card
│   │
│   └── editor/
│       ├── chat/
│       │   └── messenger-indicator.tsx    # Visual badge for messenger messages
│       │
│       └── settings/
│           └── messenger-links.tsx        # Project settings → linked conversations

packages/db/
├── migrations/
│   └── 038_messenger_channels.sql
└── src/
    └── queries/
        └── messenger-channels.ts
```

---

## 11. Revised Implementation Phases

Updated from PRD 21 to incorporate the deeper scope:

### Phase 1: Core Infrastructure + Capabilities (6-8 days)
- [ ] Database migration (all tables from PRD 21 + additions from this PRD)
- [ ] All TypeScript types (capabilities, routing, normalized messages)
- [ ] Capability interfaces and base implementations
- [ ] Channel Manager singleton
- [ ] Message Router with default routing rules
- [ ] Pairing engine (code gen, validation, linking)
- [ ] API routes for channel CRUD and pairing
- [ ] DB query functions

### Phase 2: Telegram Connector (3-4 days)
- [ ] TelegramConnector implementing all capabilities (send, listen, media, presence, group)
- [ ] grammy long polling setup
- [ ] Message normalization
- [ ] Bot commands (/start, /link, /unlink, /help, /screenshot)
- [ ] Inline keyboard support for approvals
- [ ] Integration registry entry
- [ ] End-to-end test: create bot → connect → pair → chat

### Phase 3: WhatsApp Connector + Provider Abstraction (6-8 days)
- [ ] WhatsAppProvider interface
- [ ] BaileysProvider implementation (QR pairing, WebSocket, auth state)
- [ ] CloudApiProvider implementation (webhook handler, Meta Graph API)
- [ ] Provider factory (detect from config)
- [ ] Anti-ban middleware (rate limiter, circuit breaker, warm-up, typing simulation)
- [ ] Message normalization (all WhatsApp message wrapper types)
- [ ] Media download/upload
- [ ] ToS disclaimer UI
- [ ] End-to-end test: both providers

### Phase 4: AI Chat Handler (3-4 days)
- [ ] Refactor `chat.ts` → extract `processAiChat()` shared function
- [ ] AI Chat handler consuming listen + send + media + presence capabilities
- [ ] Messenger-specific system prompt injection
- [ ] Response collection mode (non-streaming)
- [ ] Response formatting and splitting for messenger limits
- [ ] Auto-screenshot after visual AI changes
- [ ] WebSocket broadcast for messenger AI activity

### Phase 5: Team Chat Bridge + Notifications (3-4 days)
- [ ] Team Chat handler (messenger → Doable)
- [ ] Outbound bridge (Doable → messenger)
- [ ] Echo prevention (don't bridge back messages that originated from the other side)
- [ ] Notification dispatcher
- [ ] Event hooks in existing deploy/error/comment systems
- [ ] Approval requests (Telegram inline keyboards + WhatsApp text fallback)
- [ ] Per-conversation config (notifications, bridge settings)

### Phase 6: Screenshot Delivery (2-3 days)
- [ ] Screenshot handler using existing Puppeteer pipeline
- [ ] Sharp optimization for mobile viewing
- [ ] /screenshot command with options (full page, custom viewport)
- [ ] Auto-screenshot after deploy (config-driven)
- [ ] Auto-screenshot after AI visual changes (config-driven)

### Phase 7: Frontend UI (4-5 days)
- [ ] Messenger channels in integration catalog
- [ ] WhatsApp connect flow (QR modal + disclaimer + provider choice)
- [ ] Telegram connect flow (bot token form)
- [ ] Project settings → Messenger Links (active links, pairing, config)
- [ ] Conversation config editor (notifications, bridging toggles)
- [ ] Channel status indicators
- [ ] Chat panel → messenger message indicators (📱 WhatsApp, ✈️ Telegram badges)
- [ ] Channel health dashboard (messages sent, warm-up progress, circuit breaker state)

### Phase 8: Polish & Hardening (3-4 days)
- [ ] Reconnection handling across server restarts
- [ ] Message retry queue
- [ ] Rate limiting per conversation (not just per channel)
- [ ] Voice message handling (download OGG → optional Whisper transcription)
- [ ] Group mention filtering
- [ ] Error UX (banned accounts, expired sessions, circuit breaker states)
- [ ] Message retention cleanup
- [ ] Provider migration flow (Baileys → Cloud API)
- [ ] Monitoring/observability (channel health endpoint)

**Total estimate: ~30-40 days for complete implementation**

---

## Appendix A: Bot Commands Reference

| Command | DM | Group | Description |
|---------|-----|-------|-------------|
| `/start` | ✓ | ✓ | Welcome message + pairing instructions |
| `/link CODE` | ✓ | ✓ | Pair this chat to a Doable project |
| `/unlink` | ✓ | ✓ | Remove project pairing |
| `/screenshot` | ✓ | ✓ | Capture and send preview screenshot |
| `/screenshot full` | ✓ | ✓ | Full-page screenshot |
| `/screenshot 1920x1080` | ✓ | ✓ | Custom viewport screenshot |
| `/status` | ✓ | ✓ | Show linked project info and stats |
| `/help` | ✓ | ✓ | List available commands |
| `/notify on deploy,error` | ✓ | ✓ | Subscribe to notification events |
| `/notify off` | ✓ | ✓ | Unsubscribe from all notifications |
| `/bridge on` | ✗ | ✓ | Enable team chat bridging (groups only) |
| `/bridge off` | ✗ | ✓ | Disable team chat bridging |

## Appendix B: Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Integration kind system | `kind: "action" \| "channel"` on IntegrationDefinition | The system MUST distinguish fire-and-forget tool integrations (Supabase, Slack) from persistent bidirectional channel integrations (WhatsApp, Telegram). Without this, the tool bridge would try to create AI tools for channels, the UI would show identical cards, and there's no way to express capabilities, health monitoring, or message routing. `category` is cosmetic — `kind` is behavioral. |
| Provider abstraction for WhatsApp | Yes — dual provider | Ban risk is real and increasing. Users need a compliant path. Evolution API proves this pattern works. |
| Anti-ban middleware | Custom, inspired by baileys-antiban | OpenClaw has ZERO anti-ban protection. We should do better. |
| Capability-based design | Yes — not monolithic connector | Allows different parts of Doable to consume channels independently. Adding notification support doesn't require touching AI chat code. |
| Content-based message routing | Priority-ordered rule chain | Extensible, testable, configurable. New purposes can be added without modifying the router. |
| Team chat bridging | Opt-in per conversation | Not all groups should bridge. Users configure per-conversation. |
| Screenshot optimization | Sharp + format-per-channel | WhatsApp recompresses everything (send PNG), Telegram preserves quality (send WebP). |
| Run in API process | Yes (no separate service) | ~100 user scale. Keep it simple. Can extract later if needed. |
| Use grammy (not Telegraf) | grammy | TypeScript-native, better maintained, built-in sequentialization and throttling. OpenClaw uses it. |
| Circuit breaker default | 10 failures → 30min cooldown | OpenClaw had 3500 reconnects in 3 hours causing a ban. We prevent that. |
