import type { AvatarController } from '@tania/core/voice';
import type { AvatarCue, AvatarState, VoiceState } from '@tania/types';
import type { AvatarEventBus } from './event-bus';

/**
 * Voice states named as the avatar shows them.
 *
 * `PROCESSING` becomes `THINKING` because that is what it looks like from the
 * outside — and looking like thinking is the whole job. The avatar never shows
 * *what* is being considered, only that something is.
 */
const VOICE_TO_AVATAR: Record<VoiceState, AvatarState> = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  PROCESSING: 'THINKING',
  SPEAKING: 'SPEAKING',
  ERROR: 'ERROR',
};

export function avatarStateForVoice(state: VoiceState): AvatarState {
  return VOICE_TO_AVATAR[state];
}

/**
 * Connects the voice pipeline to the avatar.
 *
 * Implements the `AvatarController` seam the voice layer already emits to, so
 * nothing in the voice code changes: cues arrive here and leave as commands.
 *
 * A cue carrying only a viseme or an amplitude keeps the current state — mouth
 * movement arrives many times a second, and letting each one restate the pose
 * would fight whatever else is driving the avatar.
 */
export class VoiceAvatarBridge implements AvatarController {
  readonly id = 'voice-bridge';

  constructor(private readonly bus: AvatarEventBus) {}

  cue(cue: AvatarCue): void {
    const state = avatarStateForVoice(cue.state);
    const previous = this.bus.last();

    if (previous.state !== state) {
      this.bus.command({ state });

      // Speech bracketing is what lets the mouth controller start and stop its
      // own clock instead of inferring it from a stream of visemes.
      if (state === 'SPEAKING') {
        this.bus.emit({ type: 'speech-start', ...(cue.text === undefined ? {} : { text: cue.text }) });
      } else if (previous.state === 'SPEAKING') {
        this.bus.emit({ type: 'speech-end' });
      }
    }

    // Mouth data travels as speech events, never as a pose change: a viseme
    // arriving five times a second must not re-render anything.
    if (cue.word !== undefined) {
      this.bus.emit({
        type: 'speech-word',
        word: cue.word,
        elapsedMs: cue.elapsedMs ?? 0,
      });
      return;
    }

    if (cue.amplitude !== undefined) {
      this.bus.emit({ type: 'speech-amplitude', amplitude: cue.amplitude });
    }
  }
}
