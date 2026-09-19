'use client';

import { Loader2, Mic, Square, Volume2 } from 'lucide-react';
import type { VoiceSnapshot } from '@tania/types';
import { isVoiceBusy } from '@tania/types';

/**
 * The microphone control and what it is currently doing.
 *
 * One button for four states on purpose: while anything is happening it
 * becomes a stop, because the most important action during listening or
 * speaking is always "stop". Each state announces itself, so the control is
 * usable without seeing the icon change.
 */
export function VoiceButton({
  snapshot,
  supported,
  onStart,
  onCancel,
}: {
  snapshot: VoiceSnapshot;
  supported: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  const busy = isVoiceBusy(snapshot.state);

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Peramban ini belum mendukung input suara"
        aria-label="Input suara (tidak tersedia di peramban ini)"
        className="grid size-9 shrink-0 cursor-not-allowed place-items-center rounded-full bg-slate-100 text-slate-400"
      >
        <Mic className="size-4" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={busy ? onCancel : onStart}
      aria-label={LABELS[snapshot.state]}
      aria-pressed={busy}
      title={LABELS[snapshot.state]}
      className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${STYLES[snapshot.state]}`}
    >
      {icon(snapshot)}
    </button>
  );
}

const LABELS: Record<VoiceSnapshot['state'], string> = {
  IDLE: 'Mulai bicara dengan TANIA',
  LISTENING: 'Mendengarkan — klik untuk berhenti',
  PROCESSING: 'TANIA sedang memproses — klik untuk berhenti',
  SPEAKING: 'TANIA sedang berbicara — klik untuk berhenti',
  ERROR: 'Interaksi suara bermasalah — klik untuk mencoba lagi',
};

const STYLES: Record<VoiceSnapshot['state'], string> = {
  IDLE: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  LISTENING: 'bg-rose-600 text-white hover:bg-rose-700 animate-pulse',
  PROCESSING: 'bg-slate-200 text-slate-700',
  SPEAKING: 'bg-brand text-white hover:bg-brand-dark',
  ERROR: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
};

function icon(snapshot: VoiceSnapshot) {
  switch (snapshot.state) {
    case 'LISTENING':
      return <Square className="size-3.5 fill-current" aria-hidden />;
    case 'PROCESSING':
      return <Loader2 className="size-4 animate-spin" aria-hidden />;
    case 'SPEAKING':
      return <Volume2 className="size-4" aria-hidden />;
    default:
      return <Mic className="size-4" aria-hidden />;
  }
}

/**
 * Live commentary for the voice turn.
 *
 * A polite live region: the state changes several times a second while a
 * partial transcript grows, and an assertive one would interrupt the user's
 * own screen reader output mid-sentence.
 */
export function VoiceStatus({ snapshot }: { snapshot: VoiceSnapshot }) {
  if (snapshot.state === 'IDLE') return null;

  const message =
    snapshot.state === 'ERROR'
      ? snapshot.error?.message
      : snapshot.state === 'LISTENING'
        ? (snapshot.partial ?? 'Mendengarkan…')
        : snapshot.state === 'PROCESSING'
          ? `Memproses: "${snapshot.transcript ?? ''}"`
          : 'TANIA sedang berbicara…';

  return (
    <p
      role="status"
      aria-live="polite"
      className={`mt-2 text-[11px] ${snapshot.state === 'ERROR' ? 'text-amber-700' : 'text-muted'}`}
    >
      {message}
    </p>
  );
}
