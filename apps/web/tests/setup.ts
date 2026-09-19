import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Browser APIs jsdom does not implement.
 *
 * Stubbed rather than worked around in the components: an app that avoids
 * `scrollIntoView` because a test environment lacks it would be shaped by the
 * test runner, which is backwards. Each stub is a no-op with the right shape,
 * so a component calling it behaves as it would in a browser.
 */
if (typeof window !== 'undefined') {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }

  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  // jsdom exposes `crypto` but not always `randomUUID`.
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    Object.defineProperty(globalThis.crypto ?? (globalThis.crypto = {} as Crypto), 'randomUUID', {
      value: () => `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`,
      configurable: true,
    });
  }
}

/**
 * Unmounts anything a test rendered.
 *
 * Without this, a component that subscribes to the avatar bus or opens a voice
 * turn keeps running into the next test, and the failure surfaces somewhere
 * unrelated.
 */
afterEach(() => {
  cleanup();
});
