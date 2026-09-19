import type { EmbeddingProvider } from '@tania/core/knowledge';

const DIMENSIONS = 128;

/**
 * Deterministic local embeddings.
 *
 * Honest about what it is: a hashed bag-of-words projection, so cosine
 * similarity here approximates *lexical* overlap, not meaning. It makes the
 * pipeline runnable and testable without a model credential; swap in a real
 * provider and the same retrieval code becomes semantic.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'mock';
  readonly model = 'tania-hash-embed-v1';
  readonly dimensions = DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => embedText(text, this.dimensions));
  }
}

export function embedText(text: string, dimensions = DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);

  for (const token of tokenize(text)) {
    // Two hashes per token reduce collisions without needing a vocabulary.
    vector[hash(token, 1) % dimensions] += 1;
    vector[hash(token, 7) % dimensions] += 0.5;
  }

  return normalize(vector);
}

/**
 * Function words carry no topical signal but appear in nearly every passage,
 * so leaving them in makes an unrelated question look like a partial match.
 */
const STOP_WORDS = new Set([
  'yang', 'dan', 'atau', 'untuk', 'dari', 'pada', 'dengan', 'ini', 'itu', 'ada',
  'adalah', 'akan', 'oleh', 'ke', 'di', 'dalam', 'saat', 'bila', 'agar', 'juga',
  'apa', 'apakah', 'bagaimana', 'siapa', 'kapan', 'mengapa', 'berapa', 'mana',
  'tidak', 'bukan', 'sudah', 'belum', 'lebih', 'dapat', 'harus', 'boleh',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'were',
  'what', 'who', 'how', 'when', 'why', 'which', 'does', 'can', 'should',
]);

/**
 * Bilingual gloss.
 *
 * DPS writes its documents in Indonesian and asks questions in a mix of
 * Indonesian and English. Without this, "performance" never reaches a passage
 * that says "kinerja" — a miss that looks like a retrieval bug but is really a
 * vocabulary gap. Applied to documents and queries alike, so both sides
 * normalise to the same token.
 */
const GLOSS: Record<string, string> = {
  performance: 'kinerja',
  performa: 'kinerja',
  product: 'produk',
  products: 'produk',
  market: 'pasar',
  competitor: 'kompetitor',
  competitors: 'kompetitor',
  revenue: 'pendapatan',
  cost: 'biaya',
  risk: 'risiko',
  risks: 'risiko',
  policy: 'kebijakan',
  document: 'dokumen',
  documents: 'dokumen',
  report: 'laporan',
  quarter: 'kuartal',
  approval: 'persetujuan',
  analysis: 'analisis',
  analisa: 'analisis',
  customer: 'pelanggan',
  proposal: 'proposal',
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .map((token) => GLOSS[token] ?? token)
    .map(stem);
}

/**
 * Strips the Indonesian suffixes that make the same word look like two.
 *
 * Without it "tenggatnya" never matches "tenggat", and a question phrased
 * naturally misses the passage that answers it. Deliberately shallow: a real
 * stemmer belongs with a real embedding model, and over-stemming would merge
 * words that mean different things.
 */
const SUFFIXES = ['nya', 'kan', 'an', 'i'];

export function stem(token: string): string {
  if (token.length < 6) return token;

  for (const suffix of SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

function hash(token: string, seed: number): number {
  let value = seed * 2_166_136_261;
  for (let index = 0; index < token.length; index += 1) {
    value ^= token.charCodeAt(index);
    value = Math.imul(value, 16_777_619);
  }
  return Math.abs(value);
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += (a[index] ?? 0) * (b[index] ?? 0);
  }
  return dot;
}
