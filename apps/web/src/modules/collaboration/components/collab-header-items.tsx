"use client";

import { useCollaboration } from "../collaboration-context";
import { PresenceAvatars } from "./presence-avatars";

export function CollabHeaderItems() {
  const { members } = useCollaboration();
  if (members.length <= 1) return null; // Don't show if alone
  return <PresenceAvatars users={members} />;
}
