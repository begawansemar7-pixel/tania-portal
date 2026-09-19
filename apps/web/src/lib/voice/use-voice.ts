'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceConversation } from '@tania/core/voice';
import type { VoiceSnapshot } from '@tania/types';
import { createVoiceStack, type VoiceStack } from './index';
import { FanOutAvatarController, RecordingAvatarController } from './avatar';
import { VoiceAvatarBridge, avatarEvents } from '@/lib/avatar';

export interface UseVoiceOptions {
  /** How a spoken turn reaches TANIA. Injected so voice owns no transport. */
  ask: VoiceConversation['ask'];
  /** Conversation the spoken turns belong to, so voice continues the thread. */
  conversationId?: string;
  listenTimeoutMs?: number;
}

export interface UseVoiceResult {
  snapshot: VoiceSnapshot;
  /** False when neither a browser engine nor a runtime is available. */
  supported: boolean;
  providers: { input: string; output: string };
  /** Cues emitted for the avatar, for a debug overlay until one is mounted. */
  avatar: RecordingAvatarController;
  start: () => void;
  cancel: () => void;
  reset: () => void;
  say: (text: string) => void;
}

const IDLE: VoiceSnapshot = { state: 'IDLE', since: '' };

/**
 * Voice as a React binding.
 *
 * The stack is built once, on the client, because every provider it chooses
 * between depends on browser APIs that do not exist during server rendering.
 * The `ask` function is kept in a ref so a re-render never rebuilds the stack
 * mid-turn — which would drop the microphone and the conversation with it.
 */
export function useVoice(options: UseVoiceOptions): UseVoiceResult {
  const askRef = useRef(options.ask);

  // Updated in an effect rather than during render: React may render without
  // committing, and a ref written then would point at an `ask` that never
  // belonged to the mounted tree.
  useEffect(() => {
    askRef.current = options.ask;
  }, [options.ask]);

  const recorder = useMemo(() => new RecordingAvatarController(), []);

  /**
   * Voice cues reach the 3D avatar and the debug recorder alike.
   *
   * The bridge is what closes the loop the voice layer was built with: cues
   * become `TaniaCommand`s, and whatever is rendering the avatar reacts.
   */
  const avatar = useMemo(
    () => new FanOutAvatarController([new VoiceAvatarBridge(avatarEvents), recorder]),
    [recorder],
  );

  const [stack, setStack] = useState<VoiceStack | null>(null);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>(IDLE);

  useEffect(() => {
    const created = createVoiceStack({
      conversation: { ask: (input) => askRef.current(input) },
      avatar,
      ...(options.listenTimeoutMs === undefined
        ? {}
        : { listenTimeoutMs: options.listenTimeoutMs }),
    });

    setStack(created);
    setSnapshot(created.controller.snapshot());
    const unsubscribe = created.controller.subscribe(setSnapshot);

    return () => {
      unsubscribe();
      created.controller.dispose();
    };
  }, [avatar, options.listenTimeoutMs]);

  // Voice follows the typed conversation rather than starting its own.
  useEffect(() => {
    stack?.controller.setConversation(options.conversationId);
  }, [stack, options.conversationId]);

  const start = useCallback(() => {
    void stack?.controller.converse();
  }, [stack]);

  const cancel = useCallback(() => stack?.controller.cancel(), [stack]);
  const reset = useCallback(() => stack?.controller.reset(), [stack]);
  const say = useCallback((text: string) => void stack?.controller.say(text), [stack]);

  return {
    snapshot,
    supported: stack === null ? false : stack.providers.input !== 'mock',
    providers: stack?.providers ?? { input: 'none', output: 'none' },
    avatar: recorder,
    start,
    cancel,
    reset,
    say,
  };
}
