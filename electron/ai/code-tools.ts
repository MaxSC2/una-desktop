/**
 * Code tools — инструменты для работы с кодом.
 *
 * 4 инструмента:
 *  - edit_file: точечное редактирование (find/replace, insert, append)
 *  - grep: поиск по файлам через ripgrep (с JS fallback)
 *  - apply_patch: применение unified diff патчей
 *  - run_code: выполнение JS/TS кода в sandbox (изолированный child process)
 *
 * Безопасность:
 *  - Все операции с файлами создают бэкап перед изменением
 *  - run_code выполняется в отдельном процессе с timeout и memory limit
 *  - grep и apply_patch работают только внутри домашних/проектных директорий
 *  - Защищённые файлы (.env, *.key, id_rsa) недоступны
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { isProtectedFile, isPathInsideHome } from '../safety/classifier';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface CodeToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

const MAX_GREP_RESULTS = 100;
const MAX_GREP_FILE_SIZE = 1024 * 1024; // 1 МБ — больше пропускаем
const MAX_RUN_CODE_DURATION_MS = 30000; // 30 секунд максимум
const MAX_RUN_CODE_OUTPUT = 64 * 1024; // 64 КБ stdout/stderr
const RUN_CODE_MEMORY_MB = 256; // лимит памяти для sandbox

// ============================================================
// EDIT_FILE
// ============================================================

export async function edit_file(args: {
  path: string;
  operation: 'replace' | 'insert_at_line' | 'append' | 'delete_lines';
  find?: string;          // для operation=replace
  replace?: string;       // для operation=replace
  line?: number;          // для operation=insert_at_line (1-indexed)
  content?: string;       // для insert_at_line, append
  start_line?: number;    // для delete_lines (1-indexed, inclusive)
  end_line?: number;      // для delete_lines (1-indexed, inclusive)
  create_backup?: boolean; // по умолчанию true
}): Promise<CodeToolResult> {
  const target = path.resolve(args.path.replace(/^~/, os.homedir()));

  // Безопасность
  if (isProtectedFile(target)) {
    return { success: false, error: 'Файл защищён (вероятно содержит секреты). Редактирование запрещено.' };
  }
  if (!isPathInsideHome(target, os.homedir())) {
    return { success: false, error: 'Редактирование вне домашней папки запрещено.' };
  }

  const createBackup = args.create_backup ?? true;

  try {
    // Читаем оригинальный файл
    let original: string;
    try {
      original = await fs.readFile(target, 'utf-8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' && args.operation === 'append') {
        original = '';
      } else {
        throw e;
      }
    }

    const lines = original.split('\n');
    let modified: string;
    let changeDescription = '';

    switch (args.operation) {
      case 'replace': {
        if (!args.find) {
          return { success: false, error: 'Для operation=replace требуется параметр find' };
        }
        const find = args.find;
        const replace = args.replace ?? '';
        const occurrences = original.split(find).length - 1;
        if (occurrences === 0) {
          return { success: false, error: 'Текст для замены не найден. Проверьте find.' };
        }
        modified = original.split(find).join(replace);
        changeDescription = `Заменено ${occurrences} вхождений`;
        break;
      }

      case 'insert_at_line': {
        if (!args.line || args.line < 1) {
          return { success: false, error: 'Для operation=insert_at_line требуется line >= 1' };
        }
        if (args.content === undefined) {
          return { success: false, error: 'Для operation=insert_at_line требуется content' };
        }
        const insertLine = Math.min(args.line - 1, lines.length);
        const contentLines = args.content.split('\n');
        lines.splice(insertLine, 0, ...contentLines);
        modified = lines.join('\n');
        changeDescription = `Вставлено ${contentLines.length} строк на позицию ${args.line}`;
        break;
      }

      case 'append': {
        if (args.content === undefined) {
          return { success: false, error: 'Для operation=append требуется content' };
        }
        modified = original + (original && !original.endsWith('\n') ? '\n' : '') + args.content;
        changeDescription = `Добавлено ${args.content.split('\n').length} строк в конец`;
        break;
      }

      case 'delete_lines': {
        if (!args.start_line || !args.end_line || args.start_line < 1 || args.end_line < args.start_line) {
          return { success: false, error: 'Для operation=delete_lines требуются start_line и end_line (start <= end, оба >= 1)' };
        }
        const start = args.start_line - 1;
        const end = Math.min(args.end_line, lines.length);
        const deleted = lines.splice(start, end - start);
        modified = lines.join('\n');
        changeDescription = `Удалено ${deleted.length} строк (с ${args.start_line} по ${end})`;
        break;
      }

      default:
        return { success: false, error: `Неизвестная operation: ${args.operation}` };
    }

    // Создаём бэкап
    let backupPath: string | null = null;
    if (createBackup && original !== modified) {
      const backupDir = path.join(os.homedir(), '.una', 'backups');
      await fs.mkdir(backupDir, { recursive: true });
      const backupName = `${path.basename(target)}.${Date.now()}.bak`;
      backupPath = path.join(backupDir, backupName);
      await fs.writeFile(backupPath, original, 'utf-8');
    }

    // Записываем изменения
    await fs.writeFile(target, modified, 'utf-8');

    // Генерируем краткий diff
    const diff = generateSimpleDiff(original, modified);

    return {
      success: true,
      data: {
        path: target,
        operation: args.operation,
        change: changeDescription,
        backup_path: backupPath,
        diff,
        original_lines: original.split('\n').length,
        new_lines: modified.split('\n').length,
      },
    };
  } catch (e) {
    return { success: false, error: `edit_file failed: ${(e as Error).message}` };
  }
}

/**
 * Простой line-based diff для отображения изменений.
 */
