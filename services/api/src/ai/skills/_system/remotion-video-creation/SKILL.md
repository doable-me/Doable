---
name: remotion-video-creation
description: Build programmatic videos with Remotion (React-based video generation framework). Use this skill whenever the user wants to create, script, or render any kind of video using code — slideshows/photo montages, kinetic typography and animated titles, data visualizations (bar chart races, animated counters, line/pie charts), social media content (Reels/Shorts/TikTok captions, audiograms), personalized or data-driven videos (certificates, invoices, recaps generated per-user from a data set), lower-thirds and scene transitions, subtitle/caption burn-ins, or explainer/product-demo videos. Also use for rendering and deployment questions (remotion render CLI, Remotion Lambda, server-side rendering, CI pipelines) and for embedding Three.js/Lottie/audio-reactive visuals inside a video. Trigger on mentions of "Remotion", "programmatic video", "video with React", "render a video from data", "generate a video for every user/row", "animated video", "motion graphics", "video player in my app", or requests to turn a template into a video pipeline. Also use whenever the user wants to export, download, or see a rendered video file. Read this skill BEFORE installing any Remotion package or writing a composition — it documents the Doable-specific setup (no create-video scaffold, install_package, an in-app Player, and in-browser rendering via @remotion/web-renderer that displays the finished MP4 in the preview) and the sandbox limits that make CLI rendering impossible.
---

# Remotion Video Creation

Remotion lets you build videos as React components: every frame is a pure function of state, driven by a `frame` counter. This skill covers the core mental model plus a library of video-type recipes with working code.

## ⛔ How Remotion works inside Doable (read this before writing any code)

Doable is not a standalone Remotion project, and video is rendered in the browser rather than by the CLI. These constraints are not negotiable — violating them produces a broken app or a promise you cannot keep.

1. **The project already exists — never scaffold one.** Every Doable project is a Vite + React 19 + Tailwind v4 app. There is no `create-video` scaffold, no `remotion.config.ts`, and no `src/index.ts` render entry. **Never run `npx create-video@latest`** — it would fight the existing app structure. Just add `src/Root.tsx` (with your `<Composition>`s) and embed it, as described in "The deliverable" below.

2. **Install packages with the `install_package` tool, never `npm i` in bash.** `install_package` enforces the blocked-package and workspace sandbox policy *and restarts the Vite dev server* so the new package is actually picked up. A raw `npm i` skips both — the import will keep failing until something else restarts the server. Everywhere a reference file says `npm i X`, call `install_package(["X"])` instead. Pin Remotion add-ons to the **same version as `remotion` itself** (mismatched versions are a top source of failures).

3. **🚫 Never render via `bash`/CLI — render in the browser instead.** The AI `bash` tool runs inside the `ai-bash` jail: **256 MB memory, 50% of one CPU core, a hard 60-second wall/CPU timeout, and network egress denied except the npm registry + AI providers.** Chromium cannot even launch in 256 MB, a real render takes minutes, and Remotion's first-run Chrome Headless Shell download is blocked by the egress allowlist. **`npx remotion render` will fail — do not run it.** To produce an actual video file, use `@remotion/web-renderer`, which renders in the *preview's* browser via WebCodecs and is completely unaffected by these limits. See "Rendering the video into the preview" below.

### The deliverable: a live `<Player>`, plus a real rendered video

Ship **both**, in this order:

- **`<Player>`** — the scrubbable live preview. Always build this; it is the baseline and it always works.
- **A rendered video file, produced in-browser and displayed in the preview** — whenever the user wants "a video" as an artifact (download, export, share, "make me a video"). Build this with `@remotion/web-renderer`, per the section below.

### The `<Player>` half

The shipped artifact is **the running app with `@remotion/player` embedded**. That is what the user sees and what the platform surfaces. Build it this way:

```tsx
// src/App.tsx — the Player takes the composition COMPONENT, not the Root
import { Player } from '@remotion/player';
import { MyVideo } from './MyVideo';

export default function App() {
  return (
    <Player
      component={MyVideo}
      durationInFrames={510}
      fps={30}
      compositionWidth={1920}
      compositionHeight={1080}
      style={{ width: '100%' }}
      controls
      loop
      acknowledgeRemotionLicense   {/* silences the console license warning — see "Licensing" */}
    />
  );
}
```

