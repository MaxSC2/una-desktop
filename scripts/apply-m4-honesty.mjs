// apply-m4-honesty.mjs — M4: честная память (no fake summaries, no hard deletes, no data loss).
// CRLF-безопасная правка через Node (как при M1/M2).
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, c) => writeFileSync(join(ROOT, p), c.split(/\r?\n/).join('\n'));

function replaceOnce(src, marker, newBlock, what) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('M4: anchor not found — ' + what);
  if (src.indexOf(marker, i + marker.length) >= 0) throw new Error('M4: anchor not unique — ' + what);
  return src.slice(0, i) + newBlock + src.slice(i + marker.length);
}

const log = [];

// ————— 1. main.ts: env-loader + await runMaintenance —————
let main = read('electron/main.ts');

main = replaceOnce(
  main,
  "import { autoUpdater } from 'electron-updater';\n",
  "import { autoUpdater } from 'electron-updater';\nimport { loadEnvFile } from './ai/env-loader';\n",
  'main.ts: import env-loader'
);
log.push('main.ts: env-loader import OK');

main = replaceOnce(
  main,
  'const configStore = getConfigStore();',
  'loadEnvFile();\nconst configStore = getConfigStore();',
  'main.ts: loadEnvFile call'
);
log.push('main.ts: loadEnvFile() before config OK');

main = replaceOnce(
  main,
  'return runMaintenance();',
  'return await runMaintenance();',
  'main.ts: await maintenance IPC'
);
log.push('main.ts: await runMaintenance OK');

write('electron/main.ts', main);

// ————— 2. life-loop.ts: await runMaintenance —————
let loop = read('electron/ai/life-loop.ts');

loop = replaceOnce(
  loop,
  'const result = runMaintenance();',
  'const result = await runMaintenance();',
  'life-loop.ts: await runMaintenance'
);
log.push('life-loop.ts: await runMaintenance OK');

write('electron/ai/life-loop.ts', loop);

// ————— 3. llm.ts: честный summarizeText —————
let llm = read('electron/ai/llm.ts');

const SUMMARIZE_TS = `/**
 * Честная суммаризация текста локальной моделью (Ollama).
 *
 * Возвращает '' если Ollama недоступна или запрос не удался —
 * вызывающий код ДОЛЖЕН пропустить сжатие, а не фабриковать краткое содержание.
 */
export async function summarizeText(
  text: string,
  options?: { maxInputChars?: number; temperature?: number }
): Promise<string> {
  const cfg = getLLMConfig();
  // Только локальный Ollama — бесплатно, приватно, без неожиданных облачных расходов.
  if (cfg.provider !== 'local' && cfg.provider !== 'auto') return '';

  const available = await isOllamaAvailable(cfg.localUrl);
  if (!available) return '';

  const maxInputChars = options?.maxInputChars ?? 12000;
  const truncated = text.length > maxInputChars
    ? text.slice(0, maxInputChars) + '\\n…'
    : text;

  try {
    const resp = await fetch(\`\${cfg.localUrl}/api/chat\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.localModel,
        messages: [
          {
            role: 'system',
            content:
              'Ты — система сжатия долговременной памяти. Сократи переписку до краткого резюме на русском: ' +
              'ключевые факты, решения, предпочтения пользователя. 3–7 предложений, без воды и нумерации. ' +
              'Если контента мало — верни 1–2 предложения.',
          },
          { role: 'user', content: truncated },
        ],
        stream: false,
        options: { temperature: options?.temperature ?? 0.2, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(90000),
    });
    const data = (await resp.json()) as { message?: { content?: string }; error?: string };
    if (data.error) throw new Error(data.error);
    const content = (data.message?.content ?? '').trim();
    return content.length > 20 ? content : '';
  } catch (e) {
    console.warn(\`[LLM] summarizeText failed: \${(e as Error).message}\`);
    return '';
  }
}
`;

const LLM_ANCHOR = '/**\n * Главный метод — чат с tools.\n */\nexport async function chatWithTools(';

llm = replaceOnce(
  llm,
  LLM_ANCHOR,
  SUMMARIZE_TS + '\n\n' + LLM_ANCHOR,
  'llm.ts: summarizeText insert'
);
log.push('llm.ts: summarizeText OK');

write('electron/ai/llm.ts', llm);

// ————— 4. rlm.ts: честная summarizeOldMessages —————
let rlm = read('electron/memory/rlm.ts');

