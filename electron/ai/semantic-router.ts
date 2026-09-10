/**
 * Semantic Router (L1) — определение интента через embeddings вместо regex.
 *
 * При инициализации предвычисляет усреднённый embedding для набора якорных фраз
 * каждого intent. При запросе считает embedding пользовательского текста и выбирает
 * intent с максимальным cosine similarity.
 *
 * Fallback: если confidence < threshold или Ollama недоступна — отдаёт 'unknown',
 * и вызывающий код использует regex-роутер (intent.ts).
 */

import { embed } from './embed';
import type { Intent } from './intent';

interface IntentAnchor {
  intent: Intent;
  phrases: string[];
  centroid?: Float32Array;
}

// Якорные фразы — примеры реальных запросов для каждого intent.
// Чем разнообразнее — тем точнее роутер.
const ANCHORS: IntentAnchor[] = [
  {
    intent: 'weather',
    phrases: [
      'какая погода сегодня',
      'будет ли дождь завтра',
      'температура на улице',
      'weather forecast',
      'сколько градусов',
    ],
  },
  {
    intent: 'news',
    phrases: [
      'последние новости',
      'что нового в мире',
      'новости технологий',
      'курс доллара сегодня',
      'latest news today',
    ],
  },
  {
    intent: 'web_search',
    phrases: [
      'найди информацию о',
      'пощи в интернете',
      'что такое',
      'как работает',
      'who is',
      'search for',
    ],
  },
  {
    intent: 'file_read',
    phrases: [
      'прочитай файл',
      'открой файл',
      'покажи содержимое',
      'read file',
      'show me the file',
    ],
  },
  {
    intent: 'file_write',
    phrases: [
      'запиши в файл',
      'сохрани как',
      'создай файл',
      'write to file',
      'save this as',
    ],
  },
  {
    intent: 'file_find',
    phrases: [
      'найди файл',
      'где находится файл',
      'пощи файл',
      'find file',
      'locate file',
    ],
  },
  {
    intent: 'code',
    phrases: [
      'напиши код',
      'напиши скрипт',
      'создай функцию',
      'write code',
      'code example',
    ],
  },
  {
    intent: 'system',
    phrases: [
      'сколько памяти',
      'загрузка процессора',
      'системная информация',
      'memory usage',
      'cpu load',
    ],
  },
  {
    intent: 'screen',
    phrases: [
      'сделай скриншот',
      'что на экране',
      'снимок экрана',
      'screenshot',
      'screen capture',
    ],
  },
  {
    intent: 'gui',
    phrases: [
      'открой приложение',
      'запусти браузер',
      'открой дискорд',
      'open app',
      'launch program',
    ],
  },
  {
    intent: 'memory',
    phrases: [
      'запомни что',
      'сохрани в память',
      'что ты знаешь обо мне',
      'remember this',
      'recall facts',
    ],
  },
  {
    intent: 'greeting',
    phrases: [
      'привет',
      'здравствуй',
      'добрый день',
      'hello',
      'hi there',
    ],
  },
];

export interface SemanticResult {
  intent: Intent;
  confidence: number;
  scores: Array<{ intent: Intent; score: number }>;
}

let initialized = false;
let centroids: Array<{ intent: Intent; centroid: Float32Array }> = [];

function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Предвычислить центроиды для всех intent.
 * Вызывать при старте приложения (неблокирующе, с логом).
 */
export async function initSemanticRouter(): Promise<void> {
  if (initialized) return;
  try {
    const result: Array<{ intent: Intent; centroid: Float32Array }> = [];
    for (const anchor of ANCHORS) {
      // Усреднённый embedding всех якорных фраз
      const vecs = await Promise.all(anchor.phrases.map(embed));
      const dim = vecs[0]?.length ?? 256;
      const centroid = new Float32Array(dim);
      for (const v of vecs) {
        for (let i = 0; i < dim; i++) centroid[i] += v[i];
      }
      for (let i = 0; i < dim; i++) centroid[i] /= vecs.length;
      // Нормализуем
      let norm = 0;
      for (let i = 0; i < dim; i++) norm += centroid[i] * centroid[i];
      norm = Math.sqrt(norm);
      if (norm > 0) for (let i = 0; i < dim; i++) centroid[i] /= norm;
      result.push({ intent: anchor.intent, centroid });
    }
    centroids = result;
    initialized = true;
    console.log(`[SemanticRouter] initialized with ${centroids.length} intents`);
  } catch (e) {
    console.warn('[SemanticRouter] init failed, will use regex fallback:', (e as Error).message);
  }
}

/**
 * Определить intent семантически.
 * Возвращает confidence 0..1. При неинициализированном роутере — unknown с 0.
 */
export async function detectSemanticIntent(text: string): Promise<SemanticResult> {
  if (!initialized || centroids.length === 0) {
    return { intent: 'unknown', confidence: 0, scores: [] };
  }
  try {
    const vec = await embed(text);
    // Нормализуем
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;

    const scores = centroids.map((c) => ({
      intent: c.intent,
      score: cosine(vec, c.centroid),
    }));
    scores.sort((a, b) => b.score - a.score);

    const top = scores[0];
    return {
      intent: top.score > 0.5 ? top.intent : 'unknown',
      confidence: top.score,
      scores: scores.slice(0, 3),
    };
  } catch (e) {
    console.warn('[SemanticRouter] detect failed:', (e as Error).message);
    return { intent: 'unknown', confidence: 0, scores: [] };
  }
}

/** Порог, ниже которого считаем что intent не определён. */
export const SEMANTIC_CONFIDENCE_THRESHOLD = 0.6;
