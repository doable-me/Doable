"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useCollaboration } from "../collaboration-context";
import { PresenceAvatars } from "./presence-avatars";

export function CollabHeaderItems() {
  const ui = useUiText();

  const { members, joined, setChatPopoutOpen, setChatVisible } =
    useCollaboration();
  if (!joined) return null;

  const handleClick = () => {
    setChatPopoutOpen(true);
    setChatVisible(true);
  };

  return (
    <div
      className="cursor-pointer"
      onClick={handleClick}
      title={ui("Open team chat")}
    >
      <PresenceAvatars users={members} />
    </div>
  );
}
