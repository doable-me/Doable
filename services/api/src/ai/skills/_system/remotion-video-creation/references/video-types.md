# Video Types: Slideshows, Titles, Lower-Thirds, Transitions

## 1. Photo Slideshow / Montage (Ken Burns effect)

Uses `<Series>` to lay out one image per beat, each with a slow pan/zoom driven by `interpolate`.

```tsx
import { Series, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

const KenBurnsSlide: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  return (
    <Img
      src={src}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: `scale(${scale})`,
        opacity,
      }}
    />
  );
};

export const Slideshow: React.FC<{ images: string[] }> = ({ images }) => (
  <Series>
    {images.map((img, i) => (
      <Series.Sequence key={i} durationInFrames={90}>
        <KenBurnsSlide src={staticFile(img)} />
      </Series.Sequence>
    ))}
  </Series>
);
```

## 2. Kinetic Typography / Animated Titles

Word-by-word or letter-by-letter reveal, staggered with `spring`.

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const Word: React.FC<{ word: string; delay: number }> = ({ word, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 150 },
  });
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: progress,
        transform: `translateY(${(1 - progress) * 40}px)`,
        marginRight: 12,
      }}
    >
      {word}
    </span>
  );
};

export const KineticTitle: React.FC<{ text: string }> = ({ text }) => {
  const words = text.split(' ');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: 80, fontWeight: 700 }}>
      {words.map((w, i) => (
        <Word key={i} word={w} delay={i * 4} />
      ))}
    </div>
  );
};
```

## 3. Lower-Thirds

A name/title bar that slides in, holds, then slides out — typically layered over other footage via `<Sequence>` with a transparent background.

```tsx
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export const LowerThird: React.FC<{ name: string; role: string }> = ({ name, role }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const slideIn = interpolate(frame, [0, fps * 0.5], [-400, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const slideOut = interpolate(
    frame,
    [durationInFrames - fps * 0.5, durationInFrames],
    [0, -400],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const x = frame < durationInFrames - fps * 0.5 ? slideIn : slideOut;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 100,
        left: 0,
        transform: `translateX(${x}px)`,
        background: 'rgba(20,20,20,0.85)',
        padding: '16px 32px',
        borderLeft: '6px solid #4f46e5',
        color: 'white',
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 700 }}>{name}</div>
      <div style={{ fontSize: 20, opacity: 0.8 }}>{role}</div>
    </div>
  );
};
```

Overlay it on top of a base scene with a `<Sequence>` timed to when it should appear:

```tsx
<Sequence from={60} durationInFrames={150}>
  <LowerThird name="Harui" role="Founder, Cutiee" />
</Sequence>
```

## 4. Scene Transitions

For simple crossfades/wipes between two `<Sequence>`s, overlap their ranges and interpolate opacity/transform in each. For more elaborate transition libraries (slide, wipe, flip, clock-wipe), use `@remotion/transitions`:

```tsx
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { fade } from '@remotion/transitions/fade';

export const TransitionedScenes: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={90}>
      <SceneOne />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={slide()}
      timing={linearTiming({ durationInFrames: 20 })}
    />
    <TransitionSeries.Sequence durationInFrames={90}>
      <SceneTwo />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 15 })}
    />
    <TransitionSeries.Sequence durationInFrames={90}>
      <SceneThree />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
```

`TransitionSeries` automatically overlaps adjacent sequences by the transition's duration — no manual offset math needed. Install with `install_package(["@remotion/transitions"])`, pinned to the same version as `remotion`.

Note that `TransitionSeries` *shortens* total duration: each transition overlaps its neighbours by the transition's own `durationInFrames`. Total = sum of sequence durations − sum of transition durations. Compute the composition's `durationInFrames` that way rather than just summing the scenes, or the video will end on a frozen tail.
