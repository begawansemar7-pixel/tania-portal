// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AVATAR_STATES, type AvatarFallbackReason } from '@tania/types';
import { TaniaFallback, TaniaLoading, TaniaStatus } from '@/components/tania/TaniaStatus';
import { FALLBACK_REASON_TEXT } from '@/lib/avatar';

describe('TaniaStatus', () => {
  it('names every state in words, not only by colour', () => {
    for (const state of AVATAR_STATES) {
      const { unmount } = render(<TaniaStatus state={state} />);

      // Conveying state by animation alone fails both a screen reader and a
      // browser with no WebGL.
      const status = screen.getByRole('status');
      expect(status.textContent?.trim().length, state).toBeGreaterThan(0);
      expect(status).toHaveAttribute('aria-live', 'polite');
      unmount();
    }
  });

  it('distinguishes the states a person acts on', () => {
    const { unmount } = render(<TaniaStatus state={'ERROR'} />);
    expect(screen.getByRole('status')).toHaveTextContent('Bermasalah');
    unmount();

    render(<TaniaStatus state={'LISTENING'} />);
    expect(screen.getByRole('status')).toHaveTextContent('Mendengarkan');
  });
});

describe('the 2D presence', () => {
  const reasons: AvatarFallbackReason[] = [
    'no-asset',
    'no-webgl',
    'reduced-motion',
    'small-screen',
    'load-failed',
  ];

  it('carries the same state the scene would, and says why it is here', () => {
    for (const reason of reasons) {
      const { unmount } = render(
        <TaniaFallback command={{ state: 'SPEAKING' }} reason={reason} />,
      );

      expect(screen.getByRole('status'), reason).toHaveTextContent('Menjawab');
      // A reason a user can act on beats a blank panel.
      expect(screen.getByText(FALLBACK_REASON_TEXT[reason]), reason).toBeInTheDocument();
      unmount();
    }
  });

  it('shows what is being said when there is something to show', () => {
    render(
      <TaniaFallback
        command={{ state: 'SPEAKING', speech: { text: 'Kinerja produk X stabil.' } }}
        reason="no-asset"
      />,
    );

    expect(screen.getByText('Kinerja produk X stabil.')).toBeInTheDocument();
  });

  it('names the missing asset as the reason, not the browser', () => {
    render(<TaniaFallback command={{ state: 'IDLE' }} reason="no-asset" />);

    expect(screen.getByText(/Aset avatar 3D belum dikonfigurasi/)).toBeInTheDocument();
  });

  it('announces that it is loading rather than showing a blank box', () => {
    render(<TaniaLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Memuat avatar TANIA');
  });
});
