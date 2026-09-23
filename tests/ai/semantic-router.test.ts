/**
 * TASK-015 (DEC-021): приёмочные тесты для electron/ai/semantic-router.ts.
 *
 * Контракт P1-2: фиксируем ТЕКУЧЕЕ поведение. embed из ./embed замокан
 * детерминированными векторами (сеть/Ollama запрещены). Состояние модуля
 * (initialized/centroids) сбрасывается через vi.resetModules + re-import.
 *
 * Модель мока (3D, ортогональные центроиды): якорные фразы weather → [1,0,0],
 * всё остальное → [0,1,0]; запросный вектор задаётся маркером в тексте:
 *   'Q:weather' → [1,0,0] (cos=1 к weather), 'Q:neg' → [-1,0,0] (cos<0),
 *   'Q:t60' → [3,0,4] (cos=0.6 ровно к weather, 0 к остальным),
 *   'Q:t59' → [0.59,0,0.8074] (cos≈0.59 < 0.6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const embedMock = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('../../electron/ai/embed', () => ({ embed: embedMock.fn }));

const WEATHER_PHRASES = [
  'какая погода сегодня', 'будет ли дождь завтра', 'температура на улице',
  'weather forecast', 'сколько градусов',
];

function vecFor(text: string): Float32Array {
  if (text === 'Q:weather') return new Float32Array([1, 0, 0]);
  if (text === 'Q:neg') return new Float32Array([-1, 0, 0]);
  if (text === 'Q:t60') return new Float32Array([3, 0, 4]);
  if (text === 'Q:t59') return new Float32Array([0.59, 0, 0.8074]);
  if (WEATHER_PHRASES.includes(text)) return new Float32Array([1, 0, 0]);
  return new Float32Array([0, 1, 0]);
}

type SR = typeof import('../../electron/ai/semantic-router');
let sr: SR;

beforeEach(async () => {
  vi.resetModules();
  embedMock.fn.mockReset();
  embedMock.fn.mockImplementation(async (text: string) => vecFor(text));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  sr = await import('../../electron/ai/semantic-router');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('без init', () => {
  it('detectSemanticIntent → { unknown, 0, [] }, embed не вызывается', async () => {
    expect(await sr.detectSemanticIntent('привет')).toEqual({ intent: 'unknown', confidence: 0, scores: [] });
    expect(embedMock.fn).not.toHaveBeenCalled();
  });
});

describe('initSemanticRouter', () => {
  it('embed вызван для всех 61 якорной фразы; лог про 12 intent', async () => {
    await sr.initSemanticRouter();
    expect(embedMock.fn).toHaveBeenCalledTimes(61);
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).toContain('12 intents');
  });

  it('повторный init — no-op (embed не вызывается снова)', async () => {
    await sr.initSemanticRouter();
    const n = embedMock.fn.mock.calls.length;
    await sr.initSemanticRouter();
    expect(embedMock.fn).toHaveBeenCalledTimes(n);
  });

  it('embed бросает при init → warn, роутер остаётся неинициализированным', async () => {
    embedMock.fn.mockRejectedValue(new Error('ollama down'));
    await sr.initSemanticRouter();
    expect(vi.mocked(console.warn)).toHaveBeenCalled();
    expect(await sr.detectSemanticIntent('Q:weather'))
      .toEqual({ intent: 'unknown', confidence: 0, scores: [] });
  });
});

describe('detectSemanticIntent после init', () => {
  beforeEach(async () => {
    await sr.initSemanticRouter();
    embedMock.fn.mockClear();
  });

  it('вектор у якоря weather → intent weather, confidence 1.0, топ-3 scores отсортированы', async () => {
    const r = await sr.detectSemanticIntent('Q:weather');
    expect(r.intent).toBe('weather');
    expect(r.confidence).toBeCloseTo(1.0, 5);
    expect(r.scores).toHaveLength(3);
    expect(r.scores[0].intent).toBe('weather');
    expect(r.scores[0].score).toBeGreaterThanOrEqual(r.scores[1].score);
    expect(r.scores[1].score).toBeGreaterThanOrEqual(r.scores[2].score);
  });

  it('противоположный вектор → unknown, confidence < 0.6, scores всё равно заполнены', async () => {
    const r = await sr.detectSemanticIntent('Q:neg');
    expect(r.intent).toBe('unknown');
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.scores).toHaveLength(3); // scores считаются и при unknown
  });

  it('ЭДЖ-порог: cos ровно 0.6 → intent принимается (>=)', async () => {
    const r = await sr.detectSemanticIntent('Q:t60');
    expect(r.confidence).toBeCloseTo(0.6, 2);
    expect(r.intent).toBe('weather');
  });

  it('ЭДЖ-порог: cos чуть ниже 0.6 → unknown', async () => {
    const r = await sr.detectSemanticIntent('Q:t59');
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.intent).toBe('unknown');
  });

  it('одинаковые центроиды (все не-weather): побеждает первый по порядку ANCHORS (news)', async () => {
    const r = await sr.detectSemanticIntent('любой текст'); // вектор [0,1] — к 11 центроидам cos=1
    expect(r.confidence).toBeCloseTo(1.0, 5);
    expect(r.intent).toBe('news'); // stable sort: первый из равных
  });

  it('embed бросает при detect → { unknown, 0, [] } + warn', async () => {
    embedMock.fn.mockRejectedValue(new Error('boom'));
    expect(await sr.detectSemanticIntent('что угодно'))
      .toEqual({ intent: 'unknown', confidence: 0, scores: [] });
    expect(vi.mocked(console.warn)).toHaveBeenCalled();
  });
});

describe('константа', () => {
  it('SEMANTIC_CONFIDENCE_THRESHOLD === 0.6', () => {
    expect(sr.SEMANTIC_CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});

