/**
 * TASK-014 (DEC-021): приёмочные тесты для electron/ai/goal-tracker.ts.
 *
 * Контракт P1-2: фиксируем ТЕКУЧЕЕ поведение. Изоляция: свежий
 * better-sqlite3 ':memory:' + initGoalTracker + vi.resetModules() на тест
 * (состояние — module-level db).
 *
 * Зафиксированные эджи:
 * - deleteGoal оставляет subtasks-сирот: better-sqlite3 :memory: по умолчанию
 *   имеет PRAGMA foreign_keys=OFF, поэтому ON DELETE CASCADE не срабатывает;
 *   сироты продолжают попадать в getNextSubtask/getGoalProgress.
 * - getGoalStats: неизвестный status попадает в stats динамическим ключом
 *   и учитывается в total.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

type GT = typeof import('../../electron/ai/goal-tracker');

let db: InstanceType<typeof Database>;
let gt: GT;

beforeEach(async () => {
  vi.resetModules();
  gt = await import('../../electron/ai/goal-tracker');
  db = new Database(':memory:');
  gt.initGoalTracker(db);
});

describe('инициализация', () => {
  it('без init все функции бросают «GoalTracker not initialized»', async () => {
    vi.resetModules();
    const fresh: GT = await import('../../electron/ai/goal-tracker');
    expect(() => fresh.createGoal('x')).toThrow('GoalTracker not initialized');
    expect(() => fresh.getGoal('x')).toThrow('GoalTracker not initialized');
    expect(() => fresh.getActiveGoals()).toThrow('GoalTracker not initialized');
    expect(() => fresh.updateGoalStatus('x', 'completed')).toThrow('GoalTracker not initialized');
    expect(() => fresh.deleteGoal('x')).toThrow('GoalTracker not initialized');
    expect(() => fresh.addSubtask('x', 'y')).toThrow('GoalTracker not initialized');
    expect(() => fresh.updateSubtaskStatus('x', 'pending')).toThrow('GoalTracker not initialized');
    expect(() => fresh.getNextSubtask('x')).toThrow('GoalTracker not initialized');
    expect(() => fresh.getGoalProgress('x')).toThrow('GoalTracker not initialized');
    expect(() => fresh.getGoalStats()).toThrow('GoalTracker not initialized');
  });
});

describe('goals CRUD', () => {
  it('createGoal: дефолты priority medium, deadline/context null, status active', () => {
    const g = gt.createGoal('Задача');
    expect(g.id).toBeTruthy();
    expect(g).toMatchObject({
      description: 'Задача', status: 'active', priority: 'medium', deadline: null, context: null,
    });
    expect(g.subtasks).toEqual([]);
  });

  it('createGoal с опциями: priority/deadline/context (context парсится из JSON)', () => {
    const g = gt.createGoal('Задача', {
      priority: 'high', deadline: '2026-10-01', context: { repo: 'una', n: 42 },
    });
    expect(g.priority).toBe('high');
    expect(g.deadline).toBe('2026-10-01');
    expect(g.context).toEqual({ repo: 'una', n: 42 });
  });

  it('getGoal: несуществующий → null; subtasks отсортированы по order_idx', () => {
    expect(gt.getGoal('nope')).toBeNull();
    const g = gt.createGoal('g');
    gt.addSubtask(g.id, 'second', 5);
    gt.addSubtask(g.id, 'first', 2);
    const cur = gt.getGoal(g.id)!;
    expect(cur.subtasks.map(s => s.description)).toEqual(['first', 'second']);
  });

  it('getActiveGoals: только active, порядок created DESC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    const a = gt.createGoal('старая');
    vi.setSystemTime(new Date('2026-09-24T11:00:00Z'));
    const b = gt.createGoal('новая');
    gt.updateGoalStatus(a.id, 'paused');
    const active = gt.getActiveGoals();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(b.id);
    vi.useRealTimers();
  });

  it('updateGoalStatus / deleteGoal', () => {
    const g = gt.createGoal('g');
    gt.updateGoalStatus(g.id, 'completed');
    expect(gt.getGoal(g.id)!.status).toBe('completed');
    gt.deleteGoal(g.id);
    expect(gt.getGoal(g.id)).toBeNull();
  });

  it('ЭДЖ: deleteGoal каскадно удаляет subtasks (better-sqlite3 включает FK по умолчанию)', () => {
    // ФАКТ: better-sqlite3 выставляет PRAGMA foreign_keys=ON по умолчанию
    // (в отличие от «сырого» SQLite), поэтому ON DELETE CASCADE срабатывает —
    // сирот НЕ остаётся. Если FK выключить вручную — останутся сироты.
    const g = gt.createGoal('g');
    gt.addSubtask(g.id, 's1');
    gt.deleteGoal(g.id);
    expect(gt.getGoal(g.id)).toBeNull();
    expect(gt.getNextSubtask(g.id)).toBeNull();
    expect(gt.getGoalProgress(g.id).total).toBe(0);

    // Контроль: с FK=OFF сироты бы остались
    const g2 = gt.createGoal('g2');
    gt.addSubtask(g2.id, 's2');
    db.pragma('foreign_keys = OFF');
    gt.deleteGoal(g2.id);
    expect(gt.getNextSubtask(g2.id)!.description).toBe('s2');
  });
});

describe('subtasks CRUD', () => {
  it('addSubtask: авто-order = max+1, первый = 0; явный orderIdx уважается', () => {
    const g = gt.createGoal('g');
    const s0 = gt.addSubtask(g.id, 'a');
    const s1 = gt.addSubtask(g.id, 'b');
    expect(s0.order_idx).toBe(0);
    expect(s1.order_idx).toBe(1);
    const sExpl = gt.addSubtask(g.id, 'c', 7);
    expect(sExpl.order_idx).toBe(7);
    expect(s0.status).toBe('pending');
  });

  it('updateSubtaskStatus: статус+result пишутся; несуществующий id — silent no-op', () => {
    const g = gt.createGoal('g');
    const s = gt.addSubtask(g.id, 'a');
    gt.updateSubtaskStatus(s.id, 'completed', 'ok');
    const cur = gt.getGoal(g.id)!.subtasks[0];
    expect(cur.status).toBe('completed');
    expect(cur.result).toBe('ok');
    expect(() => gt.updateSubtaskStatus('nope', 'completed')).not.toThrow();
  });

  it('getNextSubtask: первый pending по order_idx; null если нет pending', () => {
    const g = gt.createGoal('g');
    expect(gt.getNextSubtask(g.id)).toBeNull();
    const s0 = gt.addSubtask(g.id, 'a');
    const s1 = gt.addSubtask(g.id, 'b');
    expect(gt.getNextSubtask(g.id)!.id).toBe(s0.id);
    gt.updateSubtaskStatus(s0.id, 'completed');
    expect(gt.getNextSubtask(g.id)!.id).toBe(s1.id);
    gt.updateSubtaskStatus(s1.id, 'failed'); // failed — не pending
    expect(gt.getNextSubtask(g.id)).toBeNull();
  });
});

describe('прогресс и статистика', () => {
  it('getGoalProgress: счётчики по статусам; пустые → percentage 0 (без NaN)', () => {
    const g = gt.createGoal('g');
    expect(gt.getGoalProgress(g.id)).toEqual({
      total: 0, completed: 0, failed: 0, pending: 0, inProgress: 0, percentage: 0,
    });
    const s0 = gt.addSubtask(g.id, 'a');
    const s1 = gt.addSubtask(g.id, 'b');
    const s2 = gt.addSubtask(g.id, 'c');
    const s3 = gt.addSubtask(g.id, 'd');
    gt.updateSubtaskStatus(s0.id, 'completed');
    gt.updateSubtaskStatus(s1.id, 'failed');
    gt.updateSubtaskStatus(s2.id, 'in_progress');
    expect(gt.getGoalProgress(g.id)).toEqual({
      total: 4, completed: 1, failed: 1, pending: 1, inProgress: 1, percentage: 25,
    });
    expect(s3.status).toBe('pending');
  });

  it('getGoalStats: группировка по статусам + total', () => {
    const a = gt.createGoal('a');
    gt.createGoal('b');
    gt.createGoal('c');
    gt.updateGoalStatus(a.id, 'completed');
    expect(gt.getGoalStats()).toEqual({ active: 2, completed: 1, failed: 0, paused: 0, total: 3 });
  });

  it('ЭДЖ: неизвестный status попадает в stats динамическим ключом и в total', () => {
    const g = gt.createGoal('g');
    db.prepare("UPDATE goals SET status = 'weird' WHERE id = ?").run(g.id);
    const stats = gt.getGoalStats() as unknown as Record<string, number>;
    expect(stats.weird).toBe(1);
    expect(stats.total).toBe(1);
    expect(stats.active).toBe(0);
  });
});

