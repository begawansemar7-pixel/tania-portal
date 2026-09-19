'use client';

import { AlertTriangle, CheckCircle2, Ear, Loader2, MessageCircle, Sparkles, XCircle } from 'lucide-react';
import type { AvatarFallbackReason, AvatarState, TaniaCommand } from '@tania/types';
import { FALLBACK_REASON_TEXT } from '@/lib/avatar';

const LABELS: Record<AvatarState, string> = {
  IDLE: 'TANIA siap',
  LISTENING: 'Mendengarkan',
  THINKING: 'Memproses',
  SPEAKING: 'Menjawab',
  SUCCESS: 'Selesai',
  WARNING: 'Perlu perhatian',
  ERROR: 'Bermasalah',
};

const TONES: Record<AvatarState, string> = {
  IDLE: 'bg-slate-100 text-slate-600 ring-slate-200',
  LISTENING: 'bg-rose-50 text-rose-700 ring-rose-200',
  THINKING: 'bg-sky-50 text-sky-700 ring-sky-200',
  SPEAKING: 'bg-brand/10 text-brand-dark ring-brand/30',
  SUCCESS: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  WARNING: 'bg-amber-50 text-amber-700 ring-amber-200',
  ERROR: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function StateIcon({ state }: { state: AvatarState }) {
  const className = 'size-4';

  switch (state) {
    case 'LISTENING':
      return <Ear className={className} aria-hidden />;
    case 'THINKING':
      return <Loader2 className={`${className} animate-spin`} aria-hidden />;
    case 'SPEAKING':
      return <MessageCircle className={className} aria-hidden />;
    case 'SUCCESS':
      return <CheckCircle2 className={className} aria-hidden />;
    case 'WARNING':
      return <AlertTriangle className={className} aria-hidden />;
    case 'ERROR':
      return <XCircle className={className} aria-hidden />;
    default:
      return <Sparkles className={className} aria-hidden />;
  }
}

/**
 * What TANIA is doing, in words.
 *
 * Rendered alongside the scene and *instead* of it in every fallback, so the
 * state is never conveyed by animation alone — which is both the accessible
 * choice and the one that still works when WebGL does not.
 */
export function TaniaStatus({ state, className }: { state: AvatarState; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${TONES[state]} ${className ?? ''}`}
    >
      <StateIcon state={state} />
      {LABELS[state]}
    </span>
  );
}

/**
 * The 2D presence shown when the scene is not running.
 *
 * Not an apology: it carries the same state the 3D avatar would, and says why
 * it is here. A reason the user can act on — a small screen, a reduced-motion
 * preference — is more useful than a blank panel.
 */
export function TaniaFallback({
  command,
  reason,
  className,
}: {
  command: TaniaCommand;
  reason: AvatarFallbackReason;
  className?: string;
}) {
  const { state } = command;

  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-slate-50 to-white p-4 text-center ${className ?? ''}`}
    >
      <span
        className={`grid size-12 place-items-center rounded-full ring-1 ${TONES[state]} ${
          state === 'LISTENING' || state === 'SPEAKING' ? 'motion-safe:animate-pulse' : ''
        }`}
      >
        <StateIcon state={state} />
      </span>

      <TaniaStatus state={state} />

      {command.speech?.text ? (
        <p className="line-clamp-2 max-w-xs text-xs text-muted">{command.speech.text}</p>
      ) : null}

      <p className="max-w-xs text-[11px] text-muted">{FALLBACK_REASON_TEXT[reason]}</p>
    </div>
  );
}

/**
 * Shown while the asset downloads.
 *
 * Deliberately the same size and shape as the scene, so nothing on the page
 * moves when the avatar arrives.
 */
export function TaniaLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-slate-50 ${className ?? ''}`}
    >
      <span className="grid size-16 place-items-center rounded-full bg-white ring-1 ring-slate-200">
        <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
      </span>
      <span className="text-xs text-muted">Memuat avatar TANIA…</span>
    </div>
  );
}
