export interface FrameworkPrompt {
  /** "The project is …" intro paragraph. */
  systemIntro: string;
  /** Env-var conventions block. */
  envConventions: string;
  /** Routing / preview-path conventions block. */
  routing: string;
  /** Styling conventions block. */
  styling: string;
  /** File-shape and edit conventions block. */
  fileShape: string;
}

import { viteReactPrompt } from "./vite-react.js";
import { nextjsAppPrompt } from "./nextjs-app.js";

export const FRAMEWORK_PROMPTS: Record<string, FrameworkPrompt> = {
  "vite-react": viteReactPrompt,
  "nextjs-app": nextjsAppPrompt,
};

export function getFrameworkPrompt(frameworkId: string): FrameworkPrompt {
  return FRAMEWORK_PROMPTS[frameworkId] ?? FRAMEWORK_PROMPTS["vite-react"]!;
}

/** Concatenate the prompt sections in canonical order. */
export function renderFrameworkPrompt(frameworkId: string): string {
  const p = getFrameworkPrompt(frameworkId);
  return [p.systemIntro, p.envConventions, p.routing, p.styling, p.fileShape]
    .filter(Boolean).join("\n\n");
}