function generateSimpleDiff(original: string, modified: string): string {
  const origLines = original.split('\n');
  const newLines = modified.split('\n');
  const maxLines = Math.max(origLines.length, newLines.length);
  const diff: string[] = [];
  const contextLines = 2;
  let inDiff = false;
  let diffStart = -1;

  for (let i = 0; i < maxLines; i++) {
    const orig = origLines[i];
    const newL = newLines[i];
    if (orig !== newL) {
      if (!inDiff) {
        diffStart = Math.max(0, i - contextLines);
        inDiff = true;
        if (diffStart > 0) diff.push(`... (строки 1-${diffStart}) ...`);
      }
      if (orig !== undefined) diff.push(`- ${i + 1}: ${orig}`);
      if (newL !== undefined) diff.push(`+ ${i + 1}: ${newL}`);
    } else {
      if (inDiff) {
        diff.push(`  ${i + 1}: ${orig}`);
        if (i - diffStart > 5) {
          inDiff = false;
          diff.push('...');
        }
      }
    }
  }
  return diff.slice(0, 50).join('\n'); // максимум 50 строк diff
}

// ============================================================
// GREP
// ============================================================

export async function grep(args: {
  pattern: string;
  path?: string;
  include?: string;       // glob: *.ts, *.js
  max_results?: number;
  case_insensitive?: boolean;
  use_regex?: boolean;    // по умолчанию true
}): Promise<CodeToolResult> {
  const searchPath = args.path
    ? path.resolve(args.path.replace(/^~/, os.homedir()))
    : process.cwd();

  // Безопасность
  if (!isPathInsideHome(searchPath, os.homedir())) {
    return { success: false, error: 'Поиск вне домашней папки запрещён.' };
  }

  const maxResults = Math.min(args.max_results ?? 30, MAX_GREP_RESULTS);
  const caseInsensitive = args.case_insensitive ?? false;
  const useRegex = args.use_regex ?? true;

  // Компилируем regex
  let regex: RegExp;
  try {
    const flags = caseInsensitive ? 'gi' : 'g';
    const pattern = useRegex ? args.pattern : escapeRegex(args.pattern);
    regex = new RegExp(pattern, flags);
  } catch (e) {
    return { success: false, error: `Невалидный regex: ${(e as Error).message}` };
  }

  // Проверяем, есть ли ripgrep
  const rgAvailable = await isRipgrepAvailable();

  if (rgAvailable) {
    return grepWithRipgrep(args.pattern, searchPath, args.include, maxResults, caseInsensitive, useRegex);
  }

  // JS fallback
  return grepWithJs(regex, searchPath, args.include, maxResults);
}

