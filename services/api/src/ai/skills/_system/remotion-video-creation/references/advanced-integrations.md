# Advanced Integrations: 3D, Lottie, Audio-Reactive, Product Demos

## 1. Three.js / WebGL scenes

Use `@remotion/three`, which wraps `@react-three/fiber` and syncs its render loop to Remotion's frame clock (critical — R3F's default loop runs on `requestAnimationFrame`, which is wall-clock time and non-deterministic for rendering; `ThreeCanvas` replaces that with frame-driven rendering).

```tsx
import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useMemo } from 'react';

export const RotatingCube: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const rotation = (frame / fps) * Math.PI; // half rotation per second

  return (
    <ThreeCanvas width={width} height={height}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 2, 2]} />
      <mesh rotation={[rotation, rotation, 0]}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#4f46e5" />
      </mesh>
    </ThreeCanvas>
  );
};
```

Install: `install_package(["@remotion/three", "@react-three/fiber", "three"])` — with `@remotion/three` pinned to the same version as `remotion`.

## 2. Lottie animations

Use `@remotion/lottie` to play After Effects/Lottie JSON exports frame-synced (also replaces internal wall-clock playback with frame-driven playback).

```tsx
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { staticFile, continueRender, delayRender } from 'remotion';
import { useEffect, useState } from 'react';

export const LottieScene: React.FC = () => {
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender('Loading Lottie JSON'));

  useEffect(() => {
    fetch(staticFile('confetti.json'))
      .then((r) => r.json())
      .then((data) => {
        setAnimationData(data);
        continueRender(handle);
      });
  }, [handle]);

  if (!animationData) return null;
  return <Lottie animationData={animationData} />;
};
```

Install: `install_package(["@remotion/lottie"])`, pinned to the same version as `remotion`. `delayRender`/`continueRender` are the general mechanism for "wait for an async asset before capturing this frame" — the same pattern applies to fonts, remote images, or any fetched data.

## 3. Audio-reactive visuals

Drive motion (bar height, scale, glow) from the audio's actual waveform rather than a canned animation, using `@remotion/media-utils`.

```tsx
import { useAudioData, visualizeAudio } from '@remotion/media-utils';
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export const AudioReactiveOrb: React.FC<{ audioSrc: string }> = ({ audioSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(staticFile(audioSrc));
  if (!audioData) return null;

  const [bass] = visualizeAudio({ fps, frame, audioData, numberOfSamples: 4 });
  const scale = 1 + bass * 2;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Audio src={staticFile(audioSrc)} />
      <div
        style={{
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #818cf8, #4f46e5)',
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
};
```

## 4. Product Demo / Screen-Recording Style Videos

Two common approaches:

**A. Overlay real screen recording with animated annotations** — import the recording as `<OffthreadVideo>` (preferred over `<Video>` for reliability on longer/heavier source files) and layer callouts/zooms on top, synced to frame ranges you've identified by scrubbing the source in Studio.

```tsx
import { OffthreadVideo, staticFile, Sequence, interpolate, useCurrentFrame } from 'remotion';

const Callout: React.FC<{ label: string; x: number; y: number }> = ({ label, x, y }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `scale(${scale})`,
        background: '#facc15',
        color: '#111',
        padding: '8px 14px',
        borderRadius: 20,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
};

export const ProductDemo: React.FC = () => (
  <>
    <OffthreadVideo src={staticFile('screen-recording.mp4')} />
    <Sequence from={45} durationInFrames={60}>
      <Callout label="Click here to export" x={640} y={220} />
    </Sequence>
  </>
);
```

**B. Fully synthetic UI mockups** — build the "fake UI" as real React/HTML/CSS (buttons, cursors, panels) and animate cursor movement, clicks, and panel transitions directly with `interpolate`/`spring`, giving pixel-perfect control without needing an actual recording. This is the better fit when the underlying product UI changes often (mockup stays maintainable as code) or when the demo needs to show a hypothetical/future state.

```tsx
const AnimatedCursor: React.FC<{ path: { x: number; y: number; atFrame: number }[] }> = ({ path }) => {
  const frame = useCurrentFrame();
  // interpolate x/y independently across the waypoint list
  const x = interpolate(frame, path.map((p) => p.atFrame), path.map((p) => p.x), { extrapolateRight: 'clamp' });
  const y = interpolate(frame, path.map((p) => p.atFrame), path.map((p) => p.y), { extrapolateRight: 'clamp' });
  return <div style={{ position: 'absolute', left: x, top: y, fontSize: 24 }}>👆</div>;
};
```
