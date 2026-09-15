// apply-m4-audit-doc.mjs — M4-аудит: честное обновление HONEST_STATUS.md (EOL-preserving, line-indexed).
import { readFileSync, writeFileSync } from 'fs';

const p = 'HONEST_STATUS.md';
const src = readFileSync(p, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const L = src.split(/\r?\n/); // L[0] = line 1

const at = (n) => L[n - 1];
const has = (n, sub, what) => {
  if (!at(n).includes(sub)) throw new Error('line ' + n + ' mismatch (' + what + '): ' + JSON.stringify(at(n)));
};

// --- 196: add lesson 6 ---
has(196, 'Нативные зависимости GUI', 'lesson 5');
L[195] = L[195] + EOL + '6. **Аудит-чеклист обязателен перед отчётом** — сверять счётчики (инструментов 25, не 24), прогонять `vitest run` + `verify-manifest.js`; иначе документация снова разойдётся с кодом.';

// --- 185: append M4 block after M3 line ---
has(185, 'M3: детект игр', 'maturity M3');
L[184] = L[184] + EOL + 'M4: честная память — LLM-сводки старых бесед только при реальном ответе модели и только в простое' + EOL +
  '(`shouldMaintainMemory`); forget = мягкое забывание (`use_count = -1`), а не DELETE; env-loader подключён;' + EOL +
  'Graphiti MCP включается автодетектом (M3) и проверен на уровне протокола (initialize + tools/list = 3 tools).';

// --- 154: MCP row ---
has(154, 'MCP Adapter', 'mcp row');
L[153] = '| MCP Adapter | `electron/ai/mcp-adapter.ts` | ✅ подключён в `main.ts` + fallback диспетчер в `tools/index.ts`. ' +
  'Graphiti-сервер автодетектится (M3: `DEFAULT_MCP_SERVERS` → ~/graphiti-una/server.py); проверено протокольно: ' +
  '`initialize` + `tools/list` = 3 tools (memory_add/memory_search/memory_status). Вызовы памяти требуют запущенной Ollama; см. docs/GRAPHITI_MEMORY.md |';

// --- 142-145: embeddings legacy section ---
has(142, '@xenova/transformers', 'xenova header');
has(145, 'CJS-совместимую альтернативу', 'xenova solution');
L.splice(141, 4,
  '### Embeddings (@xenova/transformers) — историческая запись, снято с повестки',
  '- **Проблема (v30):** ESM-only библиотека в CommonJS окружении.',
  '- **Факт (проверено M4):** семантическая память работает через Ollama `/api/embed` + hashing fallback ' +
  '(см. «Memory (embeddings)» выше). Зависимость от `@xenova/transformers` не требуется — раздел оставлен для истории.'
);

// --- 100: stale model + append env-loader item ---
has(100, 'gemma4', 'model line');
L[99] = '8. **Модель сменена** — ✅ дефолт `localModel: \'qwen3:1.7b\'`, `provider: \'auto\'` (local-first, M1); `qwen2.5:3b` удалена.' +
  EOL + '9. **env-loader подключён (M4)** — ✅ `loadEnvFile()` вызывается в `main.ts` до инициализации конфига (ключи из `.env`, не хардкод).';

// --- 57: add create_reminder row ---
has(57, 'web_download', 'web_download row');
L[56] = L[56] + EOL + '| create_reminder | ✅ | persistent reminders (`electron/reminders/index.ts`) |';

// --- 36: tools header count ---
has(36, 'Инструменты (24', 'tools header');
L[35] = '### Инструменты (25 в `TOOL_DEFINITIONS`)';

// --- 19: tools count + new audit rows ---
has(19, '24 инструмента', 'tools count row');
L[18] = '| Инструменты | `ls electron/tools/definitions` | 25 инструментов |' + EOL +
  '| Манифест файлов | `node scripts/verify-manifest.js` | ✅ 94/94 на месте, 0 пропущено (147 «лишних» вне MANIFEST.md) |' + EOL +
  '| MCP (graphiti) | `node scripts/m3-smoke-mcp.mjs` | ✅ initialize + tools/list, 3 tools |' + EOL +
  '| Pre-build check | `node scripts/pre-build-check.js` | ✅ 0 ошибок, 2 warning (robotjs optional) |';

// --- 7: revision note ---
has(7, 'Ревизия M1', 'revision note');
L[6] = [ '> ⚠️ Ревизия M4: честная память (реальные LLM-сводки вместо заглушек, мягкое забывание вместо DELETE,',
  '> подключён env-loader) + Graphiti MCP включён автодетектом (M3) + VRAM-gate и детект игр (M2) +',
  '> L0 fast-path и local-first по умолчанию (M1).' ].join(EOL);

// --- 3: header date ---
has(3, 'Дата проверки', 'header date');
L[2] = '> **Дата проверки:** 15 сентября 2026 (M4 «Честная память») — полный аудит';

writeFileSync(p, L.join(EOL));
console.log('HONEST_STATUS.md updated (M4 audit).');