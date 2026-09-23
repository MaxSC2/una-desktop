import { getDb } from '../memory/store';

export interface SubGoal {
  description: string;
  status: 'pending' | 'in_progress' | 'done';
}

export interface Goal {
  id: number;
  description: string;
  subgoals: SubGoal[];
  status: 'active' | 'interrupted' | 'completed' | 'cancelled';
  progress: number;
  context_snapshot: string | null;
  created_at: string;
  updated_at: string;
}

export function createGoal(description: string, subgoals: string[]): Goal {
  const db = getDb();
  if (!db) throw new Error('No database');

  const subgoalObjs: SubGoal[] = subgoals.map((s) => ({ description: s, status: 'pending' }));
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO goals (description, subgoals, status, progress, context_snapshot, created_at, updated_at)
    VALUES (?, ?, 'active', 0, NULL, ?, ?)
  `).run(description, JSON.stringify(subgoalObjs), now, now);

  return {
    id: result.lastInsertRowid as number,
    description,
    subgoals: subgoalObjs,
    status: 'active',
    progress: 0,
    context_snapshot: null,
    created_at: now,
    updated_at: now,
  };
}

export function getActiveGoals(): Goal[] {
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare(
    `SELECT * FROM goals WHERE status IN ('active', 'interrupted') ORDER BY created_at DESC LIMIT 10`
  ).all() as Array<Record<string, unknown>>;

  return rows.map(parseGoal);
}

export function getAllGoals(): Goal[] {
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare(
    `SELECT * FROM goals ORDER BY created_at DESC LIMIT 50`
  ).all() as Array<Record<string, unknown>>;

  return rows.map(parseGoal);
}

export function getGoalById(id: number): Goal | null {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare(`SELECT * FROM goals WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? parseGoal(row) : null;
}

export function updateSubgoalStatus(goalId: number, index: number, status: SubGoal['status']): void {
  const db = getDb();
  if (!db) return;

  const goal = getGoalById(goalId);
  if (!goal) return;

  if (index < 0 || index >= goal.subgoals.length) return;

  goal.subgoals[index].status = status;
  const doneCount = goal.subgoals.filter((s) => s.status === 'done').length;
  goal.progress = Math.round((doneCount / goal.subgoals.length) * 100);

  if (goal.progress === 100) {
    goal.status = 'completed';
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE goals SET subgoals = ?, status = ?, progress = ?, updated_at = ? WHERE id = ?
  `).run(JSON.stringify(goal.subgoals), goal.status, goal.progress, now, goalId);
}

export function interruptGoal(goalId: number, contextSnapshot?: string): void {
  const db = getDb();
  if (!db) return;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE goals SET status = 'interrupted', context_snapshot = ?, updated_at = ? WHERE id = ?
  `).run(contextSnapshot ?? null, now, goalId);
}

export function resumeGoal(goalId: number): Goal | null {
  const db = getDb();
  if (!db) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE goals SET status = 'active', context_snapshot = NULL, updated_at = ? WHERE id = ? AND status = 'interrupted'
  `).run(now, goalId);

  return getGoalById(goalId);
}

export function completeGoal(goalId: number): void {
  const db = getDb();
  if (!db) return;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE goals SET status = 'completed', progress = 100, updated_at = ? WHERE id = ?
  `).run(now, goalId);
}

export function cancelGoal(goalId: number): void {
  const db = getDb();
  if (!db) return;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE goals SET status = 'cancelled', updated_at = ? WHERE id = ?
  `).run(now, goalId);
}

export function deleteGoal(goalId: number): void {
  const db = getDb();
  if (!db) return;
  db.prepare(`DELETE FROM goals WHERE id = ?`).run(goalId);
}

export function formatGoalsForPrompt(): string {
  const goals = getActiveGoals();
  if (goals.length === 0) return '';

  const parts = goals.map((g, i) => {
    const sub = g.subgoals
      .map((s, j) => {
        const icon = s.status === 'done' ? '[✓]' : s.status === 'in_progress' ? '[→]' : '[ ]';
        return `  ${icon} ${s.description}`;
      })
      .join('\n');
    const statusLabel =
      g.status === 'interrupted' ? ' (приостановлена)' : '';
    return `Цель ${i + 1}: ${g.description}${statusLabel} [${g.progress}%]\n${sub}`;
  });

  return `\n\n# Текущие цели\n${parts.join('\n\n')}\n\nИспользуй [GOAL] create:описание | шаг1, шаг2, шаг3 для создания новой цели. Используй [GOAL] done:N:M для отметки подшага выполненным.`;
}

export function parseGoalToken(token: string): { action: string; goalId?: number; subIndex?: number; description?: string; subgoals?: string[] } | null {
  const createMatch = token.match(/^\[GOAL\]\s+create:\s*(.+?)\s*\|\s*(.+)$/);
  if (createMatch) {
    const description = createMatch[1].trim();
    const subgoalsStr = createMatch[2]?.trim();
    const subgoals = subgoalsStr ? subgoalsStr.split(',').map((s) => s.trim()) : [];
    return { action: 'create', description, subgoals };
  }

  const doneMatch = token.match(/^\[GOAL\]\s+done:\s*(\d+)\s*:\s*(\d+)$/);
  if (doneMatch) {
    return { action: 'update', goalId: parseInt(doneMatch[1], 10), subIndex: parseInt(doneMatch[2], 10) };
  }

  const cancelMatch = token.match(/^\[GOAL\]\s+cancel:\s*(\d+)$/);
  if (cancelMatch) {
    return { action: 'cancel', goalId: parseInt(cancelMatch[1], 10) };
  }

  return null;
}

function parseGoal(row: Record<string, unknown>): Goal {
  return {
    id: row.id as number,
    description: row.description as string,
    subgoals: JSON.parse(row.subgoals as string) as SubGoal[],
    status: row.status as Goal['status'],
    progress: row.progress as number,
    context_snapshot: row.context_snapshot as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
