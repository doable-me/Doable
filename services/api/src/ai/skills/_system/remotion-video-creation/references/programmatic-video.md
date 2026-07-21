# Programmatic & Personalized Videos

This is Remotion's signature use case: generate one video per row of a dataset (certificates, year-in-review recaps, personalized invites, invoice explainer clips) by feeding different `props` into the same composition.

> **In a Doable build session, sections 1–2 apply; sections 3–4 do not run there.** The props-driven composition and `calculateMetadata` are just component code — build them normally, and preview a representative row by passing its props to `<Player>`.
>
> To let the user actually export a row as video, render it **in the browser** with `@remotion/web-renderer`: pass that row's data as **`inputProps`, a top-level sibling of `composition`** — not as the composition's `defaultProps`, which is a type error for any component that takes props. A per-row "Export video" button works well, and looping it over a handful of selected rows client-side is fine for small batches:
>
> ```tsx
> for (const row of selectedRows) {
>   const result = await renderMediaOnWeb({ composition: VIDEO_CONFIG, inputProps: row });
>   const blob = await result.getBlob();
>   // …offer as download, or collect for a zip
> }
> ```
>
> The shell/Node batch scripts below are for the user's own machine, a backend job, or Lambda; the AI `bash` tool's 60-second / 256 MB jail cannot execute them, and they are the right answer for hundreds of rows. Write the batch script as a deliverable file if the user wants one, then tell them how to run it — don't run it yourself and don't report videos as generated.
>
> If the data lives in the project's inbuilt database, read it with `data.query` to build a realistic preview, rather than inventing sample rows.

## 1. Props-driven composition

```tsx
// src/Certificate.tsx
import { Img, staticFile, interpolate, useCurrentFrame } from 'remotion';

export type CertificateProps = {
  recipientName: string;
  courseName: string;
  dateCompleted: string;
};

export const Certificate: React.FC<CertificateProps> = ({
  recipientName,
  courseName,
  dateCompleted,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', opacity }}>
      <Img src={staticFile('certificate-bg.png')} style={{ width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', top: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 56, fontWeight: 700 }}>{recipientName}</div>
        <div style={{ fontSize: 28, marginTop: 12 }}>has completed {courseName}</div>
        <div style={{ fontSize: 20, marginTop: 8, opacity: 0.6 }}>{dateCompleted}</div>
      </div>
    </div>
  );
};
```

```tsx
// src/Root.tsx
import { Composition } from 'remotion';
import { Certificate, CertificateProps } from './Certificate';

export const RemotionRoot: React.FC = () => (
  <Composition<CertificateProps>
    id="Certificate"
    component={Certificate}
    durationInFrames={120}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{
      recipientName: 'Jane Doe',
      courseName: 'Advanced React',
      dateCompleted: 'July 2026',
    }}
  />
);
```

## 2. Dynamic duration with `calculateMetadata`

When duration depends on the data itself (e.g. number of transcript words, number of chart data points), don't hardcode `durationInFrames` — derive it:

```tsx
import { Composition, CalculateMetadataFunction } from 'remotion';
import { Recap, RecapProps } from './Recap';

const calculateMetadata: CalculateMetadataFunction<RecapProps> = ({ props }) => {
  const secondsPerItem = 3;
  const fps = 30;
  return {
    durationInFrames: Math.round(props.highlights.length * secondsPerItem * fps),
  };
};

export const RemotionRoot: React.FC = () => (
  <Composition<RecapProps>
    id="Recap"
    component={Recap}
    calculateMetadata={calculateMetadata}
    fps={30}
    width={1080}
    height={1920} // vertical, e.g. for a shareable Story-style recap
    defaultProps={{ highlights: [] }}
  />
);
```

## 3. Batch rendering many outputs from a dataset (CLI)

Render one video per row by looping the CLI with different `--props`:

```bash
#!/usr/bin/env bash
# render-all.sh — one certificate video per row in recipients.json
node -e "
  const recipients = require('./data/recipients.json');
  console.log(JSON.stringify(recipients));
" > /tmp/recipients.json

python3 - <<'EOF'
import json, subprocess

with open('data/recipients.json') as f:
    recipients = json.load(f)

for r in recipients:
    props = json.dumps(r)
    out = f"out/certificate-{r['recipientName'].replace(' ', '_')}.mp4"
    subprocess.run([
        "npx", "remotion", "render", "Certificate", out,
        "--props", props,
    ], check=True)
EOF
```

## 4. Batch rendering programmatically (Node API — faster, avoids re-bundling per video)

For large batches, bundle once and reuse the bundle across renders instead of invoking the CLI per row (each CLI invocation re-bundles, which dominates runtime at scale):

```ts
// batch-render.ts
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import recipients from './data/recipients.json';

const run = async () => {
  const bundleLocation = await bundle({ entryPoint: './src/index.ts' });

  for (const recipient of recipients) {
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'Certificate',
      inputProps: recipient,
    });

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: `out/certificate-${recipient.recipientName.replace(/\s+/g, '_')}.mp4`,
      inputProps: recipient,
    });
    console.log(`Rendered: ${recipient.recipientName}`);
  }
};

run();
```

Run with `npx tsx batch-render.ts` (or `ts-node`). This is the pattern to reach for whenever the ask is "generate a video for every user/row/customer" — bundle once, render N times, optionally parallelize with `Promise.all` in small batches (rendering is CPU/GPU-heavy, so batch size should match available cores) or move to Remotion Lambda for true parallel scale (see `references/rendering-deployment.md`).
