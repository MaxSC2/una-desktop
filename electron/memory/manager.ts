/**
 * M6: Memory Manager — единая точка входа в память (лестница L0 → L1 → L2).
 *
 * Дизайн по итогам исследования open-source (2026-09-12):
 *  - remember(): скоринг-гейт (длина/шум/конкретика) + дедупликация → L1 (SQLite) + L0 WARM.
 *    Отклонённые кандидаты НЕ теряются — уходят в архив memory_candidates с причиной.
 *  - Транскрипт ≠ память: сообщения пишутся в episodic отдельно, а в факты
 *    попадает только то, что прошло гейт.
 *  - L2 (Graphiti, темпоральный граф) — только значимые факты, с дедупликацией:
 *    повторный retain того же контента в окне не создаёт дубликат в графе.
 *  - maintenance(): идемпотентна — повторный вызов в окне не меняет БД
 *    (защита от split-brain при параллельных вызовах из life-loop и IPC).
 *  - Отказ LLM/графа не роняет запись в L1: ошибки L2 глотаются с логом.
 */

import { saveFact, recallFacts, listFacts, getDb, getFactProvenance, setFactProvenance, Fact } from './store';
import { getRelatedFacts } from './knowledge-graph';

// ============================================================
// ТИПЫ
// ============================================================

export interface RememberOptions {
  importance?: 'high' | 'medium' | 'low';
  origin?: string;
  /** Обход скоринг-гейта (явное решение пользователя — элевация кандидата). */
  force?: boolean;
}

export interface RememberVerdict {
  stored: boolean;
  id?: number;
  score: number;
  reason?: string;
  candidateId?: number;
}

export interface RecallResult {
  facts: Array<Fact & { score?: number; origin?: string | null }>;
  related: string[];
}

export interface MaintenanceResult {
  l2Flushed: number;
  promoted: number;
  demoted: number;
  skipped?: string;
}

// ============================================================
// КОНФИГ
// ============================================================

export const MEMORY_MANAGER_CONFIG = {
  /** Минимальная длина содержательного факта. */
  minFactLength: 8,
  /** Порог скоринг-гейта: ниже — факт не хранится в L1 (только архив). */
  scoreThreshold: 0.25,
  /** Сколько свежих фактов сканировать при дедупликации. */
  dedupeScanLimit: 50,
} as const;

// ============================================================
// СКОРИНГ
// ============================================================

/**
 * Эвристический скоринг кандидата (0..1):
 *  - длина (слишком короткие огрызки — не память);
 *  - шум (приветствия, извинения, междометия);
 *  - конкретика (цифры, имена собственные, технические маркеры).
 *
 * Честная эвристика без скрытых LLM-вызовов — скорость и предсказуемость.
 */
export function scoreCandidate(content: string): number {
  const text = content.trim();
  if (text.length === 0) return 0;

  let score = 0.3; // база: строка в принципе содержательная

  // Длина: содержательный факт обычно 8..200 символов
  if (text.length >= MEMORY_MANAGER_CONFIG.minFactLength) score += 0.2;
  else score -= 0.4;
  if (text.length > 200) score += 0.1;

  // Шум: приветствия/извинения/болтовня
  // ВАЖНО: \b в JS не работает с кириллицей (ASCII-only), поэтому граница слова —
  // явный lookahead «следующий символ не буква».
  if (/^(привет|здравствуй|добрый|hello|hi|ок|окей|ok|спасибо|благодар|извини|прости|sorry|thanks)(?![а-яa-zё])/i.test(text)) {
    score -= 0.5;
  }

  // Конкретика: числа/даты
  if (/\d/.test(text)) score += 0.15;

  // Конкретика: имя собственное (заглавная буква не в начале слова)
  if (/[A-ZА-ЯЁ][a-zа-яё]{2,}/.test(text.slice(1))) score += 0.15;

  // Технические маркеры: пути, код, команды, версии, URL
  if (/([/\\.]\w+|\w+:\w+|npm|git|python|node|http)/i.test(text)) score += 0.15;

  return Math.max(0, Math.min(1, score));
}

// ============================================================
// REMEMBER — гейт → dedupe → L1 → L2
// ============================================================

/**
 * Запись факта в память через скоринг-гейт.
 *
 * Лестница: гейт → dedupe → L1 (SQLite + provenance) → L2 (Graphiti, только значимые).
 * Возвращает вердикт — вызывающий код (tool/LLM) видит, что и почему сохранено.
 */
