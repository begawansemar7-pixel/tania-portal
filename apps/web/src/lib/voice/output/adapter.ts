import type {
  SpeechOutputHandlers,
  SpeechOutputProvider,
  SpeechOutputRequest,
} from '@tania/core/voice';
import { toVoiceError, voiceError } from '../errors';

export interface SpeechOutputAdapterOptions {
  provider: SpeechOutputProvider;
}

/**
 * Speaking, with cancellation and sentence chunking.
 *
 * Chunking is what makes a streamed answer feel immediate: the Brain produces
 * text word by word, and waiting for the whole reply before speaking would
 * throw away the streaming entirely. So `speakStream` buffers until a sentence
 * is complete and speaks that, while the rest is still arriving.
 *
 * A cancel stops the audio *now* — a voice that keeps talking after the user
 * pressed stop is the single most irritating failure this layer can have.
 */
export class SpeechOutputAdapter {
  private controller: AbortController | undefined;

  constructor(private readonly options: SpeechOutputAdapterOptions) {}

  get id(): string {
    return this.options.provider.id;
  }

  get streaming(): boolean {
    return this.options.provider.streaming;
  }

  isSupported(): boolean {
    return this.options.provider.isSupported();
  }

  async speak(
    request: Omit<SpeechOutputRequest, 'signal'>,
    handlers?: SpeechOutputHandlers,
  ): Promise<void> {
    if (!this.isSupported()) throw voiceError('UNSUPPORTED');
    if (request.text.trim().length === 0) return;

    const controller = new AbortController();
    this.controller = controller;

    try {
      await this.options.provider.speak({ ...request, signal: controller.signal }, handlers);
    } catch (error) {
      if (controller.signal.aborted) throw voiceError('CANCELLED');
      throw toVoiceError(error, 'SYNTHESIS_FAILED');
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  /**
   * Speaks an answer as it arrives.
   *
   * Returns a sink the caller pushes deltas into; each completed sentence is
   * spoken in order, and `finish()` flushes whatever is left. Sentences are
   * awaited one at a time so the audio does not overlap itself.
   */
  stream(
    locale: SpeechOutputRequest['locale'],
    handlers?: SpeechOutputHandlers,
  ): { push: (delta: string) => void; finish: () => Promise<void> } {
    let buffer = '';
    let queue: Promise<void> = Promise.resolve();
    let failure: unknown;

    const enqueue = (text: string): void => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      queue = queue.then(async () => {
        if (failure !== undefined) return;
        try {
          await this.speak({ text: trimmed, locale }, handlers);
        } catch (error) {
          // Keep the first failure and stop speaking the rest: a half-spoken
          // answer that resumes mid-sentence is worse than silence.
          failure = error;
        }
      });
    };

    return {
      push: (delta: string) => {
        buffer += delta;

        let boundary = nextSentenceEnd(buffer);
        while (boundary > 0) {
          enqueue(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary);
          boundary = nextSentenceEnd(buffer);
        }
      },
      finish: async () => {
        enqueue(buffer);
        buffer = '';
        await queue;
        if (failure !== undefined) throw failure;
      },
    };
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.options.provider.stop();
  }
}

/**
 * Index just past the first sentence end, or 0 when there is no complete one.
 *
 * A decimal point or an abbreviation would otherwise cut a sentence in half, so
 * a terminator only counts when whitespace or the end of the buffer follows it.
 */
function nextSentenceEnd(text: string): number {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '.' && char !== '!' && char !== '?' && char !== '\n') continue;

    const next = text[index + 1];
    if (next === undefined) return index + 1;
    if (/\s/.test(next)) return index + 2;
  }
  return 0;
}
