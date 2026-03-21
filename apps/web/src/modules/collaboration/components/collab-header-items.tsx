"use client";

import { useCollaboration } from "../collaboration-context";
import { PresenceAvatars } from "./presence-avatars";

export function CollabHeaderItems() {
  const { members, joined } = useCollaboration();
  if (!joined) return null;
  return <PresenceAvatars users={members} />;
}
