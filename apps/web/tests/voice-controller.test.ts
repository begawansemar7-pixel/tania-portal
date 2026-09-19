import { describe, expect, it, vi } from 'vitest';
import type { VoiceConversation } from '@tania/core/voice';
import type { VoiceSnapshot, VoiceState } from '@tania/types';
import { SpeechInputAdapter } from '@/lib/voice/input/adapter';
import { SpeechOutputAdapter } from '@/lib/voice/output/adapter';
import { MockSpeechInputProvider } from '@/lib/voice/input/mock-provider';
import { MockSpeechOutputProvider } from '@/lib/voice/output/mock-provider';
import { StaticMicrophoneAccess } from '@/lib/voice/permissions';
import { RecordingAvatarController } from '@/lib/voice/avatar';
import { TaniaVoiceController } from '@/lib/voice/controller';

const REPLY = 'Kinerja produk X stabil. Dua program berstatus at risk.';

interface HarnessOptions {
  transcript?: string;
  permission?: 'granted' | 'denied' | 'unavailable' | 'prompt';
  inputHangs?: boolean;
  outputHangs?: boolean;
  reply?: string;
  askFails?: boolean;
  streamSpeech?: boolean;
  listenTimeoutMs?: number;
  /** Delta chunks the conversation streams back. */
  deltas?: string[];
}

function harness(options: HarnessOptions = {}) {
  const microphone = new StaticMicrophoneAccess(options.permission ?? 'granted');

  const inputProvider = new MockSpeechInputProvider({
    ...(options.transcript === undefined ? {} : { transcript: options.transcript }),
    ...(options.inputHangs ? { hang: true } : {}),
  });
  const outputProvider = new MockSpeechOutputProvider(options.outputHangs ? { hang: true } : {});

  const input = new SpeechInputAdapter({
    provider: inputProvider,
    microphone,
    timeoutMs: options.listenTimeoutMs ?? 50,
  });
  const output = new SpeechOutputAdapter({ provider: outputProvider });

  const asked: Array<{ text: string; conversationId?: string }> = [];
  let turns = 0;

  const conversation: VoiceConversation = {
    async ask(input) {
      turns += 1;
      asked.push({
        text: input.text,
        ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      });

      if (options.askFails) throw new Error('brain unavailable');

      const reply = options.reply ?? REPLY;

      if (options.deltas) {
        for (const delta of options.deltas) {
          if (input.signal?.aborted) break;
          input.onDelta?.(delta);
        }
      }

      return { reply, conversationId: `conv-${turns === 1 ? '1' : '1'}` };
    },
  };

  const avatar = new RecordingAvatarController();

  const controller = new TaniaVoiceController({
    input,
    output,
    conversation,
    avatar,
    listenTimeoutMs: options.listenTimeoutMs ?? 50,
    ...(options.streamSpeech === undefined ? {} : { streamSpeech: options.streamSpeech }),
  });

  const states: VoiceState[] = [];
  const snapshots: VoiceSnapshot[] = [];
  controller.subscribe((snapshot) => {
    snapshots.push(snapshot);
    if (states[states.length - 1] !== snapshot.state) states.push(snapshot.state);
  });

  return { controller, input, output, outputProvider, microphone, avatar, asked, states, snapshots };
}

describe('a successful spoken conversation', () => {
  it('walks IDLE → LISTENING → PROCESSING → SPEAKING → IDLE', async () => {
    const { controller, states } = harness({ streamSpeech: false });

    await controller.converse();

    expect(states).toEqual(['LISTENING', 'PROCESSING', 'SPEAKING', 'IDLE']);
    expect(controller.snapshot().state).toBe('IDLE');
    expect(controller.snapshot().error).toBeUndefined();
  });

  it('sends what was heard to TANIA and speaks the answer back', async () => {
    const { controller, asked, outputProvider } = harness({
      transcript: 'Analisa performance product X.',
      streamSpeech: false,
    });

    await controller.converse();

    expect(asked[0]?.text).toBe('Analisa performance product X.');
    expect(outputProvider.spoken.join(' ')).toContain('Kinerja produk X stabil');
  });

  it('shows the partial transcript while listening', async () => {
    const { controller, snapshots } = harness({
      transcript: 'halo TANIA',
      streamSpeech: false,
    });

    await controller.converse();

    const partials = snapshots
      .filter((snapshot) => snapshot.state === 'LISTENING')
      .map((snapshot) => snapshot.partial);

    expect(partials).toContain('halo');
    expect(partials).toContain('halo TANIA');
  });

  it('keeps later turns in the same conversation', async () => {
    const { controller, asked } = harness({ streamSpeech: false });

    await controller.converse();
    await controller.converse();

    expect(asked).toHaveLength(2);
    expect(asked[0]?.conversationId).toBeUndefined();
    // The id from the first reply carries into the second ask.
    expect(asked[1]?.conversationId).toBe('conv-1');
    expect(controller.snapshot().conversationId).toBe('conv-1');
  });

  it('continues a conversation the user started by typing', async () => {
    const { controller, asked } = harness({ streamSpeech: false });

    controller.setConversation('conv-typed');
    await controller.converse();

    expect(asked[0]?.conversationId).toBe('conv-typed');
  });

  it('drives the avatar with the same states and with visemes', async () => {
    const { controller, avatar } = harness({ streamSpeech: false });

    await controller.converse();

    expect(avatar.states()).toContain('LISTENING');
    expect(avatar.states()).toContain('SPEAKING');
    expect(avatar.visemes().length).toBeGreaterThan(0);
  });
});

