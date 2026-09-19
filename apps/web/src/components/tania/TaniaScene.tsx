'use client';

import { Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import type { AvatarEventBus, GazeRegistry } from '@/lib/avatar';
import { TaniaAvatar } from './TaniaAvatar';
import type { AvatarRig } from './rig';

export interface TaniaSceneProps {
  assetUrl: string;
  bus: AvatarEventBus;
  gaze?: GazeRegistry;
  /** `reduced` drops idle motion and caps resolution on a weaker device. */
  quality?: 'full' | 'reduced';
  onReady?: () => void;
  onError?: () => void;
  className?: string;
}

/**
 * The WebGL canvas and its lighting.
 *
 * Three performance choices, all deliberate:
 *
 * - The device pixel ratio is capped at 2 — and at 1.5 on a reduced-quality
 *   device, where the cost is real and the difference is not.
 * - `powerPreference: 'low-power'` — this is a companion in the corner of a
 *   workspace, not the reason the machine has a GPU.
 * - No environment map. It is the single most expensive thing a small scene
 *   like this can load, and three directional lights read just as well.
 */
export function TaniaScene({
  assetUrl,
  bus,
  gaze,
  quality = 'full',
  onReady,
  onError,
  className,
}: TaniaSceneProps) {
  const handleReady = useCallback((_rig: AvatarRig) => onReady?.(), [onReady]);

  return (
    <Canvas
      className={className}
      dpr={quality === 'full' ? [1, 2] : [1, 1.5]}
      camera={{ position: [0, 1.45, 1.9], fov: 28 }}
      gl={{ antialias: quality === 'full', powerPreference: 'low-power' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', () => onError?.(), { once: true });
      }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[2, 4, 3]} intensity={1.1} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />
      <directionalLight position={[0, 1, -4]} intensity={0.3} />

      <Suspense fallback={null}>
        <TaniaAvatar
          assetUrl={assetUrl}
          bus={bus}
          {...(gaze === undefined ? {} : { gaze })}
          quality={quality}
          onReady={handleReady}
        />
      </Suspense>
    </Canvas>
  );
}
