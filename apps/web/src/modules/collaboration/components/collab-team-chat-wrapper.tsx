"use client";

import { useEffect } from "react";
import { useCollaboration } from "../collaboration-context";
import { TeamChatPanel } from "./team-chat-panel";

interface Props {
  currentUserId: string;
}

export function CollabTeamChatWrapper({ currentUserId }: Props) {
  const { messages, typingUsers, members, sendMessage, sendTyping, setChatVisible } = useCollaboration();

  // Mark chat as visible when full Team tab is open, reset on unmount
  useEffect(() => {
    setChatVisible(true);
    return () => setChatVisible(false);
  }, [setChatVisible]);

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
