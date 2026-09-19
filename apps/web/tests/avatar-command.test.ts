import { describe, expect, it, vi } from 'vitest';
import {
  AVATAR_EXPRESSIONS,
  AVATAR_GESTURES,
  AVATAR_STATES,
  STATE_EXPRESSION,
  STATE_GAZE,
  isAvatarExpression,
  isAvatarGesture,
  isAvatarState,
  resolveCommand,
} from '@tania/types';
import { AvatarEventBus } from '@/lib/avatar/event-bus';
import { VoiceAvatarBridge, avatarStateForVoice } from '@/lib/avatar/voice-bridge';
import { decideAvatar, MIN_SCENE_WIDTH } from '@/lib/avatar/capability';

describe('the TaniaCommand contract', () => {
  it('names the seven states, expressions and six gestures', () => {
    expect([...AVATAR_STATES]).toEqual([
      'IDLE',
      'LISTENING',
      'THINKING',
      'SPEAKING',
      'SUCCESS',
      'WARNING',
      'ERROR',
    ]);
    expect([...AVATAR_EXPRESSIONS]).toEqual([
      'friendly',
      'focused',
      'thinking',
      'confident',
      'cheerful',
      'concerned',
      'apologetic',
    ]);
    expect([...AVATAR_GESTURES]).toEqual([
      'wave',
      'explain',
      'point',
      'nod',
      'thinking',
      'thumbs-up',
    ]);
  });

  it('gives every state a default face and a place to look', () => {
    for (const state of AVATAR_STATES) {
      expect(isAvatarExpression(STATE_EXPRESSION[state]), state).toBe(true);
      expect(STATE_GAZE[state], state).toBeDefined();
    }
  });

  it('fills a bare command with the defaults its state implies', () => {
    expect(resolveCommand({ state: 'THINKING' })).toEqual({
      state: 'THINKING',
      emotion: 'thinking',
      gesture: 'thinking',
      // Looking away is what makes thinking legible from outside.
      gaze: 'away',
    });
  });

  it('keeps whatever the caller stated', () => {
    const resolved = resolveCommand({
      state: 'SPEAKING',
      emotion: 'cheerful',
      gesture: 'wave',
      gaze: 'screen',
    });

    expect(resolved).toEqual({
      state: 'SPEAKING',
      emotion: 'cheerful',
      gesture: 'wave',
      gaze: 'screen',
    });
  });

  it('carries speech through untouched', () => {
    const resolved = resolveCommand({
      state: 'SPEAKING',
      speech: { viseme: 'A', amplitude: 0.6, text: 'halo' },
    });

    expect(resolved.speech).toEqual({ viseme: 'A', amplitude: 0.6, text: 'halo' });
  });

  it('rejects names it does not know', () => {
    expect(isAvatarState('DANCING')).toBe(false);
    expect(isAvatarGesture('shrug')).toBe(false);
    expect(isAvatarExpression('smug')).toBe(false);
  });
});

