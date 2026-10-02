import { createHash } from "node:crypto";

/** Compare effective prompts without retaining/logging project context. */
export function fingerprintSystemPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

/** Shared by create and resume: an empty prompt explicitly clears stale content. */
export function systemMessageConfig(prompt: string | undefined) {
  return prompt === undefined
    ? {}
    : { systemMessage: { mode: "replace" as const, content: prompt } };
}

/** Refresh in place by resuming the same SDK history, never creating a new one.
 * A failed refresh must propagate: sending with stale instructions or silently
 * starting an empty conversation would both violate the user's context. */
export async function reuseSessionWithPrompt(options: {
  sessionId: string;
  previousFingerprint: string | undefined;
  nextFingerprint: string;
  bindCurrentTurn: () => boolean;
  resumeCurrentPrompt: (sessionId: string) => Promise<string>;
}): Promise<string | undefined> {
  if (options.previousFingerprint !== options.nextFingerprint) {
    return options.resumeCurrentPrompt(options.sessionId);
  }
  return options.bindCurrentTurn() ? options.sessionId : undefined;
}
