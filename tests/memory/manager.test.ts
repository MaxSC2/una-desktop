import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

const testDir = path.join(os.tmpdir(), 'una-mgr-test-' + Date.now());

const mcpMock = vi.hoisted(() => ({
  callTool: vi.fn(async () => ({ success: false, error: 'graph unavailable (test)' })),
}));

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

// L2 (Graphiti) всегда «недоступен» по умолчанию — L1 должен работать без него
vi.mock('../../electron/ai/mcp-adapter', () => ({
  mcpAdapter: mcpMock,
}));

async function getStore() {
  return await import('../../electron/memory/store');
}

async function getManager() {
  return await import('../../electron/memory/manager');
}

describe('Memory Manager (M6)', () => {
  let store: Awaited<ReturnType<typeof getStore>>;
  let mgr: Awaited<ReturnType<typeof getManager>>;

  beforeEach(async () => {
    fs.mkdirSync(path.join(testDir, 'userData'), { recursive: true });
    store = await getStore();
    mgr = await getManager();
    store.initMemory();
  });

  afterEach(() => {
    store.closeMemory();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('scoreCandidate — скоринг-гейт', () => {
    it('шум (приветствие) получает низкий скор', () => {
      expect(mgr.scoreCandidate('Привет')).toBeLessThan(mgr.MEMORY_MANAGER_CONFIG.scoreThreshold);
      expect(mgr.scoreCandidate('спасибо большое')).toBeLessThan(mgr.MEMORY_MANAGER_CONFIG.scoreThreshold);
    });

    it('конкретный факт получает высокий скор', () => {
      const s = mgr.scoreCandidate('Пользователь работает над проектом UNA Desktop v40, дедлайн 30 сентября 2026');
      expect(s).toBeGreaterThanOrEqual(mgr.MEMORY_MANAGER_CONFIG.scoreThreshold);
    });

    it('короткие огрызки отклоняются по длине', () => {
      expect(mgr.scoreCandidate('ок')).toBeLessThan(mgr.MEMORY_MANAGER_CONFIG.scoreThreshold);
      expect(mgr.scoreCandidate('')).toBe(0);
    });
  });

  describe('remember — лестница гейт → dedupe → L1 → L2', () => {
    it('отклонённый кандидат не теряется, а архивируется с причиной', async () => {
      const verdict = await mgr.remember('user', 'Привет');
      expect(verdict.stored).toBe(false);
      expect(verdict.reason).toBe('score_below_threshold');
      expect(verdict.candidateId).toBeDefined();

      const db = store.getDb()!;
      const row = db.prepare('SELECT * FROM memory_candidates WHERE id = ?').get(verdict.candidateId) as {
        reason: string;
        content: string;
      };
      expect(row.reason).toBe('low_score');
      expect(row.content).toBe('Привет');
    });

    it('валидный факт сохраняется в L1 с provenance', async () => {
      const verdict = await mgr.remember('user', 'Пользователя зовут Максим, живёт в Казани');
      expect(verdict.stored).toBe(true);
      expect(verdict.id).toBeDefined();

      const prov = store.getFactProvenance(verdict.id!);
      expect(prov).not.toBeNull();
      expect(prov!.importance).toBe('medium');
      expect(prov!.origin).toBe('fact');
    });

    it('дубликат не создаёт вторую строку, а усиливает существующую', async () => {
      const v1 = await mgr.remember('user', 'Пользователь предпочитает Python, а не Java');
      expect(v1.stored).toBe(true);

      const v2 = await mgr.remember('user', 'пользователь предпочитает Python, а не Java');
      expect(v2.stored).toBe(false);
      expect(v2.reason).toBe('duplicate');
      expect(v2.id).toBe(v1.id);

      const facts = store.listFacts();
      const same = facts.filter((f) => f.content.toLowerCase().includes('python'));
      expect(same).toHaveLength(1);

      const prov = store.getFactProvenance(v1.id!);
      expect(prov!.updates).toBeGreaterThanOrEqual(1);
    });

    it('L2-граф недоступен — remember всё равно сохраняет (критерий выживания)', async () => {
      mcpMock.callTool.mockClear();
      const verdict = await mgr.remember('project', 'Дедлайн проекта Аврора — 30 сентября 2026', {
        importance: 'high',
      });
      expect(verdict.stored).toBe(true);
      expect(mcpMock.callTool).toHaveBeenCalled();

      const db = store.getDb()!;
      const count = (db.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }).c;
      expect(count).toBe(1);
    });
  });

  describe('maintenance — идемпотентная DREAM-фаза', () => {
    it('повторный вызов в окне — no-op (split-brain защита)', async () => {
      mgr.__testResetWindows();
      const first = await mgr.maintenance();
      expect(first.skipped).toBeUndefined();

      const second = await mgr.maintenance();
      expect(second.skipped).toBe('dedupe_window');
      expect(second.l2Flushed).toBe(0);
      expect(second.promoted).toBe(0);
      expect(second.demoted).toBe(0);
    });

    it('flush ретейнтит high-importance факт и ставит graph_synced_at', async () => {
      mgr.__testResetWindows();
      mcpMock.callTool.mockReset();
      mcpMock.callTool.mockResolvedValue({ success: true, data: [{ ok: true }] });

      const v = await mgr.remember('user', 'Пользователь работает в IDE над проектом UNA', {
        importance: 'high',
      });
      expect(v.stored).toBe(true);
      // remember(high) уже ретейнтит и ставит метку — сбрасываем, чтобы проверить flush-ветку
      store.setFactProvenance(v.id!, { graph_synced_at: null });
      // и сбрасываем окна (5s-дедуп retainToGraph иначе проглотит флаш того же контента)
      mgr.__testResetWindows();

      const res = await mgr.maintenance();
      expect(res.l2Flushed).toBeGreaterThanOrEqual(1);
      expect(store.getFactProvenance(v.id!)?.graph_synced_at).toBeTruthy();

      // Повторный flush в окне не дублирует запись в граф
      const callsAfterFirst = mcpMock.callTool.mock.calls.length;
      const res2 = await mgr.maintenance();
      expect(res2.skipped).toBe('dedupe_window');
      expect(mcpMock.callTool.mock.calls.length).toBe(callsAfterFirst);

      mcpMock.callTool.mockReset();
      mcpMock.callTool.mockImplementation(async () => ({ success: false, error: 'graph unavailable (test)' }));
    });

    it('граф недоступен — flush не падает и не ставит метку (устойчивость к отказу LLM)', async () => {
      mgr.__testResetWindows();
      mcpMock.callTool.mockReset();
      mcpMock.callTool.mockImplementation(async () => ({ success: false, error: 'graph unavailable (test)' }));

      const v = await mgr.remember('user', 'Важный факт про архитектуру памяти UNA', { importance: 'high' });
      expect(v.stored).toBe(true);
      // сбрасываем окна: retain при remember уже погасил 5s-дедуп для этого контента
      mgr.__testResetWindows();

      const res = await mgr.maintenance();
      expect(res.l2Flushed).toBe(0);
      expect(store.getFactProvenance(v.id!)?.graph_synced_at ?? null).toBeNull();
    });
  });

  describe('refreshProvenance — выживание фактов по реальному использованию', () => {
    it('часто используемый факт повышается до high', async () => {
      const v = await mgr.remember('user', 'Пользователь обновил драйвер видеокарты до версии 566.14');
      expect(v.stored).toBe(true);
      const db = store.getDb()!;
      db.prepare('UPDATE facts SET use_count = 12 WHERE id = ?').run(v.id!);

      const { promoted } = mgr.refreshProvenance();
      expect(promoted).toBeGreaterThanOrEqual(1);
      expect(store.getFactProvenance(v.id!)!.importance).toBe('high');
    });

    it('забытый факт (не использовался 30+ дней) понижается до low', async () => {
      const v = await mgr.remember('user', 'Одноразовый факт про старый проект Зулу');
      const db = store.getDb()!;
      db.prepare("UPDATE facts SET last_used = datetime('now', '-45 days'), use_count = 1 WHERE id = ?").run(v.id!);

      const { demoted } = mgr.refreshProvenance();
      expect(demoted).toBeGreaterThanOrEqual(1);
      expect(store.getFactProvenance(v.id!)!.importance).toBe('low');
    });
  });

  describe('elevateCandidate — элевация отклонённого', () => {
    it('кандидат восстанавливается в память и удаляется из архива', async () => {
      const rejected = await mgr.remember('user', 'Привет');
      expect(rejected.candidateId).toBeDefined();

      const verdict = await mgr.elevateCandidate(rejected.candidateId!);
      expect(verdict.stored).toBe(true);

      const db = store.getDb()!;
      const gone = db.prepare('SELECT 1 FROM memory_candidates WHERE id = ?').get(rejected.candidateId);
      expect(gone).toBeUndefined();
    });
  });
});
