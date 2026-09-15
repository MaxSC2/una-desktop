// apply-manifest-doc-fix.mjs — шапка MANIFEST.md под новую схему + .gitignore.
import { readFileSync, writeFileSync } from 'fs';

// 1) MANIFEST.md: инструкция про EXPECTED_FILES устарела (теперь JSON + автоблок)
{
  const p = 'MANIFEST.md';
  let s = readFileSync(p, 'utf8');
  const EOL = s.includes('\r\n') ? '\r\n' : '\n';
  const oldBlock = [
    '> ⚠️ Список файлов в этом документе и в `scripts/verify-manifest.js` (`EXPECTED_FILES`)',
    '> должны совпадать. При добавлении/удалении файла правятся **оба места**.',
  ].join(EOL);
  const newBlock = [
    '> ⚠️ Список файлов генерируется: `node scripts/sync-manifest.js` → `scripts/manifest-files.json`',
    '> (и Приложение A в конце этого файла). Вручную файлы не перечисляем — иначе манифест',
    '> снова разойдётся с деревом. Проверка целостности: `node scripts/verify-manifest.js`.',
  ].join(EOL);
  if (!s.includes(oldBlock)) throw new Error('MANIFEST.md: old header block not found');
  s = s.replace(oldBlock, newBlock);
  writeFileSync(p, s);
  console.log('MANIFEST.md header updated');
}

// 2) .gitignore: commit-msg.txt — временный артефакт коммитов
{
  const p = '.gitignore';
  let s = readFileSync(p, 'utf8');
  const EOL = s.includes('\r\n') ? '\r\n' : '\n';
  if (!s.includes('commit-msg.txt')) {
    s = s.replace(/\s*$/, '') + EOL + EOL + '# Временный файл сообщения коммита' + EOL + 'commit-msg.txt' + EOL;
    writeFileSync(p, s);
    console.log('.gitignore: commit-msg.txt added');
  } else {
    console.log('.gitignore: already contains commit-msg.txt');
  }
}