"use client";

import { useEffect, useRef } from "react";
import { useCollaboration } from "../collaboration-context";

interface Props {
  openFilePaths: string[];
}

/**
 * Bridge component that syncs open file tabs to the collaboration system.
 * Sends file_open/close messages when tabs change. Renders nothing.
 */
export function CollabFileTabSync({ openFilePaths }: Props) {
  const { sendFileOpen, sendFileClose, joined } = useCollaboration();
  const prevPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!joined) return;

    const currentPaths = new Set(openFilePaths);
    const prevPaths = prevPathsRef.current;

    // Files newly opened
    for (const path of currentPaths) {
      if (!prevPaths.has(path)) {
        sendFileOpen(path);
      }
    }

    // Files closed
    for (const path of prevPaths) {
      if (!currentPaths.has(path)) {
        sendFileClose(path);
      }
    }

    prevPathsRef.current = currentPaths;
  }, [openFilePaths, joined, sendFileOpen, sendFileClose]);

  // Clean up: close all files on unmount
  useEffect(() => {
    return () => {
      for (const path of prevPathsRef.current) {
        sendFileClose(path);
      }
    };
  }, [sendFileClose]);

  return null;
}
