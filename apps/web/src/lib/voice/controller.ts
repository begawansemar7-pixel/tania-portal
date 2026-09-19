import type {
  AvatarController,
  VoiceController,
  VoiceConversation,
} from '@tania/core/voice';
import type { VoiceError, VoiceLocale, VoiceSnapshot } from '@tania/types';
import { logger } from '@/lib/logger';
import { SpeechInputAdapter } from './input/adapter';
import { SpeechOutputAdapter } from './output/adapter';
import { VoiceStateMachine } from './state-machine';
import { NullAvatarController } from './avatar';
import { toVoiceError, voiceError } from './errors';

export interface TaniaVoiceControllerOptions {
  input: SpeechInputAdapter;
  output: SpeechOutputAdapter;
  conversation: VoiceConversation;
  avatar?: AvatarController;
  locale?: VoiceLocale;
  /** Hard limit on one listening turn. */
  listenTimeoutMs?: number;
  /** Speak the answer as it streams instead of waiting for it to finish. */
  streamSpeech?: boolean;
  machine?: VoiceStateMachine;
}

const DEFAULT_LOCALE: VoiceLocale = { language: 'id-ID' };

/**
 * One spoken turn, end to end.
 *
 * Microphone → speech-to-text → TANIA Brain → text-to-speech → audio → avatar.
 *
 * The controller owns the sequence and nothing else: it does not transcribe,
 * does not answer, and does not draw. What it does own is the part that is easy
 * to get wrong — that the microphone is always closed when the state says it
 * is, that a cancel reaches every stage, and that a failure anywhere leaves a
 * state the interface can recover from.
 *
 * Conversation continuity is deliberate: the id from the first reply is carried
 * into every later turn, so speaking to TANIA continues the same thread the
 * typed conversation is in rather than starting a new one each time.
 */
export class TaniaVoiceController implements VoiceController {
  readonly id = 'tania-voice';

  private readonly machine: VoiceStateMachine;
  private readonly avatar: AvatarController;
  private readonly locale: VoiceLocale;
  private conversationId: string | undefined;
  private turn: AbortController | undefined;

  constructor(private readonly options: TaniaVoiceControllerOptions) {
    this.machine =
      options.machine ??
      new VoiceStateMachine({
        onIllegal: (from, to) => logger.warn('voice.illegal_transition', { from, to }),
      });
    this.avatar = options.avatar ?? new NullAvatarController();
    this.locale = options.locale ?? DEFAULT_LOCALE;

    // The avatar follows state for free, so a face is never out of step with
    // what the voice layer is doing.
    this.machine.subscribe((snapshot) => {
      this.avatar.cue({
        state: snapshot.state,
        ...(snapshot.speaking === undefined ? {} : { text: snapshot.speaking }),
      });
    });
  }

  snapshot(): VoiceSnapshot {
    return this.machine.snapshot();
  }

  subscribe(listener: (snapshot: VoiceSnapshot) => void): () => void {
    return this.machine.subscribe(listener);
  }

  /** The thread spoken turns belong to. Set it to continue a typed one. */
  setConversation(conversationId: string | undefined): void {
    this.conversationId = conversationId;
    this.machine.patch(conversationId === undefined ? {} : { conversationId });
  }

  async converse(): Promise<void> {
    if (this.machine.state === 'LISTENING' || this.machine.state === 'PROCESSING') return;

    // Speaking is interrupted rather than queued: a person who starts talking
    // over the answer wants to be heard now.
    if (this.machine.state === 'SPEAKING') this.options.output.cancel();

    const turn = new AbortController();
    this.turn = turn;

    try {
      const transcript = await this.listen(turn);
      if (turn.signal.aborted) return this.settleCancelled();

      const answer = await this.ask(transcript, turn);
      if (turn.signal.aborted) return this.settleCancelled();

      // The streaming path has already spoken; only the buffered path still
      // has something to say. Either way the turn ends back at IDLE.
      if (!answer.spoken) await this.speak(answer.reply, turn);
      if (!turn.signal.aborted) this.machine.idle();
    } catch (error) {
      this.settleFailure(error, 'BRAIN_FAILED');
    } finally {
      if (this.turn === turn) this.turn = undefined;
    }
  }

  /** Speaks text without listening first, e.g. replaying an answer. */
  async say(text: string): Promise<void> {
    if (text.trim().length === 0) return;

    const turn = new AbortController();
    this.turn = turn;

    try {
      if (!this.machine.to('SPEAKING', { speaking: text })) return;
      await this.speakText(text, turn);
      if (!turn.signal.aborted) this.machine.idle();
    } catch (error) {
      this.settleFailure(error, 'SYNTHESIS_FAILED');
    } finally {
      if (this.turn === turn) this.turn = undefined;
    }
  }

  /**
   * Stops everything and returns to IDLE.
   *
   * Both adapters are cancelled regardless of state: the microphone must not
   * stay open because the controller disagreed about which stage it was in.
   */
  cancel(reason = 'Dihentikan pengguna.'): void {
    this.turn?.abort();
    this.turn = undefined;
    this.options.input.cancel();
    this.options.output.cancel();

    logger.info('voice.cancelled', { reason, state: this.machine.state });
    this.machine.idle();
  }

