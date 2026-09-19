/**
 * Avatar contract.
 *
 * The avatar is the human interface layer: it shows what TANIA is doing, never
 * what TANIA is thinking. So this file describes appearance and nothing else —
 * a state to hold, a face to wear, a gesture to make, somewhere to look. No
 * reasoning, no evidence, no tool names cross this boundary.
 */

export const AVATAR_STATES = [
  'IDLE',
  'LISTENING',
  'THINKING',
  'SPEAKING',
  'SUCCESS',
  'WARNING',
  'ERROR',
] as const;

export type AvatarState = (typeof AVATAR_STATES)[number];

export const AVATAR_EXPRESSIONS = [
  'friendly',
  'focused',
  'thinking',
  'confident',
  'cheerful',
  'concerned',
  'apologetic',
] as const;

export type AvatarExpression = (typeof AVATAR_EXPRESSIONS)[number];

export const AVATAR_GESTURES = [
  'wave',
  'explain',
  'point',
  'nod',
  'thinking',
  'thumbs-up',
] as const;

export type AvatarGesture = (typeof AVATAR_GESTURES)[number];

/** Where the avatar looks. `user` tracks the pointer; `away` breaks contact. */
export const AVATAR_GAZE_TARGETS = ['user', 'screen', 'away', 'idle'] as const;

export type AvatarGazeBuiltin = (typeof AVATAR_GAZE_TARGETS)[number];

/**
 * A gaze target.
 *
 * Either a built-in direction or the name of a region the interface
 * registered — `dashboard`, `result`, `approval`. Looking at the thing being
 * discussed is most of what makes an avatar feel present, and the avatar layer
 * cannot know in advance what regions a screen has.
 */
export type AvatarGazeTarget = AvatarGazeBuiltin | (string & {});

export function isBuiltinGaze(value: string): value is AvatarGazeBuiltin {
  return (AVATAR_GAZE_TARGETS as readonly string[]).includes(value);
}

/**
 * One instruction to the avatar.
 *
 * Every field is optional except `state`, because most commands change one
 * thing: a reply that starts arriving changes the state, not the expression.
 * Omitted fields keep whatever the avatar already had, so a caller never has to
 * restate the whole pose to nudge one part of it.
 */
export interface TaniaCommand {
  state: AvatarState;
  emotion?: AvatarExpression;
  gesture?: AvatarGesture;
  gaze?: AvatarGazeTarget;
  /**
   * Speech driving the mouth.
   *
   * `viseme` is a mouth shape id and `amplitude` is 0–1 loudness. `text` is
   * carried for subtitles only — the avatar never reads it aloud itself.
   */
  speech?: {
    viseme?: string;
    amplitude?: number;
    text?: string;
  };
}

/** The default face for each state, when a command does not name one. */
export const STATE_EXPRESSION: Record<AvatarState, AvatarExpression> = {
  IDLE: 'friendly',
  LISTENING: 'focused',
  THINKING: 'thinking',
  SPEAKING: 'confident',
  SUCCESS: 'cheerful',
  WARNING: 'concerned',
  ERROR: 'apologetic',
};

/**
 * The gesture each state reaches for by default.
 *
 * Only states with something to say have one: idling and listening are still,
 * because an avatar that keeps gesturing while a person speaks reads as
 * impatient rather than attentive.
 */
export const STATE_GESTURE: Partial<Record<AvatarState, AvatarGesture>> = {
  THINKING: 'thinking',
  SPEAKING: 'explain',
  SUCCESS: 'thumbs-up',
};

/** Where the avatar looks in each state, unless told otherwise. */
export const STATE_GAZE: Record<AvatarState, AvatarGazeTarget> = {
  IDLE: 'idle',
  LISTENING: 'user',
  // Looking away while thinking is what makes thinking legible.
  THINKING: 'away',
  SPEAKING: 'user',
  SUCCESS: 'user',
  WARNING: 'user',
  ERROR: 'user',
};

