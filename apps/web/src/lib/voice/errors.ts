import type { VoiceError, VoiceErrorCode } from '@tania/types';

/**
 * The voice layer's failures, phrased for the person using it.
 *
 * Every provider error is funnelled through here, so a browser engine and a
 * JARVIS runtime report a denied microphone with the same code and the same
 * words — the interface should not have to tell them apart.
 */
const MESSAGES: Record<VoiceErrorCode, string> = {
  PERMISSION_DENIED: 'Akses mikrofon ditolak. Izinkan mikrofon di pengaturan browser untuk memakai suara.',
  NO_MICROPHONE: 'Tidak ada mikrofon yang terdeteksi pada perangkat ini.',
  UNSUPPORTED: 'Peramban ini belum mendukung interaksi suara.',
  TIMEOUT: 'Tidak ada suara yang terdengar. Coba lagi dan mulai berbicara setelah nada siap.',
  CANCELLED: 'Interaksi suara dihentikan.',
  NO_SPEECH: 'Tidak ada ucapan yang dapat dikenali.',
  TRANSCRIPTION_FAILED: 'Ucapan tidak dapat ditranskrip. Coba lagi.',
  SYNTHESIS_FAILED: 'Jawaban tidak dapat diucapkan. Teksnya tetap tersedia.',
  BRAIN_FAILED: 'TANIA tidak dapat menjawab permintaan ini.',
};

/** Codes where retrying is pointless until something outside changes. */
const PERMANENT: VoiceErrorCode[] = ['PERMISSION_DENIED', 'NO_MICROPHONE', 'UNSUPPORTED'];

export function voiceError(code: VoiceErrorCode, detail?: string): VoiceError {
  return {
    code,
    message: detail ?? MESSAGES[code],
    recoverable: !PERMANENT.includes(code),
  };
}

export function isVoiceError(value: unknown): value is VoiceError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'recoverable' in value
  );
}

/** Normalises anything thrown by a provider into a voice error. */
export function toVoiceError(error: unknown, fallback: VoiceErrorCode): VoiceError {
  if (isVoiceError(error)) return error;
  if (error instanceof Error && error.name === 'AbortError') return voiceError('CANCELLED');
  return voiceError(fallback, error instanceof Error ? undefined : undefined);
}
