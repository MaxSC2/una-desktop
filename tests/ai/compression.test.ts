/**
 * TASK-001 (DEC-021): приёмочные тесты для electron/ai/compression.ts.
 *
 * Контракт P1-2 (DEC-008): тесты фиксируют ТЕКУЧЕЕ поведение продакшн-кода.
 * Расхождение поведения с ожиданием — находка в отчёт, а не повод править код.
 *
 * Мокается внешний мир: electron (app.getPath → tmp), embed, llm.summarizeText,
 * resource-manager.shouldMaintainMemory, memory/manager.remember.
 * Тестируемая логика (compression.ts, memory/store.ts) — настоящая, на temp-БД.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

const testDir = path.join(os.tmpdir(), 'una-compression-test-' + Date.now());

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(testDir, 'userData')),
  },
}));

vi.mock('../../electron/ai/embed', () => ({
  embed: vi.fn(async () => new Float32Array([1, 0, 0, 0])),
}));

vi.mock('../../electron/ai/llm', () => ({
  summarizeText: vi.fn(async () => 'Краткая сводка диалога'),
}));

vi.mock('../../electron/ai/resource-manager', () => ({
  shouldMaintainMemory: vi.fn(() => true),
}));

vi.mock('../../electron/memory/manager', () => ({
  remember: vi.fn(async () => ({ stored: true, reason: 'ok' })),
}));

import { summarizeText } from '../../electron/ai/llm';
import { shouldMaintainMemory } from '../../electron/ai/resource-manager';
import { remember } from '../../electron/memory/manager';

const mockSummarize = vi.mocked(summarizeText);
const mockMaintain = vi.mocked(shouldMaintainMemory);
const mockRemember = vi.mocked(remember);

async function getStore() {
  return await import('../../electron/memory/store');
}
async function getCompression() {
  return await import('../../electron/ai/compression');
}

type Store = Awaited<ReturnType<typeof getStore>>;
type Compression = Awaited<ReturnType<typeof getCompression>>;

/** ISO-дата N дней назад (для ended_at / last_used). */
function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Вставка факта напрямую через реальный store DB (точный контроль полей). */
function insertFact(
  store: Store,
  opts: { category: string; content: string; useCount?: number | null; lastUsed?: string | null }
): number {
  const db = store.getDb()!;
  const res = db
    .prepare(
      `INSERT INTO facts (category, content, created_at, last_used, use_count)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      opts.category,
      opts.content,
      daysAgoISO(1),
      opts.lastUsed === undefined ? null : opts.lastUsed,
      opts.useCount === undefined ? null : opts.useCount
    );
  return res.lastInsertRowid as number;
}

function getFact(store: Store, id: number): { category: string; use_count: number | null; last_used: string | null } {
  return store.getDb()!.prepare('SELECT category, use_count, last_used FROM facts WHERE id = ?').get(id) as {
    category: string;
    use_count: number | null;
    last_used: string | null;
  };
}

/** Создать завершённую беседу с ended_at N дней назад и summary (null — без сводки). */
function insertConversation(store: Store, endedDaysAgo: number, summary: string | null): number {
  const db = store.getDb()!;
  const res = db
    .prepare(`INSERT INTO conversations (started_at, ended_at, summary) VALUES (?, ?, ?)`)
    .run(daysAgoISO(endedDaysAgo + 1), daysAgoISO(endedDaysAgo), summary);
  return res.lastInsertRowid as number;
}

function insertMessage(store: Store, conversationId: number, role: string, content: string): void {
  store.saveMessage({
    conversation_id: conversationId,
    role,
    content,
    timestamp: new Date().toISOString(),
  });
}

function getConversationSummary(store: Store, id: number): string | null {
  const row = store.getDb()!.prepare('SELECT summary FROM conversations WHERE id = ?').get(id) as {
    summary: string | null;
  };
  return row.summary;
}

describe('compression.ts (TASK-001 acceptance)', () => {
  let store: Store;
  let compression: Compression;

  beforeEach(async () => {
    fs.mkdirSync(path.join(testDir, 'userData'), { recursive: true });
    store = await getStore();
    store.initMemory();
    compression = await getCompression();
    vi.clearAllMocks();
    mockSummarize.mockResolvedValue('Краткая сводка диалога');
    mockMaintain.mockReturnValue(true);
    mockRemember.mockResolvedValue({ stored: true, reason: 'ok' } as Awaited<ReturnType<typeof remember>>);
  });

  afterEach(() => {
    store.closeMemory();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------- promoteFrequentFacts
  describe('promoteFrequentFacts', () => {
    it('повышает user-факт с use_count >= 5 до preference, use_count сохраняется', () => {
      const id = insertFact(store, { category: 'user', content: 'любит чай', useCount: 7 });
      const promoted = compression.promoteFrequentFacts();
      expect(promoted).toBe(1);
      const row = getFact(store, id);
      expect(row.category).toBe('preference');
      expect(row.use_count).toBe(7); // честная статистика, не сбрасывается
    });

    it('не трогает user-факт с use_count < 5', () => {
      const id = insertFact(store, { category: 'user', content: 'редкий факт', useCount: 4 });
      expect(compression.promoteFrequentFacts()).toBe(0);
      expect(getFact(store, id).category).toBe('user');
    });

    it('не трогает факты других категорий даже с use_count >= 5', () => {
      const p = insertFact(store, { category: 'project', content: 'проект', useCount: 10 });
      const t = insertFact(store, { category: 'task', content: 'задача', useCount: 10 });
      expect(compression.promoteFrequentFacts()).toBe(0);
      expect(getFact(store, p).category).toBe('project');
      expect(getFact(store, t).category).toBe('task');
    });

    it('повышает не более 10 фактов за проход', () => {
      for (let i = 0; i < 12; i++) {
        insertFact(store, { category: 'user', content: `частый факт ${i}`, useCount: 5 + i });
      }
      const promoted = compression.promoteFrequentFacts();
      expect(promoted).toBe(10);
      const remaining = store
        .getDb()!
        .prepare(`SELECT COUNT(*) AS c FROM facts WHERE category = 'user' AND use_count >= 5`)
        .get() as { c: number };
      expect(remaining.c).toBe(2);
    });

    it('пустая БД → 0', () => {
      expect(compression.promoteFrequentFacts()).toBe(0);
    });

    it('getDb() = null → 0, без исключений', () => {
      store.closeMemory();
      expect(compression.promoteFrequentFacts()).toBe(0);
    });
  });

  // ---------------------------------------------------------- demoteStaleFacts
  describe('demoteStaleFacts', () => {
    it('устаревший факт (last_used > 30 дней, use_count < 3) мягко забывается, НЕ удаляется', () => {
      const id = insertFact(store, { category: 'user', content: 'старый факт', useCount: 2, lastUsed: daysAgoISO(40) });
      const demoted = compression.demoteStaleFacts();
      expect(demoted).toBe(1);
      const row = getFact(store, id);
      expect(row.use_count).toBe(-1); // markFactForget
      const stillThere = store.getDb()!.prepare('SELECT COUNT(*) AS c FROM facts WHERE id = ?').get(id) as { c: number };
      expect(stillThere.c).toBe(1);
    });

    it('факт с NULL last_used и NULL use_count забывается', () => {
      const id = insertFact(store, { category: 'user', content: 'без статистики' });
      expect(compression.demoteStaleFacts()).toBe(1);
      expect(getFact(store, id).use_count).toBe(-1);
    });

    it('защищённые категории project/preference не забываются даже при stale-условиях', () => {
      const p = insertFact(store, { category: 'project', content: 'проект-стейл', useCount: 0, lastUsed: daysAgoISO(90) });
      const r = insertFact(store, { category: 'preference', content: 'преф-стейл', useCount: 1, lastUsed: daysAgoISO(90) });
      expect(compression.demoteStaleFacts()).toBe(0);
      expect(getFact(store, p).use_count).toBe(0);
      expect(getFact(store, r).use_count).toBe(1);
    });

    it('свежие факты не забываются', () => {
      const id = insertFact(store, { category: 'user', content: 'свежий', useCount: 1, lastUsed: new Date().toISOString() });
      expect(compression.demoteStaleFacts()).toBe(0);
      expect(getFact(store, id).use_count).toBe(1);
    });

    it('факты с use_count >= 3 не забываются даже при старом last_used', () => {
      const id = insertFact(store, { category: 'user', content: 'популярный', useCount: 3, lastUsed: daysAgoISO(60) });
      expect(compression.demoteStaleFacts()).toBe(0);
      expect(getFact(store, id).use_count).toBe(3);
    });

    it('забывает не более 20 фактов за проход', () => {
      for (let i = 0; i < 25; i++) {
        insertFact(store, { category: 'user', content: `stale ${i}`, useCount: 0, lastUsed: daysAgoISO(45) });
      }
      const demoted = compression.demoteStaleFacts();
      expect(demoted).toBe(20);
      const forgotten = store
        .getDb()!
        .prepare('SELECT COUNT(*) AS c FROM facts WHERE use_count = -1')
        .get() as { c: number };
      expect(forgotten.c).toBe(20);
    });

    it('getDb() = null → 0, без исключений', () => {
      store.closeMemory();
      expect(compression.demoteStaleFacts()).toBe(0);
    });
  });


  // ---------------------------------------------------------- compressOldConversations
  describe('compressOldConversations', () => {
    it('нет бесед старше 7 дней без summary → 0, LLM не вызывается', async () => {
      insertConversation(store, 2, null); // свежая завершённая
      insertConversation(store, 10, 'уже есть сводка'); // старая, но со сводкой
      const compressed = await compression.compressOldConversations();
      expect(compressed).toBe(0);
      expect(mockSummarize).not.toHaveBeenCalled();
    });

    it('shouldMaintainMemory() = false → 0, сводка не пишется, LLM не вызывается', async () => {
      const convId = insertConversation(store, 10, null);
      insertMessage(store, convId, 'user', 'привет');
      mockMaintain.mockReturnValue(false);
      const compressed = await compression.compressOldConversations();
      expect(compressed).toBe(0);
      expect(mockSummarize).not.toHaveBeenCalled();
      expect(getConversationSummary(store, convId)).toBeNull();
    });

    it('LLM вернул пустую строку → сводка не пишется, сообщения целы', async () => {
      const convId = insertConversation(store, 10, null);
      insertMessage(store, convId, 'user', 'сообщение один');
      insertMessage(store, convId, 'assistant', 'ответ один');
      mockSummarize.mockResolvedValue('');
      const compressed = await compression.compressOldConversations();
      expect(compressed).toBe(0);
      expect(getConversationSummary(store, convId)).toBeNull();
      const msgs = store.getDb()!.prepare('SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ?').get(convId) as { c: number };
      expect(msgs.c).toBe(2); // БД сообщений не трогаем
    });

    it('LLM вернул сводку → conversations.summary обновлена, счётчик увеличен', async () => {
      const convId = insertConversation(store, 10, null);
      insertMessage(store, convId, 'user', 'расскажи про проект');
      mockSummarize.mockResolvedValue('Обсуждали проект UNA.');
      const compressed = await compression.compressOldConversations();
      expect(compressed).toBe(1);
      expect(getConversationSummary(store, convId)).toBe('Обсуждали проект UNA.');
      expect(mockSummarize).toHaveBeenCalledWith(expect.any(String), { maxInputChars: 12000 });
    });

    it('гейт remember() отклонил (stored: false) → сводка сохраняется в conversations (эпизодический слой)', async () => {
      const convId = insertConversation(store, 10, null);
      insertMessage(store, convId, 'user', 'текст');
      mockRemember.mockResolvedValue({ stored: false, reason: 'low-score' } as Awaited<ReturnType<typeof remember>>);
      const compressed = await compression.compressOldConversations();
      expect(compressed).toBe(1);
      expect(getConversationSummary(store, convId)).toBe('Краткая сводка диалога');
    });

    it('гейт remember() бросил ошибку → функция не падает, сводка сохраняется', async () => {
      const convId = insertConversation(store, 10, null);
      insertMessage(store, convId, 'user', 'текст');
      mockRemember.mockRejectedValue(new Error('gate exploded'));
      const compressed = await compression.compressOldConversations();
      expect(compressed).toBe(1);
      expect(getConversationSummary(store, convId)).toBe('Краткая сводка диалога');
    });


    it('сэмпл: первые 3 + последние 3 сообщения, дедупликация по id', async () => {
      const convId = insertConversation(store, 10, null);
      // 4 сообщения: first3 = m1,m2,m3; last3 = m4,m3,m2 → дедуп → m1..m4 по одному разу
      insertMessage(store, convId, 'user', 'M1');
      insertMessage(store, convId, 'assistant', 'M2');
      insertMessage(store, convId, 'user', 'M3');
      insertMessage(store, convId, 'assistant', 'M4');
      await compression.compressOldConversations();
      expect(mockSummarize).toHaveBeenCalledTimes(1);
      const sample = mockSummarize.mock.calls[0][0] as string;
      expect(sample).toBe('user: M1\nassistant: M2\nuser: M3\nassistant: M4');
    });

    it('контент сообщения срезается до 800 символов в сэмпле', async () => {
      const convId = insertConversation(store, 10, null);
      insertMessage(store, convId, 'user', 'x'.repeat(1000));
      await compression.compressOldConversations();
      const sample = mockSummarize.mock.calls[0][0] as string;
      expect(sample).toBe('user: ' + 'x'.repeat(800));
    });

    it('обрабатывает не более 5 бесед за проход', async () => {
      for (let i = 0; i < 7; i++) {
        const convId = insertConversation(store, 10, null);
        insertMessage(store, convId, 'user', `диалог ${i}`);
      }
      const compressed = await compression.compressOldConversations();
      expect(compressed).toBe(5);
      expect(mockSummarize).toHaveBeenCalledTimes(5);
      const withSummary = store
        .getDb()!
        .prepare(`SELECT COUNT(*) AS c FROM conversations WHERE summary IS NOT NULL AND summary != ''`)
        .get() as { c: number };
      expect(withSummary.c).toBe(5);
    });

    it('беседа без сообщений пропускается (пустой сэмпл → continue)', async () => {
      insertConversation(store, 10, null); // без сообщений
      const compressed = await compression.compressOldConversations();
      expect(compressed).toBe(0);
      expect(mockSummarize).not.toHaveBeenCalled();
    });

    it('getDb() = null → 0, без исключений', async () => {
      store.closeMemory();
      expect(await compression.compressOldConversations()).toBe(0);
    });
  });


  // ---------------------------------------------------------- runMaintenance
  describe('runMaintenance', () => {
    it('возвращает агрегат, согласованный с результатами трёх функций', async () => {
      // 1 старая беседа → compressed 1
      const convId = insertConversation(store, 10, null);
      insertMessage(store, convId, 'user', 'привет');
      // 2 частых user-факта → promoted 2
      insertFact(store, { category: 'user', content: 'f1', useCount: 6 });
      insertFact(store, { category: 'user', content: 'f2', useCount: 7 });
      // 1 устаревший → demoted 1
      insertFact(store, { category: 'user', content: 'stale', useCount: 0, lastUsed: daysAgoISO(50) });

      const result = await compression.runMaintenance();
      expect(result).toEqual({ compressed: 1, promoted: 2, demoted: 1 });
    });

    it('на пустой БД возвращает нулевой агрегат', async () => {
      const result = await compression.runMaintenance();
      expect(result).toEqual({ compressed: 0, promoted: 0, demoted: 0 });
    });
  });
});

