'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GazeRegistry, type GazeRect } from './idle-motion';

/**
 * A registry bound to the browser, shared by one screen.
 *
 * The viewport is read live rather than captured, so a resized window changes
 * where the avatar looks without anything re-registering.
 */
export function useGazeRegistry(): GazeRegistry {
  const registry = useMemo(() => new GazeRegistry(), []);

  useEffect(() => {
    registry.setViewport(() => ({ width: window.innerWidth, height: window.innerHeight }));
  }, [registry]);

  return registry;
}

/**
 * Registers an element as somewhere the avatar can look.
 *
 * Returns a ref to put on the element. The rectangle is read at the moment the
 * gaze is resolved rather than cached, because a cached rectangle goes stale
 * on every scroll, resize and panel switch — and a head aimed at where a panel
 * used to be is worse than one looking straight ahead.
 */
export function useGazeRegion(
  registry: GazeRegistry,
  name: string,
): (element: HTMLElement | null) => void {
  const element = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return registry.registerRegion(name, () => rectOf(element.current));
  }, [registry, name]);

  return useCallback((node: HTMLElement | null) => {
    element.current = node;
  }, []);
}

/** Marks where the avatar itself is, so angles are measured from its head. */
export function useGazeAnchor(registry: GazeRegistry): (element: HTMLElement | null) => void {
  const element = useRef<HTMLElement | null>(null);

  useEffect(() => {
    registry.setAnchor(() => rectOf(element.current));
  }, [registry]);

  return useCallback((node: HTMLElement | null) => {
    element.current = node;
  }, []);
}

function rectOf(element: HTMLElement | null): GazeRect | undefined {
  if (!element) return undefined;

  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