export async function remember(
  category: Fact['category'],
  content: string,
  opts: RememberOptions = {}
): Promise<RememberVerdict> {
  const text = content.trim();
  const score = scoreCandidate(text);

  // 1. Скоринг-гейт: ниже порога — не память, но и не потеря — архив.
  // force (элевация) обходит гейт: явное человеческое решение сильнее эвристики.
  if (!opts.force && (text.length < MEMORY_MANAGER_CONFIG.minFactLength || score < MEMORY_MANAGER_CONFIG.scoreThreshold)) {
    const cid = archiveCandidate(category, text, score, 'low_score');
    console.log(`[MemMgr] rejected (score=${score.toFixed(2)}): "${text.slice(0, 60)}" → archived #${cid}`);
    return { stored: false, score, reason: 'score_below_threshold', candidateId: cid !== -1 ? cid : undefined };
  }

  // 2. Дедупликация: почти идентичный факт уже в памяти?
  const dup = findDuplicate(text);
  if (dup) {
    // Не создаём дубликат: усиливаем существующий (счётчик обновлений в provenance).
    setFactProvenance(dup.id, {
      importance: opts.importance ?? 'medium',
      origin: opts.origin ?? dup.origin ?? 'dedupe',
      updates: (getFactProvenance(dup.id)?.updates ?? 0) + 1,
    });
    const cid = archiveCandidate(category, text, score, 'duplicate');
    console.log(`[MemMgr] duplicate of #${dup.id} → archived #${cid}, reinforced existing`);
    return { stored: false, id: dup.id, score, reason: 'duplicate', candidateId: cid !== -1 ? cid : undefined };
  }

  // 3. L1: основная запись (SQLite + FTS + embeddings). Падение БД — наружу.
  await saveFact(category, text);

  const all = listFacts();
  const saved = all.find((f) => f.content === text);
  const id = saved?.id;

  const importance = opts.importance ?? 'medium';
  if (id !== undefined) {
    setFactProvenance(id, { importance, origin: opts.origin ?? 'fact' });
  }

  // 4. L2: в темпоральный граф — только значимые факты. Отказ графа не критичен.
  if (importance === 'high' && id !== undefined) {
    const ok = await retainToGraph(text, id);
    if (ok) {
      setFactProvenance(id, { graph_synced_at: new Date().toISOString() });
    }
  }

  console.log(`[MemMgr] stored fact #${id ?? '?'} [${category}] score=${score.toFixed(2)} importance=${importance}`);
  return { stored: true, id, score };
}

/**
 * Поиск дубликата среди свежих фактов (нормализация + точное сравнение).
 * Векторная проверка слишком дорога для гейта — нормализация покрывает
 * реальный кейс «LLM повторила факт теми же словами».
 */
function findDuplicate(content: string): { id: number; origin?: string | null } | null {
  const norm = content.toLowerCase().replace(/\s+/g, ' ').trim();
  const all = listFacts();
  for (const f of all.slice(0, MEMORY_MANAGER_CONFIG.dedupeScanLimit)) {
    const fn = f.content.toLowerCase().replace(/\s+/g, ' ').trim();
    if (fn === norm && f.id !== undefined) {
      const prov = getFactProvenance(f.id);
      return { id: f.id, origin: prov?.origin ?? null };
    }
  }
  return null;
}

// ============================================================
// L2 — GRAPHITI (явный режим)
// ============================================================

let lastGraphRetainAt = 0;
let lastGraphKey = '';
const GRAPH_RETAIN_DEDUPE_MS = 5000;

/**
 * Явный retain факта в L2 (Graphiti). Только для значимых фактов —
 * каждый вызов это LLM-извлечение сущностей внутри графа (секунды, не мс).
 * Отказ MCP/графа глотается: L1 остаётся источником правды.
 */
export async function retainToGraph(content: string, factId?: number): Promise<boolean> {
  // Идемпотентность-лайт: тот же контент в пределах 5 секунд не шлём повторно
  const now = Date.now();
  const normKey = content.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normKey === lastGraphKey && now - lastGraphRetainAt < GRAPH_RETAIN_DEDUPE_MS) {
    console.log('[MemMgr] graph retain skipped: duplicate within dedupe window');
    return false;
  }

  try {
    const { mcpAdapter } = await import('../ai/mcp-adapter');
    const res = await mcpAdapter.callTool(
      'memory_add',
      { episode: content, factId: factId ?? null, source: 'una-memory-manager' },
      { confirmedTokens: new Set<string>() } as never
    );

    lastGraphRetainAt = now;
    lastGraphKey = normKey;

    if (!res.success) {
      console.warn(`[MemMgr] graph retain failed: ${res.error ?? 'unknown'}`);
      return false;
    }
    console.log(`[MemMgr] retained to graph (fact #${factId ?? '?'})`);
    return true;
  } catch (e) {
    console.warn('[MemMgr] graph retain error (L1 не пострадал):', e);
    return false;
  }
}

