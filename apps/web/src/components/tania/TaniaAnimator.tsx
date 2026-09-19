'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { AnimationAction, AnimationMixer, Object3D, Vector2 } from 'three';
import { LoopOnce, LoopRepeat } from 'three';
import { resolveCommand, type AvatarEvent, type TaniaCommand } from '@tania/types';
import {
  AvatarEventBus,
  ExpressionController,
  GazeRegistry,
  GestureController,
  IdleMotion,
  MOUTH_REST,
  VisemeController,
  GAZE_SECONDS,
} from '@/lib/avatar';
import type { AvatarRig } from './rig';

export interface TaniaAnimatorProps {
  rig: AvatarRig | null;
  mixer: AnimationMixer | null;
  actions: Record<string, AnimationAction>;
  bus: AvatarEventBus;
  /** Named regions the avatar can look at, e.g. `dashboard`. */
  gaze?: GazeRegistry;
  /** Lowers the work per frame on a weaker device. */
  quality?: 'full' | 'reduced';
}

/**
 * Everything that moves, driven from the render loop.
 *
 * The single most important property of this component: **it never sets React
 * state.** Bus events are written into refs and consumed by `useFrame`, so a
 * mouth moving five times a second costs nothing above the canvas. That is
 * also why the controllers are plain classes — React has no business
 * re-rendering a jaw.
 *
 * Four systems run every frame and write to different parts of the rig, so
 * none can overwrite another: expression writes brows and lids, lip sync
 * writes the mouth, gaze writes head and eyes, idle motion adds the drift and
 * breathing that keep the avatar from looking frozen.
 */
export function TaniaAnimator({
  rig,
  mixer,
  actions,
  bus,
  gaze,
  quality = 'full',
}: TaniaAnimatorProps) {
  const command = useRef<TaniaCommand>(bus.last());
  const pointer = useThree((state) => state.pointer) as Vector2;

  const viseme = useMemo(() => new VisemeController(), []);
  const expression = useMemo(() => new ExpressionController(), []);
  const gestures = useMemo(() => new GestureController(), []);
  const idle = useMemo(() => new IdleMotion(), []);
  const regions = useMemo(() => gaze ?? new GazeRegistry(), [gaze]);

  const mouth = useRef({ ...MOUTH_REST });
  const head = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const active = useRef<AnimationAction | null>(null);

  // Bus events land in refs; nothing here triggers a render.
  useEffect(() => {
    const apply = (event: AvatarEvent): void => {
      switch (event.type) {
        case 'command': {
          command.current = event.command;
          const resolved = resolveCommand(event.command);
          expression.setState(resolved.state, resolved.emotion);

          if (resolved.state !== 'SPEAKING') viseme.stop();
          break;
        }
        case 'speech-start':
          viseme.start({
            ...(event.timeline === undefined ? {} : { timeline: event.timeline }),
            ...(event.text === undefined ? {} : { text: event.text }),
          });
          break;
        case 'speech-word':
          viseme.word(event.word, event.elapsedMs, event.durationMs);
          break;
        case 'speech-amplitude':
          viseme.setAmplitude(event.amplitude);
          break;
        case 'speech-end':
          viseme.stop();
          // A blink on finishing reads as "done", and breaks the stillness
          // between an answer ending and the next question.
          expression.blink();
          break;
      }
    };

    return bus.on('*', apply);
  }, [bus, expression, viseme]);

  // Gesture changes are rare, so they are applied on the mixer directly.
  useFrame((_state, rawDelta) => {
    if (!rig) return;

    // A tab returning from the background hands back a huge delta; clamping it
    // stops the avatar lurching through half a second of animation at once.
    const delta = Math.min(rawDelta, 0.1);
    const resolved = resolveCommand(command.current);

    // ── Face ────────────────────────────────────────────────────────────────
    const face = expression.update(delta);
    for (const [name, weight] of Object.entries(face)) rig.setMorph(name, weight);

    // ── Mouth ───────────────────────────────────────────────────────────────
    const target = viseme.sample();
    for (const key of Object.keys(MOUTH_REST)) {
      const from = mouth.current[key] ?? 0;
      const to = target[key] ?? 0;
      // Fast, or speech looks dubbed.
      const next = from + (to - from) * Math.min(1, delta / 0.045);
      mouth.current[key] = Math.abs(next) < 0.001 ? 0 : next;
      rig.setMorph(key, next);
    }

    // ── Head ────────────────────────────────────────────────────────────────
    const wanted = regions.resolve(resolved.gaze, { x: pointer.x, y: pointer.y });
    const life = quality === 'full'
      ? idle.update(delta, resolved.state)
      : { sway: { yaw: 0, pitch: 0, roll: 0 }, breath: 0 };

    const rate = Math.min(1, 1 - Math.exp(-delta / (GAZE_SECONDS / 3)));
    head.current.yaw += (wanted.yaw + life.sway.yaw - head.current.yaw) * rate;
    head.current.pitch += (wanted.pitch + life.sway.pitch - head.current.pitch) * rate;
    head.current.roll += (life.sway.roll - head.current.roll) * rate;

    if (rig.head) {
      rig.head.rotation.y = head.current.yaw;
      rig.head.rotation.x = head.current.pitch;
      rig.head.rotation.z = head.current.roll;
    }

    for (const eye of [rig.leftEye, rig.rightEye]) {
      if (!eye) continue;
      eye.rotation.y = head.current.yaw * 0.35;
      eye.rotation.x = head.current.pitch * 0.35;
    }

    // ── Breathing ───────────────────────────────────────────────────────────
    if (rig.chest && quality === 'full') {
      const scale = 1 + life.breath;
      rig.chest.scale.set(scale, 1 + life.breath * 0.5, scale);
    }

    // ── Body ────────────────────────────────────────────────────────────────
    const chosen = gestures.select(resolved.state, command.current.gesture);
    if (chosen && mixer) {
      play(chosen, gestures, actions, active, mixer);
    }

    mixer?.update(delta);
  });

  return null;
}

/** Cross-fades to a gesture and arranges its return to idle. */
function play(
  gesture: Parameters<GestureController['plan']>[0],
  gestures: GestureController,
  actions: Record<string, AnimationAction>,
  active: { current: AnimationAction | null },
  mixer: AnimationMixer,
): void {
  const names = Object.keys(actions);
  const plan = gestures.plan(gesture, names);

  const idleName = names.find((name) => /idle|breath/i.test(name));
  const idleAction = idleName === undefined ? undefined : actions[idleName];
  const next = plan.clip === undefined ? idleAction : actions[plan.clip];

  if (!next || next === active.current) return;

  next.reset();
  next.setLoop(plan.loop ? LoopRepeat : LoopOnce, Infinity);
  next.clampWhenFinished = true;
  next.fadeIn(plan.fadeSeconds).play();
  active.current?.fadeOut(plan.fadeSeconds);
  active.current = next;

  if (!plan.returnsToIdle || !idleAction || idleAction === next) return;

  // An avatar frozen mid-wave is the most common way a character breaks.
  const onFinished = (event: { action: AnimationAction }): void => {
    if (event.action !== next) return;
    idleAction.reset().fadeIn(plan.fadeSeconds).play();
    next.fadeOut(plan.fadeSeconds);
    active.current = idleAction;
    mixer.removeEventListener('finished', onFinished as never);
  };

  mixer.addEventListener('finished', onFinished as never);
}

/** Kept for callers that need the animator's rig contract. */
export type { Object3D };
