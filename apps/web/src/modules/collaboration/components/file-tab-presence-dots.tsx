"use client";

import { useCollaboration } from "../collaboration-context";

interface Props {
  filePath: string;
  currentUserId: string;
}

export function FileTabPresenceDots({ filePath, currentUserId }: Props) {
  const { filesOpen, members } = useCollaboration();

  // Find users who have this file open (excluding current user)
  const usersOnFile = Object.entries(filesOpen)
    .filter(([uid, paths]) => uid !== currentUserId && paths.includes(filePath))
    .map(([uid]) => members.find((m) => m.userId === uid))
    .filter((m): m is NonNullable<typeof m> => !!m);

  if (usersOnFile.length === 0) return null;

  return (
    <div className="flex -space-x-0.5 ml-1.5 shrink-0">
      {usersOnFile.slice(0, 3).map((user) => (
        <div
          key={user.userId}
          className="h-2 w-2 rounded-full border border-zinc-900"
          style={{ backgroundColor: user.color }}
          title={`${user.displayName ?? "User"} has this file open`}
        />
      ))}
      {usersOnFile.length > 3 && (
        <span className="text-[9px] text-zinc-500 ml-1">+{usersOnFile.length - 3}</span>
      )}
    </div>
  );
}
