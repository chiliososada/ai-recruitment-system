import { createHash } from 'node:crypto';
import { AppError } from '../../errors.js';
import type { EmbeddingProvider } from './types.js';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length >= 2);
}

/**
 * Deterministic hashed bag-of-words embedding. Tokens are hashed into the vector so that
 * documents sharing terms get higher cosine similarity — good enough for reproducible
 * vector recall in tests/local, with no external API. L2-normalized.
 */
export function hashedEmbedding(text: string, dim: number): number[] {
  const vec = new Array<number>(dim).fill(0);
  for (const token of tokenize(text)) {
    const h = createHash('sha1').update(token).digest();
    const idx = h.readUInt32BE(0) % dim;
    const sign = (h[4]! & 1) === 1 ? 1 : -1;
    vec[idx]! += sign;
    const idx2 = h.readUInt32BE(8) % dim;
    vec[idx2]! += sign * 0.5;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly providerName = 'mock';
  readonly model = 'mock-embedding-384';
  constructor(readonly dimensions = 384) {}
  async embed(text: string): Promise<number[]> {
    return hashedEmbedding(text, this.dimensions);
  }
}

/** OpenAI embeddings (prod). Requests `dimensions` so output fits the vector(384) column. */
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly providerName = 'openai';
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ input: text, model: this.model, dimensions: this.dimensions }),
    });
    if (!res.ok) throw new AppError('UPSTREAM_AI_ERROR', `OpenAI embeddings error: ${res.status}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    const embedding = json.data[0]?.embedding;
    if (!embedding) throw new AppError('UPSTREAM_AI_ERROR', 'OpenAI embeddings: empty response');
    return embedding;
  }
}
