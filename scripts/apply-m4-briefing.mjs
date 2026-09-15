// apply-m4-briefing.mjs — актуализация docs/MENTOR_BRIEFING.md после M3/M4 (CRLF-preserving, line-indexed).
import { readFileSync, writeFileSync } from 'fs';

const p = 'docs/MENTOR_BRIEFING.md';
const src = readFileSync(p, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const L = src.split(/\r?\n/);

const at = (n) => L[n - 1];
const has = (n, sub, what) => {
  if (!at(n).includes(sub)) throw new Error('line ' + n + ' mismatch (' + what + '): ' + JSON.stringify(at(n)));
};

// --- 122: tool count in stale-doc warning ---
has(122, 'стало 24', 'stale warning');
L[121] = L[121].replace('стало 24', 'стало 25');

// --- 62..68: section 3 rewrite ---
has(62, '## 3. Что делаем сейчас', 'section 3 header');
has(68, 'env-loader.ts', 'section 3 tail');
L.splice(61, 7,
  '## 3. Что сделано в M3/M4 (в git) и что дальше',
  '',
  '- **M3 — Graphiti MCP как долговременная память: СДЕЛАНО.** `DEFAULT_MCP_SERVERS` в `mcp-adapter.ts`',
  '  автодетектит `~/graphiti-una/server.py` (venv-python, Ollama `127.0.0.1:11434/v1`,',
  '  `qwen3:1.7b` + `nomic-embed-text`, Kuzu DB в `C:\\Users\\Public\\una-graphiti`). Проверено',
  '  протокольно: `initialize` + `tools/list` = 3 tools (memory_add / memory_search / memory_status).',
  '- **M4 — честная память: СДЕЛАНО.** `summarizeText()` (`llm.ts`) — сводки только локальным Ollama,',
  '  иначе сжатие пропускается; `compression.ts` — LLM-сжатие только в простое (`shouldMaintainMemory`),',
  '  promote без сброса `use_count`, forget = мягкое забывание (`use_count = -1`) вместо DELETE;',
  '  `rlm.summarizeOldMessages` не теряет данные при недоступной модели; `env-loader.ts` подключён в `main.ts`.',
  '- **Аудит 15.09.2026:** `tsc` 0 ошибок, `vitest run` 203/203, `vite build` 0 ошибок,',
  '  `verify-manifest.js` 94/94 файлов, инструментов 25. Детали — в `HONEST_STATUS.md`.',
  '',
  '**Дальше (M5-кандидаты):** единый роутер L0/L1/L2; Memory Manager (значимость/уверенность/давность/забвение);',
  'интеграция multi-agent / autonomous-loop / skills; GUI-automation e2e на реальном рабочем столе.'
);

// --- 58: git commits ---
has(58, 'M1/M2 уже в', 'git line');
L[57] = '- M1–M4 уже в `git` (commit `cfb5314`); предыдущие — `1e2664a` (M2), `e2c73f1` (бриф).';

// --- 48: tools count ---
has(48, '24 инструмента', 'tools count');
L[47] = L[47].replace('24 инструмента', '25 инструментов');

writeFileSync(p, L.join(EOL));
console.log('MENTOR_BRIEFING.md updated (M3/M4 done + audit).');