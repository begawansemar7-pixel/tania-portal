import type {
  MicrophoneAccess,
  SpeechInputHandlers,
  SpeechInputProvider,
  SpeechInputRequest,
} from '@tania/core/voice';
import type { VoiceTranscript } from '@tania/types';
import { voiceError, toVoiceError } from '../errors';

export interface SpeechInputAdapterOptions {
  provider: SpeechInputProvider;
  microphone: MicrophoneAccess;
  /** Hard limit on one listening turn. */
  timeoutMs?: number;
  /** Injected so tests do not wait in real time. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Listening, with the parts that are the same for every engine.
 *
 * Providers differ wildly in how they report failure — a browser engine emits
 * an event, an HTTP transcriber returns a status, a runtime throws — so three
 * things are owned here instead:
 *
 * - **Permission** is checked before any engine starts. Asking an engine to
 *   listen without the microphone produces a different, useless error from each
 *   provider.
 * - **Timeout** bounds the turn, because a microphone that is open and
 *   forgotten is a privacy problem rather than an inconvenience.
 * - **Cancellation** always wins, and always reports `CANCELLED`.
 *
 * Every failure leaves as a `VoiceError`, so the controller has one shape to
 * handle.
 */
export class SpeechInputAdapter {
  private controller: AbortController | undefined;

  constructor(private readonly options: SpeechInputAdapterOptions) {}

  get id(): string {
    return this.options.provider.id;
  }

  /** Whether this engine produces interim transcripts. */
  get streaming(): boolean {
    return this.options.provider.streaming;
  }

  isSupported(): boolean {
    return this.options.provider.isSupported();
  }

  /** Prompts for the microphone. Separate so the UI can ask before listening. */
  async ensurePermission(): Promise<void> {
    const state = await this.options.microphone.request();

    if (state === 'granted') return;
    if (state === 'unavailable') throw voiceError('NO_MICROPHONE');
    throw voiceError('PERMISSION_DENIED');
  }

  async listen(
    request: Omit<SpeechInputRequest, 'signal'>,
    handlers?: SpeechInputHandlers,
  ): Promise<VoiceTranscript> {
    if (!this.isSupported()) throw voiceError('UNSUPPORTED');

    await this.ensurePermission();

    // A previous turn that never settled must not keep the microphone open.
    this.cancel();

    const controller = new AbortController();
    this.controller = controller;

    const setTimer = this.options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = this.options.clearTimer ?? ((handle) => clearTimeout(handle as never));
    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let timedOut = false;
    const timer = setTimer(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const transcript = await this.options.provider.listen(
        { ...request, timeoutMs, signal: controller.signal },
        handlers,
      );

      if (transcript.text.trim().length === 0) throw voiceError('NO_SPEECH');
      return transcript;
    } catch (error) {
      // The provider cannot tell a timeout from a cancel — both arrive as an
      // abort — so the reason is decided here, where it is known.
      if (timedOut) throw voiceError('TIMEOUT');
      throw toVoiceError(error, 'TRANSCRIPTION_FAILED');
    } finally {
      clearTimer(timer);
      if (this.controller === controller) this.controller = undefined;
    }
  }

  /** Stops an in-flight turn. Safe to call when nothing is listening. */
  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
  }

  /** Releases the capture stream. Called when voice is switched off. */
  release(): void {
    this.cancel();
    this.options.microphone.release();
  }
}