**`<Player>` takes `component={MyVideo}` — the composition component itself — plus `durationInFrames`/`fps`/`compositionWidth`/`compositionHeight` as its own props.** Passing the `RemotionRoot` (the component that returns `<Composition>` elements) renders nothing but a blank player. Keep `src/Root.tsx` with its `<Composition>` + `registerRoot()` as the render entry point for later/external rendering, but wire the *Player* directly to the video component.

Because these duration/fps values are now written in two places, define them once in a shared constants module and import into both `Root.tsx` and `App.tsx` — a `<Player durationInFrames>` that disagrees with its `<Composition durationInFrames>` silently truncates or pads the preview.

### Tailwind classes render in the Player but not in `remotion render`

Doable styles come from `@tailwindcss/vite`, a **Vite** plugin. The `<Player>` runs through Vite, so Tailwind classes work in the preview. Remotion's CLI/bundler does **not** use Vite, so a later `remotion render` would drop every Tailwind class and produce an unstyled video. Two consequences:

- For anything visual and layout-critical inside a composition, **prefer inline `style={{…}}` objects over Tailwind classes** (this is also why every recipe in the reference files uses inline styles). Tailwind is fine for the surrounding app chrome outside the `<Player>`.
- If a project genuinely needs Tailwind inside compositions *and* real rendering, that requires `@remotion/tailwind-v4` plus a `remotion.config.ts` override — out of scope for a build session, and it does not lift the sandbox limits above.

## Rendering the video into the preview (`@remotion/web-renderer`)

**This is how a real rendered video reaches the user.** `@remotion/web-renderer` encodes the composition to an MP4 **in the browser** using WebCodecs — it runs in the preview iframe, not in the `ai-bash` jail, so none of the sandbox limits apply. The result is a `Blob` you turn into an object URL and display in a `<video>` element right there in the preview, with a download link.

**Install it explicitly: `install_package(["@remotion/web-renderer"])`.** It is often already present in `node_modules` as a transitive dependency but is *not* in `package.json` — relying on that hoisting is how you get a build that works in dev and breaks later. Pin it to the same version as `remotion`.

```tsx
// src/video-config.ts — ONE source of truth, imported everywhere
import { MyVideo } from './MyVideo';

export const VIDEO_CONFIG = {
  id: 'MyVideo',
  component: MyVideo,
  durationInFrames: 510,
  fps: 30,
  width: 1920,
  height: 1080,
  defaultProps: {},
} as const;
```

```tsx
// src/RenderButton.tsx
import { useState, useEffect, useRef } from 'react';
import { renderMediaOnWeb, canRenderMediaOnWeb } from '@remotion/web-renderer';
import { VIDEO_CONFIG } from './video-config';

export const RenderButton: React.FC = () => {
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Revoke the object URL when it's replaced or the component unmounts —
  // otherwise every re-render leaks a whole video blob.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const render = async () => {
    setBusy(true);
    setError(null);
    setProgress(0);

    // Always capability-check first: WebCodecs/WebGL support varies by browser.
    const support = await canRenderMediaOnWeb({
      width: VIDEO_CONFIG.width,
      height: VIDEO_CONFIG.height,
      container: 'mp4',
    });
    if (!support.canRender) {
      setError(support.issues.map((i) => i.message).join(' '));
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await renderMediaOnWeb({
        composition: VIDEO_CONFIG,
        container: 'mp4',
        licenseKey: 'free-license', // see "Licensing" below — declare the correct one
        signal: controller.signal,
        onProgress: (p) => setProgress(p.progress),
      });
      const blob = await result.getBlob();
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button onClick={render} disabled={busy}>
        {busy ? `Rendering… ${Math.round(progress * 100)}%` : 'Render video'}
      </button>
      {busy && <button onClick={() => abortRef.current?.abort()}>Cancel</button>}
      {error && <p role="alert">{error}</p>}

      {/* The rendered video, shown in the preview */}
      {url && (
        <>
          <video src={url} controls style={{ width: '100%' }} />
          <a href={url} download="video.mp4">Download MP4</a>
        </>
      )}
    </div>
  );
};
```

Key points, all verified against the installed `@remotion/web-renderer` types:

