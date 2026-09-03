/**
 * Система памяти U.N.A. — 5 уровней.
 *
 * 1. WORKING — последние сообщения в контексте LLM (in-memory, обрезается до N сообщений)
 * 2. SESSION — текущая задача, активные файлы, недавние действия (in-memory + SQLite)
 * 3. EPISODIC — история всех диалогов (SQLite, индекс по времени)
 * 4. SEMANTIC — факты о пользователе/проектах с векторными embeddings (SQLite + cosine)
 * 5. PROCEDURAL — усвоенные шаблоны, предпочтения (SQLite, JSON)
 *
 * Для embeddings используем Ollama /api/embed (нейронные через qwen3:4b).
 * Fallback — hashing trick (без внешних зависимостей, работает всегда).
 *
 * Структура БД (SQLite):
 * - conversations: id, started_at, summary
 * - messages: id, conversation_id, role, content, tool_calls, timestamp
 * - facts: id, category, content, embedding (BLOB), created_at, last_used, use_count
 * - patterns: id, trigger, action, success_count, fail_count
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import { getMemoryConfig } from '../ai/config';
import { embed } from '../ai/embed';
import { classifyToPod } from './pods';
import { autoLinkFacts } from './knowledge-graph';

let db: Database.Database | null = null;

export function getDb(): Database.Database | null {
  return db;
}

export interface Fact {
  id?: number;
  category: 'user' | 'project' | 'preference' | 'task' | 'self_review' | 'goal';
  content: string;
  embedding?: Float32Array;
  created_at?: string;
  last_used?: string | null;
  use_count?: number;
  pod_id?: number;
}

export interface Pod {
  id?: number;
  name: string;
  description: string;
  embedding?: Buffer;
  created_at?: string;
  last_used?: string | null;
  use_count?: number;
}

export interface Message {
  id?: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: string; // JSON
  timestamp: string;
}

// Memory config is now managed by unified config store (electron/ai/config.ts)

/**
 * Инициализация БД. Вызывается из main.ts при старте.
 */
