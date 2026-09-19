import { describe, expect, it } from 'vitest';
import type { VisemeTimeline } from '@tania/types';
import { AVATAR_STATES, STATE_EXPRESSION, STATE_GESTURE, parseAvatarCommand } from '@tania/types';
import { VisemeController, MOUTH_REST, VISEME_SHAPES } from '@/lib/avatar/viseme-controller';
import { planUtterance, planWord, wordVisemes } from '@/lib/avatar/viseme';
import {
  BLINK_SECONDS,
  BLINK_MIN_SECONDS,
  ExpressionController,
} from '@/lib/avatar/expression-controller';
import { GestureController } from '@/lib/avatar/gesture-controller';
import { IdleMotion } from '@/lib/avatar/idle-motion';

/** A clock the test moves by hand, so timing is asserted not awaited. */
function clock(start = 0) {
  let value = start;
  return {
    now: () => value,
    advance(ms: number) {
      value += ms;
    },
  };
}

describe('viseme timing from text', () => {
  it('walks a word through the shapes its letters make', () => {
    expect(wordVisemes('halo')).toEqual(['E', 'A', 'L', 'O']);
    expect(wordVisemes('mama')).toEqual(['MBP', 'A', 'MBP', 'A']);
  });

  it('collapses a cluster a mouth cannot visibly hit', () => {
    // Three positions in 60 ms reads as jitter, not as speech.
    expect(wordVisemes('ssst')).toEqual(['SS', 'E']);
  });

  it('gives vowels more time than consonants', () => {
    const frames = planWord('mata', 0, 400);
    const consonant = frames.find((frame) => frame.viseme === 'MBP');
    const vowel = frames.find((frame) => frame.viseme === 'A');

    expect(vowel).toBeDefined();
    expect(consonant).toBeDefined();
    const vowelSpan = (vowel as { startMs: number; endMs: number });
    const consonantSpan = (consonant as { startMs: number; endMs: number });

    expect(vowelSpan.endMs - vowelSpan.startMs).toBeGreaterThan(
      consonantSpan.endMs - consonantSpan.startMs,
    );
  });

  it('lays a whole utterance out in order without gaps', () => {
    const timeline = planUtterance('Kinerja produk stabil', 1200);

    expect(timeline.source).toBe('estimated');
    expect(timeline.frames.length).toBeGreaterThan(6);

    for (let index = 1; index < timeline.frames.length; index += 1) {
      const previous = timeline.frames[index - 1] as { endMs: number };
      const current = timeline.frames[index] as { startMs: number };
      expect(current.startMs).toBeCloseTo(previous.endMs, 5);
    }
  });

  it('handles an empty utterance without producing frames', () => {
    expect(planUtterance('   ').frames).toEqual([]);
  });

  it('has a mouth shape for every viseme the planner can produce', () => {
    // A planned viseme with no shape renders nothing, and a mouth that stops
    // moving mid-word is hard to trace back to a missing table entry.
    const produced = new Set(
      planUtterance('halo mama fajar sisi nganga tutup lelah').frames.map((frame) => frame.viseme),
    );

    for (const viseme of produced) {
      expect(VISEME_SHAPES[viseme], viseme).toBeDefined();
    }
    expect(produced.size).toBeGreaterThan(5);
  });
});