- **`composition` is a plain object**, not a `<Composition>` element: `{ component, id, width, height, fps, durationInFrames, defaultProps }`. That is exactly the `VIDEO_CONFIG` shape above — which is why sharing one constants module across `<Composition>`, `<Player>`, and the renderer eliminates the whole class of "preview and render disagree" bugs.
- **If the video component takes props, `inputProps` is REQUIRED — and it goes at the top level, as a sibling of `composition`, not inside it.** Putting the data only in the composition's `defaultProps` is a type error (`Property 'inputProps' is missing`), and it is the single easiest way to lose a turn here. Components with no props need neither field:

  ```tsx
  await renderMediaOnWeb({
    composition: { ...VIDEO_CONFIG, component: Certificate, defaultProps: { name: 'Preview' } },
    inputProps: { name: 'Ada Lovelace' },  // ← required, top level, wins over defaultProps
  });
  ```
- **`renderMediaOnWeb` resolves to `{ getBlob, internalState }`** — you must `await result.getBlob()` to get the `Blob`. It does not return the blob directly.
- **`onProgress` receives `{ progress, renderedFrames, encodedFrames, doneIn, renderEstimatedTime }`** — `progress` is 0–1. Always surface it; a 1080p render takes real time and a dead button reads as a hang.
- **Always call `canRenderMediaOnWeb` first** and show `issues[].message` on failure. WebCodecs and WebGL availability differ across browsers, and a hard failure with no explanation is the worst outcome.
- **Pass an `AbortSignal`** so a long render can be cancelled, and **revoke object URLs** — each one pins an entire video in memory.
- `renderStillOnWeb` is the same pattern for a single frame (thumbnails/poster images).
- `container: 'mp4'` with the default codecs is the safe choice. `getEncodableVideoCodecs()` / `getSupportedVideoCodecsForContainer()` are available if you need to negotiate alternatives.

If the user instead wants rendering **outside the browser** — batch/CI/at-scale — that is the CLI, server-side Node API, or Lambda path in `references/rendering-deployment.md`. Those run on their machine or infrastructure, never in a build session.

## Licensing — Remotion is source-available, not open source

Remotion is **free for individuals, non-profits, and for-profit companies with up to 3 employees**; larger for-profit companies must buy a Company License from remotion.pro. This is a real obligation that falls on **whoever ends up running the app**, not just on Doable.

Two things every Remotion build must do:

- **Pass `licenseKey` to `renderMediaOnWeb`/`renderStillOnWeb`.** Use `'free-license'` when the user qualifies under the terms above, or their real key if they have one. Omitting it logs a warning on every render.
- **Pass `acknowledgeRemotionLicense` to `<Player>`**, which silences the equivalent console notice.

**Be aware that rendering reports usage to Remotion.** `renderMediaOnWeb` sends a `web-render` telemetry event to `remotion.pro` containing `window.location.origin`, whether the render succeeded, and a production flag — **on every render, including with `licenseKey: 'free-license'`** (that value is sent as a null key, so it is a declaration of eligibility, not an opt-out). There is no watermark and no functional restriction; the enforcement model is honour-based plus this telemetry.

If the user's situation is anything other than clearly free-tier — in particular if their app will be **used by, or distributed to, a company with 4+ employees** — say so plainly and point them at https://remotion.pro/license and https://remotion.pro/faq. Don't quietly assume the free tier applies, and don't offer a workaround for the telemetry: it is part of the licensing mechanism, and defeating it would be circumventing a license term.

## Core mental model (read this first, always)

A Remotion video is a React tree rendered once per frame and rasterized to PNG/frames, then stitched into a video file (or, for previews, played live in the browser at the target fps). There is no "time passing" inside a component — instead:

- `useCurrentFrame()` returns the frame number for this render pass.
- `useVideoConfig()` returns `{ fps, durationInFrames, width, height }` for the active composition.
- Anything that should animate must be a **pure function of `frame`** (and optionally other props) — never `setState`, `setInterval`, or side effects tied to wall-clock time.

```tsx
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export const FadeInTitle: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps], [0, 1], { extrapolateRight: 'clamp' });
  return <h1 style={{ opacity }}>{text}</h1>;
};
```

### The three building blocks

1. **`<Composition>`** — registered in `src/Root.tsx`, defines an ID, dimensions, fps, duration, and the component to render. This is what shows up in the Remotion Studio sidebar and what `remotion render` targets by ID.
2. **`<Sequence>`** — places a child at an offset (`from`) for a duration (`durationInFrames`) within the parent timeline. This is how you build scenes — each `<Sequence>` resets `useCurrentFrame()` to 0 for its children (relative time), which makes scene components reusable and composable.
3. **`<Series>`** (from `remotion`) — a convenience wrapper over multiple `<Sequence>`s placed back-to-back automatically, useful for slideshows and scene lists where you don't want to hand-compute offsets.

