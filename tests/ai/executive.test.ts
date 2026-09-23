/**
 * TASK-012 (DEC-021): приёмочные тесты для electron/ai/executive.ts (цели).
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение, эджи НЕ чиним.
 * Изоляция: getDb из ../memory/store замокан hoisted-инстансом better-sqlite3
 * (:memory:, таблица goals по DDL store.ts); vi.resetModules() на тест.
 *
 * Зафиксированные эджи (фактическое поведение кода @ c974c0e):
 * - parseGoalToken create: regex `(.+)\s*\|?\s*(.+)$` — pipe необязателен и
 *   ИГНОРИРУЕТСЯ: жадная группа съедает всё, кроме последнего символа.
 *   'create: do X | a, b, c' → description 'do X | a, b,' + subgoals ['c'];
 *   'create: do X' → description 'do' + subgoals ['X'] (теряется токен).
 * - updateSubgoalStatus при пустых subgoals: index 0 не проходит bounds-check
 *   (0 >= 0) → silent no-op (NaN-progress недостижим через публичный API).
 * - resumeGoal не-interrupted цели: UPDATE no-op, но возвращает Goal
 *   со статусом как есть (snapshot не трогается).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

const h = vi.hoisted(() => ({ db: null as InstanceType<typeof Database> | null }));

vi.mock('../../electron/memory/store', () => ({ getDb: () => h.db }));

async function getEx() {
  return await import('../../electron/ai/executive');
}

beforeEach(() => {
  vi.resetModules();
  h.db = new Database(':memory:');
  h.db.exec(`
    CREATE TABLE goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      subgoals TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      progress REAL NOT NULL DEFAULT 0,
      context_snapshot TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
});

afterEach(() => {
  h.db?.close();
  h.db = null;
});

describe('createGoal / getGoalById', () => {
  it('создаёт цель: active, progress 0, все подшаги pending', async () => {
    const ex = await getEx();
    const g = ex.createGoal('Написать отчёт', ['собрать данные', 'оформить']);
    expect(g.status).toBe('active');
    expect(g.progress).toBe(0);
    expect(g.subgoals).toEqual([
      { description: 'собрать данные', status: 'pending' },
      { description: 'оформить', status: 'pending' },
    ]);
    expect(g.context_snapshot).toBeNull();
    expect(ex.getGoalById(g.id)).toEqual(g);
  });

  it('без БД → throw «No database»', async () => {
    h.db?.close();
    h.db = null;
    const ex = await getEx();
    expect(() => ex.createGoal('x', [])).toThrow('No database');
  });

  it('getGoalById: несуществующий id → null; без БД → null', async () => {
    const ex = await getEx();
    expect(ex.getGoalById(999)).toBeNull();
    h.db?.close();
    h.db = null;
    expect(ex.getGoalById(1)).toBeNull();
  });
});

describe('getActiveGoals / getAllGoals', () => {
  it('active+interrupted попадают, completed/cancelled — нет; лимит 10', async () => {
    const ex = await getEx();
    const ids: number[] = [];
    for (let i = 0; i < 12; i++) ids.push(ex.createGoal(`g${i}`, []).id);
    ex.completeGoal(ids[0]);
    ex.cancelGoal(ids[1]);
    ex.interruptGoal(ids[2]);
    const active = ex.getActiveGoals();
    expect(active).toHaveLength(10); // 12 - completed - cancelled
    expect(active.every(g => g.status === 'active' || g.status === 'interrupted')).toBe(true);
    expect(active.map(g => g.id)).toContain(ids[2]); // interrupted включён
  });

  it('порядок created DESC: новая цель первая', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z'));
    const ex = await getEx();
    const first = ex.createGoal('первая', []);
    vi.setSystemTime(new Date('2026-09-23T11:00:00Z'));
    const second = ex.createGoal('вторая', []);
    const active = ex.getActiveGoals();
    expect(active[0].id).toBe(second.id);
    expect(active[1].id).toBe(first.id);
    vi.useRealTimers();
  });

  it('getAllGoals: лимит 50, все статусы; без БД → []', async () => {
    const ex = await getEx();
    for (let i = 0; i < 55; i++) ex.createGoal(`g${i}`, []);
    const all = ex.getAllGoals();
    expect(all).toHaveLength(50);
    h.db?.close();
    h.db = null;
    expect(ex.getAllGoals()).toEqual([]);
    expect(ex.getActiveGoals()).toEqual([]);
  });
});

describe('updateSubgoalStatus', () => {
  it('пересчёт progress; 100% → статус completed', async () => {
    const ex = await getEx();
    const g = ex.createGoal('g', ['a', 'b']);
    ex.updateSubgoalStatus(g.id, 0, 'done');
    let cur = ex.getGoalById(g.id)!;
    expect(cur.progress).toBe(50);
    expect(cur.status).toBe('active');
    expect(cur.subgoals[0].status).toBe('done');
    ex.updateSubgoalStatus(g.id, 1, 'done');
    cur = ex.getGoalById(g.id)!;
    expect(cur.progress).toBe(100);
    expect(cur.status).toBe('completed');
  });

  it('in_progress не влияет на progress', async () => {
    const ex = await getEx();
    const g = ex.createGoal('g', ['a', 'b', 'c', 'd']);
    ex.updateSubgoalStatus(g.id, 0, 'in_progress');
    ex.updateSubgoalStatus(g.id, 1, 'done');
    const cur = ex.getGoalById(g.id)!;
    expect(cur.progress).toBe(25);
    expect(cur.subgoals.map(s => s.status)).toEqual(['in_progress', 'done', 'pending', 'pending']);
  });

  it('несуществующий goal / OOB-индекс / без БД → silent no-op', async () => {
    const ex = await getEx();
    const g = ex.createGoal('g', ['a']);
    ex.updateSubgoalStatus(999, 0, 'done'); // нет цели
    ex.updateSubgoalStatus(g.id, -1, 'done'); // OOB снизу
    ex.updateSubgoalStatus(g.id, 5, 'done'); // OOB сверху
    expect(ex.getGoalById(g.id)!.progress).toBe(0);
    h.db?.close();
    h.db = null;
    expect(() => ex.updateSubgoalStatus(g.id, 0, 'done')).not.toThrow();
  });

  it('ЭДЖ: пустые subgoals → index 0 не проходит bounds-check, silent no-op', async () => {
    const ex = await getEx();
    const g = ex.createGoal('g', []);
    expect(g.subgoals).toEqual([]);
    ex.updateSubgoalStatus(g.id, 0, 'done');
    const cur = ex.getGoalById(g.id)!;
    expect(cur.progress).toBe(0); // NaN-ветка недостижима: ранний return на bounds-check
    expect(cur.status).toBe('active');
  });
});

describe('interrupt / resume / complete / cancel / delete', () => {
  it('interruptGoal → interrupted + snapshot; цель остаётся в active-списке', async () => {
    const ex = await getEx();
    const g = ex.createGoal('g', ['a']);
    ex.interruptGoal(g.id, 'ctx: работал над шагом 1');
    const cur = ex.getGoalById(g.id)!;
    expect(cur.status).toBe('interrupted');
    expect(cur.context_snapshot).toBe('ctx: работал над шагом 1');
    expect(ex.getActiveGoals().map(x => x.id)).toContain(g.id);
  });

  it('resumeGoal из interrupted → active, snapshot сброшен', async () => {
    const ex = await getEx();
    const g = ex.createGoal('g', []);
    ex.interruptGoal(g.id, 'snap');
    const resumed = ex.resumeGoal(g.id)!;
    expect(resumed.status).toBe('active');
    expect(resumed.context_snapshot).toBeNull();
  });

  it('ЭДЖ: resumeGoal не-interrupted цели → UPDATE no-op, но Goal возвращается', async () => {
    const ex = await getEx();
    const g = ex.createGoal('g', []);
    const r = ex.resumeGoal(g.id)!; // цель active — WHERE status='interrupted' не совпал
    expect(r).not.toBeNull();
    expect(r.status).toBe('active'); // статус не изменился
  });

  it('resumeGoal несуществующего id → null', async () => {
    const ex = await getEx();
    expect(ex.resumeGoal(999)).toBeNull();
  });

  it('completeGoal → completed + 100; cancelGoal → cancelled; вне active-списка', async () => {
    const ex = await getEx();
    const a = ex.createGoal('a', []);
    const b = ex.createGoal('b', []);
    ex.completeGoal(a.id);
    ex.cancelGoal(b.id);
    expect(ex.getGoalById(a.id)).toMatchObject({ status: 'completed', progress: 100 });
    expect(ex.getGoalById(b.id)!.status).toBe('cancelled');
    expect(ex.getActiveGoals()).toHaveLength(0);
  });

  it('deleteGoal → getGoalById возвращает null', async () => {
    const ex = await getEx();
    const g = ex.createGoal('g', []);
    ex.deleteGoal(g.id);
    expect(ex.getGoalById(g.id)).toBeNull();
    expect(ex.getAllGoals()).toHaveLength(0);
  });
});


describe('formatGoalsForPrompt', () => {
  it('нет активных целей → пустая строка', async () => {
    const ex = await getEx();
    expect(ex.formatGoalsForPrompt()).toBe('');
  });

  it('блок целей: описание, иконки подшагов, progress, подсказка [GOAL]', async () => {
    const ex = await getEx();
    const g = ex.createGoal('Сделать релиз', ['собрать', 'прогнать тесты', 'тег']);
    ex.updateSubgoalStatus(g.id, 0, 'done');
    ex.updateSubgoalStatus(g.id, 1, 'in_progress');
    const out = ex.formatGoalsForPrompt();
    expect(out).toContain('# Текущие цели');
    expect(out).toContain('Цель 1: Сделать релиз [33%]');
    expect(out).toContain('[✓] собрать');
    expect(out).toContain('[→] прогнать тесты');
    expect(out).toContain('[ ] тег');
    expect(out).toContain('[GOAL] create:описание | шаг1, шаг2, шаг3');
    expect(out).toContain('[GOAL] done:N:M');
  });

  it('interrupted-цель помечается «(приостановлена)»', async () => {
    const ex = await getEx();
    const g = ex.createGoal('Пауза', []);
    ex.interruptGoal(g.id);
    expect(ex.formatGoalsForPrompt()).toContain('Цель 1: Пауза (приостановлена) [0%]');
  });
});

describe('parseGoalToken', () => {
  it('done:N:M → update с goalId и subIndex', async () => {
    const ex = await getEx();
    expect(ex.parseGoalToken('[GOAL] done:3:2')).toEqual({ action: 'update', goalId: 3, subIndex: 2 });
    expect(ex.parseGoalToken('[GOAL] done: 10 : 7')).toEqual({ action: 'update', goalId: 10, subIndex: 7 });
  });

  it('cancel:N → cancel с goalId', async () => {
    const ex = await getEx();
    expect(ex.parseGoalToken('[GOAL] cancel:5')).toEqual({ action: 'cancel', goalId: 5 });
    expect(ex.parseGoalToken('[GOAL] cancel: 42')).toEqual({ action: 'cancel', goalId: 42 });
  });

  it('ЭДЖ: create с pipe — pipe игнорируется, жадный (.+) съедает шаги', async () => {
    const ex = await getEx();
    // Фактическое поведение regex (.+)\s*\|?\s*(.+)$: pipe необязателен,
    // description получает всё, кроме последнего символа строки.
    expect(ex.parseGoalToken('[GOAL] create: do X | a, b, c')).toEqual({
      action: 'create',
      description: 'do X | a, b,',
      subgoals: ['c'],
    });
  });

  it('ЭДЖ: create без pipe — теряется последний токен описания', async () => {
    const ex = await getEx();
    expect(ex.parseGoalToken('[GOAL] create: do X')).toEqual({
      action: 'create',
      description: 'do',
      subgoals: ['X'],
    });
  });

  it('мусор → null', async () => {
    const ex = await getEx();
    expect(ex.parseGoalToken('просто текст')).toBeNull();
    expect(ex.parseGoalToken('[GOAL] unknown:1')).toBeNull();
    expect(ex.parseGoalToken('[GOAL]')).toBeNull();
  });
});

