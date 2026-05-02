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
import { sveltekitPrompt } from "./sveltekit.js";
import { nuxtPrompt } from "./nuxt.js";
import { astroPrompt } from "./astro.js";
import { honoPrompt } from "./hono.js";
import { fastapiPrompt } from "./fastapi.js";
import { djangoPrompt } from "./django.js";

export const FRAMEWORK_PROMPTS: Record<string, FrameworkPrompt> = {
  "vite-react": viteReactPrompt,
  "nextjs-app": nextjsAppPrompt,
  "sveltekit": sveltekitPrompt,
  "nuxt": nuxtPrompt,
  "astro": astroPrompt,
  "hono": honoPrompt,
  "fastapi": fastapiPrompt,
  "django": djangoPrompt,
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
