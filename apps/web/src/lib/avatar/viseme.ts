import type { VisemeFrame, VisemeSource, VisemeTimeline } from '@tania/types';

/**
 * Grapheme groups that share a mouth shape.
 *
 * Indonesian is close to phonemic, so letters map to mouth shapes far better
 * than they would in English — which is what makes text-derived visemes worth
 * doing at all here rather than falling straight back to amplitude.
 */
const GRAPHEME_VISEME: Array<[RegExp, string]> = [
  [/^(ng|ny)/, 'MBP'],
  [/^[aáà]/, 'A'],
  [/^[ií]/, 'I'],
  [/^[uú]/, 'U'],
  [/^[eé]/, 'E'],
  [/^[oó]/, 'O'],
  [/^[mbp]/, 'MBP'],
  [/^[fv]/, 'FV'],
  [/^(th|[sz])/, 'SS'],
  [/^[lnr]/, 'L'],
  [/^[dtkgcjhwy]/, 'E'],
];

/** Mouth shapes for consonants that read as closed or narrow. */
export const CLOSED_VISEMES = new Set(['MBP', 'FV', 'SS']);

/** Below this a word is not worth animating; the mouth just stays open. */
const MIN_FRAME_MS = 45;

/**
 * Splits a word into the mouth shapes it moves through.
 *
 * Consonant clusters collapse into one shape because a mouth does not visibly
 * hit three positions in 60 ms; trying to show that reads as jitter rather than
 * as speech.
 */
export function wordVisemes(word: string): string[] {
  const letters = word.toLowerCase().replace(/[^a-záéíóúàè]/g, '');
  const shapes: string[] = [];

  let index = 0;
  while (index < letters.length) {
    const rest = letters.slice(index);
    const match = GRAPHEME_VISEME.find(([pattern]) => pattern.test(rest));

    if (!match) {
      index += 1;
      continue;
    }

    const [pattern, viseme] = match;
    const consumed = rest.match(pattern)?.[0].length ?? 1;
    index += consumed;

    if (shapes[shapes.length - 1] !== viseme) shapes.push(viseme);
  }

  return shapes.length > 0 ? shapes : ['A'];
}

/**
 * Lays a word's mouth shapes across the time it is spoken.
 *
 * Vowels are given more time than consonants because they are what a viewer
 * sees: a mouth that spends equal time on every letter looks like it is
 * chewing.
 */
export function planWord(word: string, startMs: number, durationMs: number): VisemeFrame[] {
  const shapes = wordVisemes(word);
  const weights = shapes.map((viseme) => (CLOSED_VISEMES.has(viseme) ? 0.6 : 1.4));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  const frames: VisemeFrame[] = [];
  let cursor = startMs;

  shapes.forEach((viseme, index) => {
    const span = Math.max(MIN_FRAME_MS, (durationMs * (weights[index] as number)) / total);
    frames.push({ viseme, startMs: cursor, endMs: cursor + span });
    cursor += span;
  });

  return frames;
}

/** Average speaking pace, used when an engine reports no timing at all. */
export const MS_PER_CHARACTER = 62;

export function estimateDuration(text: string): number {
  return Math.max(240, text.trim().length * MS_PER_CHARACTER);
}

/**
 * Builds a timeline for a whole utterance from its text.
 *
 * The fallback when an engine reports no timing: the shapes are right and the
 * pace is plausible, but nothing is measured — which is exactly what `source`
 * records, so nobody downstream mistakes it for engine timing.
 */
export function planUtterance(
  text: string,
  durationMs = estimateDuration(text),
  source: VisemeSource = 'estimated',
): VisemeTimeline {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { frames: [], durationMs: 0, source };

  const totalLength = words.reduce((sum, word) => sum + word.length, 0);
  const frames: VisemeFrame[] = [];
  let cursor = 0;

  for (const word of words) {
    const share = (durationMs * word.length) / Math.max(1, totalLength);
    const planned = planWord(word, cursor, share);
    frames.push(...planned);

    // Advance to where the frames actually ended, not to where the share said
    // they would: `MIN_FRAME_MS` can stretch a short word past its slot, and
    // starting the next word early would overlap two mouth shapes.
    cursor = planned[planned.length - 1]?.endMs ?? cursor + share;
  }

  return { frames, durationMs: cursor, source };
}
