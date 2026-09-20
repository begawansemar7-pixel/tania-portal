// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * The banner is the last thing standing between an evaluation instance and a
 * screenshot that looks like a working product.
 *
 * It renders from server config rather than a build flag, so absence of the
 * banner means identity is real. That inverse is the property worth testing:
 * it must appear whenever the demo door is open, and never otherwise.
 */

async function bannerWith(demo: boolean | undefined) {
  vi.resetModules();
  vi.doMock('@/lib/config/env', () => ({ config: { auth: { mode: 'mock', demo } } }));
  const { DemoBanner } = await import('@/components/layout/demo-banner');
  return DemoBanner;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/config/env');
});

describe('DemoBanner', () => {
  it('says authentication is off when the demo door is open', async () => {
    const DemoBanner = await bannerWith(true);

    render(<DemoBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Autentikasi dimatikan/)).toBeInTheDocument();
  });

  it('warns against entering real data', async () => {
    const DemoBanner = await bannerWith(true);

    render(<DemoBanner />);

    expect(screen.getByText(/Jangan masukkan data nyata/)).toBeInTheDocument();
  });

  it('stays out of the way of a real deployment', async () => {
    const DemoBanner = await bannerWith(false);

    const { container } = render(<DemoBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the flag is simply absent', async () => {
    // The common case in production: the variable was never set at all.
    const DemoBanner = await bannerWith(undefined);

    const { container } = render(<DemoBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
