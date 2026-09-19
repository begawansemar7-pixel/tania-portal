// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/sidebar';

/**
 * The mobile drawer declares `aria-modal="true"`. These tests hold it to that
 * claim: a dialog that does not trap focus or close on Escape strands anyone
 * navigating by keyboard, and the attribute alone makes the problem worse by
 * telling a screen reader the rest of the page is inert when it is not.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

function renderDrawer(open: boolean) {
  const onClose = vi.fn();
  const result = render(<Sidebar open={open} onClose={onClose} />);
  return { onClose, ...result };
}

function drawer(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Navigasi' });
}

describe('sidebar drawer', () => {
  it('is absent until opened', () => {
    renderDrawer(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves focus into the dialog when it opens', () => {
    renderDrawer(true);
    // The dialog itself, so its accessible name is announced before contents.
    expect(drawer()).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer(true);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    renderDrawer(true);

    const focusable = [
      ...drawer().querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    ];
    expect(focusable.length).toBeGreaterThan(1);

    // Walk past the last control; focus must wrap to the first, not escape.
    for (let step = 0; step <= focusable.length; step += 1) {
      await user.tab();
    }

    expect(drawer().contains(document.activeElement)).toBe(true);
  });

  it('wraps backwards from the first control to the last', async () => {
    const user = userEvent.setup();
    renderDrawer(true);

    await user.tab({ shift: true });

    expect(drawer().contains(document.activeElement)).toBe(true);
  });

  it('hides the click-catching backdrop from assistive technology', () => {
    renderDrawer(true);

    // Exactly one accessible "close" control, not two: the backdrop is a mouse
    // affordance only, so it must not be announced or reachable by Tab.
    expect(screen.getAllByRole('button', { name: 'Tutup navigasi' })).toHaveLength(1);
  });

  it('restores focus to the opener when it closes', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const { rerender, onClose } = renderDrawer(true);
    expect(drawer()).toHaveFocus();

    rerender(<Sidebar open={false} onClose={onClose} />);

    expect(opener).toHaveFocus();
    opener.remove();
  });
});
