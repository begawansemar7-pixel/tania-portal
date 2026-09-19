/**
 * Voice domain — ports for spoken interaction.
 *
 * The constraint that shapes this file: **no provider is named.** Browser
 * speech APIs, a JARVIS voice runtime, and a cloud engine differ enormously in
 * how they work, and the controller must not know which one it has. So the
 * ports describe only what a spoken turn needs: permission, a transcript, and
 * audio out — each cancellable, because a person who changes their mind mid
 * sentence must be able to stop it.
 */
import type {
  AvatarCue,
  VisemeTimeline,
  VoiceError,
  VoiceLocale,
  VoiceSnapshot,
  VoiceTranscript,
} from '@tania/types';

/** Outcome of asking for the microphone. */
export type MicrophonePermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * Access to the microphone.
 *
 * Separate from the input provider because permission is a property of the
 * environment, not of the engine doing the transcription: the same denial has
 * to be reported identically whichever provider is configured.
 */
export interface MicrophoneAccess {
  readonly id: string;
  /** Reads the current state without prompting, where the platform allows it. */
  query(): Promise<MicrophonePermissionState>;
  /** Prompts if needed. Returns the resulting state rather than throwing. */
  request(): Promise<MicrophonePermissionState>;
  /** Releases any capture stream this access opened. */
  release(): void;
}

export interface SpeechInputHandlers {
  /** Called for each interim result, when the provider produces them. */
  onPartial?: (transcript: VoiceTranscript) => void;
  /** Raw loudness in [0,1], for the avatar and the listening indicator. */
  onAmplitude?: (level: number) => void;
}

export interface SpeechInputRequest {
  locale: VoiceLocale;
  /** Hard limit on one listening turn. */
  timeoutMs?: number;
  /** Stop after this much silence once speech has started. */
  silenceMs?: number;
  signal?: AbortSignal;
}

/**
 * Turns speech into text.
 *
 * `listen` resolves with the final transcript, or rejects with a `VoiceError`
 * — including for cancellation and timeout, so the caller has one failure shape
 * to handle rather than three.
 */
export interface SpeechInputProvider {
  readonly id: string;
  /** True when this provider can run in the current environment. */
  isSupported(): boolean;
  /** Whether interim transcripts are produced at all. */
  readonly streaming: boolean;
  listen(request: SpeechInputRequest, handlers?: SpeechInputHandlers): Promise<VoiceTranscript>;
}

export interface SpeechOutputHandlers {
  /**
   * The whole mouth timeline, when the engine can produce one.
   *
   * This is the good path: real phoneme timing beats anything derived after
   * the fact, and it is why `VisemeSource` records where a timeline came from.
   */
  onTimeline?: (timeline: VisemeTimeline) => void;
  /**
   * Word boundaries as they are spoken.
   *
   * `elapsedMs` is how far into the utterance the word starts, which is what
   * makes boundary-derived visemes land on the right syllable instead of
   * drifting. Engines that do not report it omit it.
   */
  onBoundary?: (text: string, elapsedMs?: number) => void;
  onViseme?: (viseme: string) => void;
  /** Loudness in [0,1]. The last-resort mouth driver. */
  onAmplitude?: (level: number) => void;
}

/** What timing an output provider can actually give the mouth. */
export const VISEME_CAPABILITIES = ['timeline', 'boundary', 'amplitude', 'none'] as const;

export type VisemeCapability = (typeof VISEME_CAPABILITIES)[number];

export interface SpeechOutputRequest {
  text: string;
  locale: VoiceLocale;
  signal?: AbortSignal;
}

/** Turns text into audio. */
export interface SpeechOutputProvider {
  readonly id: string;
  isSupported(): boolean;
  /** True when the provider can begin speaking before the text is complete. */
  readonly streaming: boolean;
  /**
   * The best mouth timing this provider offers.
   *
   * Declared rather than discovered so the avatar can choose its strategy up
   * front, and so the interface can say honestly how good the lip sync is.
   */
  readonly visemes: VisemeCapability;
  speak(request: SpeechOutputRequest, handlers?: SpeechOutputHandlers): Promise<void>;
  /** Stops audio immediately. Called on cancellation and on barge-in. */
  stop(): void;
}

/**
 * The seam the 3D avatar attaches to.
 *
 * Defined now, before the avatar exists, so the voice layer never grows its own
 * rendering concerns: it emits cues and forgets them.
 */
export interface AvatarController {
  readonly id: string;
  cue(cue: AvatarCue): void;
}

/** Subscribable voice state, as the interface consumes it. */
export interface VoiceStateStore {
  snapshot(): VoiceSnapshot;
  subscribe(listener: (snapshot: VoiceSnapshot) => void): () => void;
}

/**
 * One spoken exchange, from microphone to spoken answer.
 *
 * `converse` is injected rather than referenced: the voice layer must not know
 * whether the reply came from the Brain, the orchestrator, or a cached answer.
 */
export interface VoiceConversation {
  ask(input: {
    text: string;
    conversationId?: string;
    signal?: AbortSignal;
    /** Called as the answer streams, so speech can start before it is done. */
    onDelta?: (delta: string) => void;
  }): Promise<{ reply: string; conversationId: string }>;
}

export interface VoiceController extends VoiceStateStore {
  readonly id: string;
  /** Runs a full turn: listen, ask, speak. */
  converse(): Promise<void>;
  /** Speaks text without listening first, e.g. replaying an answer. */
  say(text: string): Promise<void>;
  /** Stops whatever is happening and returns to IDLE. */
  cancel(reason?: string): void;
  /** Clears an error state so the user can try again. */
  reset(): void;
}

export type { VoiceError, VoiceTranscript, AvatarCue, VoiceLocale, VoiceSnapshot };
