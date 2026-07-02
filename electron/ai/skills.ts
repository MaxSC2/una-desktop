/**
 * Skills System — динамическое создание навыков.
 *
 * Skill = "триггер + план действий + инструменты"
 * Пример: skill "commit_changes" — триггер "закоммитить", план [git status, git diff, git add, git commit], инструменты [execute_command, ask_clarification]
 *
 * LLM может создавать новые skills на лету (с разрешения пользователя).
 * Skills сохраняются в SQLite и переиспользуются.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { dispatchTool, ToolContext } from '../tools';

let db: Database.Database | null = null;

export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger_pattern: string; // regex или ключевое слово
  trigger_examples: string[]; // примеры запросов
  plan: SkillStep[]; // последовательность шагов
  allowed_tools: string[];
  success_count: number;
  failure_count: number;
  last_used: string | null;
  created_at: string;
  updated_at: string;
  approved: boolean; // пользователь подтвердил использование
  source: 'manual' | 'auto_created' | 'imported';
}

export interface SkillStep {
  description: string;
  tool: string;
  args_template: Record<string, string>; // шаблон с плейсхолдерами {{user_input}}, {{prev_result}}
  optional: boolean;
}

export interface SkillExecutionResult {
  skillId: string;
  success: boolean;
  stepsCompleted: number;
  stepsTotal: number;
  results: Array<{ step: SkillStep; result: unknown; success: boolean; error?: string }>;
  finalMessage: string;
  durationMs: number;
}

// ============================================================
// INIT
// ============================================================

export function initSkillsSystem(database: Database.Database): void {
  db = database;

  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      trigger_pattern TEXT NOT NULL,
      trigger_examples TEXT NOT NULL,
      plan TEXT NOT NULL,
      allowed_tools TEXT NOT NULL,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_used TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
    CREATE INDEX IF NOT EXISTS idx_skills_approved ON skills(approved);
  `);

  console.log('[Skills] Initialized');
}

// ============================================================
// CRUD
// ============================================================

export function createSkill(
  skill: Omit<Skill, 'id' | 'success_count' | 'failure_count' | 'last_used' | 'created_at' | 'updated_at'>
): Skill {
  if (!db) throw new Error('SkillsSystem not initialized');

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO skills (id, name, description, trigger_pattern, trigger_examples, plan, allowed_tools, created_at, updated_at, approved, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    skill.name,
    skill.description,
    skill.trigger_pattern,
    JSON.stringify(skill.trigger_examples),
    JSON.stringify(skill.plan),
    JSON.stringify(skill.allowed_tools),
    now,
    now,
    skill.approved ? 1 : 0,
    skill.source
  );

  return getSkill(id)!;
}

export function getSkill(id: string): Skill | null {
  if (!db) throw new Error('SkillsSystem not initialized');

  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as any;
  if (!row) return null;

  return {
    ...row,
    trigger_examples: JSON.parse(row.trigger_examples),
    plan: JSON.parse(row.plan),
    allowed_tools: JSON.parse(row.allowed_tools),
    success_count: row.success_count,
    failure_count: row.failure_count,
    last_used: row.last_used,
    approved: Boolean(row.approved),
    source: row.source,
  };
}

export function getSkillByName(name: string): Skill | null {
  if (!db) throw new Error('SkillsSystem not initialized');

  const row = db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
  if (!row) return null;

  return getSkill(row.id);
}

export function listSkills(includeUnapproved: boolean = false): Skill[] {
  if (!db) throw new Error('SkillsSystem not initialized');

  const query = includeUnapproved
    ? 'SELECT * FROM skills ORDER BY success_count DESC, name'
    : 'SELECT * FROM skills WHERE approved = 1 ORDER BY success_count DESC, name';

  const rows = db.prepare(query).all() as any[];
  return rows.map((row) => getSkill(row.id)!).filter(Boolean);
}

export function deleteSkill(id: string): void {
  if (!db) throw new Error('SkillsSystem not initialized');
  db.prepare('DELETE FROM skills WHERE id = ?').run(id);
}

export function approveSkill(id: string): void {
  if (!db) throw new Error('SkillsSystem not initialized');
  db.prepare('UPDATE skills SET approved = 1, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  );
}

// ============================================================
// MATCHING
// ============================================================

/**
 * Ищет skill, соответствующий запросу пользователя.
 */
