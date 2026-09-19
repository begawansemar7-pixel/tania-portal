import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_FALLBACK_REASONS } from '@tania/types';
import { decideAvatar, MIN_SCENE_WIDTH } from '@/lib/avatar/capability';

/**
 * The avatar's structural invariants.
 *
 * `TaniaAnimator` carries a design note explaining why four systems share one
 * `useFrame` and write to disjoint parts of the rig: expression takes brows and
 * lids, lip sync takes the mouth, gaze takes head and eyes, idle motion adds
 * drift. Because each channel has exactly one writer, none can overwrite
 * another and no ordering has to be negotiated.
 *
 * That note is the only thing protecting it. Splitting the systems into
 * separate components — as a reading of the architecture brief might suggest —
 * would give each its own frame callback, make write order depend on React
 * child order, and put two writers on one blendshape the first time anyone
 * added a second expression source. The tests below make the invariant fail
 * loudly instead of drifting quietly.
 */

const SRC = resolve(__dirname, '..', 'src');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function sourceFiles(): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) found.push(full);
    }
  };

  walk(SRC);
  return found;
}

/** Calls to `useFrame(`, ignoring comment lines that merely mention it. */
function frameLoopCalls(source: string): number {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    })
    .filter((line) => /\buseFrame\s*\(/.test(line)).length;
}

describe('the render loop', () => {
  const files = sourceFiles();

  it('finds the sources it is meant to police', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('runs exactly one frame loop, in the animator', () => {
    const callers = files
      .filter((file) => frameLoopCalls(readFileSync(file, 'utf8')) > 0)
      .map((file) => relative(REPO_ROOT, file));

    expect(callers).toEqual(['apps/web/src/components/tania/TaniaAnimator.tsx']);
  });

  it('drives that loop exactly once', () => {
    // Two `useFrame` calls in one component would reintroduce the ordering
    // problem the single loop exists to avoid.
    const animator = files.find((file) => file.endsWith('TaniaAnimator.tsx'));
    expect(animator).toBeDefined();

    expect(frameLoopCalls(readFileSync(animator as string, 'utf8'))).toBe(1);
  });

  it('keeps React state out of the animation path', () => {
    // A `setState` per frame would re-render the tree at animation rate, which
    // is the cost the refs-and-useFrame design exists to avoid.
    const animator = readFileSync(
      files.find((file) => file.endsWith('TaniaAnimator.tsx')) as string,
      'utf8',
    );

    expect(animator).not.toMatch(/\buseState\s*\(/);
  });
});

describe('every fallback reason is reachable', () => {
  /**
   * `decideAvatar` is the only place that withholds the scene, and each reason
   * is a different message: a missing asset is the deployment's problem,
   * reduced motion is the user's stated preference, and no WebGL is the
   * device's limit. A reason declared in the contract that no branch can
   * produce is dead — it would sit in the type looking handled.
   *
   * `load-failed` is the exception and is asserted separately: it cannot come
   * from `decideAvatar`, because it describes an asset that failed *after* the
   * decision to try was already made.
   */
  const base = {
    assetUrl: '/avatar/tania.glb',
    hasWebgl: true,
    prefersReducedMotion: false,
    viewportWidth: MIN_SCENE_WIDTH + 100,
  };

  it('withholds the scene when there is no asset', () => {
    const { assetUrl: _omitted, ...withoutAsset } = base;
    expect(decideAvatar(withoutAsset)).toMatchObject({ mode: 'fallback', reason: 'no-asset' });
  });

  it('withholds the scene when WebGL cannot be had', () => {
    expect(decideAvatar({ ...base, hasWebgl: false })).toMatchObject({
      mode: 'fallback',
      reason: 'no-webgl',
    });
  });

  it('honours a reduced-motion preference by switching the scene off', () => {
    // Not merely slowing it: the request is about vestibular comfort, and a
    // continuously animated face is the thing being asked about.
    expect(decideAvatar({ ...base, prefersReducedMotion: true })).toMatchObject({
      mode: 'fallback',
      reason: 'reduced-motion',
    });
  });

  it('withholds the scene on a narrow viewport', () => {
    expect(decideAvatar({ ...base, viewportWidth: MIN_SCENE_WIDTH - 1 })).toMatchObject({
      mode: 'fallback',
      reason: 'small-screen',
    });
  });

  it('renders the scene when the device can carry it', () => {
    expect(decideAvatar(base)).toMatchObject({ mode: 'scene' });
  });

  it('accounts for every declared reason', () => {
    const fromDecision = new Set(
      [
        decideAvatar({ ...base, assetUrl: undefined } as never),
        decideAvatar({ ...base, hasWebgl: false }),
        decideAvatar({ ...base, prefersReducedMotion: true }),
        decideAvatar({ ...base, viewportWidth: 1 }),
      ].map((decision) => (decision as { reason?: string }).reason),
    );

    // Everything except `load-failed`, which the loader raises, not the decision.
    const unreachable = AVATAR_FALLBACK_REASONS.filter(
      (reason) => reason !== 'load-failed' && !fromDecision.has(reason),
    );

    expect(unreachable).toEqual([]);
  });
});
