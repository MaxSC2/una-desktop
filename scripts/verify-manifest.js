#!/usr/bin/env node
/**
 * U.N.A. Desktop — File Integrity Checker
 *
 * Проверяет, что все файлы проекта на месте (и что в дереве нет «тихих» лишних).
 * Источник правды: scripts/manifest-files.json (генерируется scripts/sync-manifest.js).
 * Если JSON отсутствует — используется встроенный fallback-список.
 *
 * Запуск: node scripts/verify-manifest.js
 * Exit: 0 — все файлы на месте; 1 — есть пропавшие; 2 — критическая ошибка.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(__dirname, 'manifest-files.json');

// Fallback (используется только если manifest-files.json не найден)
const FALLBACK_FILES = [
  '.cursorrules', '.env.example', '.gitignore', 'README.md', 'MANIFEST.md', 'CHANGELOG.md', 'INSTALL.md',
  'package.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'tailwind.config.js',
  'postcss.config.js', 'index.html',
  'electron/main.ts', 'electron/preload.ts', 'electron/tsconfig.json',
  'electron/ai/llm.ts', 'electron/ai/config.ts', 'electron/ai/intent.ts', 'electron/ai/tool-loop.ts',
  'electron/ai/mcp-adapter.ts', 'electron/ai/gui-automation.ts',
  'electron/memory/store.ts', 'electron/memory/rlm.ts',
  'electron/tools/index.ts', 'electron/validation/schemas.ts',
  'prompts/system.ts',
];

const DEFAULT_DIRS = ['node_modules/', '.git/', 'dist/', 'dist-electron/', 'release/', 'out/', 'build/', 'coverage/', 'test-downloads/', '.vscode/', '.idea/', '.una/', '.agents/', '.kilo/'];
const DEFAULT_SUFFIXES = ['.log', '.zip', '.db', '.db-journal', '.db-wal', '.db-shm', '.bak', '.tmp', '.swp', '.swo'];
const DEFAULT_NAMES = ['.git', 'package-lock.json', 'package.json.bak', 'commit-msg.txt', 'nul', 'Thumbs.db', 'desktop.ini', 'scripts/manifest-files.json'];

function loadSource() {
  try {
    const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    if (!Array.isArray(raw.files) || raw.files.length === 0) throw new Error('empty files[]');
    return {
      files: raw.files,
      dirs: raw.excludeDirs ?? DEFAULT_DIRS,
      suffixes: raw.excludeSuffixes ?? DEFAULT_SUFFIXES,
      names: raw.excludeNames ?? DEFAULT_NAMES,
      generatedAt: raw.generatedAt ?? '(unknown)',
      source: 'manifest-files.json',
    };
  } catch {
    return {
      files: FALLBACK_FILES,
      dirs: DEFAULT_DIRS,
      suffixes: DEFAULT_SUFFIXES,
      names: DEFAULT_NAMES,
      generatedAt: '(fallback)',
      source: 'built-in fallback',
    };
  }
}

function main() {
  const src = loadSource();

  const isExcluded = (rel) =>
    src.dirs.some((d) => rel.startsWith(d)) ||
    src.suffixes.some((s) => rel.endsWith(s)) ||
    src.names.includes(rel);

  const present = [];
  const missing = [];
  let totalSize = 0;
  for (const file of src.files) {
    const full = path.join(ROOT, file);
    if (fs.existsSync(full)) {
      present.push(file);
      totalSize += fs.statSync(full).size;
    } else {
      missing.push(file);
    }
  }

  const allFiles = new Set();
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (isExcluded(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else allFiles.add(rel);
    }
  })(ROOT);

  const expectedSet = new Set(src.files);
  const extra = Array.from(allFiles).filter((f) => !expectedSet.has(f)).sort();

  const line = '═══════════════════════════════════════════════════════════';
  console.log('\n' + line);
  console.log('  U.N.A. Desktop — File Integrity Checker');
  console.log('  источник: ' + src.source + ' (сгенерирован: ' + src.generatedAt + ')');
  console.log(line);
  console.log(` Ожидается файлов: ${src.files.length}`);
  console.log(`✅ Найдено: ${present.length}`);
  console.log(`❌ Пропущено: ${missing.length}`);
  console.log(`📦 Общий размер: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`📝 Лишних файлов: ${extra.length}`);
  console.log('');

  if (missing.length > 0) {
    console.log(line);
    console.log('   ПРОПАВШИЕ ФАЙЛЫ:');
    console.log(line);
    for (const f of missing) console.log('  ✗ ' + f);
    console.log('');
    console.log('  Восстановление: git checkout HEAD -- <file> · либо из архива U.N.A.');
    console.log('  После изменения дерева: node scripts/sync-manifest.js');
    console.log('');
    process.exit(1);
  }

  if (extra.length > 0) {
    console.log(line);
    console.log('   ЛИШНИЕ ФАЙЛЫ (в дереве, но не в манифесте):');
    console.log(line);
    for (const f of extra) console.log('  + ' + f);
    console.log('');
    console.log('  Если это новые файлы проекта — node scripts/sync-manifest.js (обновит манифест)');
    console.log('  Если это артефакты — добавьте правило исключения в scripts/sync-manifest.js');
    console.log('');
  }

  console.log(line);
  console.log('  ✓ Все файлы проекта на месте!' + (extra.length === 0 ? ' (лишних нет)' : ''));
  console.log(line + '\n');
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.log('\n✗ Критическая ошибка: ' + e.message);
  console.error(e);
  process.exit(2);
}
