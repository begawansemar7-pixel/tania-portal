import type { VoiceError, VoiceSnapshot, VoiceState } from '@tania/types';
import { canTransitionVoice } from '@tania/types';

export interface VoiceStateMachineOptions {
  /** Injected so a test can assert timestamps without racing the clock. */
  now?: () => string;
  /** Called when a move outside the table is attempted. */
  onIllegal?: (from: VoiceState, to: VoiceState) => void;
}

/**
 * The single owner of voice state.
 *
 * Every state change goes through `to()`, which checks the transition table
 * first. That matters more here than in most state machines: a microphone that
 * is still recording while the interface believes it is IDLE is a privacy
 * problem, not a cosmetic one.
 *
 * An illegal move is refused and reported rather than applied. The voice layer
 * keeps working — the previous state stands — because dropping the user into a
 * broken interface would be worse than ignoring one bad transition.
 */
export class VoiceStateMachine {
  private current: VoiceSnapshot;
  private readonly listeners = new Set<(snapshot: VoiceSnapshot) => void>();
  private readonly now: () => string;

  constructor(private readonly options: VoiceStateMachineOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.current = { state: 'IDLE', since: this.now() };
  }

  snapshot(): VoiceSnapshot {
    return this.current;
  }

  get state(): VoiceState {
    return this.current.state;
  }

  can(to: VoiceState): boolean {
    return canTransitionVoice(this.current.state, to);
  }

  /**
   * Moves to a new state, optionally carrying detail.
   *
   * Returns false when the move is not allowed, so a caller can decide whether
   * that is benign — a second cancel arriving after the first, say — or worth
   * surfacing.
   */
  to(next: VoiceState, detail: Partial<Omit<VoiceSnapshot, 'state' | 'since'>> = {}): boolean {
    if (next === this.current.state) {
      // A no-op move still carries detail, e.g. a new partial transcript.
      this.patch(detail);
      return true;
    }

    if (!canTransitionVoice(this.current.state, next)) {
      this.options.onIllegal?.(this.current.state, next);
      return false;
    }

    // Detail that belonged to the previous state must not leak into the next
    // one: a stale partial transcript shown while speaking reads as a bug.
    const carried = next === 'ERROR' ? this.current : blank(this.current);

    this.current = {
      ...carried,
      ...detail,
      state: next,
      since: this.now(),
    };
    this.emit();
    return true;
  }

  /** Updates detail without changing state, e.g. a streaming partial. */
  patch(detail: Partial<Omit<VoiceSnapshot, 'state' | 'since'>>): void {
    this.current = { ...this.current, ...detail };
    this.emit();
  }

  fail(error: VoiceError): boolean {
    return this.to('ERROR', { error });
  }

  /** Returns to IDLE from anywhere, clearing per-turn detail. */
  idle(): boolean {
    if (this.current.state === 'IDLE') {
      this.current = {
        state: 'IDLE',
        since: this.now(),
        ...(this.current.conversationId === undefined
          ? {}
          : { conversationId: this.current.conversationId }),
      };
      this.emit();
      return true;
    }
    return this.to('IDLE');
  }

  subscribe(listener: (snapshot: VoiceSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.current);
  }
}

/** Keeps only what outlives a single turn. */
function blank(snapshot: VoiceSnapshot): VoiceSnapshot {
  return {
    state: snapshot.state,
    since: snapshot.since,
    ...(snapshot.conversationId === undefined
      ? {}
      : { conversationId: snapshot.conversationId }),
  };
}
