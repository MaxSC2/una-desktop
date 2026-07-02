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

let db: Database.Database | null = null;

export function getDb(): Database.Database | null {
  return db;
}

export interface Fact {
  id?: number;
  category: 'user' | 'project' | 'preference' | 'task';
  content: string;
  embedding?: Float32Array;
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
  `);
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

export async function saveFact(category: Fact['category'], content: string): Promise<void> {
  if (!db) throw new Error('Memory not initialized');
  const embedding = await embed(content);
  const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);

  db.prepare(
    `INSERT INTO facts (category, content, embedding, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(category, content, buf, new Date().toISOString());

  // Чистим старые, если превышаем лимит
  const cfg = getMemoryConfig();
  const count = (db.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }).c;
  if (count > cfg.maxFacts) {
    db.prepare(
      `DELETE FROM facts WHERE id IN (
        SELECT id FROM facts ORDER BY use_count ASC, last_used ASC LIMIT ?
      )`
    ).run(count - cfg.maxFacts);
  }
}

/**
 * Вспомнить факты по теме (векторный поиск).
 */
export async function recallFacts(query: string, limit = 5): Promise<Fact[]> {
  if (!db) return [];
  const queryEmbedding = await embed(query);

  const all = db.prepare('SELECT * FROM facts').all() as Array<{
    id: number;
    category: string;
    content: string;
    embedding: Buffer;
    created_at: string;
    last_used: string | null;
    use_count: number;
  }>;

  if (all.length === 0) return [];

  // Сортируем по cosine similarity
  const scored = all
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
  db.prepare('DELETE FROM facts WHERE id = ?').run(id);
}

// ============================================================
// PROCEDURAL MEMORY — шаблоны
// ============================================================

export function savePattern(trigger: string, action: string): void {
  if (!db) return;
  db.prepare(
    `INSERT INTO patterns (trigger, action, last_used) VALUES (?, ?, ?)
     ON CONFLICT(trigger) DO UPDATE SET action = excluded.action, last_used = excluded.last_used`
  ).run(trigger, action, new Date().toISOString());
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
 * Закрыть БД при выходе.
 */
export function closeMemory(): void {
  if (db) {
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
export function incrementFactUse(factId: number): void {
  if (!db) return;
  db.prepare('UPDATE facts SET use_count = use_count + 1, last_used = ? WHERE id = ?').run(
    new Date().toISOString(),
    factId
  );
}
