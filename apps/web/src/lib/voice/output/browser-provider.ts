import type {
  SpeechOutputHandlers,
  SpeechOutputProvider,
  SpeechOutputRequest,
} from '@tania/core/voice';
import { voiceError } from '../errors';
import { visemeFor } from './mock-provider';

/**
 * Text-to-speech using the browser's speech synthesis.
 *
 * Preferred when available: no audio leaves the device and there is nothing to
 * configure. Its quirks are handled here rather than leaking upward — boundary
 * events are the only timing signal it gives, so visemes are derived from them,
 * and `cancel()` fires an error event that must not be reported as a failure.
 */
export class BrowserSpeechOutputProvider implements SpeechOutputProvider {
  readonly id = 'browser';
  readonly streaming = false;
  // `onboundary` carries `elapsedTime`, so word starts are measured rather
  // than guessed — good enough to land visemes on the right syllable.
  readonly visemes = 'boundary' as const;

  isSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
  }

  async speak(request: SpeechOutputRequest, handlers?: SpeechOutputHandlers): Promise<void> {
    if (!this.isSupported()) throw voiceError('UNSUPPORTED');

    const synthesis = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(request.text);
    utterance.lang = request.locale.language;

    const voice = this.pick(request);
    if (voice) utterance.voice = voice;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let cancelled = false;

      const finish = (settle: () => void): void => {
        if (settled) return;
        settled = true;
        request.signal?.removeEventListener('abort', onAbort);
        settle();
      };

      function onAbort(): void {
        cancelled = true;
        synthesis.cancel();
        finish(() => reject(voiceError('CANCELLED')));
      }

      request.signal?.addEventListener('abort', onAbort, { once: true });

      utterance.onboundary = (event) => {
        const word = request.text.slice(event.charIndex).split(/\s/)[0] ?? '';
        if (word.length === 0) return;

        // `elapsedTime` is seconds in most engines and milliseconds in a few;
        // a word starting past an hour into one utterance is the giveaway.
        const raw = event.elapsedTime ?? 0;
        const elapsedMs = raw > 3_600 ? raw : raw * 1000;

        handlers?.onBoundary?.(word, elapsedMs);
        handlers?.onViseme?.(visemeFor(word));
        handlers?.onAmplitude?.(0.6);
      };

      utterance.onend = () => {
        handlers?.onAmplitude?.(0);
        finish(resolve);
      };

      utterance.onerror = () => {
        // A cancel surfaces here too; it is not a synthesis failure.
        finish(() => reject(voiceError(cancelled ? 'CANCELLED' : 'SYNTHESIS_FAILED')));
      };

      synthesis.speak(utterance);
    });
  }

  stop(): void {
    if (this.isSupported()) window.speechSynthesis.cancel();
  }

  /** Honours a configured voice id, then falls back to the language. */
  private pick(request: SpeechOutputRequest): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return undefined;

    if (request.locale.voice) {
      const named = voices.find((item) => item.voiceURI === request.locale.voice);
      if (named) return named;
    }

    const language = request.locale.language.toLowerCase();
    return (
      voices.find((item) => item.lang.toLowerCase() === language) ??
      voices.find((item) => item.lang.toLowerCase().startsWith(language.slice(0, 2)))
    );
  }
}
