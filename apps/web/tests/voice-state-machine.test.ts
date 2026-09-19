import { describe, expect, it, vi } from 'vitest';
import { VOICE_STATES, VOICE_TRANSITIONS, canTransitionVoice, isVoiceBusy } from '@tania/types';
import { VoiceStateMachine } from '@/lib/voice/state-machine';
import { voiceError } from '@/lib/voice/errors';

describe('voice state table', () => {
  it('declares a transition list for every state', () => {
    expect(Object.keys(VOICE_TRANSITIONS).sort()).toEqual([...VOICE_STATES].sort());
  });

  it('never names a target outside the state list', () => {
    const known = new Set<string>(VOICE_STATES);
    for (const [from, targets] of Object.entries(VOICE_TRANSITIONS)) {
      for (const target of targets) {
        expect(known.has(target), `${from} → ${target}`).toBe(true);
      }
    }
  });

  it('lets every state reach IDLE or be recovered from', () => {
    expect(canTransitionVoice('LISTENING', 'IDLE')).toBe(true);
    expect(canTransitionVoice('PROCESSING', 'IDLE')).toBe(true);
    expect(canTransitionVoice('SPEAKING', 'IDLE')).toBe(true);
    expect(canTransitionVoice('ERROR', 'IDLE')).toBe(true);
    expect(canTransitionVoice('ERROR', 'LISTENING')).toBe(true);
  });

  it('allows a user to interrupt an answer and be heard', () => {
    expect(canTransitionVoice('SPEAKING', 'LISTENING')).toBe(true);
  });

  it('rejects the moves that would skip a stage', () => {
    expect(canTransitionVoice('IDLE', 'PROCESSING')).toBe(false);
    expect(canTransitionVoice('LISTENING', 'SPEAKING')).toBe(false);
    expect(canTransitionVoice('PROCESSING', 'LISTENING')).toBe(false);
    expect(canTransitionVoice('ERROR', 'SPEAKING')).toBe(false);
    expect(canTransitionVoice('ERROR', 'PROCESSING')).toBe(false);
  });

  it('knows which states mean work is happening', () => {
    expect(isVoiceBusy('IDLE')).toBe(false);
    expect(isVoiceBusy('ERROR')).toBe(false);
    expect(isVoiceBusy('LISTENING')).toBe(true);
    expect(isVoiceBusy('PROCESSING')).toBe(true);
    expect(isVoiceBusy('SPEAKING')).toBe(true);
  });
});

describe('VoiceStateMachine', () => {
  it('starts idle and notifies subscribers of every change', () => {
    const machine = new VoiceStateMachine();
    const seen: string[] = [];
    machine.subscribe((snapshot) => seen.push(snapshot.state));

    expect(machine.state).toBe('IDLE');
    machine.to('LISTENING');
    machine.to('PROCESSING');
    machine.to('SPEAKING');
    machine.idle();

    expect(seen).toEqual(['LISTENING', 'PROCESSING', 'SPEAKING', 'IDLE']);
  });

  it('refuses an illegal move and reports it instead of applying it', () => {
    const onIllegal = vi.fn();
    const machine = new VoiceStateMachine({ onIllegal });

    expect(machine.to('SPEAKING', {})).toBe(true);
    expect(machine.to('PROCESSING')).toBe(false);

    expect(machine.state).toBe('SPEAKING');
    expect(onIllegal).toHaveBeenCalledWith('SPEAKING', 'PROCESSING');
  });

  it('drops detail that belonged to the previous state', () => {
    const machine = new VoiceStateMachine();

    machine.to('LISTENING', { partial: 'analisa perfor' });
    expect(machine.snapshot().partial).toBe('analisa perfor');

    machine.to('PROCESSING', { transcript: 'analisa performance' });
    // A stale partial rendered while processing reads as a bug.
    expect(machine.snapshot().partial).toBeUndefined();
    expect(machine.snapshot().transcript).toBe('analisa performance');
  });

  it('keeps the conversation across turns', () => {
    const machine = new VoiceStateMachine();

    machine.to('LISTENING');
    machine.patch({ conversationId: 'conv-1' });
    machine.to('PROCESSING');
    machine.idle();

    expect(machine.snapshot().conversationId).toBe('conv-1');
  });

  it('carries the failure into the error state and back out again', () => {
    const machine = new VoiceStateMachine();

    machine.to('LISTENING', { partial: 'halo' });
    machine.fail(voiceError('TIMEOUT'));

    expect(machine.state).toBe('ERROR');
    expect(machine.snapshot().error?.code).toBe('TIMEOUT');
    // The partial is kept in ERROR so the interface can show what was heard.
    expect(machine.snapshot().partial).toBe('halo');

    machine.idle();
    expect(machine.snapshot().error).toBeUndefined();
  });

  it('patches detail without moving state', () => {
    const machine = new VoiceStateMachine();
    machine.to('LISTENING');

    machine.patch({ partial: 'a' });
    machine.patch({ partial: 'ab' });

    expect(machine.state).toBe('LISTENING');
    expect(machine.snapshot().partial).toBe('ab');
  });

  it('stops notifying after unsubscribe', () => {
    const machine = new VoiceStateMachine();
    const listener = vi.fn();
    const stop = machine.subscribe(listener);

    machine.to('LISTENING');
    stop();
    machine.idle();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
