import type {
  SpeechInputHandlers,
  SpeechInputProvider,
  SpeechInputRequest,
} from '@tania/core/voice';
import type { VoiceTranscript } from '@tania/types';
import { voiceError } from '../errors';

/**
 * Minimal surface of the Web Speech API this provider uses.
 *
 * Typed locally because the API is not in the DOM lib and is still prefixed in
 * some browsers; inventing a global declaration would be worse than naming the
 * three members that are actually touched.
 */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string; confidence: number };
  }>;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/**
 * Speech-to-text using whatever the browser provides.
 *
 * The cheapest provider to run and the one with no data leaving the device, so
 * it is preferred when available. It is also the least predictable: support is
 * uneven and `onend` can fire without any result, which is why an empty final
 * transcript is reported as `NO_SPEECH` rather than as success.
 */
export class BrowserSpeechInputProvider implements SpeechInputProvider {
  readonly id = 'browser';
  readonly streaming = true;

  isSupported(): boolean {
    return recognitionConstructor() !== undefined;
  }

  async listen(
    request: SpeechInputRequest,
    handlers?: SpeechInputHandlers,
  ): Promise<VoiceTranscript> {
    const Recognition = recognitionConstructor();
    if (!Recognition) throw voiceError('UNSUPPORTED');

    const recognition = new Recognition();
    recognition.lang = request.locale.language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    return new Promise<VoiceTranscript>((resolve, reject) => {
      let finalText = '';
      let confidence: number | undefined;
      let settled = false;

      const finish = (settle: () => void): void => {
        if (settled) return;
        settled = true;
        request.signal?.removeEventListener('abort', onAbort);
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        settle();
      };

      function onAbort(): void {
        recognition.abort();
        finish(() => reject(voiceError('CANCELLED')));
      }

      request.signal?.addEventListener('abort', onAbort, { once: true });

      recognition.onresult = (event) => {
        let interim = '';

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result) continue;

          if (result.isFinal) {
            finalText += result[0].transcript;
            confidence = result[0].confidence;
          } else {
            interim += result[0].transcript;
          }
        }

        const partial = `${finalText}${interim}`.trim();
        if (partial.length > 0) {
          handlers?.onPartial?.({
            text: partial,
            isFinal: false,
            language: request.locale.language,
          });
        }
      };

      recognition.onerror = (event) => {
        finish(() => reject(mapRecognitionError(event.error)));
      };

      recognition.onend = () => {
        const text = finalText.trim();
        finish(() =>
          text.length === 0
            ? reject(voiceError('NO_SPEECH'))
            : resolve({
                text,
                isFinal: true,
                language: request.locale.language,
                ...(confidence === undefined ? {} : { confidence }),
              }),
        );
      };

      try {
        recognition.start();
      } catch {
        finish(() => reject(voiceError('TRANSCRIPTION_FAILED')));
      }
    });
  }
}

/** Browser error strings mapped to the vocabulary the interface speaks. */
function mapRecognitionError(error: string) {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return voiceError('PERMISSION_DENIED');
    case 'no-speech':
      return voiceError('NO_SPEECH');
    case 'aborted':
      return voiceError('CANCELLED');
    case 'audio-capture':
      return voiceError('NO_MICROPHONE');
    default:
      return voiceError('TRANSCRIPTION_FAILED');
  }
}
