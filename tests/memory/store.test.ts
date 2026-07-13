import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

const testDir = path.join(os.tmpdir(), 'una-memory-test-' + Date.now());

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(testDir, 'userData')),
  },
}));

vi.mock('../../electron/ai/embed', () => ({
  embed: vi.fn(async (text: string) => {
    const dim = 4;
    const arr = new Float32Array(dim);
    if (text.trim().length === 0) {
      arr[0] = 1;
    } else {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
      }
      arr[0] = Math.sin(hash);
      arr[1] = Math.cos(hash);
      arr[2] = Math.sin(hash * 2);
      arr[3] = Math.cos(hash * 2);
      let len = 0;
      for (let i = 0; i < dim; i++) len += arr[i] * arr[i];
      len = Math.sqrt(len);
      for (let i = 0; i < dim; i++) arr[i] /= len;
    }
    return arr;
  }),
}));

async function getStore() {
  return await import('../../electron/memory/store');
}

describe('Memory store', () => {
  let store: Awaited<ReturnType<typeof getStore>>;

  beforeEach(async () => {
    fs.mkdirSync(path.join(testDir, 'userData'), { recursive: true });
    store = await getStore();
    store.initMemory();
  });

  afterEach(() => {
    store.closeMemory();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('initMemory', () => {
    it('creates all tables', () => {
      const db = store.getDb()!;
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as Array<{ name: string }>;
      const names = tables.map((t) => t.name);
      expect(names).toContain('facts');
      expect(names).toContain('facts_fts');
      expect(names).toContain('messages');
      expect(names).toContain('conversations');
      expect(names).toContain('patterns');
      expect(names).toContain('emotions');
    });

    it('creates FTS5 triggers', () => {
      const db = store.getDb()!;
      const triggers = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name"
      ).all() as Array<{ name: string }>;
      const names = triggers.map((t) => t.name);
      expect(names).toContain('facts_ai');
    });
  });

  describe('Fact CRUD', () => {
    it('saves and lists facts', async () => {
      await store.saveFact('user', 'Пользователя зовут Алекс');
      await store.saveFact('project', 'UNA Desktop v40');

      const facts = store.listFacts();
      expect(facts).toHaveLength(2);
      expect(facts.map((f) => f.content)).toContain('Пользователя зовут Алекс');
    });

    it('deleteFact removes a fact', async () => {
      await store.saveFact('user', 'Тестовый факт');
      expect(store.listFacts()).toHaveLength(1);

      store.deleteFact(store.listFacts()[0].id!);
      expect(store.listFacts()).toHaveLength(0);
    });

    it('deleteFact does not throw on missing id', () => {
      expect(() => store.deleteFact(99999)).not.toThrow();
    });

    it('saves and recalls facts', async () => {
      await store.saveFact('user', 'Векторный тест');
      const results = await store.recallFacts('тест', 5);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].content).toContain('Векторный');
    });
  });

  describe('recallFacts', () => {
    it('returns empty array when no facts exist', async () => {
      const results = await store.recallFacts('test query');
      expect(results).toEqual([]);
    });

    it('recalls facts by content similarity', async () => {
      await store.saveFact('user', 'Пользователь любит программировать на TypeScript');
      await store.saveFact('user', 'Пользователь предпочитает чай');

      const results = await store.recallFacts('TypeScript', 2);
      expect(results.length).toBeGreaterThan(0);
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await store.saveFact('user', `Тестовый факт ${i}`);
      }
      const results = await store.recallFacts('тестовый', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('FTS5 integration', () => {
    it('auto-syncs on insert via trigger', async () => {
      await store.saveFact('user', 'full text search test content');
      const db = store.getDb()!;
      const ftsRow = db.prepare(
        "SELECT rowid FROM facts_fts WHERE facts_fts MATCH 'search'"
      ).get() as { rowid: number } | undefined;
      expect(ftsRow).toBeTruthy();
    });

    it('cleans up FTS on delete via deleteFact', async () => {
      await store.saveFact('user', 'delete me from fts');
      const db = store.getDb()!;
      const countBefore = (db.prepare('SELECT COUNT(*) as c FROM facts_fts').get() as { c: number }).c;
      expect(countBefore).toBe(1);
      const id = store.listFacts()[0].id!;
      store.deleteFact(id);
      const countAfter = (db.prepare('SELECT COUNT(*) as c FROM facts_fts').get() as { c: number }).c;
      expect(countAfter).toBe(0);
    });
  });

  describe('Conversations', () => {
    it('startConversation returns a new id', () => {
      const id1 = store.startConversation();
      const id2 = store.startConversation();
      expect(id2).toBeGreaterThan(id1);
    });

    it('saveMessage and getRecentMessages', () => {
      const convId = store.startConversation();
      store.saveMessage({
        conversation_id: convId,
        role: 'user',
        content: 'привет',
        timestamp: new Date().toISOString(),
      });
      store.saveMessage({
        conversation_id: convId,
        role: 'assistant',
        content: 'привет!',
        timestamp: new Date().toISOString(),
      });

      const msgs = store.getRecentMessages(convId);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].role).toBe('user');
      expect(msgs[1].role).toBe('assistant');
    });

    it('endConversation sets ended_at and summary', () => {
      const convId = store.startConversation();
      store.endConversation(convId, 'тестовый диалог');
      const db = store.getDb()!;
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId) as { ended_at: string; summary: string };
      expect(conv.ended_at).toBeTruthy();
      expect(conv.summary).toBe('тестовый диалог');
    });
  });

  describe('Emotions', () => {
    it('saveEmotion and getLastEmotion', () => {
      store.saveEmotion({
        timestamp: new Date().toISOString(),
        emotion: 'happy',
        trigger: 'user said thanks',
        intensity: 0.8,
      });

      const last = store.getLastEmotion();
      expect(last).toBeTruthy();
      expect(last!.emotion).toBe('happy');
    });

    it('getEmotionsSince returns emotions within range', () => {
      store.saveEmotion({
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        emotion: 'sad',
        intensity: 0.3,
      });
      store.saveEmotion({
        timestamp: new Date().toISOString(),
        emotion: 'happy',
        intensity: 0.9,
      });

      const recent = store.getEmotionsSince(new Date(Date.now() - 3600000).toISOString());
      expect(recent).toHaveLength(1);
      expect(recent[0].emotion).toBe('happy');
    });
  });

  describe('Patterns', () => {
    it('savePattern and findPattern', () => {
      store.savePattern('user says спасибо', 'сказать "пожалуйста"');
      const found = store.findPattern('user says спасибо');
      expect(found).toBeTruthy();
      expect(found!.action).toBe('сказать "пожалуйста"');
    });

    it('savePattern updates existing pattern', () => {
      store.savePattern('greeting', 'say hi');
      store.savePattern('greeting', 'say hello');
      const found = store.findPattern('greeting');
      expect(found!.action).toBe('say hello');
    });

    it('findPattern returns null for missing trigger', () => {
      expect(store.findPattern('nonexistent')).toBeNull();
    });
  });

  describe('WAL checkpoint', () => {
    it('walCheckpoint does not throw', () => {
      expect(() => store.walCheckpoint()).not.toThrow();
    });
  });

  describe('Working memory', () => {
    it('buildContext recalls facts', async () => {
      await store.saveFact('user', 'Тестовый пользователь');
      const ctx = await store.buildContext('тестовый', []);
      expect(ctx.messages.length).toBeGreaterThan(0);
    });
  });

  describe('RLM extensions', () => {
    it('getTopFacts returns top by usage', async () => {
      await store.saveFact('user', 'низкий приоритет');
      await store.saveFact('user', 'высокий приоритет');
      const db = store.getDb()!;
      db.prepare('UPDATE facts SET use_count = 10 WHERE content = ?').run('высокий приоритет');

      const top = store.getTopFacts(5);
      expect(top.length).toBe(2);
      expect(top[0].content).toBe('высокий приоритет');
    });

    it('markFactForget sets use_count to -1', async () => {
      await store.saveFact('user', 'забыть это');
      const id = store.listFacts()[0].id!;
      store.markFactForget(id);
      const db = store.getDb()!;
      const row = db.prepare('SELECT use_count FROM facts WHERE id = ?').get(id) as { use_count: number };
      expect(row.use_count).toBe(-1);
    });

    it('setFactImportance boosts use_count', async () => {
      await store.saveFact('user', 'важный факт');
      const id = store.listFacts()[0].id!;
      store.setFactImportance(id, 'high');
      const db = store.getDb()!;
      const row = db.prepare('SELECT use_count FROM facts WHERE id = ?').get(id) as { use_count: number };
      expect(row.use_count).toBe(10);
    });

    it('getFactsByCategory returns filtered facts', async () => {
      await store.saveFact('user', 'user fact');
      await store.saveFact('project', 'project fact');
      const userFacts = store.getFactsByCategory('user');
      expect(userFacts).toHaveLength(1);
      expect(userFacts[0].content).toBe('user fact');
    });

    it('incrementFactUse bumps count and updates last_used', async () => {
      await store.saveFact('user', 'increment me');
      const id = store.listFacts()[0].id!;
      store.incrementFactUse(id);
      const db = store.getDb()!;
      const row = db.prepare('SELECT use_count, last_used FROM facts WHERE id = ?').get(id) as { use_count: number; last_used: string };
      expect(row.use_count).toBe(1);
      expect(row.last_used).toBeTruthy();
    });
  });

  describe('searchEpisodic', () => {
    it('finds messages by keyword', () => {
      const convId = store.startConversation();
      store.saveMessage({ conversation_id: convId, role: 'user', content: 'расскажи про космос', timestamp: new Date().toISOString() });
      const results = store.searchEpisodic('космос');
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('космос');
    });
  });
});
