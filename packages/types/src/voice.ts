/**
 * Voice interaction contract.
 *
 * The shape of a spoken turn, from microphone to avatar. Nothing here names a
 * speech provider: which engine transcribes or speaks is a deployment choice,
 * and the states below have to mean the same thing whichever one is used.
 */

export const VOICE_STATES = ['IDLE', 'LISTENING', 'PROCESSING', 'SPEAKING', 'ERROR'] as const;

export type VoiceState = (typeof VOICE_STATES)[number];

/**
 * Allowed transitions. Anything outside this table is a programming error.
 *
 * Two are worth pointing at: `SPEAKING → LISTENING` exists so a user can
 * interrupt an answer and be heard immediately, and `ERROR → LISTENING` exists
 * so a denied microphone or a timeout can be retried without a page reload.
 */
export const VOICE_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  IDLE: ['LISTENING', 'SPEAKING', 'ERROR'],
  LISTENING: ['PROCESSING', 'IDLE', 'ERROR'],
  PROCESSING: ['SPEAKING', 'IDLE', 'ERROR'],
  SPEAKING: ['IDLE', 'LISTENING', 'ERROR'],
  ERROR: ['IDLE', 'LISTENING'],
};

export function canTransitionVoice(from: VoiceState, to: VoiceState): boolean {
  return VOICE_TRANSITIONS[from].includes(to);
}

/** States in which something is actively happening on the user's behalf. */
export function isVoiceBusy(state: VoiceState): boolean {
  return state === 'LISTENING' || state === 'PROCESSING' || state === 'SPEAKING';
}

export const VOICE_ERROR_CODES = [
  'PERMISSION_DENIED',
  'NO_MICROPHONE',
  'UNSUPPORTED',
  'TIMEOUT',
  'CANCELLED',
  'NO_SPEECH',
  'TRANSCRIPTION_FAILED',
  'SYNTHESIS_FAILED',
  'BRAIN_FAILED',
] as const;

export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

export interface VoiceError {
  code: VoiceErrorCode;
  /** User-safe message. Provider internals do not belong here. */
  message: string;
  /** True when trying again could plausibly work. */
  recoverable: boolean;
}

/** One transcription result. Partials arrive before the final one. */
export interface VoiceTranscript {
  text: string;
  isFinal: boolean;
  /** 0–1 when the provider reports it. */
  confidence?: number;
  language?: string;
}

/**
 * What the interface renders.
 *
 * Deliberately the whole public surface of a voice turn: a state, what was
 * heard, what is being said, and an error when there is one. No provider
 * internals, and nothing about how the answer was produced.
 */
export interface VoiceSnapshot {
  state: VoiceState;
  /** Live partial transcript while listening. */
  partial?: string;
  /** The final transcript that was sent to TANIA. */
  transcript?: string;
  /** Text currently being spoken. */
  speaking?: string;
  error?: VoiceError;
  /** Conversation this voice turn belongs to, so spoken turns stay in thread. */
  conversationId?: string;
  since: string;
}

/**
 * A cue for the avatar layer.
 *
 * The 3D avatar is not built yet, so this is the seam it will attach to: the
 * voice layer emits what the face needs — the state to hold, the mouth shape,
 * and how loud the current audio is — and knows nothing about how it is drawn.
 */
export interface AvatarCue {
  state: VoiceState;
  /** Mouth shape id for lip sync, when the output provider reports one. */
  viseme?: string;
  /** 0–1 loudness, for mouth openness and idle motion. */
  amplitude?: number;
  /** The word or phrase being spoken, for subtitle-style rendering. */
  text?: string;
  /**
   * The word just reached, and how far into the utterance it starts.
   *
   * Carried separately from `text` because it drives the mouth rather than a
   * subtitle: measured word starts are what keep visemes on the right syllable
   * instead of drifting over a long answer.
   */
  word?: string;
  elapsedMs?: number;
}

/** Spoken-language preference, carried end to end so replies match the ask. */
export interface VoiceLocale {
  /** BCP-47, e.g. `id-ID`. */
  language: string;
  /** Provider-specific voice id; absent means the provider's default. */
  voice?: string;
}
