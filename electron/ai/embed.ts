import { getLLMConfig } from './config';

const EMBED_DIM = 256;

/**
 * Generate embedding using Ollama /api/embed.
 * Falls back to hashing trick if Ollama is unavailable.
 */
export async function embed(text: string): Promise<Float32Array> {
  try {
    const cfg = getLLMConfig();
    const resp = await fetch(`${cfg.localUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.localModel, input: text }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) throw new Error(`Ollama embed ${resp.status}`);

    const data = (await resp.json()) as { embeddings?: number[][] };
    if (data.embeddings?.[0]) {
      return new Float32Array(data.embeddings[0]);
    }
    throw new Error('Empty embedding response');
  } catch (e) {
    console.warn('[Embed] Ollama failed, using hashing fallback:', (e as Error).message);
    return embedHash(text);
  }
}

/**
 * Hashing-trick embedding (zero-dependency fallback).
 * 256-dimensional vector from character n-grams + word hashing.
 */
function embedHash(text: string): Float32Array {
  // Guard: пустая строка → единичный вектор вместо NaN
  if (!text || text.trim().length === 0) {
    const vec = new Float32Array(EMBED_DIM);
    vec[0] = 1;
    return vec;
  }

  const vec = new Float32Array(EMBED_DIM);
  const lower = text.toLowerCase();
  const words = lower.match(/\w+/g) ?? [];

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    vec[Math.abs(hash) % EMBED_DIM] += 1;

    if (word.length >= 3) {
      for (let i = 0; i <= word.length - 3; i++) {
        const trigram = word.slice(i, i + 3);
        let tgHash = 0;
        for (let j = 0; j < trigram.length; j++) {
          tgHash = ((tgHash << 5) - tgHash + trigram.charCodeAt(j)) | 0;
        }
        vec[Math.abs(tgHash) % EMBED_DIM] += 0.5;
      }
    }
  }

  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;
  }

  return vec;
}
