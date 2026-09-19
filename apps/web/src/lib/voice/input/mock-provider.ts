import type {
  SpeechInputHandlers,
  SpeechInputProvider,
  SpeechInputRequest,
} from '@tania/core/voice';
import type { VoiceTranscript } from '@tania/types';
import { voiceError } from '../errors';

export interface MockSpeechInputOptions {
  /** What the user "says". Partials are emitted word by word first. */
  transcript?: string;
  /** Milliseconds between partials. Zero keeps tests instant. */
  partialDelayMs?: number;
  /** Never resolves, so a timeout can be exercised. */
  hang?: boolean;
  /** Fails with this code instead of transcribing. */
  failWith?: Parameters<typeof voiceError>[0];
}

/**
 * Deterministic speech input.
 *
 * Used where no engine is available — server-side rendering, tests, and any
 * environment without the Web Speech API — so the rest of the voice layer can
 * be exercised without a microphone.
 */
export class MockSpeechInputProvider implements SpeechInputProvider {
  readonly id = 'mock';
  readonly streaming = true;

  constructor(private readonly options: MockSpeechInputOptions = {}) {}

  isSupported(): boolean {
    return true;
  }

  async listen(
    request: SpeechInputRequest,
    handlers?: SpeechInputHandlers,
  ): Promise<VoiceTranscript> {
    if (this.options.failWith) throw voiceError(this.options.failWith);

    const text = this.options.transcript ?? 'Analisa performance product X.';
    const language = request.locale.language;

    if (this.options.hang) {
      return new Promise<VoiceTranscript>((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => reject(voiceError('CANCELLED')), {
          once: true,
        });
      });
    }

    const words = text.split(' ');
    let spoken = '';

    for (const word of words) {
      if (request.signal?.aborted) throw voiceError('CANCELLED');

      spoken = spoken.length === 0 ? word : `${spoken} ${word}`;
      handlers?.onPartial?.({ text: spoken, isFinal: false, language });
      handlers?.onAmplitude?.(0.4);

      const delay = this.options.partialDelayMs ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (request.signal?.aborted) throw voiceError('CANCELLED');
    return { text, isFinal: true, confidence: 0.95, language };
  }
}
