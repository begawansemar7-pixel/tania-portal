import type { AvatarController, VoiceConversation } from '@tania/core/voice';
import type { VoiceLocale } from '@tania/types';
import { BrowserMicrophoneAccess, StaticMicrophoneAccess } from './permissions';
import { SpeechInputAdapter } from './input/adapter';
import { BrowserSpeechInputProvider } from './input/browser-provider';
import { JarvisSpeechInputProvider } from './input/jarvis-provider';
import { MockSpeechInputProvider } from './input/mock-provider';
import { SpeechOutputAdapter } from './output/adapter';
import { BrowserSpeechOutputProvider } from './output/browser-provider';
import { JarvisSpeechOutputProvider } from './output/jarvis-provider';
import { MockSpeechOutputProvider } from './output/mock-provider';
import { TaniaVoiceController } from './controller';

export interface VoiceStackOptions {
  conversation: VoiceConversation;
  avatar?: AvatarController;
  locale?: VoiceLocale;
  listenTimeoutMs?: number;
  /** Forces a provider pair, for tests and for a deployment that requires one. */
  prefer?: 'browser' | 'jarvis' | 'mock';
}

export interface VoiceStack {
  controller: TaniaVoiceController;
  input: SpeechInputAdapter;
  output: SpeechOutputAdapter;
  /** Which engine ended up being used, for the interface to say so. */
  providers: { input: string; output: string };
}

/**
 * Picks the speech engines available in this environment.
 *
 * Browser engines are preferred when present: no audio leaves the device and
 * there is nothing to configure. JARVIS is next, for browsers without them.
 * The mock is last and exists so server rendering and tests never crash on a
 * missing microphone — it is never silently used as if it were real, because
 * `providers` reports which one was chosen.
 */
export function createVoiceStack(options: VoiceStackOptions): VoiceStack {
  const microphone =
    options.prefer === 'mock' ? new StaticMicrophoneAccess() : new BrowserMicrophoneAccess();

  const browserInput = new BrowserSpeechInputProvider();
  const jarvisInput =
    microphone instanceof BrowserMicrophoneAccess
      ? new JarvisSpeechInputProvider({ microphone })
      : undefined;

  const inputProvider =
    options.prefer === 'mock'
      ? new MockSpeechInputProvider()
      : options.prefer === 'jarvis' && jarvisInput?.isSupported()
        ? jarvisInput
        : browserInput.isSupported()
          ? browserInput
          : jarvisInput?.isSupported()
            ? jarvisInput
            : new MockSpeechInputProvider();

  const browserOutput = new BrowserSpeechOutputProvider();
  const jarvisOutput = new JarvisSpeechOutputProvider();

  const outputProvider =
    options.prefer === 'mock'
      ? new MockSpeechOutputProvider()
      : options.prefer === 'jarvis'
        ? jarvisOutput
        : browserOutput.isSupported()
          ? browserOutput
          : jarvisOutput.isSupported()
            ? jarvisOutput
            : new MockSpeechOutputProvider();

  const input = new SpeechInputAdapter({
    provider: inputProvider,
    microphone,
    ...(options.listenTimeoutMs === undefined ? {} : { timeoutMs: options.listenTimeoutMs }),
  });
  const output = new SpeechOutputAdapter({ provider: outputProvider });

  const controller = new TaniaVoiceController({
    input,
    output,
    conversation: options.conversation,
    ...(options.avatar === undefined ? {} : { avatar: options.avatar }),
    ...(options.locale === undefined ? {} : { locale: options.locale }),
    ...(options.listenTimeoutMs === undefined
      ? {}
      : { listenTimeoutMs: options.listenTimeoutMs }),
  });

  return {
    controller,
    input,
    output,
    providers: { input: inputProvider.id, output: outputProvider.id },
  };
}

export { TaniaVoiceController } from './controller';
export { VoiceStateMachine } from './state-machine';
export { SpeechInputAdapter } from './input/adapter';
export { SpeechOutputAdapter } from './output/adapter';
export { BrowserMicrophoneAccess, StaticMicrophoneAccess } from './permissions';
export { BrowserSpeechInputProvider } from './input/browser-provider';
export { JarvisSpeechInputProvider } from './input/jarvis-provider';
export { MockSpeechInputProvider } from './input/mock-provider';
export { BrowserSpeechOutputProvider } from './output/browser-provider';
export { JarvisSpeechOutputProvider } from './output/jarvis-provider';
export { MockSpeechOutputProvider, visemeFor } from './output/mock-provider';
export {
  FanOutAvatarController,
  NullAvatarController,
  RecordingAvatarController,
} from './avatar';
export { voiceError, isVoiceError, toVoiceError } from './errors';