describe('VisemeController prefers real timing', () => {
  const timeline: VisemeTimeline = {
    frames: [
      { viseme: 'A', startMs: 0, endMs: 100 },
      { viseme: 'O', startMs: 100, endMs: 200 },
    ],
    durationMs: 200,
    source: 'engine',
  };

  it('uses an engine timeline when it is given one', () => {
    const time = clock();
    const controller = new VisemeController({ now: time.now });

    controller.start({ timeline });
    expect(controller.source).toBe('engine');

    time.advance(50);
    const mouth = controller.sample();
    expect(mouth.jawOpen).toBeGreaterThan(0);
  });

  it('derives a timeline from text when no engine timing exists', () => {
    const controller = new VisemeController({ now: clock().now });
    controller.start({ text: 'halo TANIA' });

    expect(controller.source).toBe('estimated');
  });

  it('re-anchors to a measured word so the mouth does not drift', () => {
    const time = clock(1000);
    const controller = new VisemeController({ now: time.now });

    controller.start({ text: 'satu dua tiga empat lima' });
    time.advance(5000);

    // Long into the utterance, the engine reports a word at 400 ms. Without
    // re-anchoring the mouth would be seconds ahead of the audio.
    controller.word('dua', 400);
    expect(controller.source).toBe('boundary');

    // The mouth is at the very start of that word, so it opens from rest.
    expect(controller.sample().jawOpen).toBe(0);

    time.advance(80);
    const mouth = controller.sample();
    expect(Object.values(mouth).some((value) => value > 0)).toBe(true);
  });

  it('falls back to amplitude only when there is no timing at all', () => {
    const controller = new VisemeController({ now: clock().now });

    controller.start();
    controller.setAmplitude(0.8);

    expect(controller.source).toBe('amplitude');
    const mouth = controller.sample();
    // Jaw only: guessing a mouth shape from loudness would be inventing one.
    expect(mouth.jawOpen).toBeGreaterThan(0);
    expect(mouth.mouthPucker).toBe(0);
  });

  it('closes the mouth when speech ends', () => {
    const controller = new VisemeController({ now: clock().now });

    controller.start({ timeline });
    controller.stop();

    expect(controller.source).toBe('idle');
    expect(controller.sample()).toEqual(MOUTH_REST);
  });

  it('blends between adjacent shapes rather than cutting', () => {
    const time = clock();
    const controller = new VisemeController({ now: time.now });
    controller.start({ timeline });

    time.advance(95);
    const nearEnd = controller.sample();

    // Already leaning into the O that follows: co-articulation is most of what
    // separates speech from a flapping jaw.
    expect(nearEnd.mouthFunnel).toBeGreaterThan(0);
  });

  it('never opens the mouth past its range', () => {
    const time = clock();
    const controller = new VisemeController({ now: time.now });
    controller.start({ timeline });

    for (let ms = 0; ms < 200; ms += 5) {
      time.advance(5);
      for (const value of Object.values(controller.sample())) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the avatar is never frozen', () => {
  it('blinks on its own', () => {
    const controller = new ExpressionController({ random: () => 0 });
    let blinked = false;

    // An unblinking face is the clearest signal a character has crashed.
    for (let frame = 0; frame < 60 * (BLINK_MIN_SECONDS + 1); frame += 1) {
      const weights = controller.update(1 / 60);
      if ((weights.eyeBlinkLeft ?? 0) > 0.5) blinked = true;
    }

    expect(blinked).toBe(true);
  });

  it('closes both eyes together and opens them again', () => {
    const controller = new ExpressionController({ random: () => 0 });
    controller.blink();

    const seen: number[] = [];
    for (let frame = 0; frame < Math.ceil(BLINK_SECONDS * 60) + 2; frame += 1) {
      const weights = controller.update(1 / 60);
      expect(weights.eyeBlinkLeft).toBe(weights.eyeBlinkRight);
      seen.push(weights.eyeBlinkLeft ?? 0);
    }

    expect(Math.max(...seen)).toBeGreaterThan(0.5);
    expect(seen[seen.length - 1]).toBe(0);
  });

  it('keeps the face drifting even when nothing changes', () => {
    const controller = new ExpressionController({ random: () => 0.5 });
    controller.setState('IDLE');

    const samples: number[] = [];
    for (let frame = 0; frame < 240; frame += 1) {
      samples.push(controller.update(1 / 60).browInnerUp ?? 0);
    }

    // Still is fine; identical for four seconds is not.
    expect(new Set(samples.map((value) => value.toFixed(4))).size).toBeGreaterThan(20);
  });

  it('breathes, and breathes faster while speaking', () => {
    const idleMotion = new IdleMotion({ random: () => 0.5 });
    const speakingMotion = new IdleMotion({ random: () => 0.5 });

    let idlePeak = 0;
    let idleCrossings = 0;
    let speakingCrossings = 0;
    let previousIdle = 0;
    let previousSpeaking = 0;

    for (let frame = 0; frame < 60 * 10; frame += 1) {
      const idle = idleMotion.update(1 / 60, 'IDLE').breath;
      const speaking = speakingMotion.update(1 / 60, 'SPEAKING').breath;

      idlePeak = Math.max(idlePeak, Math.abs(idle));
      if (previousIdle <= 0 && idle > 0) idleCrossings += 1;
      if (previousSpeaking <= 0 && speaking > 0) speakingCrossings += 1;
      previousIdle = idle;
      previousSpeaking = speaking;
    }

    expect(idlePeak).toBeGreaterThan(0);
    // People breathe faster when they talk, and it is felt without being seen.
    expect(speakingCrossings).toBeGreaterThan(idleCrossings);
  });

  it('sways the head without settling into a visible loop', () => {
    const motion = new IdleMotion({ random: () => 0.5 });
    const first: number[] = [];
    const later: number[] = [];

    for (let frame = 0; frame < 300; frame += 1) first.push(motion.update(1 / 60, 'IDLE').sway.yaw);
    for (let frame = 0; frame < 300; frame += 1) later.push(motion.update(1 / 60, 'IDLE').sway.yaw);

    expect(first).not.toEqual(later);
  });
});

describe('gesture transitions', () => {
  it('uses the gesture a state implies', () => {
    const time = clock();
    const controller = new GestureController({ now: time.now, minIntervalMs: 0 });

    expect(controller.select('SPEAKING')).toBe('explain');
    expect(controller.select('SUCCESS')).toBe('thumbs-up');
  });

  it('stays still while listening', () => {
    const controller = new GestureController({ now: clock().now, minIntervalMs: 0 });

    // An avatar that keeps gesturing while a person speaks reads as impatient.
    expect(controller.select('LISTENING')).toBeUndefined();
    expect(controller.select('IDLE')).toBeUndefined();
  });

  it('does not restart the gesture it is already playing', () => {
    const time = clock();
    const controller = new GestureController({ now: time.now, minIntervalMs: 0 });

    expect(controller.select('SPEAKING')).toBe('explain');
    expect(controller.select('SPEAKING')).toBeUndefined();
  });

  it('refuses to change gesture too quickly', () => {
    const time = clock();
    const controller = new GestureController({ now: time.now, minIntervalMs: 900 });

    expect(controller.select('SPEAKING')).toBe('explain');

    time.advance(200);
    // A streamed answer arriving in chunks must not make the avatar twitch.
    expect(controller.select('SUCCESS')).toBeUndefined();

    time.advance(900);
    expect(controller.select('SUCCESS')).toBe('thumbs-up');
  });

  it('plans a one-shot gesture to hand back to idle', () => {
    const controller = new GestureController({ now: clock().now });
    const plan = controller.plan('wave', ['Wave', 'Idle']);

    expect(plan.clip).toBe('Wave');
    expect(plan.loop).toBe(false);
    expect(plan.returnsToIdle).toBe(true);
  });

  it('plays nothing when the rig lacks the clip', () => {
    const controller = new GestureController({ now: clock().now });

    // A wave when a point was asked for is worse than standing still.
    expect(controller.plan('point', ['wave', 'idle']).clip).toBeUndefined();
  });
});

describe('avatar state transitions', () => {
  it('gives every state a face, and the right body', () => {
    const controller = new ExpressionController({ random: () => 0.5 });
    const gestures = new GestureController({ minIntervalMs: 0, now: clock().now });

    for (const state of AVATAR_STATES) {
      controller.setState(state);
      expect(controller.expression, state).toBe(STATE_EXPRESSION[state]);

      gestures.reset();
      expect(gestures.select(state), state).toBe(STATE_GESTURE[state]);
    }
  });

  it('lets a command override the face its state implies', () => {
    const controller = new ExpressionController({ random: () => 0.5 });

    controller.setState('SPEAKING', 'cheerful');
    expect(controller.expression).toBe('cheerful');
  });

  it('accepts the documented command, lowercase and all', () => {
    expect(
      parseAvatarCommand({
        state: 'speaking',
        emotion: 'confident',
        gesture: 'explain',
        gaze: 'dashboard',
      }),
    ).toEqual({
      state: 'SPEAKING',
      emotion: 'confident',
      gesture: 'explain',
      gaze: 'dashboard',
    });
  });

  it('drops a field it does not recognise rather than passing it on', () => {
    expect(parseAvatarCommand({ state: 'speaking', emotion: 'smug' })).toEqual({
      state: 'SPEAKING',
    });
    expect(parseAvatarCommand({ state: 'dancing' })).toBeUndefined();
    expect(parseAvatarCommand(null)).toBeUndefined();
  });
});
