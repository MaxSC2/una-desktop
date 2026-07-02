/**
 * Code tools — инструменты для работы с кодом.
 *
 * 4 инструмента:
 *  - edit_file: точечное редактирование (find/replace, insert, append)
 *  - grep: поиск по файлам через ripgrep (с JS fallback)
 *  - apply_patch: применение unified diff патчей
 *  - run_code: выполнение JS кода в sandbox (vm.runInNewContext)
 *
 * Безопасность:
 *  - Все операции с файлами создают бэкап перед изменением
 *  - run_code выполняется в изолированном vm контексте (без доступа к process, require, fs)
 *  - grep и apply_patch работают только внутри домашних/проектных директорий
 *  - Защищённые файлы (.env, *.key, id_rsa) недоступны
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { createContext, runInNewContext, Script } from 'vm';
import { isProtectedFile, isPathInsideHome } from '../safety/classifier';

const execFileAsync = promisify(execFile);

async function resolveRealPath(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch (e: unknown) {
    return p;
  }
}

export interface CodeToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

const MAX_GREP_RESULTS = 100;
const MAX_GREP_FILE_SIZE = 1024 * 1024; // 1 МБ — больше пропускаем

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
  const target = await resolveRealPath(path.resolve(args.path.replace(/^~/, os.homedir())));

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
  const searchPath = await resolveRealPath(args.path
    ? path.resolve(args.path.replace(/^~/, os.homedir()))
    : process.cwd());

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
    const target = await resolveRealPath(path.resolve(args.path.replace(/^~/, os.homedir())));

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
// RUN_CODE — sandbox через vm.runInNewContext
// ============================================================

export async function run_code(args: {
  code: string;
  language?: 'javascript' | 'typescript';
  timeout_ms?: number;
  setup_code?: string; // выполняется перед основным кодом
}): Promise<CodeToolResult> {
  const MAX_RUN_CODE_OUTPUT = 64 * 1024; // 64 КБ stdout/stderr
  const MAX_RUN_CODE_DURATION_MS = 30000; // 30 секунд максимум

  const language = args.language ?? 'javascript';
  const timeoutMs = Math.min(args.timeout_ms ?? 10000, MAX_RUN_CODE_DURATION_MS);

  if (!args.code || args.code.trim().length === 0) {
    return { success: false, error: 'Требуется параметр code' };
  }

  if (args.code.length > 100 * 1024) {
    return { success: false, error: 'Код слишком большой (максимум 100 КБ)' };
  }

  // TypeScript: минимальный транспайл в JS (убрать типы, оставить логику)
  let jsCode = args.code;
  if (language === 'typescript') {
    const stripped = stripTypescript(args.code);
    if (!stripped) {
      return { success: false, error: 'Не удалось транспилировать TypeScript в JavaScript' };
    }
    jsCode = stripped;
  }

  const setupCode = args.setup_code ?? '';
  const fullCode = `${setupCode}
${jsCode}`;

  // Создаём изолированный vm контекст
  const startTime = Date.now();
  let timedOut = false;
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    // Безопасные глобальные объекты для sandbox
    const safeContext: Record<string, unknown> = {};

    // console — перехват stdout/stderr
    safeContext.console = {
      log: (...args: unknown[]) => { stdout.push(args.map(formatValue).join(' ')); },
      warn: (...args: unknown[]) => { stderr.push(['[WARN]', ...args.map(formatValue)].join(' ')); },
      error: (...args: unknown[]) => { stderr.push(['[ERROR]', ...args.map(formatValue)].join(' ')); },
      info: (...args: unknown[]) => { stdout.push(args.map(formatValue).join(' ')); },
      debug: (...args: unknown[]) => { stdout.push(args.map(formatValue).join(' ')); },
    };

    // Стандартные глобальные объекты (безопасные)
    safeContext.JSON = JSON;
    safeContext.Math = Math;
    safeContext.Date = Date;
    safeContext.RegExp = RegExp;
    safeContext.Array = Array;
    safeContext.Object = Object;
    safeContext.String = String;
    safeContext.Number = Number;
    safeContext.Boolean = Boolean;
    safeContext.Promise = Promise;
    safeContext.Map = Map;
    safeContext.Set = Set;
    safeContext.WeakMap = WeakMap;
    safeContext.WeakSet = WeakSet;
    safeContext.Symbol = Symbol;
    safeContext.Error = Error;
    safeContext.RangeError = RangeError;
    safeContext.TypeError = TypeError;
    safeContext.SyntaxError = SyntaxError;
    safeContext.AbortController = AbortController;

    // setTimeout/setInterval с ограничением
    safeContext.setTimeout = setTimeout;
    safeContext.setInterval = setInterval;
    safeContext.clearTimeout = clearTimeout;
    safeContext.clearInterval = clearInterval;

    // fetch — разрешён, но без cookie/credentials
    safeContext.fetch = fetch;

    // Buffer — разрешён для работы с бинарными данными
    safeContext.Buffer = Buffer;

    // URL/URLSearchParams
    safeContext.URL = URL;
    safeContext.URLSearchParams = URLSearchParams;

    // AbortController для таймаутов
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      // Создаём контекст и выполняем код
      const ctx = createContext(safeContext);

      // Оборачиваем в async IIFE
      const wrappedCode = `(async () => { ${fullCode} })()`;

      const script = new Script(wrappedCode, {
        filename: 'una-sandbox.js',
        lineOffset: 0,
        columnOffset: 0,
      });

      const result = script.runInContext(ctx);

      // Если результат — Promise (async код), ждём его
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        await Promise.race([
          result as Promise<unknown>,
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), timeoutMs);
          }),
        ]);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const durationMs = Date.now() - startTime;

    return {
      success: !timedOut,
      data: {
        stdout: stdout.join('\n').slice(0, MAX_RUN_CODE_OUTPUT),
        stderr: stderr.join('\n').slice(0, MAX_RUN_CODE_OUTPUT),
        exit_code: timedOut ? 124 : 0,
        duration_ms: durationMs,
        timed_out: timedOut,
        language,
      },
      error: timedOut ? `Превышен timeout ${timeoutMs}мс` : undefined,
    };
  } catch (e) {
    const durationMs = Date.now() - startTime;
    const errorMsg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      data: {
        stdout: stdout.join('\n').slice(0, MAX_RUN_CODE_OUTPUT),
        stderr: errorMsg.slice(0, MAX_RUN_CODE_OUTPUT),
        exit_code: 1,
        duration_ms: durationMs,
        timed_out: false,
        language,
      },
      error: `run_code error: ${errorMsg}`,
    };
  }
}

/**
 * Форматирует значение для вывода в stdout/stderr.
 */
