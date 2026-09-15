#!/usr/bin/env node
/**
 * sync-manifest.js — единый источник правды о файлах проекта.
 *
 * Что делает:
 *  1. Обходит дерево с общими исключениями (артефакты/зависимости).
 *  2. Пишет scripts/manifest-files.json (список файлов + правила исключений).
 *  3. Обновляет MANIFEST.md: счётчик файлов и авто-блок между маркерами
 *     <!-- MANIFEST:AUTO:BEGIN --> ... <!-- MANIFEST:AUTO:END -->.
 *  4. Печатает diff с предыдущим списком (added/removed) — честно, без «молчаливой» правки.
 *
 * Запуск: node scripts/sync-manifest.js
 * Проверка целостности: node scripts/verify-manifest.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(__dirname, 'manifest-files.json');
const MANIFEST_MD = path.join(ROOT, 'MANIFEST.md');

// Общие правила исключений (используются и в verify-manifest.js)
const EXCLUDE_DIRS = [
  'node_modules/',
  '.git/',
  'dist/',
  'dist-electron/',
  'release/',
  'out/',
  'build/',
  'coverage/',
  'test-downloads/',
  '.vscode/',
  '.idea/',
  '.una/',
];
const EXCLUDE_SUFFIXES = ['.log', '.zip', '.db', '.db-journal', '.db-wal', '.db-shm', '.bak', '.tmp', '.swp', '.swo'];
const EXCLUDE_NAMES = ['package-lock.json', 'package.json.bak', 'commit-msg.txt', 'nul', 'Thumbs.db', 'desktop.ini', 'scripts/manifest-files.json'];

function isExcluded(rel) {
  if (EXCLUDE_DIRS.some((d) => rel.startsWith(d))) return true;
  if (EXCLUDE_SUFFIXES.some((s) => rel.endsWith(s))) return true;
  if (EXCLUDE_NAMES.includes(rel)) return true;
  return false;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (isExcluded(rel)) continue;
    if (entry.isDirectory()) walk(full, out);
    else out.push(rel);
  }
  return out;
}

const files = walk(ROOT, []).sort();

// --- diff с прошлым списком (честность: что изменилось) ---
let prev = [];
try {
  prev = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')).files ?? [];
} catch {
  prev = [];
}
const added = files.filter((f) => !prev.includes(f));
const removed = prev.filter((f) => !files.includes(f));

fs.writeFileSync(
  JSON_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: 'Автогенерируется scripts/sync-manifest.js. Единый источник правды для verify-manifest.js.',
      excludeDirs: EXCLUDE_DIRS,
      excludeSuffixes: EXCLUDE_SUFFIXES,
      excludeNames: EXCLUDE_NAMES,
      total: files.length,
      files,
    },
    null,
    2
  ) + '\n'
);

// --- MANIFEST.md: счётчик + авто-блок ---
let md = fs.readFileSync(MANIFEST_MD, 'utf8');
const EOL = md.includes('\r\n') ? '\r\n' : '\n';

md = md.replace(/^(> \*\*Всего файлов:\*\*).*$/m, '$1 ' + files.length);
md = md.replace(/^(> \*\*Последнее обновление:\*\*).*$/m, '$1 v40 (15 сентября 2026, M4) — сверено с деревом');

const groups = new Map();
for (const f of files) {
  const dir = f.includes('/') ? f.split('/').slice(0, f.includes('/') ? 1 : 0).join('/') : '(root)';
  const key = dir === '(root)' ? '(root)' : dir;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(f);
}

const autoLines = [
  '<!-- MANIFEST:AUTO:BEGIN -->',
  '## Приложение A — автосписок файлов (генерируется)',
  '',
  '> Источник правды: `scripts/manifest-files.json`. Обновление: `node scripts/sync-manifest.js`.',
  '> Не редактировать вручную — блок перезаписывается.',
  '',
  `> **Всего файлов:** ${files.length} · **Сгенерировано:** ${new Date().toISOString().slice(0, 10)}`,
  '',
  '```',
];
for (const [key, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  autoLines.push(`## ${key} (${list.length})`);
  for (const f of list) autoLines.push(`  ${f}`);
  autoLines.push('');
}
autoLines.push('```', '<!-- MANIFEST:AUTO:END -->');

const BEGIN = '<!-- MANIFEST:AUTO:BEGIN -->';
const END = '<!-- MANIFEST:AUTO:END -->';
const block = autoLines.join(EOL);
if (md.includes(BEGIN) && md.includes(END)) {
  const start = md.indexOf(BEGIN);
  const end = md.indexOf(END) + END.length;
  md = md.slice(0, start) + block + md.slice(end);
} else {
  md = md.replace(/\s*$/, '') + EOL + EOL + '---' + EOL + EOL + block + EOL;
}

fs.writeFileSync(MANIFEST_MD, md);

console.log(`[sync-manifest] files: ${files.length}`);
console.log(`[sync-manifest] added: ${added.length}${added.length ? ' -> ' + added.slice(0, 12).join(', ') + (added.length > 12 ? ' …' : '') : ''}`);
console.log(`[sync-manifest] removed: ${removed.length}${removed.length ? ' -> ' + removed.join(', ') : ''}`);
console.log('[sync-manifest] wrote scripts/manifest-files.json + MANIFEST.md auto-block');