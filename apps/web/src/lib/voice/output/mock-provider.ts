import type {
  SpeechOutputHandlers,
  SpeechOutputProvider,
  SpeechOutputRequest,
} from '@tania/core/voice';
import { voiceError } from '../errors';

export interface MockSpeechOutputOptions {
  /** Milliseconds per word. Zero keeps tests instant. */
  wordDelayMs?: number;
  hang?: boolean;
  failWith?: Parameters<typeof voiceError>[0];
}

/**
 * Deterministic speech output.
 *
 * Emits the same boundary, viseme and amplitude cues a real engine would, so
 * the avatar seam and the speaking state can be exercised with no audio device
 * present.
 */
export class MockSpeechOutputProvider implements SpeechOutputProvider {
  readonly id = 'mock';
  readonly streaming = true;
  readonly visemes = 'boundary' as const;

  /** Everything this provider was asked to say, in order. */
  readonly spoken: string[] = [];
  stopped = 0;

  constructor(private readonly options: MockSpeechOutputOptions = {}) {}

  isSupported(): boolean {
    return true;
  }

  async speak(request: SpeechOutputRequest, handlers?: SpeechOutputHandlers): Promise<void> {
    if (this.options.failWith) throw voiceError(this.options.failWith);

    if (this.options.hang) {
      return new Promise<void>((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => reject(voiceError('CANCELLED')), {
          once: true,
        });
      });
    }

    this.spoken.push(request.text);

    const perWordMs = this.options.wordDelayMs ?? 0;
    let elapsedMs = 0;

    for (const word of request.text.split(/\s+/).filter(Boolean)) {
      if (request.signal?.aborted) throw voiceError('CANCELLED');

      handlers?.onBoundary?.(word, elapsedMs);
      elapsedMs += perWordMs;
      handlers?.onViseme?.(visemeFor(word));
      handlers?.onAmplitude?.(0.6);

      const delay = this.options.wordDelayMs ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }

    handlers?.onAmplitude?.(0);
  }

  stop(): void {
    this.stopped += 1;
  }
}

/**
 * A crude mouth shape from the word's first vowel.
 *
 * Good enough to drive and test the avatar seam; a real engine reports visemes
 * on its own timeline, and this is deliberately not pretending to be that.
 */
export function visemeFor(word: string): string {
  const vowel = word.toLowerCase().match(/[aiueo]/)?.[0];
  return vowel === undefined ? 'MBP' : vowel.toUpperCase();
}