rlm = replaceOnce(
  rlm,
  "import { findRelevantPods, classifyToPod } from './pods';\n",
  "import { findRelevantPods, classifyToPod } from './pods';\nimport { summarizeText } from '../ai/llm';\n",
  'rlm.ts: import summarizeText'
);
log.push('rlm.ts: import summarizeText OK');

const OLD_SUMMARIZE_START = '/**\n * Summarize old messages';
const OLD_SUMMARIZE_END = '// ============================================================\n// SYSTEM PROMPT WITH MEMORY INSTRUCTIONS';

const NEW_SUMMARIZE = `/**
 * Честная суммаризация: только если LLM реально доступен.
 *
 * Если сжать не удалось — сообщения остаются нетронутыми (без потери данных,
 * без псевдо-сводок из обрезков текста).
 */
async function summarizeOldMessages(n: number): Promise<string> {
  if (n <= 0) return '';
  const messages = warmCacheGetMessages(n);
  if (messages.length === 0) return '';

  const text = messages.map((m) => \`\${m.role}: \${m.content}\`).join('\\n');
  const summary = await summarizeText(text, { maxInputChars: 8000 });
  if (summary.trim().length > 0) {
    // Заменяем сжатые сообщения одним компактным резюме — не выбрасываем данные.
    const kept = warmCache.messages.slice(0, -n);
    warmCache.messages = [...kept, { role: 'system' as const, content: \`[Сводка] \${summary.trim()}\`, timestamp: new Date().toISOString() }];
    return summary.trim();
  }

  // LLM недоступен/не удалось — ничего не трогаем. Не фабрикуем псевдо-сводку.
  console.warn(\`[RLM] summarize skipped: LLM unavailable/failed (\${n} messages retained)\`);
  return '';
}
`;

const sIdx = rlm.indexOf(OLD_SUMMARIZE_START);
if (sIdx < 0) throw new Error('M4: rlm summarize start not found');
const eIdx = rlm.indexOf(OLD_SUMMARIZE_END, sIdx);
if (eIdx < 0) throw new Error('M4: rlm summarize end not found');
const oldBlock = rlm.slice(sIdx, eIdx);
if (!oldBlock.includes('async function summarizeOldMessages')) throw new Error('M4: rlm summarize block mismatch');
rlm = rlm.slice(0, sIdx) + NEW_SUMMARIZE + '\n\n' + rlm.slice(eIdx);
log.push('rlm.ts: summarizeOldMessages honest rewrite OK');

write('electron/memory/rlm.ts', rlm);

// ————— 5. compression.ts: честная переписка (полностью) —————
const NB = '\n';

