/**
 * TASK-016 (DEC-021): приёмочные тесты для electron/ai/self-review.ts.
 *
 * Тесты написаны на ИСПРАВЛЕННОЕ поведение после Fix 0 (вето Lead не получено):
 * \b вокруг кириллицы заменён на WB_START/WB_END-границы (подход TASK-013).
 * Моки: saveFact/listFacts из ../memory/store. Реальной БД нет.
 *
 * Зафиксированные эджи (контракт P1-2):
 * - needsWeb-паттерны только RU: «weather today?» (EN) НЕ триггерит штраф.
 * - runDeepReview: битый JSON исключается из суммы score, но НЕ из делителя
 *   (averageScore занижается); default score 3 при отсутствии поля.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../electron/memory/store', () => ({
  saveFact: vi.fn(),
  listFacts: vi.fn(() => []),
}));

import { saveFact, listFacts } from '../../electron/memory/store';
import {
  reviewResponse, getRecentReviews, getReviewSummary,
  formatReviewForPrompt, clearReviews, runDeepReview,
} from '../../electron/ai/self-review';

const saveMock = vi.mocked(saveFact);
const listMock = vi.mocked(listFacts);

beforeEach(() => {
  clearReviews();
  saveMock.mockReset();
  listMock.mockReset().mockReturnValue([]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reviewResponse — 7 проверок', () => {
  it('чистый короткий обмен → score 5, без слабостей', () => {
    const e = reviewResponse('Привет!', 'Привет! Чем помочь?');
    expect(e.score).toBe(5);
    expect(e.weaknesses).toEqual([]);
  });

  it('check1a: короткий вопрос (<80) + длинный ответ (>500) → -0.5', () => {
    const e = reviewResponse('Hi', 'x'.repeat(600));
    // + check5 (нет <think> при >200): ещё -0.5
    expect(e.score).toBe(4);
    expect(e.weaknesses).toContain('Слишком длинный ответ на короткий вопрос');
  });

  it('check1b: длинный вопрос (>300) + короткий ответ (<100) → -0.5', () => {
    const e = reviewResponse('y'.repeat(350), 'Ок.');
    expect(e.score).toBe(4.5);
    expect(e.weaknesses).toContain('Слишком короткий ответ на сложный вопрос');
  });

  it('check2: RU needsWeb («какая погода») + 0 инструментов → -1 (Fix 0: работает!)', () => {
    const e = reviewResponse('Какая погода сегодня?', 'Не знаю.', { toolCallCount: 0 });
    expect(e.weaknesses).toContain('Не использован web_search для актуальной информации');
    expect(e.score).toBe(4);
  });

  it('check2: стемы — «новости», «последние события» триггерят; EN «weather» — НЕТ (эдж)', () => {
    const ru = reviewResponse('Расскажи последние новости', 'Ответ.', { toolCallCount: 0 });
    expect(ru.score).toBe(4);
    const en = reviewResponse('What is the weather today?', 'Answer.', { toolCallCount: 0 });
    expect(en.score).toBe(5); // RU-only список — фактическое поведение
  });

  it('check2: toolCallCount > 0 → strength; options без toolCallCount → проверка пропущена', () => {
    const withTools = reviewResponse('Какая погода?', 'Вот данные.', { toolCallCount: 3 });
    expect(withTools.strengths).toContain('Использовано 3 инструментов');
    const skipped = reviewResponse('Какая погода?', 'Не знаю.');
    expect(skipped.score).toBe(5);
  });

  it('check3: hadError → -1 + урок', () => {
    const e = reviewResponse('Вопрос', 'Ответ.', { hadError: true });
    expect(e.score).toBe(4);
    expect(e.weaknesses).toContain('Произошла ошибка при выполнении');
  });

  it('check4: user поздоровался, ответ без приветствия → -0.5 (Fix 0: RU работает)', () => {
    const e = reviewResponse('Привет, как дела?', 'Пока.');
    expect(e.weaknesses).toContain('Не поприветствовала пользователя в ответ');
    expect(e.score).toBe(4.5);
  });

  it('check4: ответ с «привет»/«здравствуйте» (стем) → без штрафа', () => {
    expect(reviewResponse('привет', 'Здравствуйте! Слушаю.').score).toBe(5);
  });

  it('check5: >200 символов без <think> → -0.5; с <think> → strength', () => {
    const noThink = reviewResponse('расскажи', 'x'.repeat(300));
    expect(noThink.weaknesses).toContain('Нет блока рассуждений <think> в развёрнутом ответе');
    const withThink = reviewResponse('расскажи', `<think>${'t'.repeat(50)}</think>${'x'.repeat(300)}`);
    expect(withThink.strengths).toContain('Использует цепочку рассуждений');
  });

  it('check6: >15 непустых строк и >1000 символов → strength', () => {
    const resp = Array.from({ length: 20 }, (_, i) => `Строка ${i} ${'x'.repeat(60)}`).join('\n');
    expect(reviewResponse('вопрос без знака', resp).strengths).toContain('Хорошая структура ответа');
  });

  it('check7: вопрос + длинный ответ без прямого префикса → -0.5; с «Да,» → ок (Fix 0)', () => {
    const noPrefix = reviewResponse('Ты работаешь?', 'x'.repeat(300));
    expect(noPrefix.weaknesses).toContain('Нет прямого ответа на вопрос');
    const withPrefix = reviewResponse('Ты работаешь?', `Да, конечно. ${'x'.repeat(300)}`);
    expect(withPrefix.weaknesses).not.toContain('Нет прямого ответа на вопрос');
  });

  it('clamp: сумма штрафов > 4 → score = 1 (нижняя граница)', () => {
    const e = reviewResponse('привет, какая погода?', 'x'.repeat(600), { toolCallCount: 0, hadError: true });
    // -1 web, -1 error, -0.5 greet, -0.5 think, -0.5 answer, -0.5 long → 5-4=1
    expect(e.score).toBe(1);
    expect(e.score).toBeGreaterThanOrEqual(1);
  });

  it('поля entry: обрезки 200/300, id, дефолты toolCallCount/hadError', () => {
    const e = reviewResponse('u'.repeat(250), 'r'.repeat(350));
    expect(e.userMessage).toHaveLength(200);
    expect(e.responsePreview).toHaveLength(300);
    expect(e.id).toMatch(/^review_/);
    expect(e.toolCallCount).toBe(0);
    expect(e.hadError).toBe(false);
  });
});

describe('in-memory хранилище и персистентность', () => {
  it('cap 20: 25 ревью → хранятся 20, новейшее первым (unshift+pop)', () => {
    for (let i = 0; i < 25; i++) reviewResponse(`вопрос ${i}`, `ответ ${i}`);
    const all = getRecentReviews(100);
    expect(all).toHaveLength(20);
    expect(all[0].userMessage).toBe('вопрос 24');
    expect(all[19].userMessage).toBe('вопрос 5');
  });

  it('saveFact вызван с категорией self_review и JSON со score', () => {
    reviewResponse('q', 'a');
    expect(saveMock).toHaveBeenCalledTimes(1);
    const [cat, content] = saveMock.mock.calls[0];
    expect(cat).toBe('self_review');
    expect(JSON.parse(content as string).score).toBe(5);
  });

  it('saveFact бросил → console.warn, ревью не падает', () => {
    saveMock.mockImplementation(() => { throw new Error('db down'); });
    expect(() => reviewResponse('q', 'a')).not.toThrow();
    expect(vi.mocked(console.warn)).toHaveBeenCalled();
  });

  it('getRecentReviews: дефолтный лимит 5', () => {
    for (let i = 0; i < 8; i++) reviewResponse(`q${i}`, 'a');
    expect(getRecentReviews()).toHaveLength(5);
  });
});

describe('getReviewSummary / formatReviewForPrompt', () => {
  it('пусто → нули и пустые списки; format → пустая строка', () => {
    expect(getReviewSummary()).toEqual({
      totalReviews: 0, averageScore: 0, topWeaknesses: [], recentLessons: [],
    });
    expect(formatReviewForPrompt()).toBe('');
  });

  it('среднее с округлением до x.x; топ-5 слабостей по убыванию; уникальные уроки топ-5', () => {
    reviewResponse('q1', 'a'); // 5
    reviewResponse('Какая погода?', 'Нет.', { toolCallCount: 0 }); // 4 (web)
    reviewResponse('Курс доллара?', 'Нет.', { toolCallCount: 0 }); // 4 (web) — та же слабость ×2
    const s = getReviewSummary();
    expect(s.totalReviews).toBe(3);
    expect(s.averageScore).toBe(4.3); // (5+4+4)/3 = 4.33… → 4.3
    expect(s.topWeaknesses[0]).toEqual({
      pattern: 'Не использован web_search для актуальной информации', count: 2,
    });
    expect(s.recentLessons).toHaveLength(1); // одинаковый урок дедуплицирован
    expect(formatReviewForPrompt()).toContain('# Саморефлексия');
    expect(formatReviewForPrompt()).toContain('Средняя оценка: 4.3/5');
  });
});

describe('runDeepReview (listFacts замокан)', () => {
  it('нет фактов / нет self_review → null', async () => {
    expect(await runDeepReview()).toBeNull();
    listMock.mockReturnValue([{ category: 'other', content: '{}' } as never]);
    expect(await runDeepReview()).toBeNull();
  });

  it('агрегация: score/weaknesses/lessons по валидным фактам', async () => {
    listMock.mockReturnValue([
      { category: 'self_review', content: JSON.stringify({ score: 5, weaknesses: ['A'], lessons: ['L1'] }) },
      { category: 'self_review', content: JSON.stringify({ score: 3, weaknesses: ['A', 'B'], lessons: ['L1', 'L2'] }) },
    ] as never);
    const s = (await runDeepReview())!;
    expect(s.totalReviews).toBe(2);
    expect(s.averageScore).toBe(4);
    expect(s.topWeaknesses[0]).toEqual({ pattern: 'A', count: 2 });
    expect(s.recentLessons).toEqual(['L1', 'L2']);
  });

  it('ЭДЖ: битый JSON пропускается в сумме, но остаётся в делителе (average занижен)', async () => {
    listMock.mockReturnValue([
      { category: 'self_review', content: JSON.stringify({ score: 5 }) },
      { category: 'self_review', content: 'not json{{' },
    ] as never);
    const s = (await runDeepReview())!;
    expect(s.totalReviews).toBe(2);
    expect(s.averageScore).toBe(2.5); // 5/2, а не 5/1 — фактическое поведение
  });

  it('ЭДЖ: факт без поля score → вклад 3 (default)', async () => {
    listMock.mockReturnValue([
      { category: 'self_review', content: JSON.stringify({ weaknesses: [] }) },
    ] as never);
    expect((await runDeepReview())!.averageScore).toBe(3);
  });

  it('listFacts бросил → null (внешний catch)', async () => {
    listMock.mockImplementation(() => { throw new Error('db'); });
    expect(await runDeepReview()).toBeNull();
  });
});

