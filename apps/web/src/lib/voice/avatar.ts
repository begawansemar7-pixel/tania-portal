import type { AvatarController } from '@tania/core/voice';
import type { AvatarCue, VoiceState } from '@tania/types';

/**
 * Where the 3D avatar will attach.
 *
 * The avatar is not built yet, and this exists so the voice layer never grows
 * rendering concerns while waiting for it: voice emits cues, and whatever draws
 * the face consumes them. When the Three.js controller arrives it implements
 * `AvatarController` and is passed to the voice controller — no change here.
 */

/** Discards cues. Used until an avatar is mounted. */
export class NullAvatarController implements AvatarController {
  readonly id = 'null';

  cue(): void {
    // Intentionally empty: nothing is rendering yet.
  }
}

/** Keeps every cue, so tests and the future avatar can read the same stream. */
export class RecordingAvatarController implements AvatarController {
  readonly id = 'recording';
  readonly cues: AvatarCue[] = [];

  constructor(private readonly limit = 500) {}

  cue(cue: AvatarCue): void {
    this.cues.push(cue);
    if (this.cues.length > this.limit) this.cues.shift();
  }

  states(): VoiceState[] {
    return this.cues.map((cue) => cue.state);
  }

  visemes(): string[] {
    return this.cues.map((cue) => cue.viseme).filter((viseme): viseme is string => Boolean(viseme));
  }

  clear(): void {
    this.cues.length = 0;
  }
}

/** Sends cues to several controllers, e.g. an avatar and a debug overlay. */
export class FanOutAvatarController implements AvatarController {
  readonly id = 'fan-out';

  constructor(private readonly targets: AvatarController[]) {}

  cue(cue: AvatarCue): void {
    for (const target of this.targets) target.cue(cue);
  }
}