/** Fills a partial command with the defaults its state implies. */
export function resolveCommand(command: TaniaCommand): Required<Omit<TaniaCommand, 'speech'>> & {
  speech?: TaniaCommand['speech'];
} {
  return {
    state: command.state,
    emotion: command.emotion ?? STATE_EXPRESSION[command.state],
    gesture: command.gesture ?? STATE_GESTURE[command.state] ?? 'nod',
    gaze: command.gaze ?? STATE_GAZE[command.state],
    ...(command.speech === undefined ? {} : { speech: command.speech }),
  };
}

export function isAvatarState(value: unknown): value is AvatarState {
  return (AVATAR_STATES as readonly unknown[]).includes(value);
}

export function isAvatarExpression(value: unknown): value is AvatarExpression {
  return (AVATAR_EXPRESSIONS as readonly unknown[]).includes(value);
}

export function isAvatarGesture(value: unknown): value is AvatarGesture {
  return (AVATAR_GESTURES as readonly unknown[]).includes(value);
}

/**
 * Accepts a command written in either case.
 *
 * The documented example uses lowercase (`state: "speaking"`), while the type
 * is uppercase. Rather than make callers remember which, anything that names a
 * known value is accepted and normalised; anything unrecognised is dropped
 * instead of being passed through to a renderer that cannot use it.
 */
export function parseAvatarCommand(input: unknown): TaniaCommand | undefined {
  if (typeof input !== 'object' || input === null) return undefined;

  const raw = input as Record<string, unknown>;
  const state = upper(raw.state);
  if (!isAvatarState(state)) return undefined;

  const emotion = lower(raw.emotion);
  const gesture = lower(raw.gesture);
  const gaze = lower(raw.gaze);

  return {
    state,
    ...(isAvatarExpression(emotion) ? { emotion } : {}),
    ...(isAvatarGesture(gesture) ? { gesture } : {}),
    ...(typeof gaze === 'string' && gaze.length > 0 ? { gaze } : {}),
    ...(isSpeech(raw.speech) ? { speech: raw.speech } : {}),
  };
}

function upper(value: unknown): unknown {
  return typeof value === 'string' ? value.toUpperCase() : value;
}

function lower(value: unknown): unknown {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

function isSpeech(value: unknown): value is TaniaCommand['speech'] {
  return typeof value === 'object' && value !== null;
}

// ── Viseme timing ────────────────────────────────────────────────────────────

/** One mouth shape, held for a span of the utterance. */
export interface VisemeFrame {
  viseme: string;
  /** Milliseconds from the start of the utterance. */
  startMs: number;
  endMs: number;
}

/**
 * Where a timeline's timing came from.
 *
 * Carried so the interface, the tests and a future engine can all tell an
 * engine-reported timeline from one TANIA estimated. Pretending the two are
 * equally accurate would hide the only thing that makes lip sync convincing.
 */
export const VISEME_SOURCES = ['engine', 'boundary', 'estimated', 'amplitude'] as const;

export type VisemeSource = (typeof VISEME_SOURCES)[number];

export interface VisemeTimeline {
  frames: VisemeFrame[];
  durationMs: number;
  source: VisemeSource;
}

// ── Events ───────────────────────────────────────────────────────────────────

/**
 * Everything the avatar reacts to.
 *
 * Commands change the pose and are rare; speech events arrive many times a
 * second. They travel as different events so a renderer can treat them
 * differently — a pose change may re-render, a viseme must not.
 */
export type AvatarEvent =
  | { type: 'command'; command: TaniaCommand }
  | { type: 'speech-start'; timeline?: VisemeTimeline; text?: string }
  | { type: 'speech-word'; word: string; elapsedMs: number; durationMs?: number }
  | { type: 'speech-amplitude'; amplitude: number }
  | { type: 'speech-end' };

export type AvatarEventType = AvatarEvent['type'];

/** How the avatar is being presented, so the interface can say so honestly. */
export const AVATAR_MODES = ['scene', 'fallback', 'loading'] as const;

export type AvatarMode = (typeof AVATAR_MODES)[number];

/** Why a 2D fallback is showing instead of the scene. */
export const AVATAR_FALLBACK_REASONS = [
  'no-asset',
  'no-webgl',
  'reduced-motion',
  'small-screen',
  'load-failed',
] as const;

export type AvatarFallbackReason = (typeof AVATAR_FALLBACK_REASONS)[number];
