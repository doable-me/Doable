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
  /** PWA (Progressive Web App) conventions block. */
  pwa?: string;
}

import { viteReactPrompt } from "./vite-react.js";
import { nextjsAppPrompt } from "./nextjs-app.js";
// Prompt files for the 6 disabled frameworks (sveltekit, nuxt, astro,
// hono, fastapi, django) were removed alongside their adapters and
// templates. Backups: ~/Documents/doable-disabled-frameworks-backup-<date>/

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
  return [p.systemIntro, p.envConventions, p.routing, p.styling, p.fileShape, p.pwa]
    .filter(Boolean).join("\n\n");
}
