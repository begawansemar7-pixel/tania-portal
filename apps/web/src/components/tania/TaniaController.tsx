'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AvatarFallbackReason, AvatarState, TaniaCommand } from '@tania/types';
import {
  AvatarEventBus,
  GazeRegistry,
  avatarEvents,
  decideAvatar,
  readAvatarEnvironment,
  type AvatarDecision,
} from '@/lib/avatar';
import { TaniaFallback, TaniaLoading, TaniaStatus } from './TaniaStatus';

/**
 * The scene is loaded only when it will actually be used.
 *
 * `ssr: false` because every capability check it depends on — WebGL, viewport,
 * reduced motion — exists only in a browser. The dynamic import is what keeps
 * Three.js out of the initial bundle: a user on a phone, or one who asked for
 * less motion, never downloads it at all.
 */
const TaniaScene = dynamic(() => import('./TaniaScene').then((module) => module.TaniaScene), {
  ssr: false,
  loading: () => <TaniaLoading />,
});

export interface TaniaControllerProps {
  /** Defaults to the shared bus, which the voice layer already feeds. */
  bus?: AvatarEventBus;
  /** Overrides the configured asset, for a preview or a test. */
  assetUrl?: string;
  /** Named regions the avatar may look at, e.g. `dashboard`. */
  gaze?: GazeRegistry;
  className?: string;
  showStatus?: boolean;
}

/**
 * The avatar, its fallbacks, and the commands driving it.
 *
 * Two rules this component exists to enforce.
 *
 * **The application is never blocked by the avatar.** It decides on the client
 * whether a scene is appropriate, loads it lazily if so, shows a 2D presence
 * carrying the same state while it loads or if it cannot, and falls back again
 * if the asset fails.
 *
 * **Speech never re-renders React.** Only the coarse state is held in state —
 * enough for the status badge and the fallback. Visemes, amplitude and word
 * timing reach the scene through the bus and are consumed inside the render
 * loop, so a moving mouth costs nothing above the canvas.
 */
export function TaniaController({
  bus = avatarEvents,
  assetUrl,
  gaze,
  className,
  showStatus = true,
}: TaniaControllerProps) {
  const [state, setState] = useState<AvatarState>(() => bus.last().state);
  const [decision, setDecision] = useState<AvatarDecision | null>(null);
  const [failed, setFailed] = useState<AvatarFallbackReason | null>(null);

  // Kept for the fallback, which shows what is being said; updated without a
  // render because the fallback only reads it when the state changes.
  const latest = useRef<TaniaCommand>(bus.last());

  useEffect(
    () =>
      bus.onCommand((command) => {
        latest.current = command;
        // Only a changed state is worth a render.
        setState((current) => (current === command.state ? current : command.state));
      }),
    [bus],
  );

  const configured = assetUrl ?? process.env.NEXT_PUBLIC_TANIA_AVATAR_URL;

  useEffect(() => {
    const evaluate = (): void => setDecision(decideAvatar(readAvatarEnvironment(configured)));
    evaluate();

    // Re-evaluated on resize and on a changed motion preference: a window
    // dragged onto a small screen should drop the scene, not struggle on.
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', evaluate);
    motion.addEventListener('change', evaluate);

    return () => {
      window.removeEventListener('resize', evaluate);
      motion.removeEventListener('change', evaluate);
    };
  }, [configured]);

  const reason = failed ?? (decision?.mode === 'fallback' ? decision.reason : null);
  const showOverlay = showStatus && reason === null && decision?.mode === 'scene';

  const body = useMemo(() => {
    // Nothing decided yet: the client checks have not run.
    if (decision === null) return <TaniaLoading />;
    if (reason !== null || decision.mode !== 'scene') {
      return <TaniaFallback command={{ ...latest.current, state }} reason={reason ?? 'no-asset'} />;
    }

    return (
      <TaniaScene
        assetUrl={decision.assetUrl}
        bus={bus}
        {...(gaze === undefined ? {} : { gaze })}
        quality={decision.quality}
        onError={() => setFailed('load-failed')}
      />
    );
  }, [decision, reason, state, bus, gaze]);

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      {body}

      {showOverlay ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <TaniaStatus state={state} />
        </div>
      ) : null}
    </div>
  );
}
