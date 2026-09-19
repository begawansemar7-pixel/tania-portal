import type {
  SpeechOutputHandlers,
  SpeechOutputProvider,
  SpeechOutputRequest,
} from '@tania/core/voice';
import type { VisemeTimeline } from '@tania/types';
import { voiceError } from '../errors';
import { visemeFor } from './mock-provider';

export interface JarvisSpeechOutputOptions {
  /** Portal route that forwards to the runtime's `voice.output` capability. */
  endpoint?: string;
  fetchImpl?: typeof fetch;
  /** Injected so tests do not need an audio element. */
  createAudio?: (src: string) => HTMLAudioElement;
}

const DEFAULT_ENDPOINT = '/api/tania/voice/speak';

/**
 * Text-to-speech through the JARVIS voice runtime.
 *
 * The runtime returns an audio artifact, which the browser plays. When it
 * returns text instead — as the simulated capability does — nothing is played
 * and the boundary cues still run, so the avatar and the speaking state behave
 * identically whether or not audio was produced.
 */
export class JarvisSpeechOutputProvider implements SpeechOutputProvider {
  readonly id = 'jarvis';
  readonly streaming = false;
  /**
   * A runtime that returns a viseme timeline is used as such; one that does
   * not leaves the mouth to boundary timing. Declared as `timeline` because
   * the contract offers it — `onTimeline` simply never fires without one.
   */
  readonly visemes = 'timeline' as const;

  private audio: HTMLAudioElement | undefined;

  constructor(private readonly options: JarvisSpeechOutputOptions = {}) {}

  isSupported(): boolean {
    return typeof window !== 'undefined';
  }

  async speak(request: SpeechOutputRequest, handlers?: SpeechOutputHandlers): Promise<void> {
    const call = this.options.fetchImpl ?? fetch;

    let response: Response;
    try {
      response = await call(this.options.endpoint ?? DEFAULT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: request.text,
          language: request.locale.language,
          ...(request.locale.voice === undefined ? {} : { voice: request.locale.voice }),
        }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    } catch (error) {
      if (request.signal?.aborted) throw voiceError('CANCELLED');
      throw voiceError('SYNTHESIS_FAILED', error instanceof Error ? error.message : undefined);
    }

    const payload = (await response.json().catch(() => ({}))) as {
      data?: { audioUri?: string; text?: string; visemes?: VisemeTimeline };
      error?: { message?: string };
    };

    if (!response.ok) throw voiceError('SYNTHESIS_FAILED', payload.error?.message);
    if (request.signal?.aborted) throw voiceError('CANCELLED');

    // A runtime-reported timeline is the best mouth timing available, so it
    // is handed over whole and nothing is derived on top of it.
    const timeline = payload.data?.visemes;
    if (timeline?.frames?.length) {
      handlers?.onTimeline?.({ ...timeline, source: 'engine' });
    } else {
      const words = (payload.data?.text ?? request.text).split(/\s+/).filter(Boolean);
      for (const word of words) {
        if (request.signal?.aborted) throw voiceError('CANCELLED');
        handlers?.onBoundary?.(word);
        handlers?.onViseme?.(visemeFor(word));
      }
    }

    const uri = payload.data?.audioUri;
    if (uri === undefined) {
      // No audio came back. The turn is still complete: the answer is on screen
      // and the cues ran, so this is reported as spoken rather than failed.
      handlers?.onAmplitude?.(0);
      return;
    }

    await this.play(uri, request, handlers);
  }

  stop(): void {
    this.audio?.pause();
    this.audio = undefined;
  }

  private play(
    uri: string,
    request: SpeechOutputRequest,
    handlers?: SpeechOutputHandlers,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const audio = (this.options.createAudio ?? ((src) => new Audio(src)))(uri);
      this.audio = audio;

      const onAbort = (): void => {
        audio.pause();
        reject(voiceError('CANCELLED'));
      };

      request.signal?.addEventListener('abort', onAbort, { once: true });

      audio.onended = () => {
        request.signal?.removeEventListener('abort', onAbort);
        handlers?.onAmplitude?.(0);
        resolve();
      };

      audio.onerror = () => {
        request.signal?.removeEventListener('abort', onAbort);
        reject(voiceError('SYNTHESIS_FAILED'));
      };

      void audio.play().catch(() => {
        request.signal?.removeEventListener('abort', onAbort);
        // Autoplay policies block audio until the user interacts; the answer is
        // still on screen, so this is not treated as a hard failure.
        resolve();
      });
    });
  }
}
