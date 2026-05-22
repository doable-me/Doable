"use client";

import { useCollaboration } from "../collaboration-context";

// ---------------------------------------------------------------------------
// AiStreamOverlay
// Shows when another user's AI request is streaming. Displays the user's name,
// streaming text content, and an abort button any participant can click.
// ---------------------------------------------------------------------------

interface AiStreamOverlayProps {
  /** Callback fired when any user clicks the abort button */
  onAbort?: (messageId: string) => void;
}

export function AiStreamOverlay({ onAbort }: AiStreamOverlayProps) {
  const { aiStreamChunks, members } = useCollaboration();

  if (aiStreamChunks.size === 0) return null;

  // Each entry is messageId -> accumulated text. We display every active stream.
  const entries = Array.from(aiStreamChunks.entries());

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {entries.map(([messageId, text]) => {
        // Attempt to derive the userId from the messageId (format: "<userId>:<rest>")
        const userId = messageId.split(":")[0];
        const member = members.find((m) => m.userId === userId);
        const displayName = member?.displayName ?? "Someone";
        const color = member?.color ?? "#888";

        return (
          <div
            key={messageId}
            className="rounded-lg border border-border bg-secondary/80 p-3"
          >
            {/* Header */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs font-medium text-foreground">
                  {displayName} is chatting with AI...
                </span>
              </div>
              <button
                type="button"
                onClick={() => onAbort?.(messageId)}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Abort
              </button>
            </div>

            {/* Streaming content */}
            <div className="max-h-40 overflow-y-auto rounded bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground">
              {text || (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AiTypingIndicator
// Shows when another user is composing an AI message. Renders animated dots
// alongside the user's name and color.
// ---------------------------------------------------------------------------

export function AiTypingIndicator() {
  const { aiTypingUsers, members } = useCollaboration();

  if (aiTypingUsers.size === 0) return null;

  const entries = Array.from(aiTypingUsers.entries());

  return (
    <div className="flex flex-col gap-1 px-4 py-1.5">
      {entries.map(([userId, displayName]) => {
        const member = members.find((m) => m.userId === userId);
        const color = member?.color ?? "#888";

        return (
          <div key={userId} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[11px] text-muted-foreground italic">
              {displayName} is typing to AI
            </span>
            <span className="inline-flex items-center gap-0.5">
              <span
                className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AiQueuePanel
// Shows a queue of pending AI messages when multiple users have messages
// waiting. Displays position, user avatars, and a cancel button for own items.
// ---------------------------------------------------------------------------

interface AiQueuePanelProps {
  currentUserId: string;
  /** Callback fired when the user cancels their own queued message */
  onCancel?: (messageId: string) => void;
}

export function AiQueuePanel({ currentUserId, onCancel }: AiQueuePanelProps) {
  const { aiQueue, members } = useCollaboration();

  if (aiQueue.length === 0) return null;

  const ownItem = aiQueue.find((item) => item.userId === currentUserId);

  return (
    <div className="rounded-lg border border-border bg-secondary/80 mx-4 my-2 p-3">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          AI Message Queue
        </span>
        <span className="text-[11px] text-muted-foreground">
          {aiQueue.length} pending
        </span>
      </div>

      {/* Position callout for current user */}
      {ownItem && (
        <div className="mb-2 rounded bg-blue-600/10 px-2.5 py-1.5 text-[11px] font-medium text-blue-300">
          Your message is #{ownItem.position} in queue
        </div>
      )}

      {/* Queue list */}
      <div className="flex flex-col gap-1.5">
        {aiQueue.map((item) => {
          const member = members.find((m) => m.userId === item.userId);
          const color = member?.color ?? "#888";
          const isOwn = item.userId === currentUserId;

          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                isOwn ? "bg-secondary" : "bg-muted"
              }`}
            >
              {/* Position */}
              <span className="w-5 shrink-0 text-center text-[10px] font-semibold text-muted-foreground">
                #{item.position}
              </span>

              {/* Avatar */}
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {(item.displayName ?? "?").charAt(0).toUpperCase()}
              </div>

              {/* Message preview */}
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {item.content}
              </span>

              {/* Cancel button (own messages only) */}
              {isOwn && (
                <button
                  type="button"
                  onClick={() => onCancel?.(item.id)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AiMessageAttribution
// Shows sender information above an AI chat message: a small colored dot or
// avatar with the display name. Styles differ for own messages vs others.
// ---------------------------------------------------------------------------

interface AiMessageAttributionProps {
  userId: string;
  currentUserId: string;
}

export function AiMessageAttribution({
  userId,
  currentUserId,
}: AiMessageAttributionProps) {
  const { members } = useCollaboration();
  const member = members.find((m) => m.userId === userId);

  const displayName = member?.displayName ?? "User";
  const color = member?.color ?? "#888";
  const isOwn = userId === currentUserId;

  return (
    <div
      className={`mb-1 flex items-center gap-1.5 ${
        isOwn ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {displayName.charAt(0).toUpperCase()}
      </div>
      <span
        className={`text-[11px] font-medium ${
          isOwn ? "text-blue-300" : "text-muted-foreground"
        }`}
      >
        {isOwn ? "You" : displayName}
      </span>
    </div>
  );
}
