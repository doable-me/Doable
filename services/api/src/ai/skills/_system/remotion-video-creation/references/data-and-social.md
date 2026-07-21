# Data Visualizations & Social Media Videos

## 1. Animated Counter / Stat Reveal

```tsx
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export const AnimatedCounter: React.FC<{ target: number; label: string }> = ({
  target,
  label,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const value = interpolate(frame, [0, fps * 2], [0, target], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3), // ease-out cubic
  });
  return (
    <div style={{ textAlign: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ fontSize: 120, fontWeight: 800 }}>{Math.round(value).toLocaleString()}</div>
      <div style={{ fontSize: 28, opacity: 0.7 }}>{label}</div>
    </div>
  );
};
```

## 2. Animated Bar Chart Race

The classic "bars swap positions over time" video, driven from a dataset keyed by frame/time bucket.

```tsx
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

type DataPoint = { label: string; value: number };
type Frame = DataPoint[]; // one ranked snapshot per time bucket

export const BarChartRace: React.FC<{ frames: Frame[] }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Map current frame to a fractional index into `frames` for smooth interpolation
  const progress = (frame / durationInFrames) * (frames.length - 1);
  const idx = Math.floor(progress);
  const t = progress - idx;
  const current = frames[idx];
  const next = frames[Math.min(idx + 1, frames.length - 1)];

  const sorted = [...current]
    .map((d) => {
      const nextVal = next.find((n) => n.label === d.label)?.value ?? d.value;
      return { label: d.label, value: interpolate(t, [0, 1], [d.value, nextVal]) };
    })
    .sort((a, b) => b.value - a.value);

  const maxValue = Math.max(...sorted.map((d) => d.value));

  return (
    <div style={{ padding: 60, fontFamily: 'sans-serif' }}>
      {sorted.map((d, i) => (
        <div key={d.label} style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ width: 140 }}>{d.label}</div>
          <div
            style={{
              height: 40,
              width: `${(d.value / maxValue) * 800}px`,
              background: `hsl(${i * 47}, 70%, 50%)`,
              borderRadius: 6,
              transition: 'none',
            }}
          />
          <div style={{ marginLeft: 12 }}>{Math.round(d.value).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
};
```

## 3. Line/Pie Charts via a charting library

Remotion components are plain React, so drop in any SVG-based chart library (Recharts, Victory, visx, or hand-rolled SVG) and drive its data window with `frame` — just avoid libraries that animate internally on a wall-clock timer (disable their built-in transitions and animate via props instead).

```tsx
import { LineChart, Line, XAxis, YAxis } from 'recharts';
import { useCurrentFrame, useVideoConfig } from 'remotion';

export const RevealingLineChart: React.FC<{ data: { x: number; y: number }[] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pointsToShow = Math.floor((frame / durationInFrames) * data.length);
  const visible = data.slice(0, Math.max(2, pointsToShow));

  return (
    <LineChart width={1200} height={600} data={visible}>
      <XAxis dataKey="x" />
      <YAxis />
      <Line type="monotone" dataKey="y" stroke="#4f46e5" strokeWidth={3} isAnimationActive={false} dot={false} />
    </LineChart>
  );
};
```

## 4. Social Media Captions (Reels / TikTok / Shorts burn-in)

Word-level highlight captions synced to a transcript. In practice, transcripts come from a captioning API (e.g. Whisper) with word-level timestamps in seconds — convert those to frames.

```tsx
import { useCurrentFrame, useVideoConfig } from 'remotion';

type Word = { text: string; startSec: number; endSec: number };

export const CaptionOverlay: React.FC<{ words: Word[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeSec = frame / fps;

  const activeIndex = words.findIndex(
    (w) => currentTimeSec >= w.startSec && currentTimeSec < w.endSec
  );
  // Show a short rolling window of words (typical Reels/TikTok style: 3-5 words visible)
  const windowStart = Math.max(0, activeIndex - 2);
  const visibleWords = words.slice(windowStart, windowStart + 5);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 220,
        width: '100%',
        textAlign: 'center',
        fontSize: 64,
        fontWeight: 800,
        fontFamily: 'sans-serif',
      }}
    >
      {visibleWords.map((w, i) => {
        const globalIndex = windowStart + i;
        const isActive = globalIndex === activeIndex;
        return (
          <span
            key={globalIndex}
            style={{
              color: isActive ? '#facc15' : 'white',
              marginRight: 14,
              WebkitTextStroke: '2px black',
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};
```

## 5. Audiogram (podcast-clip style: waveform + captions + static art)

Combines `<Audio>`, a waveform visualization from `@remotion/media-utils`, and the caption overlay above.

```tsx
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { useAudioData, visualizeAudio } from '@remotion/media-utils';

export const Audiogram: React.FC<{ audioSrc: string }> = ({ audioSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(staticFile(audioSrc));

  if (!audioData) return null;

  const bars = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: 32,
  });

  return (
    <div style={{ background: '#111827', width: '100%', height: '100%' }}>
      <Audio src={staticFile(audioSrc)} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, padding: 40 }}>
        {bars.map((b, i) => (
          <div
            key={i}
            style={{
              width: 10,
              height: Math.max(4, b * 200),
              background: '#4f46e5',
              borderRadius: 4,
            }}
          />
        ))}
      </div>
    </div>
  );
};
```

Install with `install_package(["@remotion/media-utils"])`, pinned to the same version as `remotion`. Note `useAudioData` requires the dev server / render worker to have access to the audio file — pass it through `staticFile()` from the `public/` folder.

## 6. Captions from a transcript — prefer `@remotion/captions`

Section 4 hand-rolls the caption window to show the mechanic, but Remotion ships an official helper: `install_package(["@remotion/captions"])` gives you a standard `Caption` type plus `parseSrt()` (import an existing `.srt`) and `createTikTokStyleCaptions()` (group word-level timestamps into the short rolling phrases Reels/TikTok/Shorts use). Reach for it instead of hand-rolling whenever the input is a real transcript or subtitle file — it handles the grouping and timing edge cases the snippet above glosses over.

Doable has no built-in transcription or text-to-speech tool, so word-level timestamps must come from the user (an uploaded `.srt`/JSON) or from an external API they've configured. If the user asks for auto-captions from raw audio, say that up front and ask for the transcript rather than inventing timings — fabricated timestamps look correct in code and are visibly wrong on screen.
