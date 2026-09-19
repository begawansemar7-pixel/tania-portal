import type { VisemeSource, VisemeTimeline } from '@tania/types';
import { planUtterance, planWord } from './viseme';

/** Mouth shape weights the renderer writes onto the rig. */
export type MouthShape = Record<string, number>;

/**
 * Blendshape weights for each viseme.
 *
 * Restrained on purpose: a mouth at full weight on every syllable reads as
 * shouting. Real speech barely opens.
 */
export const VISEME_SHAPES: Record<string, MouthShape> = {
  A: { jawOpen: 0.5, mouthFunnel: 0.08 },
  I: { mouthStretch: 0.45, jawOpen: 0.18 },
  U: { mouthPucker: 0.55, jawOpen: 0.12 },
  E: { mouthStretch: 0.32, jawOpen: 0.26 },
  O: { mouthFunnel: 0.5, jawOpen: 0.3 },
  MBP: { mouthClose: 0.55, mouthPress: 0.35 },
  FV: { mouthPress: 0.4, mouthFunnel: 0.15, jawOpen: 0.08 },
  SS: { mouthStretch: 0.3, mouthPress: 0.2, jawOpen: 0.06 },
  L: { jawOpen: 0.22, mouthStretch: 0.15 },
};

/** The closed mouth every shape relaxes back toward. */
export const MOUTH_REST: MouthShape = {
  jawOpen: 0,
  mouthFunnel: 0,
  mouthPucker: 0,
  mouthStretch: 0,
  mouthClose: 0,
  mouthPress: 0,
};

/** How far into a frame the mouth reaches its full shape. */
const ATTACK = 0.35;

export interface VisemeControllerOptions {
  /** Injected so tests drive time instead of waiting for it. */
  now?: () => number;
  /** How much amplitude alone may open the jaw, when that is all there is. */
  amplitudeGain?: number;
}

/**
 * The mouth.
 *
 * Prefers timing in this order, and says which it used:
 *
 * 1. **`engine`** — a timeline the speech engine produced. Nothing beats it.
 * 2. **`boundary`** — word starts measured by the engine; the shapes within a
 *    word are laid out from its letters.
 * 3. **`estimated`** — text only, paced at an average speaking rate.
 * 4. **`amplitude`** — loudness driving the jaw. Deliberately last: it is the
 *    thing that makes an avatar look like a nutcracker.
 *
 * The controller holds no React state and is sampled from the render loop, so
 * a mouth moving five times a second never re-renders anything.
 */
export class VisemeController {
  private timeline: VisemeTimeline | undefined;
  private startedAt = 0;
  private amplitude = 0;
  private speaking = false;
  private readonly now: () => number;

  constructor(private readonly options: VisemeControllerOptions = {}) {
    this.now = options.now ?? (() => performance.now());
  }

  /** What is currently driving the mouth. */
  get source(): VisemeSource | 'idle' {
    if (!this.speaking) return 'idle';
    return this.timeline?.source ?? 'amplitude';
  }

  get active(): boolean {
    return this.speaking;
  }

  /** Begins an utterance, with whatever timing is available. */
  start(input: { timeline?: VisemeTimeline; text?: string } = {}): void {
    this.speaking = true;
    this.startedAt = this.now();

    if (input.timeline?.frames.length) {
      this.timeline = input.timeline;
      return;
    }

    this.timeline = input.text ? planUtterance(input.text) : undefined;
  }

  /**
   * Records a word the engine just reached.
   *
   * Two things happen: the word's own shapes are laid out from `elapsedMs`,
   * and the clock is re-anchored to it. Re-anchoring is what stops the mouth
   * drifting out of step over a long answer, which is the failure that makes
   * boundary-based lip sync look worse than none.
   */
  word(word: string, elapsedMs: number | undefined, durationMs?: number): void {
    if (!this.speaking) this.start();

    const at = elapsedMs ?? this.elapsed();
    const span = durationMs ?? Math.max(180, word.length * 70);

    this.timeline = {
      frames: planWord(word, at, span),
      durationMs: at + span,
      source: elapsedMs === undefined ? 'estimated' : 'boundary',
    };

    this.startedAt = this.now() - at;
  }

  /** The last-resort driver, used only when no timing exists. */
  setAmplitude(amplitude: number): void {
    this.amplitude = Math.max(0, Math.min(1, amplitude));
  }

  stop(): void {
    this.speaking = false;
    this.timeline = undefined;
    this.amplitude = 0;
  }

  /**
   * The mouth shape right now.
   *
   * Adjacent frames are blended rather than cut between: co-articulation is
   * most of what separates speech from a flapping jaw.
   */
  sample(): MouthShape {
    if (!this.speaking) return MOUTH_REST;

    const frames = this.timeline?.frames;
    if (!frames || frames.length === 0) return this.fromAmplitude();

    const at = this.elapsed();
    const index = frames.findIndex((frame) => at >= frame.startMs && at < frame.endMs);

    if (index === -1) {
      // Past the end of what was planned: hold a relaxed mouth rather than
      // snapping shut, because more words are usually still coming.
      return at >= (this.timeline?.durationMs ?? 0) ? MOUTH_REST : this.fromAmplitude();
    }

    const frame = frames[index] as (typeof frames)[number];
    const span = Math.max(1, frame.endMs - frame.startMs);
    const progress = (at - frame.startMs) / span;

    const shape = VISEME_SHAPES[frame.viseme] ?? MOUTH_REST;
    const next = frames[index + 1];
    const upcoming = next ? (VISEME_SHAPES[next.viseme] ?? MOUTH_REST) : MOUTH_REST;

    // Rise into the shape, then lean toward the one that follows.
    const blend =
      progress < ATTACK
        ? mix(MOUTH_REST, shape, progress / ATTACK)
        : mix(shape, upcoming, (progress - ATTACK) / (1 - ATTACK));

    return blend;
  }

  private elapsed(): number {
    return this.now() - this.startedAt;
  }

  /** Jaw only: guessing a mouth shape from loudness would be inventing one. */
  private fromAmplitude(): MouthShape {
    const gain = this.options.amplitudeGain ?? 0.45;
    return { ...MOUTH_REST, jawOpen: this.amplitude * gain };
  }
}

export function mix(from: MouthShape, to: MouthShape, t: number): MouthShape {
  const amount = Math.max(0, Math.min(1, t));
  const result: MouthShape = {};

  for (const key of new Set([...Object.keys(from), ...Object.keys(to), ...Object.keys(MOUTH_REST)])) {
    const a = from[key] ?? 0;
    const b = to[key] ?? 0;
    result[key] = a + (b - a) * amount;
  }

  return result;
}
