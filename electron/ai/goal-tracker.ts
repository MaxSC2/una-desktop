/**
 * Goal Tracker — SQLite-backed tracking активных целей пользователя.
 *
 * Цель = высокоуровневая задача, разбитая на подзадачи (subtasks).
 * Используется Autonomous Loop для отслеживания прогресса.
 *
 * Схема:
 *  - goals: id, description, status, priority, deadline, created_at, updated_at
 *  - subtasks: id, goal_id, description, status, order_idx
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

let db: Database.Database | null = null;

export interface Goal {
  id: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  deadline?: string | null;
  context?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
}

export interface Subtask {
  id: string;
  goal_id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  order_idx: number;
  result?: string | null;
  created_at: string;
  updated_at: string;
}

export function initGoalTracker(database: Database.Database): void {
  db = database;

  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      priority TEXT NOT NULL DEFAULT 'medium',
      deadline TEXT,
      context TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      order_idx INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_subtasks_goal_id ON subtasks(goal_id);
    CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
  `);

  console.log('[GoalTracker] Initialized');
}

// ============================================================
// GOALS CRUD
// ============================================================

export function createGoal(
  description: string,
  options: {
    priority?: Goal['priority'];
    deadline?: string;
    context?: Record<string, unknown>;
  } = {}
): Goal {
  if (!db) throw new Error('GoalTracker not initialized');

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO goals (id, description, status, priority, deadline, context, created_at, updated_at)
    VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
  `).run(
    id,
    description,
    options.priority ?? 'medium',
    options.deadline ?? null,
    options.context ? JSON.stringify(options.context) : null,
    now,
    now
  );

  return getGoal(id)!;
}

export function getGoal(id: string): Goal | null {
  if (!db) throw new Error('GoalTracker not initialized');

  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as any;
  if (!row) return null;

  const subtasks = db
    .prepare('SELECT * FROM subtasks WHERE goal_id = ? ORDER BY order_idx')
    .all(id) as any[];

  return {
    ...row,
    priority: row.priority as Goal['priority'],
    status: row.status as Goal['status'],
    context: row.context ? JSON.parse(row.context) : null,
    deadline: row.deadline,
    subtasks: subtasks.map((s) => ({
      ...s,
      status: s.status as Subtask['status'],
    })),
  };
}

export function getActiveGoals(): Goal[] {
  if (!db) throw new Error('GoalTracker not initialized');

  const rows = db.prepare("SELECT * FROM goals WHERE status = 'active' ORDER BY created_at DESC").all() as any[];
  return rows.map((row) => getGoal(row.id)!).filter(Boolean);
}

export function updateGoalStatus(id: string, status: Goal['status']): void {
  if (!db) throw new Error('GoalTracker not initialized');

  db.prepare('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    new Date().toISOString(),
    id
  );
}

export function deleteGoal(id: string): void {
  if (!db) throw new Error('GoalTracker not initialized');
  db.prepare('DELETE FROM goals WHERE id = ?').run(id);
}

// ============================================================
// SUBTASKS CRUD
// ============================================================

export function addSubtask(goalId: string, description: string, orderIdx?: number): Subtask {
  if (!db) throw new Error('GoalTracker not initialized');

  const id = randomUUID();
  const now = new Date().toISOString();

  // Если orderIdx не указан — ставим в конец
  let order = orderIdx;
  if (order === undefined) {
    const maxOrder = db
      .prepare('SELECT MAX(order_idx) as max FROM subtasks WHERE goal_id = ?')
      .get(goalId) as any;
    order = (maxOrder?.max ?? -1) + 1;
  }

  db.prepare(`
    INSERT INTO subtasks (id, goal_id, description, status, order_idx, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)
  `).run(id, goalId, description, order, now, now);

  return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as any;
}

export function updateSubtaskStatus(
  subtaskId: string,
  status: Subtask['status'],
  result?: string
): void {
  if (!db) throw new Error('GoalTracker not initialized');

  db.prepare('UPDATE subtasks SET status = ?, result = ?, updated_at = ? WHERE id = ?').run(
    status,
    result ?? null,
    new Date().toISOString(),
    subtaskId
  );
}

export function getNextSubtask(goalId: string): Subtask | null {
  if (!db) throw new Error('GoalTracker not initialized');

  const row = db
    .prepare(
      "SELECT * FROM subtasks WHERE goal_id = ? AND status = 'pending' ORDER BY order_idx LIMIT 1"
    )
    .get(goalId) as any;

  if (!row) return null;
  return { ...row, status: row.status as Subtask['status'] };
}

// ============================================================
// GOAL PROGRESS
// ============================================================

export function getGoalProgress(goalId: string): {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  inProgress: number;
  percentage: number;
} {
  if (!db) throw new Error('GoalTracker not initialized');

  const subtasks = db
    .prepare('SELECT status FROM subtasks WHERE goal_id = ?')
    .all(goalId) as Array<{ status: string }>;

  const total = subtasks.length;
  const completed = subtasks.filter((s) => s.status === 'completed').length;
  const failed = subtasks.filter((s) => s.status === 'failed').length;
  const pending = subtasks.filter((s) => s.status === 'pending').length;
  const inProgress = subtasks.filter((s) => s.status === 'in_progress').length;

  return {
    total,
    completed,
    failed,
    pending,
    inProgress,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

// ============================================================
// STATISTICS
// ============================================================

export function getGoalStats(): {
  active: number;
  completed: number;
  failed: number;
  paused: number;
  total: number;
} {
  if (!db) throw new Error('GoalTracker not initialized');

  const rows = db
    .prepare('SELECT status, COUNT(*) as count FROM goals GROUP BY status')
    .all() as Array<{ status: string; count: number }>;

  const stats = {
    active: 0,
    completed: 0,
    failed: 0,
    paused: 0,
    total: 0,
  };

  for (const row of rows) {
    stats[row.status as keyof typeof stats] = row.count;
    stats.total += row.count;
  }

  return stats;
}
