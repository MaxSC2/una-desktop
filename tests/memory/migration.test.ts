/**
 * P1-1 — Миграционные тесты M6 (Phase 1 / Pass 1 remainder).
 * Scope: docs/research/phase-1-scope.md
 *
 * Rollback прод-БД при битой миграции: закрыть приложение, восстановить
 * файлы una-memory.db* из бэкапа поверх userData, запустить снова.
 * initMemory идемпотентен — уже-мигрированную БД не трогает.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import Database from 'better-sqlite3';

const fileTestDir = path.join(os.tmpdir(), 'una-mig-test-' + Date.now());
const userDataDir = path.join(fileTestDir, 'userData');
const dbFile = path.join(userDataDir, 'una-memory.db');

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataDir) },
}));

vi.mock('../../electron/ai/embed', () => ({
  embed: vi.fn(async () => new Float32Array([0.1, 0.2, 0.3, 0.4])),
}));

async function getStore() {
  return await import('../../electron/memory/store');
}
type Store = Awaited<ReturnType<typeof getStore>>;

/** Старая БД: facts без M6-колонок + facts_fts как ОБЫЧНАЯ FTS5-таблица (до v30-фикса). */
function createLegacyDb(): void {
  fs.mkdirSync(userDataDir, { recursive: true });
  const legacy = new Database(dbFile);
  legacy.exec(`
    CREATE TABLE facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      created_at TEXT NOT NULL,
      last_used TEXT,
      use_count INTEGER DEFAULT 0
    );
    CREATE VIRTUAL TABLE facts_fts USING fts5(content, tokenize='unicode61');
  `);
  const now = new Date().toISOString();
  const ins = legacy.prepare(
    'INSERT INTO facts (category, content, created_at, last_used, use_count) VALUES (?, ?, ?, ?, ?)'
  );
  const r1 = ins.run('user', 'Пользователя зовут Алекс', now, now, 3);
  const r2 = ins.run('project', 'Старый проект Зулу на паузе', now, null, 0);
  const fts = legacy.prepare('INSERT INTO facts_fts(rowid, content) VALUES (?, ?)');
  fts.run(r1.lastInsertRowid, 'Пользователя зовут Алекс');
  fts.run(r2.lastInsertRowid, 'Старый проект Зулу на паузе');
  legacy.close();
}

function ftsMatch(db: NonNullable<ReturnType<Store['getDb']>>, term: string): number[] {
  const rows = db
    .prepare('SELECT rowid FROM facts_fts WHERE facts_fts MATCH ?')
    .all(term) as Array<{ rowid: number }>;
  return rows.map((r) => r.rowid);
}



describe('P1-1 — миграция M6', () => {
  let store: Store;

  beforeEach(async () => {
    fs.mkdirSync(userDataDir, { recursive: true });
    store = await getStore();
  });

  afterEach(() => {
    try { store.closeMemory(); } catch { /* noop */ }
    fs.rmSync(fileTestDir, { recursive: true, force: true });
  });

  it('fresh: создаёт таблицы, external-content FTS и триггеры', () => {
    store.initMemory();
    const db = store.getDb()!;
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
    ).map((t) => t.name);
    for (const t of ['facts', 'facts_fts', 'memory_candidates', 'goals']) expect(names).toContain(t);
    const ftsSql = (
      db.prepare("SELECT sql FROM sqlite_master WHERE name='facts_fts'").get() as { sql: string }
    ).sql;
    expect(ftsSql).toContain("content='facts'");
    const triggers = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as Array<{ name: string }>
    ).map((t) => t.name);
    expect(triggers).toEqual(expect.arrayContaining(['facts_ai', 'facts_ad', 'facts_au']));
  });

  it('legacy: апгрейд сохраняет старые факты и добавляет M6-колонки', async () => {
    createLegacyDb();
    store.initMemory();
    const contents = store.listFacts().map((f) => f.content);
    expect(contents).toEqual(expect.arrayContaining(['Пользователя зовут Алекс', 'Старый проект Зулу на паузе']));
    const cols = (store.getDb()!.prepare('PRAGMA table_info(facts)').all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    for (const c of ['importance', 'origin', 'pinned', 'graph_synced_at', 'provenance_json']) {
      expect(cols).toContain(c);
    }
    const row = store.getDb()!.prepare('SELECT use_count FROM facts WHERE content = ?').get(
      'Пользователя зовут Алекс'
    ) as { use_count: number };
    expect(row.use_count).toBe(3);
    expect(ftsMatch(store.getDb()!, 'Алекс').length).toBeGreaterThanOrEqual(1);
    expect(ftsMatch(store.getDb()!, 'Зулу').length).toBeGreaterThanOrEqual(1);
    await store.saveFact('user', 'Новый факт после миграции 42');
    expect(store.listFacts()).toHaveLength(3);
  });

  it('legacy: удаление мигрированного факта не роняет FTS (регрессия v30)', () => {
    createLegacyDb();
    store.initMemory();
    const id = store.listFacts().find((f) => f.content.includes('Зулу'))!.id!;
    expect(() => store.deleteFact(id)).not.toThrow();
    expect(ftsMatch(store.getDb()!, 'Зулу')).toHaveLength(0);
    expect(ftsMatch(store.getDb()!, 'Алекс').length).toBeGreaterThanOrEqual(1);
  });

  it('restart: close + initMemory сохраняют данные', async () => {
    store.initMemory();
    await store.saveFact('user', 'Факт переживающий рестарт 42');
    store.closeMemory();
    store.initMemory();
    expect(store.listFacts().map((f) => f.content)).toContain('Факт переживающий рестарт 42');
    expect((await store.recallFacts('рестарт', 5)).length).toBeGreaterThanOrEqual(1);
  });

  it('restart: двойной initMemory без close — идемпотентный no-op', async () => {
    store.initMemory();
    await store.saveFact('user', 'Одиночный факт идемпотентности');
    expect(() => store.initMemory()).not.toThrow();
    expect(store.listFacts()).toHaveLength(1);
  });

  it('triggers: insert/update/delete синхронизируют facts_fts напрямую', async () => {
    store.initMemory();
    await store.saveFact('user', 'Триггерный факт про синхрофазотрон');
    const db = store.getDb()!;
    expect(ftsMatch(db, 'синхрофазотрон').length).toBeGreaterThanOrEqual(1);
    const id = store.listFacts().find((f) => f.content.includes('Триггерный'))!.id!;
    db.prepare('UPDATE facts SET content = ? WHERE id = ?').run('Обновлённый факт про синхрофазотрон v2', id);
    expect(ftsMatch(db, 'синхрофазотрон').length).toBeGreaterThanOrEqual(1);
    expect(ftsMatch(db, 'Обновлённый').length).toBeGreaterThanOrEqual(1);
    store.deleteFact(id);
    expect(ftsMatch(db, 'синхрофазотрон')).toHaveLength(0);
  });

});
