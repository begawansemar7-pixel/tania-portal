import type { MicrophoneAccess, MicrophonePermissionState } from '@tania/core/voice';

/**
 * Microphone permission in the browser.
 *
 * Two APIs are involved and neither is sufficient alone: the Permissions API
 * reports the current state without prompting but is not implemented for
 * microphone everywhere, and `getUserMedia` prompts but only tells you the
 * answer by succeeding or throwing. So `query` prefers the quiet path and
 * `request` is the only thing that ever shows a prompt.
 *
 * The capture stream is kept, because opening a second one would make the
 * browser's recording indicator flicker, and released explicitly on `release`.
 */
export class BrowserMicrophoneAccess implements MicrophoneAccess {
  readonly id = 'browser';
  private stream: MediaStream | undefined;

  async query(): Promise<MicrophonePermissionState> {
    if (!this.available()) return 'unavailable';

    try {
      const status = await navigator.permissions?.query({
        name: 'microphone' as PermissionName,
      });
      if (status) return status.state as MicrophonePermissionState;
    } catch {
      // Permissions API not implemented for microphone here; fall through.
    }

    // Unknown without prompting, and this method must never prompt.
    return 'prompt';
  }

  async request(): Promise<MicrophonePermissionState> {
    if (!this.available()) return 'unavailable';
    if (this.stream) return 'granted';

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return 'granted';
    } catch (error) {
      return classify(error);
    }
  }

  /** The live capture stream, for providers that need the raw audio. */
  mediaStream(): MediaStream | undefined {
    return this.stream;
  }

  release(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
  }

  private available(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function'
    );
  }
}

/**
 * Distinguishes "you said no" from "there is nothing to record with".
 *
 * They need different words in the interface: one is fixed in browser settings,
 * the other by plugging something in.
 */
function classify(error: unknown): MicrophonePermissionState {
  const name = error instanceof Error ? error.name : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'unavailable';
  return 'denied';
}

/** Permission that answers however a test needs it to. */
export class StaticMicrophoneAccess implements MicrophoneAccess {
  readonly id = 'static';
  released = false;

  constructor(private readonly state: MicrophonePermissionState = 'granted') {}

  async query(): Promise<MicrophonePermissionState> {
    return this.state;
  }

  async request(): Promise<MicrophonePermissionState> {
    return this.state;
  }

  release(): void {
    this.released = true;
  }
}
