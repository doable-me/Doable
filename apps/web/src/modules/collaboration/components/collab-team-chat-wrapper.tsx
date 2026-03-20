"use client";

import { useCollaboration } from "../collaboration-context";
import { TeamChatPanel } from "./team-chat-panel";

interface Props {
  currentUserId: string;
}

export function CollabTeamChatWrapper({ currentUserId }: Props) {
  const { messages, typingUsers, members, sendMessage, sendTyping } = useCollaboration();
  return (
    <TeamChatPanel
      messages={messages}
      typingUsers={typingUsers}
      members={members}
      onSend={sendMessage}
      onTyping={sendTyping}
      currentUserId={currentUserId}
    />
  );
}
