import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical-json.js';

describe('canonicalJson', () => {
  it('is stable regardless of key order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('normalizes nested structures and dates', () => {
    const date = new Date('2026-09-18T10:00:00.000Z');
    expect(canonicalJson({ z: [{ y: 1, x: 2 }], d: date })).toBe(
      '{"d":"2026-09-18T10:00:00.000Z","z":[{"x":2,"y":1}]}',
    );
  });

  it('drops undefined values and stringifies bigint', () => {
    expect(canonicalJson({ a: undefined, b: 10n })).toBe('{"b":"10"}');
  });
});