export function findMatchingSkill(userInput: string): Skill | null {
  if (!db) throw new Error('SkillsSystem not initialized');

  const skills = listSkills(false); // только approved

  for (const skill of skills) {
    // Проверяем trigger_pattern (regex)
    try {
      const pattern = new RegExp(skill.trigger_pattern, 'i');
      if (pattern.test(userInput)) {
        return skill;
      }
    } catch {
      // невалидный regex — пропускаем
    }

    // Проверяем trigger_examples (точное совпадение или подстрока)
    for (const example of skill.trigger_examples) {
      if (userInput.toLowerCase().includes(example.toLowerCase())) {
        return skill;
      }
    }
  }

  return null;
}

// ============================================================
// EXECUTION
// ============================================================

/**
 * Выполняет skill — последовательно вызывает инструменты.
 */
export async function executeSkill(
  skill: Skill,
  userInput: string,
  toolContext: ToolContext
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  const results: SkillExecutionResult['results'] = [];
  let stepsCompleted = 0;

  for (const step of skill.plan) {
    try {
      // Подставляем плейсхолдеры в args
      const args = substitutePlaceholders(step.args_template, {
        user_input: userInput,
        prev_result: results.length > 0 ? JSON.stringify(results[results.length - 1].result) : '',
      });

      // Проверяем, что tool разрешён
      if (!skill.allowed_tools.includes(step.tool)) {
        throw new Error(`Tool ${step.tool} not allowed for skill ${skill.name}`);
      }

      // Вызываем tool
      const result = await dispatchTool(step.tool, args, toolContext);
      const success = result.success;

      results.push({ step, result, success, error: result.error });
      if (success) stepsCompleted++;
      else if (!step.optional) {
        // Обязательный шаг провалился — останавливаемся
        break;
      }
    } catch (e) {
      results.push({
        step,
        result: null,
        success: false,
        error: (e as Error).message,
      });
      if (!step.optional) break;
    }
  }

  // Обновляем статистику skill
  const success = stepsCompleted === skill.plan.length;
  updateSkillStats(skill.id, success);

  return {
    skillId: skill.id,
    success,
    stepsCompleted,
    stepsTotal: skill.plan.length,
    results,
    finalMessage: success
      ? `Skill "${skill.name}" выполнен успешно (${stepsCompleted}/${skill.plan.length} шагов)`
      : `Skill "${skill.name}" выполнен частично (${stepsCompleted}/${skill.plan.length} шагов)`,
    durationMs: Date.now() - startTime,
  };
}

function substitutePlaceholders(
  template: Record<string, string>,
  values: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(template)) {
    if (typeof value === 'string') {
      result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? '');
    } else {
      result[key] = value;
    }
  }

  return result;
}

function updateSkillStats(skillId: string, success: boolean): void {
  if (!db) return;

  const now = new Date().toISOString();
  if (success) {
    db.prepare(
      'UPDATE skills SET success_count = success_count + 1, last_used = ?, updated_at = ? WHERE id = ?'
    ).run(now, now, skillId);
  } else {
    db.prepare(
      'UPDATE skills SET failure_count = failure_count + 1, last_used = ?, updated_at = ? WHERE id = ?'
    ).run(now, now, skillId);
  }
}

// ============================================================
// STATISTICS
// ============================================================

export function getSkillsStats(): {
  total: number;
  approved: number;
  totalSuccess: number;
  totalFailure: number;
  avgSuccessRate: number;
} {
  if (!db) throw new Error('SkillsSystem not initialized');

  const row = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN approved = 1 THEN 1 ELSE 0 END) as approved,
        SUM(success_count) as total_success,
        SUM(failure_count) as total_failure
      FROM skills`
    )
    .get() as any;

  const totalSuccess = row?.total_success ?? 0;
  const totalFailure = row?.total_failure ?? 0;
  const total = totalSuccess + totalFailure;

  return {
    total: row?.total ?? 0,
    approved: row?.approved ?? 0,
    totalSuccess,
    totalFailure,
    avgSuccessRate: total > 0 ? Math.round((totalSuccess / total) * 100) : 0,
  };
}
