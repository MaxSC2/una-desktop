#!/usr/bin/env node
/**
 * U.N.A. Desktop — File Integrity Checker
 *
 * Проверяет что все файлы из MANIFEST.md существуют в проекте.
 * Запуск: node scripts/verify-manifest.js
 *
 * Exit codes:
 *  0 — все файлы на месте
 *  1 — есть пропавшие файлы
 *  2 — критическая ошибка
 */

const fs = require('fs');
const path = require('path');

// Полный список файлов проекта (из MANIFEST.md)
const EXPECTED_FILES = [
  // Корневые
  '.cursorrules',
  '.env.example',
  '.gitignore',
  'README.md',
  'MANIFEST.md',
  'CHANGELOG.md',
  'INSTALL.md',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'index.html',
  'start.bat',
  'install.bat',
  'start.ps1',
  'start.sh',

  // Корневые документы (опциональные метаданные/исследование)
  'AGENTS.md',
  'AUDIT_REPORT.md',
  'HONEST_STATUS.md',
  'UNA_Research.pdf',

  // assets
  'assets/icon.png',

  // docs
  'docs/ARCHITECTURE.md',
  'docs/BACKGROUND.md',
  'docs/CODE.md',
  'docs/HARDWARE.md',
  'docs/INSTALL.md',
  'docs/MEMORY.md',
  'docs/SECURITY.md',
  'docs/MASCOT_TZ.md',

  // electron
  'electron/main.ts',
  'electron/preload.ts',
  'electron/tsconfig.json',
  'electron/ai/llm.ts',
  'electron/ai/config.ts',
  'electron/ai/intent.ts',
  'electron/ai/tool-loop.ts',
  'electron/ai/asr.ts',
  'electron/ai/tts.ts',
  'electron/ai/web-tools.ts',
  'electron/ai/code-tools.ts',
  'electron/ai/goal-tracker.ts',
  'electron/ai/autonomous-loop.ts',
  'electron/ai/rollback.ts',
  'electron/ai/mcp-adapter.ts',
  'electron/ai/skills.ts',
  'electron/ai/gui-automation.ts',
  'electron/ai/background-monitor.ts',
  'electron/ai/proactive.ts',
  'electron/ai/work-context.ts',
  'electron/ai/dynamic-prompt/index.ts',
  'electron/agents/index.ts',
  'electron/agents/rlm-extensions.ts',
  'electron/memory/store.ts',
  'electron/memory/rlm.ts',
  'electron/safety/classifier.ts',
  'electron/tools/index.ts',
  'electron/validation/schemas.ts',

  // src
  'src/App.tsx',
  'src/main.tsx',
  'src/components/ChatPanel.tsx',
  'src/components/MarkdownRenderer.tsx',
  'src/components/CodeBlock.tsx',
  'src/components/OnboardingWizard.tsx',
  'src/components/UnaAvatar.tsx',
  'src/components/MiniOverlay.tsx',
  'src/components/QuickPalette.tsx',
  'src/components/EmotionPanel.tsx',
  'src/components/WorkPanel.tsx',
  'src/components/SettingsPanel.tsx',
  'src/components/MemoryPanel.tsx',
  'src/components/FilesPanel.tsx',
  'src/components/ConfirmationDialog.tsx',
  'src/components/ErrorBoundary.tsx',
  'src/components/Orb.tsx',
  'src/components/UnaMascot.tsx',
  'src/components/RiveMascot.tsx',
  'src/hooks/useUNA.ts',
  'src/lib/store.ts',
  'src/lib/api.ts',
  'src/lib/toast-utils.ts',
  'src/styles/index.css',

  // prompts
  'prompts/system.ts',

  // scripts
  'scripts/setup.js',
  'scripts/verify-manifest.js',
  'scripts/pre-build-check.js',
  'scripts/test-web-tools.ts',
  'scripts/test-code-tools.ts',

  // tests
  'tests/ai/web-tools.test.ts',
  'tests/ai/web-tools-integration.test.ts',
  'tests/ai/code-tools.test.ts',
  'tests/ai/code-tools-integration.test.ts',
  'tests/safety/classifier.test.ts',
];

const ROOT = path.join(__dirname, '..');

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(msg, color = 'reset') {
  console.log(`${COLORS[color] || ''}${msg}${COLORS.reset}`);
}

function main() {
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  U.N.A. Desktop — File Integrity Checker', 'bold');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const missing = [];
  const present = [];
  let totalSize = 0;

  for (const file of EXPECTED_FILES) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      present.push(file);
      totalSize += stat.size;
    } else {
      missing.push(file);
    }
  }

  // Также проверяем наличие лишних файлов (не в манифесте, но в проекте)
  const allFiles = new Set();
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');

      // Skip excluded
      if (
        relPath.startsWith('node_modules/') ||
        relPath.startsWith('.git/') ||
        relPath.startsWith('dist/') ||
        relPath.startsWith('dist-electron/') ||
        relPath.startsWith('coverage/') ||
        relPath.startsWith('test-downloads/') ||
        relPath.endsWith('.log') ||
        relPath === 'package-lock.json' ||
        relPath === 'package.json.bak'
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        allFiles.add(relPath);
      }
    }
  }
  walk(ROOT);

  const expectedSet = new Set(EXPECTED_FILES);
  const extra = Array.from(allFiles).filter((f) => !expectedSet.has(f)).sort();

  // Отчёт
  log(`📊 Ожидается файлов: ${EXPECTED_FILES.length}`, 'cyan');
  log(`✅ Найдено: ${present.length}`, 'green');
  log(`❌ Пропущено: ${missing.length}`, missing.length > 0 ? 'red' : 'green');
  log(`📦 Общий размер: ${(totalSize / 1024).toFixed(1)} KB`, 'cyan');
  log(`📝 Лишних файлов: ${extra.length}`, extra.length > 0 ? 'yellow' : 'green');
  log('');

  if (missing.length > 0) {
    log('═══════════════════════════════════════════════════════════', 'red');
    log('  ❌ ПРОПАВШИЕ ФАЙЛЫ:', 'red');
    log('═══════════════════════════════════════════════════════════', 'red');
    for (const file of missing) {
      log(`  ✗ ${file}`, 'red');
    }
    log('');
    log('  Действия для восстановления:', 'yellow');
    log('  1. Проверить git history: git log --oneline -- <file>', 'yellow');
    log('  2. Восстановить: git checkout HEAD -- <file>', 'yellow');
    log('  3. Или распаковать из последнего архива U.N.A.', 'yellow');
    log('  4. После восстановления — запустить снова', 'yellow');
    log('');
    process.exit(1);
  }

  if (extra.length > 0) {
    log('═══════════════════════════════════════════════════════════', 'yellow');
    log('  ⚠ ЛИШНИЕ ФАЙЛЫ (не в MANIFEST.md):', 'yellow');
    log('═══════════════════════════════════════════════════════════', 'yellow');
    for (const file of extra) {
      log(`  + ${file}`, 'yellow');
    }
    log('');
    log('  Если это новые файлы — добавьте их в MANIFEST.md', 'cyan');
    log('  Если временные — удалите', 'cyan');
    log('');
  }

  log('═══════════════════════════════════════════════════════════', 'green');
  log('  ✓ Все файлы проекта на месте!', 'green');
  log('═══════════════════════════════════════════════════════════\n', 'green');

  process.exit(0);
}

try {
  main();
} catch (e) {
  log(`\n✗ Критическая ошибка: ${e.message}`, 'red');
  console.error(e);
  process.exit(2);
}
