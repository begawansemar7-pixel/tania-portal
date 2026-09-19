import type { AvatarExpression, AvatarState } from '@tania/types';
import { STATE_EXPRESSION } from '@tania/types';

export type FaceWeights = Record<string, number>;

/**
 * Blendshape weights for each expression.
 *
 * ARKit names, which most GLB and VRM exports use. The weights are restrained:
 * a face pinned at full strength reads as a mascot, and TANIA is meant to look
 * like a colleague.
 */
export const EXPRESSION_WEIGHTS: Record<AvatarExpression, FaceWeights> = {
  friendly: { mouthSmile: 0.35, browInnerUp: 0.1, cheekSquint: 0.15 },
  focused: { browDownLeft: 0.25, browDownRight: 0.25, eyeSquint: 0.2, mouthPress: 0.1 },
  thinking: { browInnerUp: 0.35, eyeLookUp: 0.3, mouthPucker: 0.15 },
  confident: { mouthSmile: 0.25, browOuterUp: 0.15, cheekSquint: 0.1 },
  cheerful: { mouthSmile: 0.7, cheekSquint: 0.45, eyeSquint: 0.3, browOuterUp: 0.2 },
  concerned: { browInnerUp: 0.5, mouthFrown: 0.3, eyeWide: 0.15 },
  apologetic: { browInnerUp: 0.6, mouthFrown: 0.2, eyeLookDown: 0.25 },
};

/** Seconds for a face to reach a new expression. Slower reads as sincere. */
export const EXPRESSION_SECONDS = 0.45;

/** How long a blink takes, closed included. */
export const BLINK_SECONDS = 0.13;

/** Blink gap range in seconds. Humans blink every 2–8 seconds at rest. */
export const BLINK_MIN_SECONDS = 2.2;
export const BLINK_MAX_SECONDS = 7.5;

/** Listening holds eye contact, so blinks come further apart. */
export const BLINK_ATTENTIVE_SCALE = 1.5;

export interface ExpressionControllerOptions {
  /** Injected so a test gets a predictable blink rhythm. */
  random?: () => number;
}

/**
 * The face.
 *
 * Owns three things that must not fight each other: the expression the state
 * calls for, blinking, and the micro-movement that keeps a face from looking
 * switched off. It writes brows, cheeks and eyelids — never the mouth shapes
 * lip sync uses, so a smile survives a spoken sentence.
 *
 * Blinking matters more than it sounds. An unblinking face is the single
 * clearest signal that a character is frozen, and it is noticed long before
 * anyone can say why.
 */
export class ExpressionController {
  private current: FaceWeights = {};
  private target: AvatarExpression = 'friendly';
  private state: AvatarState = 'IDLE';

  private nextBlinkIn: number;
  private blinkElapsed: number | null = null;
  private elapsed = 0;

  private readonly random: () => number;

  constructor(options: ExpressionControllerOptions = {}) {
    this.random = options.random ?? Math.random;
    this.nextBlinkIn = this.scheduleBlink();
  }

  get expression(): AvatarExpression {
    return this.target;
  }

  /** Follows the state unless the command named an expression explicitly. */
  setState(state: AvatarState, expression?: AvatarExpression): void {
    this.state = state;
    this.target = expression ?? STATE_EXPRESSION[state];
  }

  /** Forces a blink, e.g. when an answer lands. */
  blink(): void {
    if (this.blinkElapsed === null) this.blinkElapsed = 0;
  }

  /**
   * Advances the face by one frame and returns the weights to write.
   *
   * Framerate independent: the same blend takes the same wall-clock time at
   * 30fps and at 120fps, so a face does not transition twice as fast on a
   * better machine.
   */
  update(delta: number): FaceWeights {
    this.elapsed += delta;
    this.current = damp(this.current, EXPRESSION_WEIGHTS[this.target] ?? {}, delta, EXPRESSION_SECONDS);

    return { ...this.current, ...this.eyelids(delta), ...this.microMotion() };
  }

  /** Eyelid weights for the blink in progress, if any. */
  private eyelids(delta: number): FaceWeights {
    if (this.blinkElapsed !== null) {
      this.blinkElapsed += delta;

      if (this.blinkElapsed >= BLINK_SECONDS) {
        this.blinkElapsed = null;
        this.nextBlinkIn = this.scheduleBlink();
        return { eyeBlinkLeft: 0, eyeBlinkRight: 0 };
      }

      // Closes faster than it opens, as a real eyelid does.
      const progress = this.blinkElapsed / BLINK_SECONDS;
      const weight = progress < 0.4 ? progress / 0.4 : 1 - (progress - 0.4) / 0.6;

      return { eyeBlinkLeft: clamp(weight), eyeBlinkRight: clamp(weight) };
    }

    this.nextBlinkIn -= delta;
    if (this.nextBlinkIn <= 0) this.blinkElapsed = 0;

    return { eyeBlinkLeft: 0, eyeBlinkRight: 0 };
  }

  /**
   * Barely visible drift on the brows.
   *
   * Two slow sine waves at unrelated frequencies, so the face never settles
   * into a loop a viewer can spot. This is the difference between "still" and
   * "frozen".
   */
  private microMotion(): FaceWeights {
    const slow = Math.sin(this.elapsed * 0.7) * 0.02;
    const slower = Math.sin(this.elapsed * 0.31 + 1.1) * 0.015;

    return {
      browInnerUp: clamp((this.current.browInnerUp ?? 0) + slow + slower),
    };
  }

  private scheduleBlink(): number {
    const scale = this.state === 'LISTENING' ? BLINK_ATTENTIVE_SCALE : 1;
    const span = BLINK_MAX_SECONDS - BLINK_MIN_SECONDS;
    return (BLINK_MIN_SECONDS + this.random() * span) * scale;
  }
}

/** Exponential damping: same wall-clock blend whatever the framerate. */
export function damp(
  current: FaceWeights,
  target: FaceWeights,
  delta: number,
  seconds: number,
): FaceWeights {
  const rate = seconds <= 0 ? 1 : Math.min(1, 1 - Math.exp(-delta / (seconds / 3)));
  const next: FaceWeights = { ...current };

  for (const key of new Set([...Object.keys(current), ...Object.keys(target)])) {
    const from = current[key] ?? 0;
    const to = target[key] ?? 0;
    const value = from + (to - from) * rate;
    next[key] = Math.abs(value) < 0.001 ? 0 : value;
  }

  return next;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
