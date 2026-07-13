import { listFacts, saveFact, getDb } from '../memory/store';

export function compressOldConversations(): number {
  const db = getDb();
  if (!db) return 0;

  // Find conversations older than 7 days without a summary
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

  let compressed = 0;
  for (const conv of oldConvs) {
    // Get first and last messages as a minimal summary
    const msgs = db.prepare(`
      SELECT role, content FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
      LIMIT 3
    `).all(conv.id) as Array<{ role: string; content: string }>;

    const lastMsg = db.prepare(`
      SELECT content FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(conv.id) as { content: string } | undefined;

    if (msgs.length > 0) {
      const summary = `Беседа (${conv.msg_count} сообщений). Начало: ${msgs[0]?.content?.slice(0, 100)}. Конец: ${lastMsg?.content?.slice(0, 100)}`;
      db.prepare(`UPDATE conversations SET summary = ? WHERE id = ?`).run(summary, conv.id);
      compressed++;
    }
  }

  return compressed;
}

export function promoteFrequentFacts(): number {
  const db = getDb();
  if (!db) return 0;

  // Find facts used >5 times, promote by updating their category
  const frequent = db.prepare(`
    SELECT id, content, category, use_count FROM facts
    WHERE use_count >= 5 AND category = 'user'
    ORDER BY use_count DESC
    LIMIT 10
  `).all() as Array<{ id: number; content: string; category: string; use_count: number }>;

  let promoted = 0;
  for (const fact of frequent) {
    // Promote to 'preference' — this is highly used info
    db.prepare(`UPDATE facts SET category = 'preference', use_count = 0 WHERE id = ?`).run(fact.id);
    promoted++;
  }

  return promoted;
}

export function demoteStaleFacts(): number {
  const db = getDb();
  if (!db) return 0;

  // Find facts unused for >30 days with <3 uses
  const stale = db.prepare(`
    SELECT id, content, category FROM facts
    WHERE (last_used IS NULL OR last_used < datetime('now', '-30 days'))
      AND (use_count IS NULL OR use_count < 3)
      AND category NOT IN ('project', 'preference')
    LIMIT 20
  `).all() as Array<{ id: number; content: string; category: string }>;

  let demoted = 0;
  for (const fact of stale) {
    // Mark as forget
    db.prepare(`DELETE FROM facts WHERE id = ?`).run(fact.id);
    demoted++;
  }

  return demoted;
}

export function runMaintenance(): { compressed: number; promoted: number; demoted: number } {
  const compressed = compressOldConversations();
  const promoted = promoteFrequentFacts();
  const demoted = demoteStaleFacts();
  return { compressed, promoted, demoted };
}
