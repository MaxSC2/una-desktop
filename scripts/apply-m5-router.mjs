// apply-m5-router.mjs — M5: tool-loop переведён на единый router (L0/L1/L2). LF/EOL-preserving.
import { readFileSync, writeFileSync } from 'fs';

const p = 'electron/ai/tool-loop.ts';
const src = readFileSync(p, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const L = src.split(/\r?\n/);

const at = (n) => L[n - 1];
const must = (n, sub) => {
  if (!at(n).includes(sub)) throw new Error('line ' + n + ' mismatch: ' + JSON.stringify(at(n)));
};

const NEW_IMPORT = ["import { routeMessage } from './router';"];

const NEW_BLOCK = [
  '  // Router (M5): единая лестница L0-fast → L0-direct → L1-semantic → L1-regex → L2-llm.',
  '  const route = await routeMessage(userMessage, toolContext);',
  '',
  '  if (route.direct) {',
  '    const { direct } = route;',
  '    console.log(`[ToolLoop] ${route.layer} hit (${route.reason}) — LLM skipped`);',
  '',
  '    if (direct.fastPath) {',
  '      // Fast-path: сохраняем обмен в WARM-кэш и историю как псевдо-tool.',
  '      warmCacheAddMessage(\'user\', userMessage);',
  '      warmCacheAddMessage(\'assistant\', direct.text);',
  '      return {',
  '        finalText: direct.text,',
  '        toolCallHistory: [',
  '          {',
  '            name: \'_fast_path\',',
  '            args: direct.args,',
  '            result: direct.result,',
  '            timestamp: new Date().toISOString(),',
  '          },',
  '        ],',
  '        pendingConfirmation: null,',
  '        maxRoundsHit: false,',
  '        messages: [',
  '          { role: \'user\', content: userMessage },',
  '          { role: \'assistant\', content: direct.text },',
  '        ],',
  '        provider: undefined,',
  '      };',
  '    }',
  '',
  '    // L0-direct: детерминированный инструмент отработал без LLM.',
  '    if (onChunk) {',
  '      onChunk({ type: \'tool_start\', tools: [direct.tool] });',
  '      onChunk({ type: \'tool_done\' });',
  '    }',
  '    return {',
  '      finalText: direct.text,',
  '      toolCallHistory: [',
  '        {',
  '          name: direct.tool,',
  '          args: direct.args,',
  '          result: direct.result,',
  '          timestamp: new Date().toISOString(),',
  '        },',
  '      ],',
  '      pendingConfirmation: null,',
  '      maxRoundsHit: false,',
  '      messages: [],',
  '      provider: undefined,',
  '    };',
  '  }',
  '',
  '  const { intent, mode } = route;',
  '  let currentTools = route.tools;',
  '  console.log(',
  '    `[ToolLoop] ${route.layer}: intent=${intent}, mode=${mode}, tools: ${currentTools.length}/${getToolDefinitions().length} (${route.reason})`',
  '  );',
];

// Проверки границ
must(26, "import { detectIntent, filterToolsByIntent } from './intent';");
must(27, "import { tryFastCommand } from './fast-path';");
must(28, 'import { detectSemanticIntent, initSemanticRouter, SEMANTIC_CONFIDENCE_THRESHOLD }');
must(29, "import { resolveMode, filterToolsByMode, getModeConfig } from './modes';");
must(94, '// Определяем намерение и режим выполнения');
must(104, 'const fastReply = await tryFastCommand(userMessage, toolContext);');
must(133, 'const direct = await tryDirectCommand(userMessage, toolContext);');
must(142, 'let currentTools = filterToolsByMode(getToolDefinitions(), mode);');
must(143, 'console.log(');
must(389, '');
must(390, '/**');
must(391, 'L0 — детерминированный pre-router.');
must(481, '}');
must(483, '/**');
must(484, 'Handle screenshot/analyze_screen tools (need desktopCapturer + VLM).');

// Правки снизу вверх, чтобы не сбить индексы
L.splice(388, 93); // удалить строки 389..481 (дубль L0: APP_ALIASES + tryDirectCommand)
L.splice(93, 50, ...NEW_BLOCK); // заменить строки 94..143 на блок роутера
L.splice(25, 4, ...NEW_IMPORT); // заменить строки 26..29 на импорт роутера

writeFileSync(p, L.join(EOL));
console.log('tool-loop.ts: refactored to use router (imports + block + dedupe) OK');
console.log('lines before/after: ' + src.split(/\r?\n/).length + ' -> ' + L.length);