export function initMemory(): void {
  if (db) return;

  const dbPath = path.join(app.getPath('userData'), 'una-memory.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      created_at TEXT NOT NULL,
      last_used TEXT,
      use_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger TEXT NOT NULL,
      action TEXT NOT NULL,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      last_used TEXT
    );

    CREATE TABLE IF NOT EXISTS emotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      emotion TEXT NOT NULL,
      trigger TEXT,
      intensity REAL DEFAULT 0.5,
      message_preview TEXT,
      conversation_id INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_emotions_time ON emotions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_emotions_type ON emotions(emotion);
    CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
    CREATE INDEX IF NOT EXISTS idx_facts_content ON facts(content);

    -- Knowledge Graph: relations between facts
    CREATE TABLE IF NOT EXISTS fact_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL REFERENCES facts(id),
      to_id INTEGER NOT NULL REFERENCES facts(id),
      relation TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      created_at TEXT NOT NULL,
      UNIQUE(from_id, to_id, relation)
    );

    CREATE INDEX IF NOT EXISTS idx_relations_from ON fact_relations(from_id);
    CREATE INDEX IF NOT EXISTS idx_relations_to ON fact_relations(to_id);
    CREATE INDEX IF NOT EXISTS idx_relations_type ON fact_relations(relation);

    -- Memory Pods
    CREATE TABLE IF NOT EXISTS memory_pods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      embedding BLOB,
      created_at TEXT NOT NULL,
      last_used TEXT,
      use_count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_pods_name ON memory_pods(name);
    CREATE INDEX IF NOT EXISTS idx_pods_last_used ON memory_pods(last_used);

    -- FTS5 index for full-text search on facts content.
    -- ВАЖНО: external-content таблица (content='facts') — только в этом режиме
    -- допустима FTS5-команда 'delete' в триггерах. На обычной FTS5-таблице
    -- любой UPDATE/DELETE на facts вызывал "SQL logic error".
    CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
      content,
      content='facts',
      content_rowid='id',
      tokenize='unicode61'
    );

    -- Sync triggers for FTS5
    CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
      INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
    END;

    -- Executive Manager goals
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      subgoals TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      progress REAL NOT NULL DEFAULT 0,
      context_snapshot TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
  `);

  // One-time rebuild of FTS from existing rows (safe to run multiple times)
  try {
    db.exec(`INSERT INTO facts_fts(facts_fts) VALUES('rebuild')`);
  } catch { /* already populated */ }

  // Migration: старые БД имеют facts_fts как ОБЫЧНУЮ FTS5-таблицу (без content='facts').
  // В таком режиме триггеры с FTS5-командой 'delete' вызывают "SQL logic error".
  // Пересоздаём как external-content таблицу и перестраиваем индекс.
  try {
    const ftsSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='facts_fts'`).get() as { sql?: string } | undefined)?.sql ?? '';
    if (ftsSql.length > 0 && !ftsSql.includes(`content='facts'`) && !ftsSql.includes(`content="facts"`)) {
      db.exec(`DROP TABLE facts_fts`);
      db.exec(`CREATE VIRTUAL TABLE facts_fts USING fts5(content, content='facts', content_rowid='id', tokenize='unicode61')`);
      db.exec(`INSERT INTO facts_fts(facts_fts) VALUES('rebuild')`);
      console.log('[Memory] Migrated facts_fts to external-content FTS5 table');
    }
  } catch (e) {
    console.warn('[Memory] FTS migration failed:', e);
  }

  // Pod schema migration: add pod_id column to facts
  try {
    db.exec(`ALTER TABLE facts ADD COLUMN pod_id INTEGER REFERENCES memory_pods(id)`);
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_pod ON facts(pod_id)`);
  } catch { /* already exists */ }

  // Seed default pods
  const defaultPods: Array<{ name: string; description: string }> = [
    { name: 'profile', description: 'Личные данные пользователя: имя, возраст, профессия, контакты, биография' },
    { name: 'project', description: 'Информация о проектах: репозитории, технологии, задачи, сроки' },
    { name: 'preference', description: 'Предпочтения пользователя: стиль общения, любимые технологии, привычки' },
    { name: 'emotion', description: 'Эмоциональный контекст: настроение, триггеры, эмоциональные реакции' },
    { name: 'work', description: 'Рабочий контекст: текущие задачи, код, файлы, команды, дедлайны' },
    { name: 'general', description: 'Общие факты, не подходящие под другие категории' },
  ];
  const now = new Date().toISOString();
  const insertPod = db.prepare(
    `INSERT OR IGNORE INTO memory_pods (name, description, created_at) VALUES (?, ?, ?)`
  );
  for (const pod of defaultPods) {
    insertPod.run(pod.name, pod.description, now);
  }

  // Migrate existing facts with NULL pod_id to 'general' pod
  const generalPod = db.prepare(`SELECT id FROM memory_pods WHERE name = 'general'`).get() as { id: number } | undefined;
  if (generalPod) {
    db.prepare(`UPDATE facts SET pod_id = ? WHERE pod_id IS NULL`).run(generalPod.id);
  }
}

// ============================================================
// MEMORY PODS — модульные контейнеры памяти
// ============================================================

export function createPod(name: string, description: string): number {
  if (!db) throw new Error('Memory not initialized');
  const result = db.prepare(
    `INSERT INTO memory_pods (name, description, created_at) VALUES (?, ?, ?)`
  ).run(name, description, new Date().toISOString());
  return result.lastInsertRowid as number;
}

export function listPods(): Array<Pod & { factCount: number }> {
  if (!db) return [];
  return db.prepare(`
    SELECT p.*, COALESCE(f.cnt, 0) as factCount
    FROM memory_pods p
    LEFT JOIN (SELECT pod_id, COUNT(*) as cnt FROM facts GROUP BY pod_id) f ON f.pod_id = p.id
    ORDER BY p.use_count DESC, p.last_used DESC
  `).all() as Array<Pod & { factCount: number }>;
}

export function getPod(id: number): Pod | null {
  if (!db) return null;
  return (db.prepare(`SELECT * FROM memory_pods WHERE id = ?`).get(id) as Pod | undefined) ?? null;
}

export function getPodByName(name: string): Pod | null {
  if (!db) return null;
  return (db.prepare(`SELECT * FROM memory_pods WHERE name = ?`).get(name) as Pod | undefined) ?? null;
}

export function deletePod(id: number): void {
  if (!db) return;
  const generalPod = db.prepare(`SELECT id FROM memory_pods WHERE name = 'general'`).get() as { id: number } | undefined;
  if (generalPod) {
    db.prepare(`UPDATE facts SET pod_id = ? WHERE pod_id = ?`).run(generalPod.id, id);
  }
  db.prepare(`DELETE FROM memory_pods WHERE id = ?`).run(id);
}

export function incrementPodUse(podId: number): void {
  if (!db) return;
  db.prepare(`UPDATE memory_pods SET use_count = use_count + 1, last_used = ? WHERE id = ?`).run(
    new Date().toISOString(),
    podId,
  );
}

// ============================================================
// EMOTIONAL MEMORY — эмоциональная память
// ============================================================

export interface EmotionRecord {
  id?: number;
  timestamp: string;
  emotion: string;
  trigger?: string | null;
  intensity: number;
  message_preview?: string | null;
  conversation_id?: number | null;
}

/**
 * Сохранить эмоцию пользователя.
 */
export function saveEmotion(record: Omit<EmotionRecord, 'id'>): void {
  if (!db) throw new Error('Memory not initialized');
  db.prepare(
    `INSERT INTO emotions (timestamp, emotion, trigger, intensity, message_preview, conversation_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    record.timestamp,
    record.emotion,
    record.trigger ?? null,
    record.intensity,
    record.message_preview ?? null,
    record.conversation_id ?? null
  );
}

