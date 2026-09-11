import { getDb, markFactForget } from '../memory/store';
import { summarizeText } from './llm';
import { shouldMaintainMemory } from './resource-manager';

/**
 * M4: честная сборка памяти.
 *
 * 1. Суммаризация старых бесед — ТОЛЬКО когда система простаивает и ресурсы позволяют,
 *    и только если LLM реально вернул сводку (иначе пропускаем — никаких псевдо-сводок из обрезков).
 *
 * 2. Часто используемые факты повышаем до «предпочтения», но use_count НЕ сбрасываем —
 *    это честная статистика использования, а не демо-промоушен.
 *
 * 3. Устаревшие факты — мягкое забывание (markFactForget: use_count = -1; никаких DELETE).
 */

export async function compressOldConversations(): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  // Старые беседы (старше 7 дней, без summary).
  const oldConvs = db.prepare(`
    SELECT c.id, c.summary,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as msg_count
    FROM conversations c
    WHERE c.ended_at IS NOT NULL
      AND (c.summary IS NULL OR c.summary = '')
      AND c.ended_at < datetime('now', '-7 days')
    ORDER BY c.ended_at ASC
    LIMIT 5
  `).all() as Array<{ id: number; summary: string | null; msg_count: number }>;

  if (oldConvs.length === 0) return 0;

  // LLM-суммаризация — только в простое и при свободных ресурсах.
  if (!shouldMaintainMemory()) {
    console.log(`[Memory] Skipping ${oldConvs.length} old conversation(s): LLM summarization requires idle/resources`);
    return 0;
  }

  let compressed = 0;
  for (const conv of oldConvs) {
    // Первые 3 и последние 3 сообщения — честный контекст для сводки (БД не трогаем!).
    const firstMsgs = db.prepare(`
      SELECT id, role, content FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC, id ASC
      LIMIT 3
    `).all(conv.id) as Array<{ id: number; role: string; content: string }>;
    const lastMsgs = db.prepare(`
      SELECT id, role, content FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC, id DESC
      LIMIT 3
    `).all(conv.id) as Array<{ id: number; role: string; content: string }>;

    const seen = new Set<number>();
    const sampleParts: string[] = [];
    for (const m of [...firstMsgs, ...lastMsgs]) {
      const id = m.id as number;
      if (seen.has(id)) continue;
      seen.add(id);
      sampleParts.push(`${m.role}: ${m.content.slice(0, 800)}`);
    }
    const sample = sampleParts.join('\n');
    if (!sample.trim()) continue;

    const summary = await summarizeText(sample, { maxInputChars: 12000 });
    if (summary.trim().length > 0) {
      db.prepare(`UPDATE conversations SET summary = ? WHERE id = ?`).run(summary.trim(), conv.id);
      compressed++;
    } else {
      console.warn(`[Memory] Conversation #${conv.id} not summarized (LLM unavailable/failed) — messages kept intact`);
    }
  }

  return compressed;
}

export function promoteFrequentFacts(): number {
  const db = getDb();
  if (!db) return 0;

  // Часто используемые факты (>=5 использований) — честное повышение важности:
  // категория → preference, НО use_count сохраняется (реальная статистика).
  const frequent = db.prepare(`
    SELECT id, content, category, use_count FROM facts
    WHERE use_count >= 5 AND category = 'user'
    ORDER BY use_count DESC
    LIMIT 10
  `).all() as Array<{ id: number; content: string; category: string; use_count: number }>;

  let promoted = 0;
  for (const fact of frequent) {
    db.prepare(`UPDATE facts SET category = 'preference' WHERE id = ?`).run(fact.id);
    promoted++;
  }

  return promoted;
}

export function demoteStaleFacts(): number {
  const db = getDb();
  if (!db) return 0;

  // Устаревшие факты (не использовались 30+ дней, <3 использований) —
  // мягкое забывание через markFactForget (use_count = -1): факт прячется из top-N,
  // но не уничтожается безвозвратно. Защищённые категории не трогаем.
  const stale = db.prepare(`
    SELECT id, content, category FROM facts
    WHERE (last_used IS NULL OR last_used < datetime('now', '-30 days'))
      AND (use_count IS NULL OR use_count < 3)
      AND category NOT IN ('project', 'preference')
    LIMIT 20
  `).all() as Array<{ id: number; content: string; category: string }>;

  let demoted = 0;
  for (const fact of stale) {
    markFactForget(fact.id);
    demoted++;
  }

  return demoted;
}

export async function runMaintenance(): Promise<{ compressed: number; promoted: number; demoted: number }> {
  const compressed = await compressOldConversations();
  const promoted = promoteFrequentFacts();
  const demoted = demoteStaleFacts();
  return { compressed, promoted, demoted };
}
