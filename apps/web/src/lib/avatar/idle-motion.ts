import type { AvatarGazeTarget, AvatarState } from '@tania/types';
import { isBuiltinGaze } from '@tania/types';

export interface Pose {
  /** Head rotation in radians. */
  headYaw: number;
  headPitch: number;
  headRoll: number;
  /** Chest scale offset from breathing, as a fraction. */
  breath: number;
}

/** Head yaw and pitch for each built-in target. */
export const GAZE_ANGLES: Record<string, { yaw: number; pitch: number }> = {
  user: { yaw: 0, pitch: 0 },
  screen: { yaw: 0, pitch: 0.12 },
  // Looking away and slightly up is what makes thinking legible from outside.
  away: { yaw: 0.35, pitch: -0.18 },
  idle: { yaw: 0.08, pitch: 0.04 },
};

/** How far the head may turn, so it never looks dislocated. */
export const MAX_YAW = 0.5;
export const MAX_PITCH = 0.3;

/** Seconds to settle on a new target. */
export const GAZE_SECONDS = 0.35;

/** Breaths per minute at rest, and while speaking. */
export const BREATH_RATE_IDLE = 14;
export const BREATH_RATE_SPEAKING = 19;

/** How much the chest moves. Barely visible, which is the point. */
export const BREATH_DEPTH = 0.018;

/**
 * Named regions the avatar can look at.
 *
 * Registered by the interface, because the avatar layer cannot know what
 * regions a screen has — and looking at the thing being discussed is most of
 * what makes a character feel present.
 */
/** A rectangle on screen. Kept structural so tests need no DOM. */
export interface GazeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How much of the head's range a region at the edge of the screen claims. */
export const REGION_GAZE_SCALE = 1.6;

/**
 * Head angles that point from the avatar toward a region on screen.
 *
 * Derived from geometry rather than configured per region, because configured
 * angles go stale the moment a panel moves — and the whole value of looking at
 * something is that it is *that* thing, not a direction that used to be it.
 *
 * The offset is measured in viewport halves, so a panel on the far edge claims
 * most of the head's range and one just beside the avatar barely turns it.
 */
export function anglesForRegion(
  anchor: GazeRect,
  region: GazeRect,
  viewport: { width: number; height: number },
): { yaw: number; pitch: number } {
  const from = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  const to = { x: region.x + region.width / 2, y: region.y + region.height / 2 };

  const halfWidth = Math.max(1, viewport.width / 2);
  const halfHeight = Math.max(1, viewport.height / 2);

  return {
    yaw: clamp(((to.x - from.x) / halfWidth) * MAX_YAW * REGION_GAZE_SCALE, MAX_YAW),
    // Screen y grows downward; a region below the avatar tilts the head down.
    pitch: clamp(((to.y - from.y) / halfHeight) * MAX_PITCH * REGION_GAZE_SCALE, MAX_PITCH),
  };
}

/**
 * Named regions the avatar can look at.
 *
 * Registered by the interface, because the avatar layer cannot know what
 * regions a screen has. A region may be given as fixed angles or, better, as
 * an element — the angles are then recomputed from where it actually is, so a
 * resized window or a collapsed panel does not leave the avatar staring at
 * where something used to be.
 */
export class GazeRegistry {
  private readonly fixed = new Map<string, { yaw: number; pitch: number }>();
  private readonly elements = new Map<string, () => GazeRect | undefined>();

  /** Where the avatar itself is, so angles can be measured from it. */
  private anchor: (() => GazeRect | undefined) | undefined;
  private viewport: (() => { width: number; height: number }) | undefined;

  setAnchor(anchor: () => GazeRect | undefined): void {
    this.anchor = anchor;
  }

  setViewport(viewport: () => { width: number; height: number }): void {
    this.viewport = viewport;
  }

  register(name: string, angles: { yaw: number; pitch: number }): void {
    this.fixed.set(name.toLowerCase(), angles);
  }