```tsx
// src/Root.tsx
import { Composition, registerRoot } from 'remotion';
import { MyVideo } from './MyVideo';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MyVideo"
    component={MyVideo}
    durationInFrames={300}   // 10s at 30fps
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ title: 'Hello World' }}
  />
);

// Required: without this, the file has no entry point and `remotion render`
// fails with "does not contain registerRoot". Call it once, at the bottom of
// whichever file you pass to the CLI as the entry point.
registerRoot(RemotionRoot);
```

### Animation primitives

- `interpolate(input, inputRange, outputRange, options)` — linear (or eased) mapping from frame → value. Always set `extrapolateLeft`/`extrapolateRight: 'clamp'` unless you want values to shoot past the range.
- `spring({ frame, fps, config })` — physically-based easing (bounce, overshoot). Preferred over `interpolate` for anything that should feel "alive" (entrances, pops, UI reveals).
- `Easing` (from `remotion`) — standard easing curves to pass into `interpolate`'s options for non-spring animation.

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { fps } = useVideoConfig();
const scale = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
```

### Assets and data

- `<Img>`, `<Video>`, `<Audio>`, `<OffthreadVideo>` (from `remotion`) — use these instead of raw `<img>`/`<video>` tags; they wait for the asset to load before capturing the frame, avoiding blank/flickering frames during render.
- `staticFile('name.png')` — resolves a path in the `public/` folder correctly both in Studio and during render.
- Props are passed via `defaultProps` in dev, and via `--props` (CLI) or `inputProps` (SSR/Lambda API) at render time — this is the mechanism behind every data-driven/personalized video (see `references/programmatic-video.md`).

## Choosing the right recipe

This skill's reference files each cover a family of video types with full working snippets. Read the one(s) that match the request — don't load all of them unless the task genuinely spans several:

| Reference file | Covers | Read when the user wants... |
|---|---|---|
| `references/video-types.md` | Slideshows/photo montage (Ken Burns), kinetic typography & animated titles, lower-thirds, scene transitions | "turn these photos into a video", "animated title/text video", "add a lower-third", "transition between scenes" |
| `references/data-and-social.md` | Animated bar/line/pie charts, bar-chart races, animated counters, social captions burned into video, audiograms | "chart video", "bar race", "animated stat/counter", "TikTok/Reels captions", "audiogram/podcast clip" |
| `references/programmatic-video.md` | Per-user/per-row personalized videos (certificates, recaps, invoices-as-video), dynamic duration via `calculateMetadata`, batch rendering many outputs from a dataset | "generate a video for every user in this CSV", "personalized video", "certificate/recap generator" |
| `references/advanced-integrations.md` | Three.js/WebGL scenes inside Remotion, Lottie animations, audio-reactive visuals (waveform-driven motion), screen-recording/product-demo style videos | "3D video", "Lottie", "audio-reactive", "product demo/explainer video" |
| `references/rendering-deployment.md` | `remotion render` CLI flags, output formats/codecs, server-side rendering (Node API), Remotion Lambda for scale/parallel rendering, CI (GitHub Actions) | "how do I render/export", "render on a server", "render at scale", "CI pipeline for video" |

## Required dependencies

Every Remotion project needs three packages, not just `remotion` — installing only the core library builds a project that cannot render or preview:

- `remotion` — the runtime (`Composition`, `Sequence`, `interpolate`, `spring`, …).
- `@remotion/cli` — provides the `remotion` CLI binary (`remotion render`, `remotion studio`). Without it, `npx remotion render`/`npx remotion studio` fail to resolve.
- `@remotion/player` — only if you embed a live in-app preview via `<Player component={...} />` (e.g. inside a Vite/Next app shell). Importing `@remotion/player` without adding it as a dependency will break that app's build/dev server.

Add all three that apply as `devDependencies` (or `dependencies` for `@remotion/player`, since it renders in the browser) at the same version as `remotion` itself — mismatched versions between `remotion`, `@remotion/cli`, and `@remotion/player` are a common source of render failures.

**In Doable, `@remotion/player` is the one that actually matters** — it powers the deliverable. Install it and `remotion` via `install_package`; `@remotion/cli` is only useful for the render command the user runs on their own machine.

## General workflow for any request

1. **Install the Remotion packages** with `install_package` — `remotion` and `@remotion/player` at minimum (plus any add-on a recipe needs, at the same version). Never `npx create-video@latest`; the Vite + React project already exists. See the Doable section above.
2. **Define the composition(s)** in `src/Root.tsx` — get `width`/`height`/`fps`/duration right first; changing fps later reflows all frame-based math. Put those values in a shared constants module so `App.tsx` can import the same numbers. **Call `registerRoot(RemotionRoot)`** in that same file (see the code sample above) — a composition file without it is not a valid render entry point.
3. **Build scene components** — one component per logical scene/beat, composed with `<Sequence>`/`<Series>`. Use inline `style={{…}}` inside compositions rather than Tailwind classes.
4. **Wire up `<Player>` in the app** — `component={<the video component>}`, not the Root. Drive it from the shared `VIDEO_CONFIG`.
5. **Add in-browser rendering** whenever the user wants an actual video artifact — `@remotion/web-renderer` + a render button that displays the resulting `<video>` in the preview with a download link. See "Rendering the video into the preview" above.
6. **Verify it actually builds and runs** — the sandbox can't *render* video, but it *can* typecheck and build. Run the build and confirm the dev server comes up clean, then reason through the composition's edge frames — frame 0, the last frame, and every sequence boundary — since unclamped `interpolate` causing flicker/pop at those points is the most common bug and you have no way to scrub it yourself.
7. **Report accurately.** The user gets a working player, and a render button that produces a real MP4 in their browser. Don't claim you rendered a file yourself — you didn't; the browser does it when they click. If they need batch/CI/at-scale rendering, point them at `references/rendering-deployment.md`.

## Common pitfalls to flag proactively

- **Doable-specific, most common of all**: scaffolding with `create-video`, installing with raw `npm i` instead of `install_package`, passing `RemotionRoot` to `<Player>` instead of the video component, Tailwind classes inside compositions, or trying to render through `bash`. See the Doable section at the top.
- **`<Player>`, `<Composition>`, and `renderMediaOnWeb` disagreeing on `durationInFrames`/`fps`/dimensions**: all three are configured independently, so a change to one silently truncates, pads, or letterboxes the others. Import all three from one shared `VIDEO_CONFIG` module.
- **Assuming `@remotion/web-renderer` is installed because it resolves**: it is commonly hoisted into `node_modules` as a transitive dep while absent from `package.json`. Always `install_package` it explicitly.
- **Leaking object URLs**: every `URL.createObjectURL(blob)` pins a full video in memory until revoked. Revoke the previous URL when replacing it and on unmount.
- **Rendering with no progress or cancel affordance**: a 1080p in-browser render takes real time; a button that just goes dead reads as a crash. Wire `onProgress` and an `AbortSignal`.
- **Passing render data as the composition's `defaultProps` instead of top-level `inputProps`**: a type error for any component with props. See the `renderMediaOnWeb` notes above.
- **Missing `registerRoot()`**: `<Composition>` alone doesn't make a file a valid entry point — forgetting `registerRoot(RemotionRoot)` produces a project that previews fine (if `<Player>` is wired up separately) but fails `remotion render`/`remotion studio` with "does not contain registerRoot". Always include it, and verify by actually running the render (see workflow step 5) rather than assuming the CLI command will work.
- **Missing `@remotion/cli`/`@remotion/player` in `package.json`**: only adding `remotion` compiles but can't render (`npx remotion` resolves nothing) or breaks the in-app `<Player>` import. See "Required dependencies" above.
- **Non-deterministic renders**: `Math.random()`, `Date.now()`, or reading real wall-clock time inside a component will produce different output in Studio preview vs. final render (frames are rendered out of order and in parallel workers). Use `random(seed)` from `remotion` instead — it's deterministic per-seed.
- **Missing `extrapolateRight: 'clamp'`**: causes values to overshoot far past a sequence's end once `frame` exceeds the input range, producing visible glitches on late frames.
- **Using `<img>`/`<video>` instead of `<Img>`/`<Video>`/`<OffthreadVideo>`**: race conditions where the renderer captures a frame before the asset finished loading, causing blank or flashing frames.
- **Fonts**: use `@remotion/fonts` or `loadFont()` from `@remotion/google-fonts/<FontName>` and await font loading via `continueRender`/`delayRender` before the first frame renders, or text will render in a fallback font for the first few frames.
- **Audio drift**: always derive audio trim points (`startFrom`/`endAt` on `<Audio>`) from `fps`, never hardcoded milliseconds, so changing fps doesn't desync audio from visuals.