/**
 * Получить эмоции за период.
 */
export function getEmotionsSince(sinceDate: string): EmotionRecord[] {
  if (!db) return [];
  return db
    .prepare('SELECT * FROM emotions WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 500')
    .all(sinceDate) as EmotionRecord[];
}

/**
 * Получить эмоциональную сводку за период.
 */
export function getEmotionSummary(days: number = 7): Array<{ emotion: string; count: number; avg_intensity: number; last_occurrence: string }> {
  if (!db) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db
    .prepare(
      `SELECT emotion, COUNT(*) as count, AVG(intensity) as avg_intensity, MAX(timestamp) as last_occurrence
       FROM emotions
       WHERE timestamp >= ?
       GROUP BY emotion
       ORDER BY count DESC`
    )
    .all(since.toISOString()) as Array<{ emotion: string; count: number; avg_intensity: number; last_occurrence: string }>;
}

/**
 * Получить последнюю эмоцию пользователя.
 */
export function getLastEmotion(): EmotionRecord | null {
  if (!db) return null;
  return (db.prepare('SELECT * FROM emotions ORDER BY timestamp DESC LIMIT 1').get() as EmotionRecord) ?? null;
}

/**
 * Cosine similarity между двумя нормализованными векторами.
 */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // векторы уже нормализованы
}

// ============================================================
// EPISODIC MEMORY — диалоги
// ============================================================

export function startConversation(): number {
  if (!db) throw new Error('Memory not initialized');
  const result = db
    .prepare('INSERT INTO conversations (started_at) VALUES (?)')
    .run(new Date().toISOString());
  return result.lastInsertRowid as number;
}

export function getConversationExists(id: number): boolean {
  if (!db) return false;
  const row = db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(id);
  return !!row;
}

export function endConversation(id: number, summary: string): void {
  if (!db) return;
  db.prepare('UPDATE conversations SET ended_at = ?, summary = ? WHERE id = ?').run(
    new Date().toISOString(),
    summary,
    id
  );
}

// Alias for backwards compatibility
export const endConversationWithSummary = endConversation;

export function saveMessage(msg: Omit<Message, 'id'>): void {
  if (!db) throw new Error('Memory not initialized');
  db.prepare(
    `INSERT INTO messages (conversation_id, role, content, tool_calls, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    msg.conversation_id,
    msg.role,
    msg.content,
    msg.tool_calls ?? null,
    msg.timestamp
  );
}

export function getRecentMessages(conversationId: number, limit = 50): Message[] {
  if (!db) return [];
  return db
    .prepare(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(conversationId, limit)
    .reverse() as Message[];
}

/**
 * Поиск по истории диалогов по ключевому слову.
 */
export function searchEpisodic(query: string, limit = 10): Message[] {
  if (!db) return [];
  return db
    .prepare(
      `SELECT * FROM messages WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?`
    )
    .all(`%${query}%`, limit) as Message[];
}

// ============================================================
// SEMANTIC MEMORY — факты с embeddings
// ============================================================

export async function saveFact(category: Fact['category'], content: string, podId?: number): Promise<void> {
  if (!db) throw new Error('Memory not initialized');
  const embedding = await embed(content);
  const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);

  const resolvedPodId = podId ?? getPodIdByCategory(content);
  const d = db;

  const txn = d.transaction(() => {
    const insertResult = d.prepare(
      `INSERT INTO facts (category, content, embedding, created_at, pod_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(category, content, buf, new Date().toISOString(), resolvedPodId);

    const newId = insertResult.lastInsertRowid as number;
    // Auto-link to related facts in Knowledge Graph
    autoLinkFacts(newId);

    const cfg = getMemoryConfig();
    const count = (d.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }).c;
    if (count > cfg.maxFacts) {
      d.prepare(
        `DELETE FROM facts WHERE id IN (
          SELECT id FROM facts ORDER BY use_count ASC, last_used ASC LIMIT ?
        )`
      ).run(count - cfg.maxFacts);
    }
  });

  txn();
}