describe('AvatarEventBus', () => {
  it('replays the current pose to a late subscriber', () => {
    const bus = new AvatarEventBus();
    bus.command({ state: 'SPEAKING' });

    const listener = vi.fn();
    bus.onCommand(listener);

    // An avatar that finishes loading mid-conversation must adopt the pose in
    // progress rather than starting at IDLE.
    expect(listener).toHaveBeenCalledWith({ state: 'SPEAKING' });
  });

  it('changes one part of the pose and keeps the rest', () => {
    const bus = new AvatarEventBus();
    bus.command({ state: 'SPEAKING', emotion: 'cheerful' });
    bus.patch({ speech: { viseme: 'O' } });

    expect(bus.last()).toEqual({
      state: 'SPEAKING',
      emotion: 'cheerful',
      speech: { viseme: 'O' },
    });
  });

  it('never wakes a command subscriber for speech', () => {
    const bus = new AvatarEventBus();
    const onCommand = vi.fn();
    bus.onCommand(onCommand);
    onCommand.mockClear();

    // A speaking avatar produces these several times a second. If they reached
    // a command subscriber, React would re-render the panel on every syllable.
    bus.emit({ type: 'speech-start', text: 'halo' });
    for (let index = 0; index < 40; index += 1) {
      bus.emit({ type: 'speech-word', word: 'halo', elapsedMs: index * 50 });
      bus.emit({ type: 'speech-amplitude', amplitude: 0.5 });
    }
    bus.emit({ type: 'speech-end' });

    expect(onCommand).not.toHaveBeenCalled();
  });

  it('delivers speech to whoever asked for it', () => {
    const bus = new AvatarEventBus();
    const seen: string[] = [];
    bus.on('speech-word', (event) => {
      if (event.type === 'speech-word') seen.push(event.word);
    });

    bus.emit({ type: 'speech-word', word: 'kinerja', elapsedMs: 0 });
    bus.emit({ type: 'speech-amplitude', amplitude: 0.3 });

    expect(seen).toEqual(['kinerja']);
  });

  it('does not replay stale speech to a late subscriber', () => {
    const bus = new AvatarEventBus();
    bus.emit({ type: 'speech-word', word: 'lama', elapsedMs: 0 });

    const listener = vi.fn();
    bus.on('speech-word', listener);

    // A viseme from two seconds ago is not worth showing.
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const bus = new AvatarEventBus();
    const listener = vi.fn();
    const stop = bus.onCommand(listener);

    stop();
    bus.command({ state: 'ERROR' });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('voice drives the avatar', () => {
  it('shows processing as thinking, because that is what it looks like', () => {
    expect(avatarStateForVoice('IDLE')).toBe('IDLE');
    expect(avatarStateForVoice('LISTENING')).toBe('LISTENING');
    expect(avatarStateForVoice('PROCESSING')).toBe('THINKING');
    expect(avatarStateForVoice('SPEAKING')).toBe('SPEAKING');
    expect(avatarStateForVoice('ERROR')).toBe('ERROR');
  });

  it('turns a voice cue into a command', () => {
    const bus = new AvatarEventBus();
    new VoiceAvatarBridge(bus).cue({ state: 'LISTENING' });

    expect(bus.last()).toEqual({ state: 'LISTENING' });
  });

  it('lets a mouth update through without restating the pose', () => {
    const bus = new AvatarEventBus();
    const bridge = new VoiceAvatarBridge(bus);

    bus.command({ state: 'SPEAKING', emotion: 'cheerful', gesture: 'wave' });
    const events: string[] = [];
    bus.on('*', (event) => events.push(event.type));

    bridge.cue({ state: 'SPEAKING', amplitude: 0.5 });

    // Mouth data travels as a speech event, never as a pose change: the
    // expression and gesture the workspace set must survive an utterance.
    expect(bus.last()).toEqual({ state: 'SPEAKING', emotion: 'cheerful', gesture: 'wave' });
    expect(events).toContain('speech-amplitude');
  });

  it('brackets an utterance so the mouth knows when to start and stop', () => {
    const bus = new AvatarEventBus();
    const bridge = new VoiceAvatarBridge(bus);
    const events: string[] = [];
    bus.on('*', (event) => events.push(event.type));

    bridge.cue({ state: 'SPEAKING' });
    bridge.cue({ state: 'SPEAKING', word: 'halo', elapsedMs: 0 });
    bridge.cue({ state: 'IDLE' });

    expect(events).toEqual([
      'command',
      'command',
      'speech-start',
      'speech-word',
      'command',
      'speech-end',
    ]);
  });

  it('resets the pose when the state actually changes', () => {
    const bus = new AvatarEventBus();
    const bridge = new VoiceAvatarBridge(bus);

    bus.command({ state: 'SPEAKING', emotion: 'cheerful', gesture: 'wave' });
    bridge.cue({ state: 'IDLE' });

    expect(bus.last()).toEqual({ state: 'IDLE' });
  });
});

describe('when the 3D scene should run at all', () => {
  const base = {
    assetUrl: '/avatar/tania.glb',
    prefersReducedMotion: false,
    hasWebgl: true,
    viewportWidth: 1440,
  };

  it('runs the scene when everything is in place', () => {
    expect(decideAvatar(base)).toEqual({
      mode: 'scene',
      assetUrl: '/avatar/tania.glb',
      quality: 'full',
    });
  });

  it('degrades rather than refuses on a modest device', () => {
    // It can manage something, so it gets something: no idle motion, lower dpr.
    expect(decideAvatar({ ...base, deviceMemoryGb: 3 })).toEqual({
      mode: 'scene',
      assetUrl: '/avatar/tania.glb',
      quality: 'reduced',
    });
    expect(decideAvatar({ ...base, cores: 2 }).mode).toBe('scene');
  });

  it('falls back when no asset is configured', () => {
    expect(decideAvatar({ ...base, assetUrl: undefined })).toEqual({
      mode: 'fallback',
      reason: 'no-asset',
    });
  });

  it('falls back without WebGL', () => {
    expect(decideAvatar({ ...base, hasWebgl: false })).toEqual({
      mode: 'fallback',
      reason: 'no-webgl',
    });
  });

  it('honours a reduced-motion preference by switching the scene off', () => {
    // The request is about vestibular comfort, and a continuously animated
    // face is exactly the thing being asked about.
    expect(decideAvatar({ ...base, prefersReducedMotion: true })).toEqual({
      mode: 'fallback',
      reason: 'reduced-motion',
    });
  });

  it('falls back on a small screen', () => {
    expect(decideAvatar({ ...base, viewportWidth: MIN_SCENE_WIDTH - 1 })).toEqual({
      mode: 'fallback',
      reason: 'small-screen',
    });
    expect(decideAvatar({ ...base, viewportWidth: MIN_SCENE_WIDTH }).mode).toBe('scene');
  });

  it('falls back on a device with little memory', () => {
    expect(decideAvatar({ ...base, deviceMemoryGb: 1 })).toEqual({
      mode: 'fallback',
      reason: 'small-screen',
    });
    expect(decideAvatar({ ...base, deviceMemoryGb: 8 }).mode).toBe('scene');
  });

  it('reports the reason a user can act on first', () => {
    // Several reasons at once: the missing asset wins, because it is the fact
    // the other two cannot be acted on without.
    const decision = decideAvatar({
      ...base,
      assetUrl: undefined,
      hasWebgl: false,
      prefersReducedMotion: true,
    });

    expect(decision).toEqual({ mode: 'fallback', reason: 'no-asset' });
  });
});
