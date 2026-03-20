"use client";

import { useCollaboration } from "../collaboration-context";
import { ActivityToasts } from "./activity-toast";

export function CollabActivityOverlay() {
  const { toasts, dismissToast } = useCollaboration();
  return <ActivityToasts toasts={toasts} onDismiss={dismissToast} />;
}