/**
 * Extracts significant keywords from a query for FTS5 search.
 */
function ftsKeywords(query: string): string {
  const words = query.toLowerCase().match(/\w{3,}/g) ?? [];
  const stopWords = new Set(['the', 'and', 'for', 'are', 'not', 'but', 'had', 'has', 'was', 'all', 'can', 'you', 'this', 'that', 'with', 'from', 'what', 'your', 'have', 'been', 'were', 'they', 'their', 'which', 'when', 'where', 'how', 'who']);
  const filtered = words.filter((w) => w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w));
  return [...new Set(filtered)].join(' OR ');
}

/**
 * Вспомнить факты по теме (векторный поиск с FTS5 предфильтрацией).
 */
export async function recallFacts(query: string, limit = 5, podId?: number): Promise<Fact[]> {
  if (!db) return [];
  const queryEmbedding = await embed(query);

  // FTS5 pre-filter: get candidate IDs matching query keywords
  const keywords = ftsKeywords(query);
  let candidateIds: number[] = [];
  if (keywords) {
    try {
      const ftsRows = db.prepare(
        `SELECT rowid FROM facts_fts WHERE facts_fts MATCH ? ORDER BY rank LIMIT 200`
      ).all(keywords) as Array<{ rowid: number }>;
      candidateIds = ftsRows.map((r) => r.rowid);
    } catch {
      // FTS5 search failed (e.g. invalid query syntax), fall back to full scan
    }
  }

  let rows: Array<{
    id: number;
    category: string;
    content: string;
    embedding: Buffer;
    created_at: string;
    last_used: string | null;
    use_count: number;
  }>;

  if (candidateIds.length > 0) {
    // Load only candidates from FTS5
    const placeholders = candidateIds.map(() => '?').join(',');
    const params: unknown[] = [...candidateIds];
    let sql = `SELECT * FROM facts WHERE id IN (${placeholders})`;
    if (podId !== undefined) {
      sql += ` AND pod_id = ?`;
      params.push(podId);
    }
    rows = db.prepare(sql).all(...params) as typeof rows;
  } else {
    // Fall back to full scan for short/abstract queries
    let sql: string;
    let params: unknown[];
    if (podId !== undefined) {
      sql = `SELECT * FROM facts WHERE pod_id = ? LIMIT 500`;
      params = [podId];
    } else {
      sql = `SELECT * FROM facts LIMIT 500`;
      params = [];
    }
    rows = db.prepare(sql).all(...params) as typeof rows;
  }

  if (rows.length === 0) return [];

  // Сортируем по cosine similarity
  const scored = rows
    .map((f) => {
      if (!f.embedding) {
        return {
          id: f.id,
          category: f.category as Fact['category'],
          content: f.content,
          created_at: f.created_at,
          last_used: f.last_used,
          use_count: f.use_count,
          score: 0,
        };
      }
      const emb = new Float32Array(f.embedding.buffer, f.embedding.byteOffset, f.embedding.byteLength / 4);
      return {
        id: f.id,
        category: f.category as Fact['category'],
        content: f.content,
        created_at: f.created_at,
        last_used: f.last_used,
        use_count: f.use_count,
        score: cosine(queryEmbedding, emb),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Обновляем last_used и use_count для найденных
  const now = new Date().toISOString();
  for (const f of scored) {
    db.prepare('UPDATE facts SET last_used = ?, use_count = use_count + 1 WHERE id = ?').run(now, f.id);
  }

  return scored;
}

/**
 * Все факты (для UI).
 */
export function listFacts(): Fact[] {
  if (!db) return [];
  return db
    .prepare('SELECT id, category, content, created_at, last_used, use_count FROM facts ORDER BY use_count DESC, last_used DESC')
    .all() as Fact[];
}

export function deleteFact(id: number): void {
  if (!db) return;
  // Синхронизацию FTS выполняет триггер facts_ad (external-content таблица).
  // Ручной `DELETE FROM facts_fts` здесь запрещён для external-content и был бы двойным удалением.
  db.prepare('DELETE FROM facts WHERE id = ?').run(id);
}

// ============================================================
// PROCEDURAL MEMORY — шаблоны
// ============================================================

export function savePattern(trigger: string, action: string): void {
  if (!db) return;
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE patterns SET action = ?, last_used = ? WHERE trigger = ?').run(action, now, trigger);
  if (result.changes === 0) {
    db.prepare('INSERT INTO patterns (trigger, action, last_used) VALUES (?, ?, ?)').run(trigger, action, now);
  }
}

export function findPattern(trigger: string): { action: string } | null {
  if (!db) return null;
  return (db.prepare('SELECT action FROM patterns WHERE trigger = ?').get(trigger) as { action: string } | null) ?? null;
}

// ============================================================
// WORKING MEMORY — контекст для LLM
// ============================================================

export interface WorkingMemory {
  messages: Array<{ role: string; content: string }>;
  sessionContext: {
    activeConversationId: number | null;
    recentFiles: string[];
    currentTask: string | null;
  };
}

/**
 * Готовит контекст для LLM: системный промпт + семантическая память + рабочие сообщения.
 */
export async function buildContext(
  userMessage: string,
  recentMessages: Array<{ role: string; content: string }>
): Promise<{ system: string; messages: Array<{ role: string; content: string }> }> {
  // Вспоминаем релевантные факты
  let facts: Fact[] = [];
  try {
    facts = await recallFacts(userMessage, 5);
  } catch (e) {
    console.error('[Memory] recall failed:', e);
  }

  const factsBlock =
    facts.length > 0
      ? `\n\n# Вспомненные факты о пользователе (используй при необходимости)\n${facts
          .map((f) => `- [${f.category}] ${f.content}`)
          .join('\n')}`
      : '';

  return {
    system: '', // Будет добавлен вызывающим кодом
    messages: [
      ...recentMessages.slice(-getMemoryConfig().maxWorkingMessages),
      { role: 'user', content: userMessage + factsBlock },
    ],
  };
}

/**
 * Run WAL checkpoint to flush WAL into main DB file.
 * Call periodically (e.g. every 5 minutes) to prevent WAL from growing unbounded.
 */
export function walCheckpoint(): void {
  if (!db) return;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (e) {
    console.error('[Memory] WAL checkpoint failed:', e);
  }
}

/**
 * Закрыть БД при выходе.
 */
export function closeMemory(): void {
  if (db) {
    walCheckpoint();
    db.close();
    db = null;
  }
}

// ============================================================
// RLM EXTENSIONS — for memory management
// ============================================================

/**
 * Get top-N facts by use_count (for WARM cache).
 */
export function getTopFacts(n: number = 20): Fact[] {
  if (!db) return [];
  const rows = db
    .prepare('SELECT * FROM facts ORDER BY use_count DESC, last_used DESC LIMIT ?')
    .all(n) as Array<{
    id: number;
    category: string;
    content: string;
    created_at: string;
    last_used: string | null;
    use_count: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    category: r.category as Fact['category'],
    content: r.content,
    created_at: r.created_at,
    last_used: r.last_used,
    use_count: r.use_count,
  }));
}

/**
 * Mark a fact as forgotten (soft delete — sets use_count to -1).
 */
export function markFactForget(factId: number): void {
  if (!db) return;
  db.prepare('UPDATE facts SET use_count = -1 WHERE id = ?').run(factId);
}

/**
 * Set importance level on a fact.
 * Maps: high → use_count +10, medium → +5, low → +1
 */
export function setFactImportance(factId: number, level: 'high' | 'medium' | 'low'): void {
  if (!db) return;
  const boost = level === 'high' ? 10 : level === 'medium' ? 5 : 1;
  db.prepare('UPDATE facts SET use_count = use_count + ? WHERE id = ?').run(boost, factId);
}

/**
 * Get facts by category.
 */
export function getFactsByCategory(category: Fact['category']): Fact[] {
  if (!db) return [];
  const rows = db
    .prepare('SELECT * FROM facts WHERE category = ? ORDER BY use_count DESC')
    .all(category) as Array<{
    id: number;
    category: string;
    content: string;
    created_at: string;
    last_used: string | null;
    use_count: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    category: r.category as Fact['category'],
    content: r.content,
    created_at: r.created_at,
    last_used: r.last_used,
    use_count: r.use_count,
  }));
}

/**
 * Increment use_count when a fact is recalled (reinforces importance).
 */
/**
 * Auto-classify content to a pod and return its ID.
 */
function getPodIdByCategory(content: string): number | null {
  if (!db) return null;
  const d = db;
  const podName = classifyToPod(content);
  const pod = d.prepare(`SELECT id FROM memory_pods WHERE name = ?`).get(podName) as { id: number } | undefined;
  return pod?.id ?? null;
}

export function incrementFactUse(factId: number): void {
  if (!db) return;
  db.prepare('UPDATE facts SET use_count = use_count + 1, last_used = ? WHERE id = ?').run(
    new Date().toISOString(),
    factId
  );
}
