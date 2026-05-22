"use client";

import { useCollaboration } from "../collaboration-context";
import { PresenceAvatars } from "./presence-avatars";

export function CollabHeaderItems() {
  const { members, joined, setChatPopoutOpen, setChatVisible } = useCollaboration();
  if (!joined) return null;

  const handleClick = () => {
    setChatPopoutOpen(true);
    setChatVisible(true);
  };

  return (
    <div className="cursor-pointer" onClick={handleClick} title="Open team chat">
      <PresenceAvatars users={members} />
    </div>
  );
}