describe('streaming speech', () => {
  it('starts speaking before the answer is complete', async () => {
    const { controller, outputProvider, states } = harness({
      deltas: ['Kinerja produk X stabil. ', 'Dua program berstatus at risk.'],
    });

    await controller.converse();

    // Each completed sentence is spoken on its own rather than all at the end.
    expect(outputProvider.spoken).toEqual([
      'Kinerja produk X stabil.',
      'Dua program berstatus at risk.',
    ]);
    expect(states).toEqual(['LISTENING', 'PROCESSING', 'SPEAKING', 'IDLE']);
  });

  it('falls back to speaking the whole answer when nothing streamed', async () => {
    const { controller, outputProvider } = harness({});

    await controller.converse();

    expect(outputProvider.spoken).toEqual([REPLY]);
  });
});

describe('microphone permission', () => {
  it('reports a denial without ever entering LISTENING', async () => {
    const { controller, states } = harness({ permission: 'denied' });

    await controller.converse();

    expect(states).toEqual(['ERROR']);
    expect(controller.snapshot().error?.code).toBe('PERMISSION_DENIED');
    // Nothing the user can retry until they change a browser setting.
    expect(controller.snapshot().error?.recoverable).toBe(false);
  });

  it('distinguishes no microphone from a refusal', async () => {
    const { controller } = harness({ permission: 'unavailable' });

    await controller.converse();

    expect(controller.snapshot().error?.code).toBe('NO_MICROPHONE');
  });

  it('lets the user try again after clearing the error', async () => {
    const { controller } = harness({ permission: 'denied' });

    await controller.converse();
    expect(controller.snapshot().state).toBe('ERROR');

    controller.reset();
    expect(controller.snapshot().state).toBe('IDLE');
    expect(controller.snapshot().error).toBeUndefined();
  });
});

describe('timeout', () => {
  it('stops listening and reports a timeout when nothing is said', async () => {
    const { controller, states } = harness({ inputHangs: true, listenTimeoutMs: 20 });

    await controller.converse();

    expect(states).toEqual(['LISTENING', 'ERROR']);
    expect(controller.snapshot().error?.code).toBe('TIMEOUT');
    // Worth trying again: the microphone works, nobody spoke.
    expect(controller.snapshot().error?.recoverable).toBe(true);
  });

  it('never leaves the microphone open after a timeout', async () => {
    const { controller, input } = harness({ inputHangs: true, listenTimeoutMs: 20 });
    const cancel = vi.spyOn(input, 'cancel');

    await controller.converse();

    expect(cancel).toHaveBeenCalled();
  });
});

describe('cancellation', () => {
  it('stops a listening turn and returns to IDLE without an error', async () => {
    const { controller, states } = harness({ inputHangs: true, listenTimeoutMs: 5_000 });

    const turn = controller.converse();
    await vi.waitFor(() => expect(controller.snapshot().state).toBe('LISTENING'));
    controller.cancel();
    await turn;

    expect(controller.snapshot().state).toBe('IDLE');
    // A cancel is a decision, not a fault.
    expect(controller.snapshot().error).toBeUndefined();
    expect(states).toEqual(['LISTENING', 'IDLE']);
  });

  it('stops audio immediately when speaking is cancelled', async () => {
    const { controller, outputProvider } = harness({
      outputHangs: true,
      streamSpeech: false,
    });

    const turn = controller.converse();
    await vi.waitFor(() => expect(controller.snapshot().state).toBe('SPEAKING'));
    controller.cancel();
    await turn;

    expect(controller.snapshot().state).toBe('IDLE');
    expect(outputProvider.stopped).toBeGreaterThan(0);
  });

  it('releases the microphone when voice is switched off', () => {
    const { controller, microphone } = harness({});

    controller.dispose();

    expect(microphone.released).toBe(true);
    expect(controller.snapshot().state).toBe('IDLE');
  });

  it('does not lose a cancel that arrives before listening starts', async () => {
    const { controller, states } = harness({ inputHangs: true, listenTimeoutMs: 5_000 });

    // Cancelled while the permission prompt is still resolving: the turn must
    // stop rather than opening a microphone nobody is waiting on.
    const turn = controller.converse();
    controller.cancel();
    await turn;

    expect(controller.snapshot().state).toBe('IDLE');
    expect(controller.snapshot().error).toBeUndefined();
    expect(states).not.toContain('PROCESSING');
  });

  it('ignores a cancel when nothing is happening', () => {
    const { controller } = harness({});

    controller.cancel();

    expect(controller.snapshot().state).toBe('IDLE');
  });
});

describe('failure handling', () => {
  it('reports a Brain failure without losing the state machine', async () => {
    const { controller, states } = harness({ askFails: true, streamSpeech: false });

    await controller.converse();

    expect(states).toEqual(['LISTENING', 'PROCESSING', 'ERROR']);
    expect(controller.snapshot().error?.code).toBe('BRAIN_FAILED');

    controller.reset();
    expect(controller.snapshot().state).toBe('IDLE');
  });

  it('returns to IDLE when the answer is empty rather than speaking nothing', async () => {
    const { controller, outputProvider } = harness({ reply: '   ', streamSpeech: false });

    await controller.converse();

    expect(controller.snapshot().state).toBe('IDLE');
    expect(outputProvider.spoken).toEqual([]);
  });

  it('speaks a replayed answer without listening first', async () => {
    const { controller, outputProvider, states } = harness({});

    await controller.say('Ini pengulangan jawaban.');

    expect(states).toEqual(['SPEAKING', 'IDLE']);
    expect(outputProvider.spoken).toEqual(['Ini pengulangan jawaban.']);
  });
});
