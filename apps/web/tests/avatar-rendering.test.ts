import { describe, expect, it } from 'vitest';
import { AVATAR_EXPRESSIONS, AVATAR_GESTURES, resolveCommand } from '@tania/types';
import { EXPRESSION_WEIGHTS, damp } from '@/lib/avatar/expression-controller';
import { GESTURE_CLIPS, IDLE_CLIPS, isOneShot, resolveClip } from '@/lib/avatar/gesture-controller';
import { GazeRegistry, MAX_PITCH, MAX_YAW, anglesForRegion } from '@/lib/avatar/idle-motion';
import { NullRig, normalise } from '@/components/tania/rig';
import { framing } from '@/components/tania/framing';
import { Box3, Vector3 } from 'three';

describe('expressions', () => {
  it('defines weights for all seven', () => {
    for (const expression of AVATAR_EXPRESSIONS) {
      const weights = EXPRESSION_WEIGHTS[expression];
      expect(weights, expression).toBeDefined();
      expect(Object.keys(weights).length, expression).toBeGreaterThan(0);
    }
  });

  it('keeps every weight within range and restrained', () => {
    for (const [expression, weights] of Object.entries(EXPRESSION_WEIGHTS)) {
      for (const [shape, value] of Object.entries(weights)) {
        expect(value, `${expression}.${shape}`).toBeGreaterThan(0);
        // A face pinned at full strength reads as a mascot, not a colleague.
        expect(value, `${expression}.${shape}`).toBeLessThanOrEqual(0.7);
      }
    }
  });

  it('blends toward the target rather than snapping to it', () => {
    const step = damp({}, { mouthSmile: 1 }, 1 / 60, 0.45);

    expect(step.mouthSmile).toBeGreaterThan(0);
    expect(step.mouthSmile).toBeLessThan(1);
  });

  it('takes the same wall-clock time whatever the framerate', () => {
    const seconds = 0.45;

    let slow: Record<string, number> = {};
    for (let frame = 0; frame < 30; frame += 1) {
      slow = damp(slow, { mouthSmile: 1 }, 1 / 30, seconds);
    }

    let fast: Record<string, number> = {};
    for (let frame = 0; frame < 120; frame += 1) {
      fast = damp(fast, { mouthSmile: 1 }, 1 / 120, seconds);
    }

    // A face that transitions twice as fast on a better machine is a bug
    // users feel without being able to name it.
    expect(Math.abs((slow.mouthSmile ?? 0) - (fast.mouthSmile ?? 0))).toBeLessThan(0.02);
  });

  it('relaxes shapes the new expression does not use', () => {
    const blended = damp({ mouthSmile: 1 }, { browInnerUp: 0.5 }, 1, 0.45);

    expect(blended.mouthSmile).toBeLessThan(0.2);
    expect(blended.browInnerUp).toBeGreaterThan(0.2);
  });

  it('writes only the shapes the rig actually has', () => {
    const rig = new NullRig();
    for (const [name, weight] of Object.entries({ mouthSmile: 0.4, cheekSquint: 0.2 })) {
      rig.setMorph(name, weight);
    }

    expect(rig.weights.get('mouthsmile')).toBe(0.4);
    expect(rig.weights.get('cheeksquint')).toBe(0.2);
  });
});

describe('gestures', () => {
  it('offers clip candidates for all six', () => {
    for (const gesture of AVATAR_GESTURES) {
      expect(GESTURE_CLIPS[gesture]?.length, gesture).toBeGreaterThan(0);
    }
  });

  it('matches a clip whatever the exporter called it', () => {
    expect(resolveClip(['Wave', 'idle'], GESTURE_CLIPS.wave)).toBe('Wave');
    expect(resolveClip(['greeting'], GESTURE_CLIPS.wave)).toBe('greeting');
    expect(resolveClip(['Armature|wave'], GESTURE_CLIPS.wave)).toBe('Armature|wave');
    expect(resolveClip(['RigTania|nod'], GESTURE_CLIPS.nod)).toBe('RigTania|nod');
  });

  it('returns nothing rather than playing the wrong clip', () => {
    // A wave when a point was asked for is worse than standing still.
    expect(resolveClip(['wave', 'idle'], GESTURE_CLIPS.point)).toBeUndefined();
  });

  it('finds an idle clip for the rest pose', () => {
    expect(resolveClip(['Idle', 'wave'], IDLE_CLIPS)).toBe('Idle');
    expect(resolveClip(['breathing'], IDLE_CLIPS)).toBe('breathing');
  });

  it('knows which gestures play once and hand back to idle', () => {
    expect(isOneShot('wave')).toBe(true);
    expect(isOneShot('nod')).toBe(true);
    expect(isOneShot('thumbs-up')).toBe(true);
    // These accompany an ongoing state, so they loop.
    expect(isOneShot('explain')).toBe(false);
    expect(isOneShot('thinking')).toBe(false);
  });
});