  /** Registers a region by where it is on screen. Returns an unregister. */
  registerRegion(name: string, rect: () => GazeRect | undefined): () => void {
    const key = name.toLowerCase();
    this.elements.set(key, rect);
    return () => {
      this.elements.delete(key);
    };
  }

  /** Names currently registered, for diagnostics and tests. */
  names(): string[] {
    return [...new Set([...this.fixed.keys(), ...this.elements.keys()])];
  }

  resolve(target: AvatarGazeTarget, pointer: { x: number; y: number }): { yaw: number; pitch: number } {
    const name = String(target).toLowerCase();

    // The user is tracked rather than fixed: that is what reads as attention.
    if (name === 'user') {
      return {
        yaw: clamp(pointer.x * MAX_YAW, MAX_YAW),
        pitch: clamp(-pointer.y * MAX_PITCH, MAX_PITCH),
      };
    }

    const measured = this.measure(name);
    if (measured) return measured;

    const registered = this.fixed.get(name);
    if (registered) {
      return { yaw: clamp(registered.yaw, MAX_YAW), pitch: clamp(registered.pitch, MAX_PITCH) };
    }

    // An unregistered name falls back to the screen rather than snapping the
    // head somewhere arbitrary.
    return GAZE_ANGLES[isBuiltinGaze(name) ? name : 'screen'] as { yaw: number; pitch: number };
  }

  /**
   * Angles for a region that is currently on screen.
   *
   * Returns undefined when the region, the avatar or the viewport cannot be
   * measured — a region that has unmounted must fall through to the fixed
   * angles or the default, not freeze the head at its last known position.
   */
  private measure(name: string): { yaw: number; pitch: number } | undefined {
    const region = this.elements.get(name)?.();
    const anchor = this.anchor?.();
    const viewport = this.viewport?.();

    if (!region || !anchor || !viewport) return undefined;
    if (region.width === 0 && region.height === 0) return undefined;

    return anglesForRegion(anchor, region, viewport);
  }
}

export interface IdleMotionOptions {
  random?: () => number;
}

/**
 * The movement that keeps the avatar alive.
 *
 * Breathing, a slow head sway, and micro-saccades — none of it meaningful, all
 * of it necessary. A character that holds perfectly still between utterances
 * does not read as calm; it reads as crashed, and the brief once said the
 * avatar must never appear frozen during conversation.
 *
 * The sway uses two sine waves at unrelated frequencies so it never settles
 * into a visible loop.
 */
export class IdleMotion {
  private elapsed = 0;
  private saccade = { yaw: 0, pitch: 0 };
  private nextSaccadeIn: number;
  private readonly random: () => number;

  constructor(options: IdleMotionOptions = {}) {
    this.random = options.random ?? Math.random;
    this.nextSaccadeIn = 1 + this.random() * 3;
  }

  /**
   * Advances by one frame.
   *
   * `speaking` raises the breathing rate: people breathe faster when talking,
   * and the difference is felt even when it is not noticed.
   */
  update(delta: number, state: AvatarState): { sway: { yaw: number; pitch: number; roll: number }; breath: number } {
    this.elapsed += delta;

    this.nextSaccadeIn -= delta;
    if (this.nextSaccadeIn <= 0) {
      // Eyes flick somewhere nearby, then the timer resets.
      this.saccade = {
        yaw: (this.random() - 0.5) * 0.06,
        pitch: (this.random() - 0.5) * 0.04,
      };
      this.nextSaccadeIn = 1 + this.random() * 3;
    }

    const rate = state === 'SPEAKING' ? BREATH_RATE_SPEAKING : BREATH_RATE_IDLE;
    const breath = Math.sin((this.elapsed * rate * Math.PI * 2) / 60) * BREATH_DEPTH;

    return {
      sway: {
        yaw: Math.sin(this.elapsed * 0.43) * 0.035 + this.saccade.yaw,
        pitch: Math.sin(this.elapsed * 0.27 + 2.1) * 0.022 + this.saccade.pitch,
        roll: Math.sin(this.elapsed * 0.19 + 0.7) * 0.015,
      },
      breath,
    };
  }
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