  reset(): void {
    if (this.machine.state === 'ERROR') this.machine.idle();
  }

  /** Releases the microphone. Called when voice is switched off entirely. */
  dispose(): void {
    this.cancel('Voice dimatikan.');
    this.options.input.release();
  }

  // ── Stages ─────────────────────────────────────────────────────────────────

  private async listen(turn: AbortController): Promise<string> {
    const onCancel = (): void => this.options.input.cancel();
    turn.signal.addEventListener('abort', onCancel, { once: true });

    try {
      // Checked rather than relied upon: a listener added to a signal that has
      // already aborted never fires, so a cancel arriving during the permission
      // prompt would otherwise be lost and leave the microphone open.
      this.stopIfCancelled(turn);

      // Permission is resolved before the state changes, so the interface never
      // shows "listening" over a browser prompt that has not been answered.
      await this.options.input.ensurePermission();
      this.stopIfCancelled(turn);

      this.machine.to('LISTENING', { partial: '' });

      const transcript = await this.options.input.listen(
        {
          locale: this.locale,
          ...(this.options.listenTimeoutMs === undefined
            ? {}
            : { timeoutMs: this.options.listenTimeoutMs }),
        },
        {
          onPartial: (partial) => {
            if (this.machine.state === 'LISTENING') this.machine.patch({ partial: partial.text });
          },
          onAmplitude: (amplitude) =>
            this.avatar.cue({ state: this.machine.state, amplitude }),
        },
      );

      return transcript.text;
    } finally {
      turn.signal.removeEventListener('abort', onCancel);
    }
  }

  private async ask(
    transcript: string,
    turn: AbortController,
  ): Promise<{ reply: string; spoken: boolean }> {
    this.machine.to('PROCESSING', { transcript, partial: '' });

    const speech =
      this.options.streamSpeech === false
        ? undefined
        : this.options.output.stream(this.locale, this.speechHandlers());

    let spokenStarted = false;

    const result = await this.options.conversation.ask({
      text: transcript,
      ...(this.conversationId === undefined ? {} : { conversationId: this.conversationId }),
      signal: turn.signal,
      ...(speech === undefined
        ? {}
        : {
            onDelta: (delta) => {
              if (turn.signal.aborted) return;
              if (!spokenStarted) {
                spokenStarted = true;
                // Speech begins while the answer is still arriving.
                this.machine.to('SPEAKING', { speaking: '' });
              }
              this.machine.patch({ speaking: (this.machine.snapshot().speaking ?? '') + delta });
              speech.push(delta);
            },
          }),
    });

    this.conversationId = result.conversationId;
    this.machine.patch({ conversationId: result.conversationId });

    if (turn.signal.aborted) {
      this.options.output.cancel();
      return { reply: result.reply, spoken: true };
    }

    if (speech !== undefined && spokenStarted) {
      await speech.finish();
      return { reply: result.reply, spoken: true };
    }

    return { reply: result.reply, spoken: false };
  }

  private async speak(reply: string, turn: AbortController): Promise<void> {
    if (reply.trim().length === 0) {
      this.machine.idle();
      return;
    }

    this.machine.to('SPEAKING', { speaking: reply });
    await this.speakText(reply, turn);
  }

  private async speakText(text: string, turn: AbortController): Promise<void> {
    const onCancel = (): void => this.options.output.cancel();
    turn.signal.addEventListener('abort', onCancel, { once: true });

    try {
      await this.options.output.speak({ text, locale: this.locale }, this.speechHandlers());
    } finally {
      turn.signal.removeEventListener('abort', onCancel);
    }
  }

  /** Throws if the turn was cancelled, so no stage starts after a stop. */
  private stopIfCancelled(turn: AbortController): void {
    if (turn.signal.aborted) throw voiceError('CANCELLED');
  }

  private speechHandlers() {
    return {
      // A measured word start is the best mouth timing the browser offers, so
      // it is passed through rather than reduced to a single viseme.
      onBoundary: (word: string, elapsedMs?: number) =>
        this.avatar.cue({
          state: this.machine.state,
          word,
          ...(elapsedMs === undefined ? {} : { elapsedMs }),
        }),
      onViseme: (viseme: string) => this.avatar.cue({ state: this.machine.state, viseme }),
      onAmplitude: (amplitude: number) =>
        this.avatar.cue({ state: this.machine.state, amplitude }),
    };
  }

  // ── Endings ────────────────────────────────────────────────────────────────

  private settleCancelled(): void {
    this.options.output.cancel();
    this.machine.idle();
  }

  private settleFailure(error: unknown, fallback: VoiceError['code']): void {
    const failure = toVoiceError(error, fallback);

    // A cancel is a decision, not a fault: it must not leave an error banner.
    if (failure.code === 'CANCELLED') {
      this.machine.idle();
      return;
    }

    logger.warn('voice.failed', { code: failure.code, state: this.machine.state });
    this.options.output.cancel();
    this.machine.fail(failure);
  }
}

export { voiceError };
