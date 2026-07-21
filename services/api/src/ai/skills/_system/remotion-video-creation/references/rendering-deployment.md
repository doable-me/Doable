# Rendering & Deployment

> **⛔ None of this runs inside a Doable build session.** The AI `bash` tool is jailed to 256 MB RAM, 50% of one CPU core, a hard 60-second timeout, and an egress allowlist that blocks Remotion's Chrome Headless Shell download. `npx remotion render` and `npx remotion studio` will fail there.
>
> **To give the user an actual rendered video, use `@remotion/web-renderer` — it renders in the preview's browser via WebCodecs, unaffected by these limits, and the result is displayed right in the preview. That is the default path; see "Rendering the video into the preview" in `SKILL.md`.**
>
> Everything below is for rendering **outside the browser** — the user's own machine, a backend job, or CI — which is what you want for batch output, very long videos, or server-triggered rendering. Hand these commands over; don't run them.
>
> When handing over a local render command, add `--browser-executable=/usr/bin/chromium` (or their local Chrome path) if the machine can't reach Remotion's browser CDN.

## 1. CLI rendering (single video, local machine)

```bash
# Render a specific composition by ID to an mp4
npx remotion render MyVideo out/video.mp4

# With custom props (JSON string or path to a .json file)
npx remotion render MyVideo out/video.mp4 --props='{"title":"Hello"}'
npx remotion render MyVideo out/video.mp4 --props=./data/props.json

# Common flags
npx remotion render MyVideo out/video.mp4 \
  --codec=h264 \
  --crf=18 \
  --concurrency=4 \
  --scale=1
```

- `--codec` — `h264` (default, universal MP4), `h265`, `vp8`/`vp9` (WebM), `prores` (editing-friendly, large files), `gif`.
- `--crf` — quality for h264/h265; lower = higher quality/bigger file (18–23 is a reasonable range).
- `--concurrency` — number of parallel Chromium tabs rendering frames; tune to CPU core count.
- `--scale` — render at a multiplier of the composition's resolution (useful for rendering 2x then downscaling for anti-aliasing, or rendering at reduced scale for fast drafts).

Still frames (e.g. for a thumbnail):

```bash
npx remotion still MyVideo out/thumbnail.png --frame=90
```

## 2. Server-side rendering via the Node API

Preferred when rendering is triggered by an application (a web request, a queue job) rather than run manually. See `references/programmatic-video.md` section 4 for the full `bundle` + `renderMedia` pattern — the same API is what a backend route would call.

Key functions from `@remotion/renderer` and `@remotion/bundler`:
- `bundle({ entryPoint })` — webpack-bundles the Remotion project once; reuse the result across many renders.
- `selectComposition({ serveUrl, id, inputProps })` — resolves a composition's metadata (including any `calculateMetadata` output) for the given props.
- `renderMedia({ composition, serveUrl, codec, outputLocation, inputProps })` — renders the actual file.
- `renderStill({ composition, serveUrl, output, inputProps, frame })` — for thumbnails/still exports.

## 3. Remotion Lambda (parallel rendering at scale)

For high-volume or time-sensitive rendering (e.g. rendering hundreds of personalized videos on demand, or needing a 10-minute video back in seconds rather than minutes), Remotion Lambda splits a render across many AWS Lambda invocations in parallel, then stitches the result.

```bash
npm i @remotion/lambda

# One-time setup: deploy the Remotion renderer function + bundle site to S3
npx remotion lambda functions deploy
npx remotion lambda sites create src/index.ts --site-name=my-video-site
```

```ts
// trigger-lambda-render.ts
import { renderMediaOnLambda } from '@remotion/lambda/client';

const { renderId, bucketName } = await renderMediaOnLambda({
  region: 'us-east-1',
  functionName: 'remotion-render-...', // from `functions deploy` output
  serveUrl: 'my-video-site',           // from `sites create` output
  composition: 'MyVideo',
  inputProps: { title: 'Hello from Lambda' },
  codec: 'h264',
});
```

Costs are pay-per-render-second across Lambda invocations; this is the right tool when local/single-server rendering is a bottleneck (batch of many personalized videos, or a user-facing "render my video now" feature with a latency budget).

## 4. CI pipelines (e.g. GitHub Actions)

Typical shape: install deps, run `remotion render` headlessly (Chromium runs fine in CI runners — Remotion bundles its own Chrome Headless Shell), upload the artifact.

```yaml
# .github/workflows/render.yml
name: Render Video
on: workflow_dispatch
jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx remotion render MyVideo out/video.mp4 --props=./data/props.json
      - uses: actions/upload-artifact@v4
        with:
          name: rendered-video
          path: out/video.mp4
```

## 5. Choosing an approach

| Scenario | Approach |
|---|---|
| **Inside a Doable build session** | **`@remotion/web-renderer` — renders in the preview's browser, video shown in-preview with a download link** |
| One-off video, iterating locally | `remotion studio` to preview, `remotion render` CLI to export |
| Video generated in response to a user action in an app | Node API (`bundle` + `renderMedia`) called from your backend |
| Hundreds/thousands of personalized videos, or need sub-minute turnaround on long videos | Remotion Lambda |
| Scheduled/triggered renders as part of a repo (e.g. nightly recap video) | CI pipeline calling the CLI |