describe('gaze', () => {
  const registry = new GazeRegistry();

  it('follows the pointer when looking at the user', () => {
    const right = registry.resolve('user', { x: 1, y: 0 });
    const left = registry.resolve('user', { x: -1, y: 0 });

    expect(right.yaw).toBeGreaterThan(0);
    expect(left.yaw).toBeLessThan(0);
  });

  it('never turns the head further than a neck allows', () => {
    const extreme = registry.resolve('user', { x: 99, y: -99 });

    expect(Math.abs(extreme.yaw)).toBeLessThanOrEqual(MAX_YAW);
    expect(Math.abs(extreme.pitch)).toBeLessThanOrEqual(MAX_PITCH);
  });

  it('holds a fixed direction for every other target', () => {
    // Tracking the cursor while thinking looks distracted, not thoughtful.
    const a = registry.resolve('away', { x: 1, y: 1 });
    const b = registry.resolve('away', { x: -1, y: -1 });

    expect(a).toEqual(b);
    expect(a.yaw).toBeGreaterThan(0);
  });

  it('looks at a region the interface registered', () => {
    const named = new GazeRegistry();
    named.register('dashboard', { yaw: -0.3, pitch: 0.1 });

    expect(named.resolve('dashboard', { x: 0, y: 0 })).toEqual({ yaw: -0.3, pitch: 0.1 });
  });

  it('falls back to the screen for a region nobody registered', () => {
    // Snapping the head somewhere arbitrary is worse than looking ahead.
    expect(registry.resolve('nowhere', { x: 0, y: 0 })).toEqual(
      registry.resolve('screen', { x: 0, y: 0 }),
    );
  });
});

describe('rig', () => {
  it('matches blendshape names whatever the exporter used', () => {
    expect(normalise('mouth_smile')).toBe(normalise('MouthSmile'));
    expect(normalise('mouth-smile')).toBe(normalise('mouth smile'));
  });

  it('clamps weights to the range a morph target accepts', () => {
    const rig = new NullRig();
    rig.setMorph('jawOpen', 0.5);

    expect(rig.weights.get('jawopen')).toBe(0.5);
  });
});

describe('framing an asset of unknown size', () => {
  it('keeps the top of the head inside the frame', () => {
    const tall = new Box3(new Vector3(-0.3, 0, -0.3), new Vector3(0.3, 1.7, 0.3));
    const result = framing(tall, 28);

    const bandTop = result.target.y + result.framedHeight / 2;
    const bandBottom = result.target.y - result.framedHeight / 2;

    // A cropped crown is the most obvious way an avatar looks broken.
    expect(bandTop).toBeGreaterThan(1.7);
    // And it frames head and shoulders, not the whole body.
    expect(bandBottom).toBeGreaterThan(0.8);
  });

  it('pulls back further for a larger model', () => {
    const metres = framing(new Box3(new Vector3(-0.3, 0, -0.3), new Vector3(0.3, 1.7, 0.3)), 28);
    const centimetres = framing(new Box3(new Vector3(-30, 0, -30), new Vector3(30, 170, 30)), 28);

    // The same rig exported in centimetres must still be framed, not missed.
    expect(centimetres.distance).toBeGreaterThan(metres.distance * 50);
    expect(centimetres.target.y / metres.target.y).toBeCloseTo(100, 0);
  });

  it('ignores where the artist put the origin', () => {
    const feetAtOrigin = framing(new Box3(new Vector3(0, 0, 0), new Vector3(0.6, 1.7, 0.6)), 28);
    const centred = framing(new Box3(new Vector3(0, -0.85, 0), new Vector3(0.6, 0.85, 0.6)), 28);

    expect(feetAtOrigin.distance).toBeCloseTo(centred.distance, 5);
    expect(feetAtOrigin.target.y - centred.target.y).toBeCloseTo(0.85, 5);
  });

  it('widens for a model wider than it is tall', () => {
    const tall = framing(new Box3(new Vector3(-0.3, 0, 0), new Vector3(0.3, 1.7, 0)), 28, 1);
    const wide = framing(new Box3(new Vector3(-2, 0, 0), new Vector3(2, 1.7, 0)), 28, 1);

    // Cropping the sides off a wide model is worse than showing it smaller.
    expect(wide.distance).toBeGreaterThan(tall.distance);
  });

  it('never returns a degenerate distance for an empty model', () => {
    const empty = framing(new Box3(new Vector3(0, 0, 0), new Vector3(0, 0, 0)), 28);

    expect(Number.isFinite(empty.distance)).toBe(true);
    expect(empty.distance).toBeGreaterThan(0);
  });
});

