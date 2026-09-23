/**
 * TASK-005 (DEC-021): приёмочные тесты для electron/ai/monologue.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Мокируется только
 * внешняя персистентность (memory/store.saveFact). RNG не мокается:
 * при единственном кандидате выбор детерминирован, при нескольких —
 * assert membership в множестве ожидаемых кандидатов.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveFact } from '../../electron/memory/store';

vi.mock('../../electron/memory/store', () => ({
  saveFact: vi.fn(async () => ({})),
}));

const mockSaveFact = vi.mocked(saveFact);

async function getMono() {
  return await import('../../electron/ai/monologue');
}

beforeEach(() => {
  vi.resetModules();
  mockSaveFact.mockClear();
});

describe('generateThought — кандидаты из наблюдений', () => {
  it('наблюдение о батарее → мысль о батарее', async () => {
    const m = await getMono();
    const t = m.generateThought(['Battery: 15%'], []);
    expect(t).not.toBeNull();
    expect(t!.text).toBe('Надо следить за батареей — Battery: 15%');
    expect(t!.type).toBe('observation');
  });

  it('наблюдение с idle → мысль об обслуживании памяти', async () => {
    const m = await getMono();
    const t = m.generateThought(['User went idle — good time for maintenance'], []);
    expect(t!.text).toBe('Пользователь отошёл. Можно заняться обслуживанием памяти.');
  });

  it('наблюдение о нагрузке → мысль об экономии ресурсов', async () => {
    const m = await getMono();
    const t = m.generateThought(['Performance: RAM usage high'], []);
    expect(t!.text).toBe('Система нагружена. Буду экономить ресурсы.');
  });

  it('наблюдения без ключевых слов + без рефлексий → null', async () => {
    const m = await getMono();
    expect(m.generateThought(['UNA state: active'], [])).toBeNull();
  });
});

describe('generateThought — кандидаты из рефлексий и контекста', () => {
  it('рефлексия о stale-фактах → мысль о чистке', async () => {
    const m = await getMono();
    const t = m.generateThought([], ['Found 7 potentially stale facts (>30d unused, <3 uses)']);
    expect(t!.text).toBe('Нужно почистить устаревшие факты.');
    expect(t!.type).toBe('reflection');
  });

  it('self-review с avg → «лучше»; без avg → «требуют улучшения»', async () => {
    const m = await getMono();
    const better = m.generateThought([], ['Self-review: 5 reviews, avg 4.2/5']);
    expect(better!.text).toBe('Мои ответы стали лучше.');
    const worse = m.generateThought([], ['Self-review deep analysis']);
    expect(worse!.text).toBe('Мои ответы стали требуют улучшения.');
  });

  it('ночной час (23) → ночная мысль; день без ключевых слов → null', async () => {
    const m = await getMono();
    // obs непустой (иначе добавится curiosity-кандидат), но без ключевых слов
    const night = m.generateThought(['x'], [], { hour: 23, sessionLength: 0 });
    expect(night!.text).toBe('Уже поздно. Если пользователь не пишет — сделаю ночное обслуживание.');
    const day = m.generateThought(['x'], [], { hour: 12, sessionLength: 0 });
    expect(day).toBeNull();
  });

  it('sessionLength>120 → мысль о перерыве', async () => {
    const m = await getMono();
    const t = m.generateThought(['x'], [], { hour: 12, sessionLength: 130 });
    expect(t!.text).toBe('Пользователь работает уже 2ч. Стоит предложить перерыв скоро.');
  });

  it('пустые obs+refs без контекста → curiosity «Всё тихо» с типом reflection (зафиксировано)', async () => {
    const m = await getMono();
    const t = m.generateThought([], []);
    expect(t!.text).toBe('Всё тихо. Продолжаю наблюдение.');
    expect(t!.type).toBe('reflection'); // 0 > 0 === false → 'reflection'
  });

  it('несколько кандидатов → текст из множества кандидатов (RNG membership)', async () => {
    const m = await getMono();
    const t = m.generateThought(['Battery: 10%', 'User idle now'], []);
    expect([
      'Надо следить за батареей — Battery: 10%',
      'Пользователь отошёл. Можно заняться обслуживанием памяти.',
    ]).toContain(t!.text);
  });
});

describe('тип, буфер, персистентность', () => {
  it('type: observations.length > reflections.length → observation, иначе reflection', async () => {
    const m = await getMono();
    const obs = m.generateThought(['Battery low', 'Performance high'], ['stale facts']);
    expect(obs!.type).toBe('observation');
    const ref = m.generateThought(['Battery low'], ['stale facts', 'Self-review: avg 4']);
    expect(ref!.type).toBe('reflection');
  });

  it('reflection-мысль персистится через saveFact; observation — нет', async () => {
    const m = await getMono();
    m.generateThought([], ['stale facts']);
    expect(mockSaveFact).toHaveBeenCalledTimes(1);
    expect(mockSaveFact.mock.calls[0][0]).toBe('self_review');
    expect(JSON.parse(mockSaveFact.mock.calls[0][1] as string).type).toBe('thought');

    mockSaveFact.mockClear();
    m.generateThought(['Battery: 50%'], []);
    expect(mockSaveFact).not.toHaveBeenCalled();
  });

  it('ошибка saveFact глотается — мысль всё равно возвращается', async () => {
    mockSaveFact.mockRejectedValueOnce(new Error('db down'));
    const m = await getMono();
    const t = m.generateThought([], ['stale facts']);
    expect(t).not.toBeNull();
  });

  it('буфер ограничен 20 мыслями (MAX_THOUGHTS), свежие впереди', async () => {
    const m = await getMono();
    for (let i = 0; i < 25; i++) {
      m.generateThought([`Battery: ${i}%`], []);
    }
    const all = m.getRecentThoughts(25);
    expect(all).toHaveLength(20);
    expect(all[0].text).toContain('24%'); // последняя — первая
  });

  it('getRecentThoughts без аргумента → максимум 5', async () => {
    const m = await getMono();
    for (let i = 0; i < 8; i++) m.generateThought([`Battery: ${i}%`], []);
    expect(m.getRecentThoughts()).toHaveLength(5);
    expect(m.getRecentThoughts(3)).toHaveLength(3);
  });

  it('clearThoughts очищает буфер', async () => {
    const m = await getMono();
    m.generateThought(['Battery: 50%'], []);
    m.clearThoughts();
    expect(m.getRecentThoughts(10)).toEqual([]);
  });
});

describe('formatThoughtsForPrompt', () => {
  it('пустой буфер → пустая строка', async () => {
    const m = await getMono();
    expect(m.formatThoughtsForPrompt()).toBe('');
  });

  it('непустой буфер → блок «Внутренний монолог» с «только что»', async () => {
    const m = await getMono();
    m.generateThought(['Battery: 50%'], []);
    const out = m.formatThoughtsForPrompt();
    expect(out).toContain('# Внутренний монолог');
    expect(out).toContain('Надо следить за батареей — Battery: 50%');
    expect(out).toContain('только что');
  });
});

