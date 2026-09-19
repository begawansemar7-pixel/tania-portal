'use client';

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import type { AnimationAction, AnimationMixer, Group, Object3D, PerspectiveCamera } from 'three';
import type { AvatarEventBus, GazeRegistry } from '@/lib/avatar';
import { MorphTargetRig, type AvatarRig } from './rig';
import { frameCamera } from './framing';
import { TaniaAnimator } from './TaniaAnimator';

/**
 * The avatar itself.
 *
 * Suspends while the asset loads — the caller wraps it in `Suspense`, which is
 * what keeps a multi-megabyte model from blocking the page. Everything that
 * moves is delegated to one animator running in the render loop, so this
 * component renders once and then gets out of the way.
 */
export function TaniaAvatar({
  assetUrl,
  bus,
  gaze,
  quality = 'full',
  onReady,
}: {
  assetUrl: string;
  bus: AvatarEventBus;
  gaze?: GazeRegistry;
  quality?: 'full' | 'reduced';
  onReady?: (rig: AvatarRig) => void;
}) {
  const gltf = useGLTF(assetUrl);
  const { actions, mixer } = useAnimations(gltf.animations, gltf.scene as unknown as Group);
  const camera = useThree((state) => state.camera);

  const root = useMemo(() => gltf.scene as unknown as Object3D, [gltf.scene]);

  // Derived from the model rather than held in state: there is nothing to
  // synchronise, and a render that rebuilt it would lose no information.
  const rig = useMemo(() => new MorphTargetRig(root), [root]);

  // Framed from the model's own bounds, so an asset authored at any scale or
  // origin arrives correctly composed instead of off-screen.
  useEffect(() => {
    frameCamera(root, camera as PerspectiveCamera, rig.head);
  }, [root, camera, rig]);

  useEffect(() => {
    onReady?.(rig);
  }, [rig, onReady]);

  // Three.js does not free GPU buffers when an object leaves the scene, so the
  // model is disposed explicitly and the loader cache is cleared — otherwise
  // mounting the avatar a few times leaks until the tab is reloaded.
  useEffect(() => {
    return () => {
      mixer?.stopAllAction();
      rig.dispose?.();
      useGLTF.clear(assetUrl);
    };
  }, [assetUrl, mixer, rig]);

  return (
    <group>
      <primitive object={root} />

      <TaniaAnimator
        rig={rig}
        mixer={(mixer as AnimationMixer | null) ?? null}
        actions={actions as unknown as Record<string, AnimationAction>}
        bus={bus}
        {...(gaze === undefined ? {} : { gaze })}
        quality={quality}
      />
    </group>
  );
}

/**
 * Starts fetching the asset before the scene mounts.
 *
 * Called from an idle callback by the controller, so the download overlaps
 * with whatever the user is already doing.
 */
export function preloadAvatar(assetUrl: string): void {
  useGLTF.preload(assetUrl);
}
