import type { AvatarGesture, AvatarState } from '@tania/types';
import { STATE_GESTURE } from '@tania/types';

/**
 * Animation clip names, in the order each gesture prefers them.
 *
 * Several per gesture because exporters disagree: Mixamo, VRoid and
 * hand-authored rigs all label the same wave differently, and the avatar asset
 * is provided separately.
 */
export const GESTURE_CLIPS: Record<AvatarGesture, string[]> = {
  wave: ['wave', 'Wave', 'greeting', 'Armature|wave'],
  explain: ['explain', 'Explain', 'talking', 'Talk', 'gesture_talk'],
  point: ['point', 'Point', 'pointing'],
  nod: ['nod', 'Nod', 'agree', 'yes'],
  thinking: ['thinking', 'Thinking', 'idle_think', 'ponder'],
  'thumbs-up': ['thumbsUp', 'thumbs_up', 'ThumbsUp', 'approve'],
};

export const IDLE_CLIPS = ['idle', 'Idle', 'breathing', 'Armature|idle'];

/** Seconds to cross-fade between two clips. */
export const GESTURE_FADE_SECONDS = 0.3;

/** Gestures that play once and hand back to idle rather than looping. */
const ONE_SHOT: AvatarGesture[] = ['wave', 'point', 'nod', 'thumbs-up'];

export function isOneShot(gesture: AvatarGesture): boolean {
  return ONE_SHOT.includes(gesture);
}

/**
 * Picks the first clip the rig actually has.
 *
 * Returns undefined rather than falling back to an arbitrary clip: playing a
 * wave when a point was asked for is worse than standing still.
 */
export function resolveClip(available: string[], candidates: string[]): string | undefined {
  const lookup = new Map(available.map((name) => [name.toLowerCase(), name]));

  for (const candidate of candidates) {
    const match = lookup.get(candidate.toLowerCase());
    if (match) return match;
  }

  // Suffix match catches exporters that prefix every clip with the rig name.
  for (const candidate of candidates) {
    const found = available.find((name) =>
      name.toLowerCase().endsWith(`|${candidate.toLowerCase()}`),
    );
    if (found) return found;
  }

  return undefined;
}

export interface GesturePlan {
  /** Clip to play, or undefined to stay on idle. */
  clip: string | undefined;
  loop: boolean;
  /** True when this clip should hand back to idle once it finishes. */
  returnsToIdle: boolean;
  fadeSeconds: number;
}

export interface GestureControllerOptions {
  /** Shortest gap between two gestures, so the avatar is not twitchy. */
  minIntervalMs?: number;
  now?: () => number;
}

const DEFAULT_MIN_INTERVAL_MS = 900;

/**
 * Decides what the body does.
 *
 * Two rules do most of the work. A gesture is not replayed while the same one
 * is still running, and a new gesture waits a moment after the last — without
 * that, an answer arriving as several stream chunks makes the avatar fire the
 * explain gesture over and over and look agitated.
 *
 * The state's default gesture is used unless a command named one, so
 * `{state: "speaking"}` alone still produces a body that moves.
 */
export class GestureController {
  private currentGesture: AvatarGesture | undefined;
  private lastChangeAt = Number.NEGATIVE_INFINITY;
  private readonly now: () => number;

  constructor(private readonly options: GestureControllerOptions = {}) {
    this.now = options.now ?? (() => performance.now());
  }

  get gesture(): AvatarGesture | undefined {
    return this.currentGesture;
  }

  /**
   * Chooses a gesture for a state.
   *
   * Returns undefined when nothing should change, so a caller can skip the
   * cross-fade entirely rather than restarting the clip it is already playing.
   */
  select(state: AvatarState, requested?: AvatarGesture): AvatarGesture | undefined {
    const wanted = requested ?? STATE_GESTURE[state];

    // Idle and listening are deliberately still: an avatar that keeps
    // gesturing while a person speaks reads as impatient, not attentive.
    if (wanted === undefined) {
      this.currentGesture = undefined;
      return undefined;
    }

    if (wanted === this.currentGesture) return undefined;

    const interval = this.options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    if (this.now() - this.lastChangeAt < interval) return undefined;

    this.currentGesture = wanted;
    this.lastChangeAt = this.now();
    return wanted;
  }

  /** How to play a gesture on a rig that has these clips. */
  plan(gesture: AvatarGesture, available: string[]): GesturePlan {
    const clip = resolveClip(available, GESTURE_CLIPS[gesture] ?? []);
    const oneShot = isOneShot(gesture);

    return {
      clip,
      loop: !oneShot,
      returnsToIdle: oneShot,
      fadeSeconds: GESTURE_FADE_SECONDS,
    };
  }

  /** Clears the memory of what is playing, e.g. when the model is replaced. */
  reset(): void {
    this.currentGesture = undefined;
    this.lastChangeAt = Number.NEGATIVE_INFINITY;
  }
}