const NEW_COMPRESSION = [
  "import { getDb, markFactForget } from '../memory/store';",
  "import { summarizeText } from './llm';",
  "import { shouldMaintainMemory } from './resource-manager';",
  '',
  '/**',
  ' * M4: честная сборка памяти.',
  ' *',
  ' * 1. Суммаризация старых бесед — ТОЛЬКО когда система простаивает и ресурсы позволяют,',
  ' *    и только если LLM реально вернул сводку (иначе пропускаем — никаких псевдо-сводок из обрезков).',
  ' *',
  ' * 2. Часто используемые факты повышаем до «предпочтения», но use_count НЕ сбрасываем —',
  ' *    это честная статистика использования, а не демо-промоушен.',
  ' *',
  ' * 3. Устаревшие факты — мягкое забывание (markFactForget: use_count = -1; никаких DELETE).',
  ' */',
  '',
  'export async function compressOldConversations(): Promise<number> {',
  '  const db = getDb();',
  '  if (!db) return 0;',
  '',
  '  // Старые беседы (старше 7 дней, без summary).',
  '  const oldConvs = db.prepare(`',
  '    SELECT c.id, c.summary,',
  '      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as msg_count',
  '    FROM conversations c',
  '    WHERE c.ended_at IS NOT NULL',
  "      AND (c.summary IS NULL OR c.summary = '')",
  "      AND c.ended_at < datetime('now', '-7 days')",
  '    ORDER BY c.ended_at ASC',
  '    LIMIT 5',
  '  `).all() as Array<{ id: number; summary: string | null; msg_count: number }>;',
  '',
  '  if (oldConvs.length === 0) return 0;',
  '',
  '  // LLM-суммаризация — только в простое и при свободных ресурсах.',
  '  if (!shouldMaintainMemory()) {',
  '    console.log(`[Memory] Skipping ' + '${oldConvs.length}' + ' old conversation(s): LLM summarization requires idle/resources`);',
  '    return 0;',
  '  }',
  '',
  '  let compressed = 0;',
  '  for (const conv of oldConvs) {',
  '    // Первые 3 и последние 3 сообщения — честный контекст для сводки (БД не трогаем!).',
  '    const firstMsgs = db.prepare(`',
  '      SELECT id, role, content FROM messages',
  '      WHERE conversation_id = ?',
  '      ORDER BY timestamp ASC, id ASC',
  '      LIMIT 3',
  '    `).all(conv.id) as Array<{ id: number; role: string; content: string }>;',
  '    const lastMsgs = db.prepare(`',
  '      SELECT id, role, content FROM messages',
  '      WHERE conversation_id = ?',
  '      ORDER BY timestamp DESC, id DESC',
  '      LIMIT 3',
  '    `).all(conv.id) as Array<{ id: number; role: string; content: string }>;',
  '',
  '    const seen = new Set<number>();',
  '    const sampleParts: string[] = [];',
  '    for (const m of [...firstMsgs, ...lastMsgs]) {',
  '      const id = m.id as number;',
  '      if (seen.has(id)) continue;',
  '      seen.add(id);',
  '      sampleParts.push(`' + '${m.role}' + ': ' + '${m.content.slice(0, 800)}' + '`);',
  '    }',
  "    const sample = sampleParts.join('\\n');",
  '    if (!sample.trim()) continue;',
  '',
  '    const summary = await summarizeText(sample, { maxInputChars: 12000 });',
  '    if (summary.trim().length > 0) {',
  '      db.prepare(`UPDATE conversations SET summary = ? WHERE id = ?`).run(summary.trim(), conv.id);',
  '      compressed++;',
  '    } else {',
  '      console.warn(`[Memory] Conversation #' + '${conv.id}' + ' not summarized (LLM unavailable/failed) — messages kept intact`);',
  '    }',
  '  }',
  '',
  '  return compressed;',
  '}',
  '',
  'export function promoteFrequentFacts(): number {',
  '  const db = getDb();',
  '  if (!db) return 0;',
  '',
  '  // Часто используемые факты (>=5 использований) — честное повышение важности:',
  '  // категория → preference, НО use_count сохраняется (реальная статистика).',
  '  const frequent = db.prepare(`',
  '    SELECT id, content, category, use_count FROM facts',
  "    WHERE use_count >= 5 AND category = 'user'",
  '    ORDER BY use_count DESC',
  '    LIMIT 10',
  '  `).all() as Array<{ id: number; content: string; category: string; use_count: number }>;',
  '',
  '  let promoted = 0;',
  '  for (const fact of frequent) {',
  "    db.prepare(`UPDATE facts SET category = 'preference' WHERE id = ?`).run(fact.id);",
  '    promoted++;',
  '  }',
  '',
  '  return promoted;',
  '}',
  '',
  'export function demoteStaleFacts(): number {',
  '  const db = getDb();',
  '  if (!db) return 0;',
  '',
  '  // Устаревшие факты (не использовались 30+ дней, <3 использований) —',
  '  // мягкое забывание через markFactForget (use_count = -1): факт прячется из top-N,',
  '  // но не уничтожается безвозвратно. Защищённые категории не трогаем.',
  '  const stale = db.prepare(`',
  '    SELECT id, content, category FROM facts',
  "    WHERE (last_used IS NULL OR last_used < datetime('now', '-30 days'))",
  '      AND (use_count IS NULL OR use_count < 3)',
  "      AND category NOT IN ('project', 'preference')",
  '    LIMIT 20',
  '  `).all() as Array<{ id: number; content: string; category: string }>;',
  '',
  '  let demoted = 0;',
  '  for (const fact of stale) {',
  '    markFactForget(fact.id);',
  '    demoted++;',
  '  }',
  '',
  '  return demoted;',
  '}',
  '',
  'export async function runMaintenance(): Promise<{ compressed: number; promoted: number; demoted: number }> {',
  '  const compressed = await compressOldConversations();',
  '  const promoted = promoteFrequentFacts();',
  '  const demoted = demoteStaleFacts();',
  '  return { compressed, promoted, demoted };',
  '}',
  '',
].join(NB);

write('electron/ai/compression.ts', NEW_COMPRESSION);
log.push('compression.ts: honest rewrite OK');

console.log(log.join(NB));
console.log('[M4] OK — all edits applied.');

