import type { AvatarFallbackReason } from '@tania/types';

export interface AvatarEnvironment {
  /** Where the GLB/VRM lives. Absent until an asset is configured. */
  assetUrl?: string;
  prefersReducedMotion: boolean;
  hasWebgl: boolean;
  viewportWidth: number;
  /** `navigator.deviceMemory` in GB, when the browser reports it. */
  deviceMemoryGb?: number;
  /** `navigator.hardwareConcurrency`, when reported. */
  cores?: number;
}

export type AvatarQuality = 'full' | 'reduced';

export type AvatarDecision =
  | { mode: 'scene'; assetUrl: string; quality: AvatarQuality }
  | { mode: 'fallback'; reason: AvatarFallbackReason };

/** Below this the scene crowds out the conversation it is meant to support. */
export const MIN_SCENE_WIDTH = 768;

/** Below this a WebGL scene competes with the page for memory it cannot spare. */
export const MIN_DEVICE_MEMORY_GB = 2;

/** Below this the scene runs, but without idle motion and at a lower dpr. */
export const REDUCED_QUALITY_MEMORY_GB = 4;

/** Below this core count the same applies: render, but spend less per frame. */
export const REDUCED_QUALITY_CORES = 4;

/**
 * Decides whether to render the 3D scene at all.
 *
 * Ordered by how hard each reason is to argue with: no asset and no WebGL are
 * facts, reduced motion is an explicit request, and the last two are judgements
 * about small devices. Getting the order right matters because the reason is
 * shown to the user — "peramban tidak mendukung WebGL" is useless advice when
 * the real reason is that they asked for less motion.
 *
 * Reduced motion switches the scene off rather than merely slowing it: the
 * request is about vestibular comfort, and a continuously animated face is the
 * thing being asked about.
 */
export function decideAvatar(environment: AvatarEnvironment): AvatarDecision {
  if (!environment.assetUrl) return { mode: 'fallback', reason: 'no-asset' };
  if (!environment.hasWebgl) return { mode: 'fallback', reason: 'no-webgl' };
  if (environment.prefersReducedMotion) return { mode: 'fallback', reason: 'reduced-motion' };
  if (environment.viewportWidth < MIN_SCENE_WIDTH) {
    return { mode: 'fallback', reason: 'small-screen' };
  }
  if (
    environment.deviceMemoryGb !== undefined &&
    environment.deviceMemoryGb < MIN_DEVICE_MEMORY_GB
  ) {
    return { mode: 'fallback', reason: 'small-screen' };
  }

  // Between "cannot" and "comfortably": the scene runs, but idle motion is
  // dropped and the pixel ratio capped. Degrading beats refusing when the
  // device can manage something.
  const modest =
    (environment.deviceMemoryGb !== undefined &&
      environment.deviceMemoryGb < REDUCED_QUALITY_MEMORY_GB) ||
    (environment.cores !== undefined && environment.cores < REDUCED_QUALITY_CORES);

  return {
    mode: 'scene',
    assetUrl: environment.assetUrl,
    quality: modest ? 'reduced' : 'full',
  };
}

/** Why the 2D presence is showing, in words a user can act on. */
export const FALLBACK_REASON_TEXT: Record<AvatarFallbackReason, string> = {
  'no-asset': 'Aset avatar 3D belum dikonfigurasi.',
  'no-webgl': 'Peramban ini tidak mendukung WebGL.',
  'reduced-motion': 'Mengikuti preferensi kurangi animasi pada perangkat Anda.',
  'small-screen': 'Layar kecil — avatar 3D dinonaktifkan agar percakapan tetap lapang.',
  'load-failed': 'Aset avatar gagal dimuat.',
};

/** Reads the environment from the browser. Returns safe values on the server. */
export function readAvatarEnvironment(assetUrl?: string): AvatarEnvironment {
  if (typeof window === 'undefined') {
    return {
      ...(assetUrl === undefined ? {} : { assetUrl }),
      prefersReducedMotion: false,
      hasWebgl: false,
      viewportWidth: 0,
    };
  }

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;

  return {
    ...(assetUrl === undefined ? {} : { assetUrl }),
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    hasWebgl: detectWebgl(),
    viewportWidth: window.innerWidth,
    ...(memory === undefined ? {} : { deviceMemoryGb: memory }),
    ...(cores === undefined ? {} : { cores }),
  };
}

/**
 * Whether a WebGL context can actually be created.
 *
 * Feature-detected by trying, not by checking for the constructor: a browser
 * can expose `WebGLRenderingContext` and still refuse a context on a blocked
 * or exhausted GPU.
 */
function detectWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}
