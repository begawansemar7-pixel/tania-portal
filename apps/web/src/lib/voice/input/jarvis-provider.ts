import type {
  MicrophoneAccess,
  SpeechInputHandlers,
  SpeechInputProvider,
  SpeechInputRequest,
} from '@tania/core/voice';
import type { VoiceTranscript } from '@tania/types';
import { voiceError } from '../errors';

export interface JarvisSpeechInputOptions {
  /** Supplies the capture stream; the same one the permission layer opened. */
  microphone: Pick<MicrophoneAccess, 'id'> & { mediaStream?: () => MediaStream | undefined };
  /** Portal route that forwards to the runtime's `voice.input` capability. */
  endpoint?: string;
  mimeType?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_ENDPOINT = '/api/tania/voice/transcribe';

/**
 * Speech-to-text through the JARVIS voice runtime.
 *
 * Audio is captured in the browser and sent to the portal, which forwards it as
 * a `voice.transcribe` command — TANIA never transcribes anything itself, and
 * the audio does not reach a third party the deployment did not configure.
 *
 * No interim transcripts: the audio is sent once the user stops speaking, so
 * `streaming` is false and the interface shows a listening state rather than
 * words appearing. A runtime that supports partial results would be a different
 * provider, not a change here.
 */
export class JarvisSpeechInputProvider implements SpeechInputProvider {
  readonly id = 'jarvis';
  readonly streaming = false;

  constructor(private readonly options: JarvisSpeechInputOptions) {}

  isSupported(): boolean {
    return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
  }

  async listen(
    request: SpeechInputRequest,
    handlers?: SpeechInputHandlers,
  ): Promise<VoiceTranscript> {
    const stream = this.options.microphone.mediaStream?.();
    if (!stream) throw voiceError('NO_MICROPHONE');

    const audio = await this.record(stream, request, handlers);
    if (request.signal?.aborted) throw voiceError('CANCELLED');

    const call = this.options.fetchImpl ?? fetch;

    let response: Response;
    try {
      response = await call(this.options.endpoint ?? DEFAULT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio, language: request.locale.language }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    } catch (error) {
      if (request.signal?.aborted) throw voiceError('CANCELLED');
      throw voiceError('TRANSCRIPTION_FAILED', describe(error));
    }

    const payload = (await response.json().catch(() => ({}))) as {
      data?: { transcript?: string; confidence?: number };
      error?: { message?: string };
    };

    if (!response.ok || typeof payload.data?.transcript !== 'string') {
      throw voiceError('TRANSCRIPTION_FAILED', payload.error?.message);
    }

    const text = payload.data.transcript.trim();
    if (text.length === 0) throw voiceError('NO_SPEECH');

    return {
      text,
      isFinal: true,
      language: request.locale.language,
      ...(payload.data.confidence === undefined ? {} : { confidence: payload.data.confidence }),
    };
  }

  /** Captures until the caller aborts or the turn's budget runs out. */
  private record(
    stream: MediaStream,
    request: SpeechInputRequest,
    handlers?: SpeechInputHandlers,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Blob[] = [];
      let recorder: MediaRecorder;

      try {
        recorder = new MediaRecorder(
          stream,
          this.options.mimeType === undefined ? undefined : { mimeType: this.options.mimeType },
        );
      } catch (error) {
        reject(voiceError('TRANSCRIPTION_FAILED', describe(error)));
        return;
      }

      const stop = (): void => {
        if (recorder.state !== 'inactive') recorder.stop();
      };

      request.signal?.addEventListener('abort', stop, { once: true });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          handlers?.onAmplitude?.(0.5);
        }
      };

      recorder.onerror = () => {
        request.signal?.removeEventListener('abort', stop);
        reject(voiceError('TRANSCRIPTION_FAILED'));
      };

      recorder.onstop = () => {
        request.signal?.removeEventListener('abort', stop);
        const blob = new Blob(chunks, { type: recorder.mimeType });

        const reader = new FileReader();
        reader.onerror = () => reject(voiceError('TRANSCRIPTION_FAILED'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      };

      recorder.start();
    });
  }
}

function describe(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
