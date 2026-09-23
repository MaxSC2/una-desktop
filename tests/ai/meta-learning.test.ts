/**
 * TASK-007 (DEC-021): приёмочные тесты для electron/ai/meta-learning.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Моки: memory/store
 * (персистентность) и self-review (getReviewSummary). Вся логика детекции
 * и подсчёта — реальная.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveFact, getFactsByCategory } from '../../electron/memory/store';
import { getReviewSummary } from '../../electron/ai/self-review';

vi.mock('../../electron/memory/store', () => ({
  saveFact: vi.fn(async () => ({})),
  listFacts: vi.fn(() => []),
  getFactsByCategory: vi.fn(() => []),
}));

vi.mock('../../electron/ai/self-review', () => ({
  getReviewSummary: vi.fn(() => ({ totalReviews: 0, averageScore: 0, topWeaknesses: [] })),
}));

const mockSaveFact = vi.mocked(saveFact);
const mockGetFacts = vi.mocked(getFactsByCategory);
const mockSummary = vi.mocked(getReviewSummary);

async function getML() {
  return await import('../../electron/ai/meta-learning');
}

beforeEach(() => {
  vi.resetModules();
  mockSaveFact.mockClear();
  mockGetFacts.mockReset().mockReturnValue([]);
  mockSummary.mockReset().mockReturnValue({ totalReviews: 0, averageScore: 0, topWeaknesses: [] });
});

describe('detectCorrection', () => {
  it('английские коррекции распознаются (ASCII-словарные границы)', async () => {
    const ml = await getML();
    for (const msg of [
      'stop', 'wrong answer', 'no, not what I wanted', 'actually I mean something else',
    ]) {
      expect(ml.detectCorrection(msg)).toBe(true);
    }
  });

  it('ЗАФИКСИРОВАННЫЙ ДЕФЕКТ: русские коррекции НЕ распознаются — \\b не работает с кириллицей', async () => {
    const ml = await getML();
    // Все русские паттерны построены на /\bслово\b/i, но в JS \w = [A-Za-z0-9_],
    // кириллица — \W, поэтому граница \b рядом с русской буквой никогда не матчится.
    for (const msg of ['нет, это не то', 'исправь пожалуйста', 'ты неправ', 'там ошибка']) {
      expect(ml.detectCorrection(msg)).toBe(false);
    }
  });

  it('нейтральные сообщения — не коррекции', async () => {
    const ml = await getML();
    for (const msg of ['спасибо, отлично', 'продолжай', 'ok thanks, continue please']) {
      expect(ml.detectCorrection(msg)).toBe(false);
    }
  });
});

describe('learnFromMessage → preferences → insights', () => {
  it('«be short» → инсайт о кратких ответах (conf 0.6)', async () => {
    const ml = await getML();
    ml.learnFromMessage('be short please');
    const insights = ml.getInsights();
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      pattern: 'Пользователь предпочитает краткие ответы',
      confidence: 0.6,
      source: 'preference',
    });
  });

  it('«more detail» → инсайт о развёрнутых ответах', async () => {
    const ml = await getML();
    ml.learnFromMessage('give me more detail');
    expect(ml.getInsights().map(i => i.pattern)).toContain('Пользователь предпочитает развёрнутые ответы');
  });

  it('«just answer» → инсайт о минимуме инструментов (conf 0.5)', async () => {
    const ml = await getML();
    ml.learnFromMessage('just answer, no tools');
    const i = ml.getInsights().find(x => x.pattern === 'Пользователь предпочитает минимум инструментов');
    expect(i).toMatchObject({ confidence: 0.5, source: 'preference' });
  });

  it('ЗАФИКСИРОВАННЫЙ ДЕФЕКТ: русские фразы предпочтений не детектируются (\\b + кириллица)', async () => {
    const ml = await getML();
    ml.learnFromMessage('будь короче');
    ml.learnFromMessage('ответь подробнее');
    ml.learnFromMessage('просто ответь без поиска');
    expect(ml.getInsights()).toEqual([]);
  });

  it('сообщение без паттернов → инсайтов нет', async () => {
    const ml = await getML();
    ml.learnFromMessage('расскажи про проект');
    expect(ml.getInsights()).toEqual([]);
  });

  it('upsert: short → detailed перезаписывает value, confidence капается на 1.0', async () => {
    const ml = await getML();
    ml.learnFromMessage('be short');
    ml.learnFromMessage('more detail');
    const insights = ml.getInsights();
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ pattern: 'Пользователь предпочитает развёрнутые ответы', confidence: 1.0 });
  });

  it('upsert персистится через saveFact(\'preference\')', async () => {
    const ml = await getML();
    ml.learnFromMessage('be short');
    expect(mockSaveFact).toHaveBeenCalledWith('preference', expect.stringContaining('"key":"answer_style"'));
  });
});

describe('инсайты из self-review', () => {
  it('totalReviews>=3 и avg<3 → инсайт о низкой оценке (conf 0.7)', async () => {
    mockSummary.mockReturnValue({ totalReviews: 5, averageScore: 2.4, topWeaknesses: [] });
    const ml = await getML();
    const i = ml.getInsights().find(x => x.pattern === 'Низкая средняя оценка ответов');
    expect(i).toMatchObject({ confidence: 0.7, source: 'self_review' });
  });

  it('totalReviews<3 → self-review инсайтов нет', async () => {
    mockSummary.mockReturnValue({ totalReviews: 2, averageScore: 1.0, topWeaknesses: [{ pattern: 'галлюцинации', count: 5 }] });
    const ml = await getML();
    expect(ml.getInsights()).toEqual([]);
  });

  it('avg>=3 → инсайта о низкой оценке нет', async () => {
    mockSummary.mockReturnValue({ totalReviews: 10, averageScore: 4.0, topWeaknesses: [] });
    const ml = await getML();
    expect(ml.getInsights().map(i => i.pattern)).not.toContain('Низкая средняя оценка ответов');
  });

  it('слабость с count>=3 → инсайт conf=min(0.5+n*0.1,0.9); count<3 → нет', async () => {
    mockSummary.mockReturnValue({
      totalReviews: 5, averageScore: 4.0,
      topWeaknesses: [{ pattern: 'галлюцинации', count: 3 }, { pattern: 'опечатки', count: 2 }],
    });
    const ml = await getML();
    const insights = ml.getInsights();
    const w = insights.find(i => i.pattern === 'Повторяющаяся слабость: галлюцинации');
    expect(w).toMatchObject({ confidence: 0.8, source: 'self_review' });
    expect(insights.find(i => i.pattern.includes('опечатки'))).toBeUndefined();
  });
});

describe('инсайт по частоте исправлений', () => {
  it('rate>0.3 при total>=10 → инсайт conf=rate', async () => {
    const ml = await getML();
    for (let i = 0; i < 10; i++) ml.recordInteraction(i < 4);
    const i = ml.getInsights().find(x => x.pattern === 'Высокая частота исправлений');
    expect(i).toMatchObject({ confidence: 0.4, source: 'correction' });
  });

  it('rate=0.3 ровно → инсайта нет; total<10 → инсайта нет', async () => {
    const ml = await getML();
    for (let i = 0; i < 10; i++) ml.recordInteraction(i < 3);
    expect(ml.getInsights().map(x => x.pattern)).not.toContain('Высокая частота исправлений');

    ml.resetLearning();
    for (let i = 0; i < 9; i++) ml.recordInteraction(true);
    expect(ml.getInsights().map(x => x.pattern)).not.toContain('Высокая частота исправлений');
  });
});

describe('getMetaInstructions', () => {
  it('нет инсайтов → пустая строка', async () => {
    const ml = await getML();
    expect(ml.getMetaInstructions()).toBe('');
  });

  it('есть инсайты → блок «# Мета-обучение» со строками "- instruction"', async () => {
    const ml = await getML();
    ml.learnFromMessage('be short');
    const out = ml.getMetaInstructions();
    expect(out).toContain('# Мета-обучение (выученные паттерны)');
    expect(out).toContain('- Пользователь предпочитает краткие ответы. Отвечай 2-3 предложения.');
  });
});

describe('loadPreferences / resetLearning', () => {
  it('loadPreferences подхватывает факты, битый JSON и дубликаты пропускает', async () => {
    mockGetFacts.mockReturnValue([
      { content: JSON.stringify({ key: 'answer_style', value: 'short', confidence: 0.5 }), created_at: '2026-01-01' },
      { content: 'not-json', created_at: '2026-01-01' },
      { content: JSON.stringify({ noKey: true }), created_at: '2026-01-01' },
    ] as never);
    const ml = await getML();
    ml.loadPreferences();
    const i = ml.getInsights().find(x => x.pattern === 'Пользователь предпочитает краткие ответы');
    expect(i).toMatchObject({ confidence: 0.5 });
  });

  it('resetLearning очищает preferences и счётчики', async () => {
    const ml = await getML();
    ml.learnFromMessage('be short');
    for (let i = 0; i < 10; i++) ml.recordInteraction(true);
    ml.resetLearning();
    expect(ml.getInsights()).toEqual([]);
    expect(ml.getMetaInstructions()).toBe('');
  });
});