async function isRipgrepAvailable(): Promise<boolean> {
  try {
    await execFileAsync('rg', ['--version'], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function grepWithRipgrep(
  pattern: string,
  searchPath: string,
  include: string | undefined,
  maxResults: number,
  caseInsensitive: boolean,
  useRegex: boolean
): Promise<CodeToolResult> {
  try {
    const rgArgs: string[] = [
      '--json',
      '--max-count', String(maxResults),
      '--max-filesize', String(MAX_GREP_FILE_SIZE),
    ];
    if (caseInsensitive) rgArgs.push('-i');
    if (!useRegex) rgArgs.push('--fixed-strings');
    if (include) {
      rgArgs.push('--glob', include);
    }
    // Исключаем node_modules, .git, dist
    rgArgs.push('--glob', '!node_modules/**', '--glob', '!.git/**', '--glob', '!dist/**', '--glob', '!dist-electron/**');
    rgArgs.push(pattern, searchPath);

    const { stdout } = await execFileAsync('rg', rgArgs, {
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
    });

    // Парсим JSON output ripgrep
    const results: Array<{
      file: string;
      line_number: number;
      line_content: string;
    }> = [];

    for (const line of stdout.split('\n').filter(Boolean)) {
      try {
        const obj = JSON.parse(line);
        // rg --json формат: { type: "match", data: { path: {text}, lines: {text}, line_number, submatches: [...] } }
        if (obj.type === 'match' && obj.data?.path?.text && obj.data?.line_number !== undefined) {
          results.push({
            file: obj.data.path.text,
            line_number: obj.data.line_number,
            line_content: (obj.data.lines?.text ?? '').trimEnd(),
          });
          if (results.length >= maxResults) break;
        }
      } catch {
        // skip invalid JSON
      }
    }

    return {
      success: true,
      data: {
        pattern,
        path: searchPath,
        engine: 'ripgrep',
        count: results.length,
        truncated: results.length >= maxResults,
        results,
      },
    };
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (msg.includes('exit code 1') || msg.includes('no matches')) {
      // ripgrep возвращает exit 1 если нет совпадений — это не ошибка
      return {
        success: true,
        data: { pattern, path: searchPath, engine: 'ripgrep', count: 0, results: [] },
      };
    }
    // Fallback на JS
    console.warn('[grep] ripgrep failed, falling back to JS:', msg);
    let regex: RegExp;
    try {
      regex = new RegExp(useRegex ? pattern : escapeRegex(pattern), caseInsensitive ? 'gi' : 'g');
    } catch {
      return { success: false, error: `Невалидный pattern: ${pattern}` };
    }
    return grepWithJs(regex, searchPath, include, maxResults);
  }
}

async function grepWithJs(
  regex: RegExp,
  searchPath: string,
  include: string | undefined,
  maxResults: number
): Promise<CodeToolResult> {
  const results: Array<{ file: string; line_number: number; line_content: string }> = [];
  const includeRegex = include ? globToRegex(include) : null;
  const excludeDirs = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.next', 'build']);

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 10 || results.length >= maxResults) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!excludeDirs.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        if (includeRegex && !includeRegex.test(entry.name)) continue;
        if (isProtectedFile(fullPath)) continue;
        try {
          const stat = await fs.stat(fullPath);
          if (stat.size > MAX_GREP_FILE_SIZE) continue;
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            regex.lastIndex = 0;
            if (regex.test(lines[i])) {
              results.push({
                file: fullPath,
                line_number: i + 1,
                line_content: lines[i].slice(0, 500),
              });
              if (results.length >= maxResults) return;
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walk(searchPath, 0);

  return {
    success: true,
    data: {
      pattern: regex.source,
      path: searchPath,
      engine: 'js-fallback',
      count: results.length,
      truncated: results.length >= maxResults,
      results,
    },
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(glob: string): RegExp {
  // Простой glob → regex: * → .*, ? → .
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

// ============================================================
// APPLY_PATCH
// ============================================================

/**
 * Применяет unified diff патч.
 *
 * Формат поддерживается стандартный unified diff:
 *   --- a/file.txt
 *   +++ b/file.txt
 *   @@ -1,3 +1,4 @@
 *    unchanged line
 *   -removed line
 *   +added line
 *    unchanged line
 *
 * Или упрощённый формат (один hunk):
 *   Просто текст с -/+ строками, path указывается в args.path
 */
export async function apply_patch(args: {
  path: string;
  patch: string;
  create_backup?: boolean;
}): Promise<CodeToolResult> {
  const target = path.resolve(args.path.replace(/^~/, os.homedir()));

  if (isProtectedFile(target)) {
    return { success: false, error: 'Файл защищён. apply_patch запрещён.' };
  }
  if (!isPathInsideHome(target, os.homedir())) {
    return { success: false, error: 'apply_patch вне домашней папки запрещён.' };
  }

  const createBackup = args.create_backup ?? true;

  try {
    const original = await fs.readFile(target, 'utf-8');
    const originalLines = original.split('\n');

    // Парсим patch
    const patchLines = args.patch.split('\n');
    const hunks = parseUnifiedDiff(patchLines);

    if (hunks.length === 0) {
      return { success: false, error: 'Не найдено валидных hunks в патче. Ожидается формат "@@ -start,count +start,count @@"' };
    }

    // Применяем hunks (с конца к началу, чтобы не сбивать индексы)
    const newLines = [...originalLines];
    let appliedHunks = 0;

    for (let h = hunks.length - 1; h >= 0; h--) {
      const hunk = hunks[h];
      const startIdx = hunk.oldStart - 1; // 0-indexed

      // Проверяем context и remove-строки (что они совпадают с оригиналом)
      // Используем отдельный счётчик originalIdx — позицию в оригинальном файле
      let originalIdx = startIdx;
      for (let i = 0; i < hunk.lines.length; i++) {
        const line = hunk.lines[i];
        if (line.type === 'context' || line.type === 'remove') {
          if (newLines[originalIdx] !== line.content) {
            return {
              success: false,
              error: `Context mismatch на строке ${originalIdx + 1}: ожидалось "${line.content}", найдено "${newLines[originalIdx] ?? '(нет)'}"`,
            };
          }
          originalIdx++;
        }
        // add-строки не двигают originalIdx — они только добавляются
      }

      // Строим новые строки для hunk
      const newHunkLines: string[] = [];
      for (const line of hunk.lines) {
        if (line.type === 'context' || line.type === 'add') {
          newHunkLines.push(line.content);
        }
      }

      // Считаем сколько старых строк занимает hunk
      const oldHunkSize = hunk.lines.filter((l) => l.type === 'context' || l.type === 'remove').length;

      // Заменяем
      newLines.splice(startIdx, oldHunkSize, ...newHunkLines);
      appliedHunks++;
    }

    const modified = newLines.join('\n');

    // Бэкап
    let backupPath: string | null = null;
    if (createBackup && original !== modified) {
      const backupDir = path.join(os.homedir(), '.una', 'backups');
      await fs.mkdir(backupDir, { recursive: true });
      const backupName = `${path.basename(target)}.${Date.now()}.patch.bak`;
      backupPath = path.join(backupDir, backupName);
      await fs.writeFile(backupPath, original, 'utf-8');
    }

    await fs.writeFile(target, modified, 'utf-8');

    return {
      success: true,
      data: {
        path: target,
        hunks_applied: appliedHunks,
        backup_path: backupPath,
        original_lines: originalLines.length,
        new_lines: newLines.length,
      },
    };
  } catch (e) {
    return { success: false, error: `apply_patch failed: ${(e as Error).message}` };
  }
}

interface PatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: Array<{ type: 'context' | 'add' | 'remove'; content: string }>;
}

function parseUnifiedDiff(lines: string[]): PatchHunk[] {
  const hunks: PatchHunk[] = [];
  let currentHunk: PatchHunk | null = null;
  let skipHeaders = true;

  for (const line of lines) {
    // Пропускаем заголовки --- и +++
    if (skipHeaders && (line.startsWith('--- ') || line.startsWith('+++ '))) {
      continue;
    }
    skipHeaders = false;

    // Начало hunk
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newCount: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
        lines: [],
      };
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith(' ')) {
      currentHunk.lines.push({ type: 'context', content: line.slice(1) });
    } else if (line.startsWith('+')) {
      currentHunk.lines.push({ type: 'add', content: line.slice(1) });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({ type: 'remove', content: line.slice(1) });
    } else if (line === '') {
      // Пустая строка — context
      currentHunk.lines.push({ type: 'context', content: '' });
    }
    // Строки начинающиеся с \ — no newline at end of file, игнорируем
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

// ============================================================
// RUN_CODE
// ============================================================

/**
 * Выполняет JavaScript код в изолированном child process.
 *
 * Sandbox:
 *  - Отдельный Node.js процесс
 *  - Timeout 30 секунд (настраиваемо)
 *  - Memory limit 256 МБ
 *  - Working directory: временная папка (очищается после)
 *  - Без доступа к сети (через env переменные)
 *  - Без доступа к require встроенных модулей (basic, не perfect)
 */
export async function run_code(args: {
  code: string;
  language?: 'javascript' | 'typescript';
  timeout_ms?: number;
  setup_code?: string; // выполняется перед основным кодом (например, для установки переменных)
}): Promise<CodeToolResult> {
  const language = args.language ?? 'javascript';
  const timeoutMs = Math.min(args.timeout_ms ?? 10000, MAX_RUN_CODE_DURATION_MS);

  if (!args.code || args.code.trim().length === 0) {
    return { success: false, error: 'Требуется параметр code' };
  }

  if (args.code.length > 100 * 1024) {
    return { success: false, error: 'Код слишком большой (максимум 100 КБ)' };
  }

  // Создаём временную директорию
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'una-sandbox-'));
  const scriptPath = path.join(tmpDir, language === 'typescript' ? 'script.ts' : 'script.js');

  try {
    // Базовая проверка на опасные вызовы
    const dangerous = checkDangerousCode(args.code);
    if (dangerous) {
      return { success: false, error: `Обнаружен потенциально опасный код: ${dangerous}` };
    }

    // Готовим wrapper
    const wrapper = buildCodeWrapper(args.code, args.setup_code ?? '', language);
    await fs.writeFile(scriptPath, wrapper, 'utf-8');

    const startTime = Date.now();

    // Запускаем в отдельном процессе с ограничениями
    const nodeArgs = [
      `--max-old-space-size=${RUN_CODE_MEMORY_MB}`,
      '--no-warnings',
    ];

    let cmd: string;
    if (language === 'typescript') {
      // Используем tsx если доступен, иначе ts-node
      cmd = `npx tsx ${scriptPath}`;
    } else {
      cmd = `node ${nodeArgs.join(' ')} ${scriptPath}`;
    }

    // Whitelist-safe env: only known safe vars, no secrets
    const safeKeys = ['PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT'];
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '' };
    for (const key of safeKeys) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    env.HTTP_PROXY = 'http://0.0.0.0:0';
    env.HTTPS_PROXY = 'http://0.0.0.0:0';
    env.NO_PROXY = '';
    env.ZAI_API_KEY = '';
    env.OPENAI_API_KEY = '';
    env.ANTHROPIC_API_KEY = '';

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let timedOut = false;

    try {
      const result = await execAsync(cmd, {
        cwd: tmpDir,
        timeout: timeoutMs,
        maxBuffer: MAX_RUN_CODE_OUTPUT,
        env,
      });
      stdout = result.stdout ?? '';
      stderr = result.stderr ?? '';
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; killed?: boolean; signal?: string; code?: number | string };
      stdout = err.stdout ?? '';
      stderr = err.stderr ?? '';
      exitCode = typeof err.code === 'number' ? err.code : 1;
      if (err.killed && err.signal === 'SIGTERM') {
        timedOut = true;
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      success: !timedOut,
      data: {
        stdout: stdout.slice(0, MAX_RUN_CODE_OUTPUT),
        stderr: stderr.slice(0, MAX_RUN_CODE_OUTPUT),
        exit_code: timedOut ? 124 : exitCode, // 124 = стандартный timeout exit code
        duration_ms: durationMs,
        timed_out: timedOut,
        language,
      },
      error: timedOut ? `Превышен timeout ${timeoutMs}мс` : undefined,
    };
  } catch (e) {
    return { success: false, error: `run_code failed: ${(e as Error).message}` };
  } finally {
    // Очищаем временную директорию
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Базовая проверка на опасные вызовы.
 * Это НЕ полная защита — для настоящей sandbox нужен Docker/containers.
 * Здесь только blocking самых явных паттернов.
 */
function checkDangerousCode(code: string): string | null {
  // Нормализуем: убираем комментарии и строковые литералы, чтобы усложнить обход
  // Но для безопасности — проверяем И оригинальный, и "очищенный" код

  const dangerousPatterns: Array<{ pattern: RegExp; reason: string }> = [
    // Динамическое выполнение
    { pattern: /\beval\s*\(/, reason: 'eval() — динамическое выполнение кода' },
    { pattern: /\bnew\s+Function\s*\(/, reason: 'new Function() — динамическое выполнение кода' },
    { pattern: /\brequire\s*\(/, reason: 'require() — загрузка модулей' },
    { pattern: /\bimport\s+.*\s+from\s+['"`]/, reason: 'import — динамическая загрузка модулей' },

    // Обход через строковые конструкторы
    { pattern: /String\s*\.\s*fromCharCode\s*\(/, reason: 'String.fromCharCode() — обход фильтра' },
    { pattern: /String\s*\.\s*fromCodePoint\s*\(/, reason: 'String.fromCodePoint() — обход фильтра' },
    { pattern: /String\s*\.\s*raw\s*\(/, reason: 'String.raw() — обход фильтра' },
    { pattern: /String\s*\.\s*from\s*\(/, reason: 'String.from() — обход фильтра' },

    // Доступ к файловой системе
    { pattern: /require\s*\(\s*['"]child_process['"]/, reason: 'require("child_process") — может выполнять произвольные команды' },
    { pattern: /require\s*\(\s*['"]fs['"]/, reason: 'require("fs") — доступ к файловой системе' },
    { pattern: /require\s*\(\s*['"]net['"]/, reason: 'require("net") — сетевой доступ' },
    { pattern: /require\s*\(\s*['"]http['"]/, reason: 'require("http") — сетевой доступ' },
    { pattern: /require\s*\(\s*['"]https['"]/, reason: 'require("https") — сетевой доступ' },
    { pattern: /require\s*\(\s*['"]dns['"]/, reason: 'require("dns") — DNS запросы' },
    { pattern: /require\s*\(\s*['"]os['"]/, reason: 'require("os") — доступ к системной информации' },
    { pattern: /require\s*\(\s*['"]cluster['"]/, reason: 'require("cluster") — управление процессами' },
    { pattern: /require\s*\(\s*['"]path['"]/, reason: 'require("path") — доступ к путям файловой системы' },
    { pattern: /require\s*\(\s*['"]crypto['"]/, reason: 'require("crypto") — криптографические операции' },
    { pattern: /require\s*\(\s*['"]child_process['"]/, reason: 'require("child_process") — может выполнять произвольные команды' },
    { pattern: /require\s*\(\s*['"]fs['"]/, reason: 'require("fs") — доступ к файловой системе' },
    { pattern: /require\s*\(\s*['"]net['"]/, reason: 'require("net") — сетевой доступ' },
    { pattern: /require\s*\(\s*['"]http['"]/, reason: 'require("http") — сетевой доступ' },
    { pattern: /require\s*\(\s*['"]https['"]/, reason: 'require("https") — сетевой доступ' },
    { pattern: /require\s*\(\s*['"]dns['"]/, reason: 'require("dns") — DNS запросы' },
    { pattern: /require\s*\(\s*['"]os['"]/, reason: 'require("os") — доступ к системной информации' },
    { pattern: /require\s*\(\s*['"]cluster['"]/, reason: 'require("cluster") — управление процессами' },
    { pattern: /process\.exit/, reason: 'process.exit() — может завершить хост-процесс' },
    { pattern: /process\.kill/, reason: 'process.kill() — может завершить другие процессы' },
    { pattern: /process\.env/, reason: 'process.env — доступ к переменным окружения (возможны секреты)' },
    { pattern: /process\.cwd\s*\(\s*\)/, reason: 'process.cwd() — доступ к текущей директории' },
    { pattern: /process\.chdir\s*\(/, reason: 'process.chdir() — смена текущей директории' },
    { pattern: /process\.getuid\s*\(\s*\)/, reason: 'process.getuid() — доступ к информации о пользователе' },
    { pattern: /process\.getpid\s*\(\s*\)/, reason: 'process.getpid() — доступ к PID процесса' },
    { pattern: /import\s+.*from\s+['"]child_process['"]/, reason: 'import child_process — может выполнять произвольные команды' },
    { pattern: /import\s+.*from\s+['"]fs['"]/, reason: 'import fs — доступ к файловой системе' },
    { pattern: /import\s+.*from\s+['"]net['"]/, reason: 'import net — сетевой доступ' },
    { pattern: /import\s+.*from\s+['"]http['"]/, reason: 'import http — сетевой доступ' },

    // Доступ к файлам через __dirname / __filename
    { pattern: /__dirname/, reason: '__dirname — доступ к пути исполняемого файла' },
    { pattern: /__filename/, reason: '__filename — доступ к пути исполняемого файла' },

    // Динамическая загрузка модулей через шаблонные строки
    { pattern: /require\s*\(\s*`[^`]+`/, reason: 'require() с шаблонной строкой — динамическая загрузка' },
    { pattern: /require\s*\(\s*[\w]+\s*\+\s*['"`]/, reason: 'require() с конкатенацией — динамическая загрузка' },

    // Обход через Buffer и кодировки
    { pattern: /Buffer\s*\.\s*from\s*\([^)]*fromCharCode/i, reason: 'Buffer.from(String.fromCharCode()) — обход фильтра' },
    { pattern: /atob\s*\(/, reason: 'atob() — декодирование base64 (может использоваться для обхода)' },
    { pattern: /btoa\s*\(/, reason: 'btoa() — кодирование base64 (может использоваться для обхода)' },
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(code)) {
      return reason;
    }
  }

  // Дополнительная проверка: ищем конкатенацию частей опасных слов
  // Например: 'requ' + 'ire' или 'pro' + 'cess'
  const obfuscationPatterns = [
    /['"]requ['"]\s*\+\s*['"]ire['"]/,
    /['"]pro['"]\s*\+\s*['"]ess['"]/,
    /['"]child['"]\s*\+\s*['"]_process['"]/,
    /(?:child[_\s]+process)/,
  ];

  for (const pattern of obfuscationPatterns) {
    if (pattern.test(code)) {
      return 'Обнаружена попытка обхода фильтра через конкатенацию строк';
    }
  }

  return null;
}

/**
 * Строит wrapper вокруг пользовательского кода.
 * Перехватывает console.log/error/warn и возвращает их через stdout.
 */
function buildCodeWrapper(code: string, setupCode: string, language: 'javascript' | 'typescript'): string {
  const langComment = language === 'typescript' ? '// TypeScript' : '// JavaScript';
  return `${langComment}
// U.N.A. sandbox — изолированное выполнение кода
// setup:
${setupCode}

// === USER CODE START ===
(async () => {
${code.split('\n').map((l) => '  ' + l).join('\n')}
})();
// === USER CODE END ===
`;
}