/**
 * Явный поиск по графу (L2-recall). Никогда не вызывается фоновым пайплайном.
 * Ошибки глотаются: граф недоступен → просто нет графовых результатов.
 */
export async function l2Search(query: string, limit = 3): Promise<string[]> {
  try {
    const { mcpAdapter } = await import('../ai/mcp-adapter');
    const res = await mcpAdapter.callTool(
      'memory_search',
      { query, limit },
      { confirmedTokens: new Set<string>() } as never
    );
    if (!res.success) return [];
    const content = res.data;
    if (Array.isArray(content)) {
      return content.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).slice(0, limit);
    }
    if (content != null) return [JSON.stringify(content)];
    return [];
  } catch (e) {
    console.warn('[MemMgr] l2Search failed:', e);
    return [];
  }
}

// ============================================================
// RECALL — факты + происхождение + связи из Knowledge Graph
// ============================================================

/**
 * Recall по запросу: векторный поиск по L1 + расширение связями из Knowledge Graph.
 * L2 (граф) сюда НЕ входит — только явный l2Search().
 */
export async function recall(query: string, limit = 5): Promise<RecallResult> {
  const facts = await recallFacts(query, limit);
  const enriched = facts.map((f) => ({
    ...f,
    origin: f.id !== undefined ? getFactProvenance(f.id)?.origin ?? null : null,
  }));

  // Расширение: связи из Knowledge Graph для топ-факта
  const related: string[] = [];
  const topId = enriched[0]?.id;
  if (topId !== undefined) {
    try {
      const rel = getRelatedFacts(topId) as unknown as Array<{
        relation: string;
        fact?: { content?: string };
        related_id?: number;
      }>;
      for (const r of rel.slice(0, 3)) {
        related.push(`${r.relation}: ${r.fact?.content ?? `#${r.related_id ?? '?'}`}`);
      }
    } catch {
      // Knowledge Graph недоступен — recall без расширения
    }
  }

  return { facts: enriched, related };
}

// ============================================================
// MAINTENANCE — идемпотентная DREAM-фаза
// ============================================================

let lastMaintenanceAt = 0;
const MAINTENANCE_DEDUPE_MS = 10_000;
let l2FlushRunning = false;
let lastL2FlushAt = 0;
const L2_FLUSH_DEDUPE_MS = 30_000;

/**
 * DREAM-фаза памяти (фоновое обслуживание в idle):
 *  1. Flush L1 → L2: пачка высоковажных фактов без графовой записи уходит в Graphiti.
 *  2. Обновление provenance: пересчёт важности по реальному использованию.
 *
 * Идемпотентность: повторный вызов в пределах 10 секунд — no-op (split-brain защита
 * от параллельного вызова life-loop и IPC). Дедупликация внутри retainToGraph
 * не даёт флашу плодить дубли в графе.
 */
export async function maintenance(): Promise<MaintenanceResult> {
  const now = Date.now();
  if (now - lastMaintenanceAt < MAINTENANCE_DEDUPE_MS) {
    return { l2Flushed: 0, promoted: 0, demoted: 0, skipped: 'dedupe_window' };
  }
  lastMaintenanceAt = now;

  const l2Flushed = await flushL2();
  const { promoted, demoted } = refreshProvenance();

  console.log(`[MemMgr] maintenance: l2Flushed=${l2Flushed} promoted=${promoted} demoted=${demoted}`);
  return { l2Flushed, promoted, demoted };
}

/**
 * Отложенный flush: до 5 высоковажных фактов, не зафиксированных в графе,
 * ретейнсятся в Graphiti (в idle — нагрузка щадящая).
 */
async function flushL2(): Promise<number> {
  if (l2FlushRunning) return 0; // защита от параллельного запуска
  const now = Date.now();
  if (now - lastL2FlushAt < L2_FLUSH_DEDUPE_MS) return 0;
  l2FlushRunning = true;

  try {
    const db = getDb();
    if (!db) return 0;

    const nowIso = new Date().toISOString();
    const pending = db.prepare(`
      SELECT id, content FROM facts
      WHERE (last_used IS NULL OR last_used >= datetime('now', '-30 days'))
      ORDER BY use_count DESC
      LIMIT 20
    `).all() as Array<{ id: number; content: string }>;

    let flushed = 0;
    for (const row of pending) {
      const prov = getFactProvenance(row.id);
      if (!prov || prov.importance !== 'high') continue;
      if (prov.graph_synced_at) continue; // уже в графе
      const ok = await retainToGraph(row.content, row.id);
      if (ok) {
        setFactProvenance(row.id, { graph_synced_at: nowIso });
        flushed++;
        if (flushed >= 5) break;
      }
    }
    lastL2FlushAt = Date.now();
    return flushed;
  } catch (e) {
    console.warn('[MemMgr] flushL2 error:', e);
    return 0;
  } finally {
    l2FlushRunning = false;
  }
}

// ============================================================
// PROVENANCE-REFRESH + АРХИВ КАНДИДАТОВ
// ============================================================

/**
 * Обновление provenance по реальному использованию (DREAM-фаза, шаг 2).
 * Экспортируется для тестов: выживание фактов — ядро жизненного цикла.
 */
export function refreshProvenance(): { promoted: number; demoted: number } {
  try {
    const db = getDb();
    if (!db) return { promoted: 0, demoted: 0 };

    const rows = db.prepare(`
      SELECT id, use_count, last_used, created_at FROM facts WHERE id IS NOT NULL LIMIT 500
    `).all() as Array<{ id: number; use_count: number; last_used: string | null; created_at: string }>;

    let promoted = 0;
    let demoted = 0;
    const nowMs = Date.now();
    for (const row of rows) {
      const prov = getFactProvenance(row.id);
      const prev = prov?.importance ?? 'medium';
      const refIso = row.last_used ?? row.created_at;
      const daysSinceUse = refIso
        ? (nowMs - new Date(refIso).getTime()) / 86_400_000
        : Infinity;

      let next = prev;
      if (row.use_count >= 10) next = 'high';
      else if (row.use_count >= 3) next = 'medium';
      else if (daysSinceUse > 30) next = 'low';

      if (next !== prev) {
        setFactProvenance(row.id, { importance: next });
        if (next === 'high' || (next === 'medium' && prev === 'low')) promoted++;
        if (next === 'low') demoted++;
      }
    }
    return { promoted, demoted };
  } catch (e) {
    console.warn('[MemMgr] refreshProvenance error:', e);
    return { promoted: 0, demoted: 0 };
  }
}

/** Тестовый хук: сброс окон идемпотентности (используется только тестами). */
export function __testResetWindows(): void {
  lastMaintenanceAt = 0;
  lastL2FlushAt = 0;
  lastGraphRetainAt = 0;
  lastGraphKey = '';
}

// ============================================================
// АРХИВ ОТКЛОНЁННЫХ — кандидаты не теряются (анти-«молча в /dev/null»)
// ============================================================

/**
 * Отклонённые гейтом кандидаты уходят в таблицу memory_candidates.
 * Это не память (в recall не попадает), но материал для отладки гейта
 * и будущей «элевации» (пользователь сказал — восстановили).
 */
function archiveCandidate(
  category: Fact['category'],
  candidateContent: string,
  score: number,
  reason: string
): number {
  try {
    const db = getDb();
    if (!db) return -1;
    const res = db
      .prepare(
        'INSERT INTO memory_candidates (category, content, score, reason, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(category, candidateContent, score, reason, new Date().toISOString());
    return res.lastInsertRowid as number;
  } catch (e) {
    console.warn('[MemMgr] candidate archive failed:', e);
    return -1;
  }
}

/**
 * Элевация кандидата: пользователь/LLM решил, что отклонённое всё-таки нужно.
 * Повторно прогоняет через remember с высоким важностью; при успехе кандидат удаляется.
 */
export async function elevateCandidate(candidateId: number): Promise<RememberVerdict> {
  const db = getDb();
  if (!db) return { stored: false, score: 0, reason: 'no_db' };
  const row = db.prepare('SELECT id, category, content FROM memory_candidates WHERE id = ?').get(candidateId) as
    | { id: number; category: Fact['category']; content: string }
    | undefined;
  if (!row) return { stored: false, score: 0, reason: 'not_found' };

  const verdict = await remember(row.category, row.content, {
    importance: 'high',
    origin: 'elevated',
    force: true,
  });
  if (verdict.stored) {
    db.prepare('DELETE FROM memory_candidates WHERE id = ?').run(candidateId);
  }
  return verdict;
}