describe('looking at a region on screen', () => {
  const viewport = { width: 1440, height: 900 };
  const avatar = { x: 1000, y: 240, width: 400, height: 160 };

  it('turns toward a panel on the other side of the screen', () => {
    const left = anglesForRegion(avatar, { x: 60, y: 240, width: 600, height: 500 }, viewport);
    const right = anglesForRegion(avatar, { x: 1300, y: 240, width: 120, height: 500 }, viewport);

    expect(left.yaw).toBeLessThan(0);
    expect(right.yaw).toBeGreaterThan(0);
  });

  it('tilts down for a panel below it', () => {
    const below = anglesForRegion(avatar, { x: 1000, y: 700, width: 400, height: 120 }, viewport);

    // Screen y grows downward, so a lower panel must not tilt the head up.
    expect(below.pitch).toBeGreaterThan(0);
  });

  it('barely turns for a region it is already facing', () => {
    const beside = anglesForRegion(avatar, { x: 1000, y: 410, width: 400, height: 120 }, viewport);

    expect(Math.abs(beside.yaw)).toBeLessThan(0.05);
  });

  it('never exceeds what a neck allows, however far the region is', () => {
    const far = anglesForRegion(
      avatar,
      { x: -5000, y: 9000, width: 10, height: 10 },
      viewport,
    );

    expect(Math.abs(far.yaw)).toBeLessThanOrEqual(MAX_YAW);
    expect(Math.abs(far.pitch)).toBeLessThanOrEqual(MAX_PITCH);
  });

  it('measures a registered element instead of a configured angle', () => {
    const registry = new GazeRegistry();
    registry.setAnchor(() => avatar);
    registry.setViewport(() => viewport);
    registry.registerRegion('result', () => ({ x: 60, y: 240, width: 600, height: 500 }));

    expect(registry.resolve('result', { x: 0, y: 0 }).yaw).toBeLessThan(0);
    expect(registry.names()).toContain('result');
  });

  it('falls through when a region has unmounted', () => {
    const registry = new GazeRegistry();
    registry.setAnchor(() => avatar);
    registry.setViewport(() => viewport);
    registry.register('result', { yaw: 0.2, pitch: 0 });
    registry.registerRegion('result', () => undefined);

    // A head frozen where a panel used to be is worse than a fixed direction.
    expect(registry.resolve('result', { x: 0, y: 0 })).toEqual({ yaw: 0.2, pitch: 0 });
  });

  it('ignores a region collapsed to nothing', () => {
    const registry = new GazeRegistry();
    registry.setAnchor(() => avatar);
    registry.setViewport(() => viewport);
    registry.registerRegion('result', () => ({ x: 0, y: 0, width: 0, height: 0 }));

    expect(registry.resolve('result', { x: 0, y: 0 })).toEqual(
      registry.resolve('screen', { x: 0, y: 0 }),
    );
  });

  it('needs an anchor before it can measure anything', () => {
    const registry = new GazeRegistry();
    registry.setViewport(() => viewport);
    registry.registerRegion('result', () => ({ x: 60, y: 240, width: 600, height: 500 }));

    // Without knowing where the avatar is, there is no angle to compute.
    expect(registry.resolve('result', { x: 0, y: 0 })).toEqual(
      registry.resolve('screen', { x: 0, y: 0 }),
    );
  });
});

describe('from command to head angle', () => {
  const viewport = { width: 1440, height: 900 };
  const avatar = { x: 1000, y: 240, width: 400, height: 160 };

  /** The same path the animator takes each frame. */
  function aim(command: Parameters<typeof resolveCommand>[0], registry: GazeRegistry) {
    return registry.resolve(resolveCommand(command).gaze, { x: 0, y: 0 });
  }

  function workspace(): GazeRegistry {
    const registry = new GazeRegistry();
    registry.setAnchor(() => avatar);
    registry.setViewport(() => viewport);
    // Roughly where the workspace puts them: conversation left, result under
    // the avatar, composer at the bottom of the left column.
    registry.registerRegion('conversation', () => ({ x: 60, y: 240, width: 620, height: 500 }));
    registry.registerRegion('result', () => ({ x: 1000, y: 420, width: 400, height: 320 }));
    registry.registerRegion('composer', () => ({ x: 60, y: 760, width: 620, height: 90 }));
    return registry;
  }

  it('looks at the result panel when an answer lands there', () => {
    const registry = workspace();
    const atResult = aim({ state: 'SUCCESS', gaze: 'result' }, registry);
    const atComposer = aim({ state: 'IDLE', gaze: 'composer' }, registry);

    // The composer is to the left and below; the result is straight down.
    expect(atComposer.yaw).toBeLessThan(atResult.yaw);
    expect(atResult.pitch).toBeGreaterThan(0);
  });

  it('keeps the default the state implies when a command names no region', () => {
    const registry = workspace();

    // Looking away is what makes thinking legible, and it must survive the
    // registry being present.
    expect(resolveCommand({ state: 'THINKING' }).gaze).toBe('away');
    expect(aim({ state: 'THINKING' }, registry).yaw).toBeGreaterThan(0);
  });

  it('still tracks the person when the command says so', () => {
    const registry = workspace();
    const right = registry.resolve(resolveCommand({ state: 'ERROR', gaze: 'user' }).gaze, {
      x: 1,
      y: 0,
    });

    expect(right.yaw).toBeGreaterThan(0);
  });

  it('registers exactly the regions the workspace claims', () => {
    expect(workspace().names().sort()).toEqual(['composer', 'conversation', 'result']);
  });
});