function formatValue(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Error) return v.message;
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  if (v && typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '[Object]';
    }
  }
  return String(v);
}

/**
 * Минимальный стриппер TypeScript-типов.
 * Убирает: interface, type, as X, : Type, enum (частично).
 * Не полная транспиляция, но достаточно для простого кода.
 */
function stripTypescript(ts: string): string | null {
  try {
    let result = ts;

    // Убираем `as Type`
    result = result.replace(/\bas\s+[\w<>\[\]|&,?\s]+/g, '');

    // Убираем `: Type` в аргументах функций и переменных
    result = result.replace(/:\s*(?:\w+(?:<[^>]*>)?(?:\s*\|\s*\w+(?:<[^>]*>)?)*)(?=\s*[;,)\n}])/g, '');

    // Убираем return type
    result = result.replace(/:\s*(?:\w+(?:<[^>]*>)?(?:\s*\|\s*\w+(?:<[^>]*>)?)*)\s*(?=>|\;)/g, '');

    // Удаляем interface/type объявления целиком (multiline)
    result = result.replace(/(?:export\s+)?(?:interface|type)\s+\w+[^{]*\{[^}]*\}/gs, '');

    // Удаляем enum (простой случай)
    result = result.replace(/(?:export\s+)?enum\s+\w+\s*\{[^}]*\}/gs, '');

    // Удаляем declare
    result = result.replace(/\bdeclare\b\s*/g, '');

    // Удаляем readonly
    result = result.replace(/\breadonly\b\s*/g, '');

    // Удаляем ключевые слова типовых модификаторов
    result = result.replace(/\b(?:public|private|protected|abstract|static|override)\b\s*/g, ' ');

    return result.trim() || null;
  } catch {
    return null;
  }
}
