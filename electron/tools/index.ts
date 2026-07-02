/**
 * Инструменты U.N.A. — реальные операции с файловой системой.
 *
 * Каждый инструмент возвращает структурированный результат.
 * Опасные операции не выполняются, а возвращают запрос на подтверждение.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isProtectedFile, isPathInsideHome, classifyCommand } from '../safety/classifier';
import { web_search, web_fetch, web_download } from '../ai/web-tools';
import { edit_file, grep, apply_patch, run_code } from '../ai/code-tools';
import { open_app, type_text, click, key_press, list_windows } from '../ai/gui-automation';

const execAsync = promisify(exec);

export interface ToolContext {
  /** Подтверждённые пользователем токены (для опасных операций) */
  confirmedTokens: Set<string>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  needs_confirmation?: {
    token: string;
    action: string;
    risk: 'caution' | 'dangerous';
    details: string;
  };
}

function home(): string {
  return os.homedir();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... [обрезано, всего ${s.length} символов]`;
}

/**
 * Builds a safe environment for child processes using a whitelist.
 * Only allows essential system variables — no secrets, tokens, or API keys.
 */
function safeEnv(): NodeJS.ProcessEnv {
  const whitelist = new Set([
    'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'TEMP', 'TMP', 'TMPDIR',
    'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
    'USERNAME', 'LOGNAME', 'SHELL',
    'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramData',
    'OSTYPE', 'TERM', 'COLORTERM', 'LANG', 'LC_ALL',
    'NODE_PATH',
  ]);
  const env: NodeJS.ProcessEnv = {};
  for (const key of whitelist) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  // Ensure PATH exists (critical for running commands)
  if (!env.PATH && process.env.PATH) {
    env.PATH = process.env.PATH;
  }
  // Explicitly blank known UNA secrets
  env.ZAI_API_KEY = '';
  env.OPENAI_API_KEY = '';
  env.ANTHROPIC_API_KEY = '';
  return env;
}

/**
 * Список файлов в директории.
 */
export async function list_files(args: { path?: string }, _ctx: ToolContext): Promise<ToolResult> {
  const target = args.path ? path.resolve(args.path.replace(/^~/, home())) : home();
  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) {
      return { success: false, error: `Это не директория: ${target}` };
    }
    const entries = await fs.readdir(target, { withFileTypes: true });
    const items = await Promise.all(
      entries.slice(0, 500).map(async (entry) => {
        const fullPath = path.join(target, entry.name);
        try {
          const s = await fs.stat(fullPath);
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: s.size,
            modified: s.mtime.toISOString(),
            path: fullPath,
          };
        } catch {
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: 0,
            modified: null,
            path: fullPath,
          };
        }
      })
    );
    return { success: true, data: { path: target, count: items.length, items } };
  } catch (e) {
    return { success: false, error: `Не удалось прочитать директорию: ${(e as Error).message}` };
  }
}

/**
 * Чтение текстового файла.
 */
export async function read_file(
  args: { path: string; max_bytes?: number },
  _ctx: ToolContext
): Promise<ToolResult> {
  const target = path.resolve(args.path.replace(/^~/, home()));
  const maxBytes = Math.min(args.max_bytes ?? 32768, 1024 * 1024);

  if (isProtectedFile(target)) {
    return {
      success: false,
      error:
        'Этот файл защищён (вероятно содержит секреты). Содержимое не отображается. Могу сообщить только факт его наличия.',
    };
  }

  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) return { success: false, error: 'Это директория, а не файл.' };
    if (stat.size > 5 * 1024 * 1024) {
      return { success: false, error: `Файл слишком большой (${(stat.size / 1024 / 1024).toFixed(1)} МБ). Максимум 5 МБ.` };
    }
    const buf = await fs.readFile(target);
    const content = buf.toString('utf8', 0, Math.min(buf.length, maxBytes));
    const isText = !/[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 1024));
    if (!isText && buf.length > 0) {
      return {
        success: true,
        data: { path: target, size: stat.size, binary: true, note: 'Бинарный файл — содержимое не отображается.' },
      };
    }
    return {
      success: true,
      data: {
        path: target,
        size: stat.size,
        binary: false,
        truncated: buf.length > maxBytes,
        content: truncate(content, maxBytes),
      },
    };
  } catch (e) {
    return { success: false, error: `Не удалось прочитать файл: ${(e as Error).message}` };
  }
}

/**
 * Запись в файл.
 */
export async function write_file(
  args: { path: string; content: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const target = path.resolve(args.path.replace(/^~/, home()));

  if (!isPathInsideHome(target, home())) {
    const token = `write_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!ctx.confirmedTokens.has(token)) {
      return {
        success: false,
        needs_confirmation: {
          token,
          action: `Записать файл: ${target}`,
          risk: 'dangerous',
          details: 'Файл находится вне домашней директории пользователя.',
        },
      };
    }
  }

  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, args.content, 'utf8');
    return { success: true, data: { path: target, bytes: Buffer.byteLength(args.content, 'utf8') } };
  } catch (e) {
    return { success: false, error: `Не удалось записать файл: ${(e as Error).message}` };
  }
}

/**
 * Поиск файлов по шаблону (glob * и ?).
 */
export async function find_files(
  args: { pattern: string; path?: string; max_results?: number },
  _ctx: ToolContext
): Promise<ToolResult> {
  const searchRoot = args.path ? path.resolve(args.path.replace(/^~/, home())) : home();
  const max = Math.min(args.max_results ?? 50, 200);
  const pattern = args.pattern.toLowerCase();

  // Конвертация glob в regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexStr}$`, 'i');

  const results: Array<{ path: string; name: string; size: number; modified: string }> = [];
  const visited = new Set<string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (results.length >= max || depth > 6 || visited.has(dir)) return;
    visited.add(dir);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= max) return;
        const full = path.join(dir, entry.name);
        // Пропускаем тяжёлые/системные директории
        if (
          entry.isDirectory() &&
          (entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === 'AppData' ||
            entry.name === 'Library' ||
            entry.name === '__pycache__' ||
            entry.name === '.git' ||
            entry.name === 'dist' ||
            entry.name === 'build')
        ) {
          continue;
        }
        if (entry.isFile() && regex.test(entry.name)) {
          try {
            const s = await fs.stat(full);
            results.push({ path: full, name: entry.name, size: s.size, modified: s.mtime.toISOString() });
          } catch {
            /* ignore */
          }
        } else if (entry.isDirectory()) {
          await walk(full, depth + 1);
        }
      }
    } catch {
      /* ignore permission errors */
    }
  }

  await walk(searchRoot, 0);
  return {
    success: true,
    data: {
      root: searchRoot,
      pattern: args.pattern,
      count: results.length,
      truncated: results.length >= max,
      results,
    },
  };
}

/**
 * Выполнение shell-команды с проверкой безопасности.
 */
export async function execute_command(
  args: { command: string; cwd?: string; timeout_ms?: number },
  ctx: ToolContext
): Promise<ToolResult> {
  const cmd = args.command;
  const cwd = args.cwd ? path.resolve(args.cwd.replace(/^~/, home())) : home();
  const timeout = Math.min(args.timeout_ms ?? 30000, 120000);

  const safety = classifyCommand(cmd);

  if (safety.level === 'forbidden') {
    return {
      success: false,
      error: `Команда заблокирована: ${safety.reason}. ${safety.suggestion ?? ''}`,
    };
  }

  if (safety.level === 'dangerous') {
    const token = `exec_${Date.now()}_${Buffer.from(cmd).toString('base64url').slice(0, 12)}`;
    if (!ctx.confirmedTokens.has(token)) {
      return {
        success: false,
        needs_confirmation: {
          token,
          action: `Выполнить команду: ${cmd}`,
          risk: 'dangerous',
          details: `${safety.reason}. Рабочая директория: ${cwd}`,
        },
      };
    }
  }

  try {
    // Filter sensitive env vars before passing to child process
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024,
      env: safeEnv(),
    });
    return {
      success: true,
      data: {
        command: cmd,
        cwd,
        exit_code: 0,
        stdout: truncate(stdout, 8192),
        stderr: truncate(stderr, 4096) || null,
      },
    };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
    if ((err as any).killed) {
      return { success: false, error: `Процесс прерван по таймауту (${timeout} мс).` };
    }
    return {
      success: false,
      error: `Ошибка выполнения: ${err.message}`,
      data: {
        command: cmd,
        cwd,
        exit_code: typeof err.code === 'number' ? err.code : -1,
        stdout: truncate(err.stdout ?? '', 8192),
        stderr: truncate(err.stderr ?? '', 4096),
      },
    };
  }
}

/**
 * Информация о системе.
 */
export async function system_info(): Promise<ToolResult> {
  try {
    const platform = os.platform();
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptime = os.uptime();

    let diskInfo: { available: number; total: number } | null = null;
    try {
      const stat = await fs.statfs(home());
      diskInfo = { available: stat.bavail * stat.bsize, total: stat.blocks * stat.bsize };
    } catch {
      /* statfs недоступен на всех платформах */
    }

    return {
      success: true,
      data: {
        platform: `${platform} ${os.release()}`,
        platform_name:
          platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : platform === 'linux' ? 'Linux' : platform,
        arch: os.arch(),
        hostname: os.hostname(),
        cpu: cpus[0]?.model ?? 'unknown',
        cpu_cores: cpus.length,
        memory: {
          total_gb: +(totalMem / 1024 ** 3).toFixed(2),
          free_gb: +(freeMem / 1024 ** 3).toFixed(2),
          used_pct: +(((totalMem - freeMem) / totalMem) * 100).toFixed(1),
        },
        disk: diskInfo
          ? {
              total_gb: +(diskInfo.total / 1024 ** 3).toFixed(2),
              free_gb: +(diskInfo.available / 1024 ** 3).toFixed(2),
              used_pct: +(((diskInfo.total - diskInfo.available) / diskInfo.total) * 100).toFixed(1),
            }
          : null,
        uptime_hours: +(uptime / 3600).toFixed(2),
        home: home(),
      },
    };
  } catch (e) {
    return { success: false, error: `Не удалось получить информацию о системе: ${(e as Error).message}` };
  }
}

/**
 * Захват экрана (через Electron desktopCapturer в main.ts).
 */
export async function take_screenshot(): Promise<ToolResult> {
  // Реализация в main.ts через desktopCapturer
  // Здесь возвращаем заглушку — реальный код в ipc-handlers.ts
  return {
    success: false,
    error: 'Снимок экрана должен выполняться через IPC — смотрите ipc-handlers.ts',
  };
}

/**
 * Запрос подтверждения опасной операции.
 */
export async function request_confirmation(
  args: { action: string; risk: 'caution' | 'dangerous'; details: string },
  _ctx: ToolContext
): Promise<ToolResult> {
  const token = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    success: false,
    needs_confirmation: {
      token,
      action: args.action,
      risk: args.risk,
      details: args.details,
    },
  };
}

/**
 * Диспетчер инструментов.
 */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  switch (name) {
    case 'list_files':
      return list_files(args as { path?: string }, ctx);
    case 'read_file':
      return read_file(args as { path: string; max_bytes?: number }, ctx);
    case 'write_file':
      return write_file(args as { path: string; content: string }, ctx);
    case 'find_files':
      return find_files(args as { pattern: string; path?: string; max_results?: number }, ctx);
    case 'execute_command':
      return execute_command(args as { command: string; cwd?: string; timeout_ms?: number }, ctx);
    case 'system_info':
      return system_info();
    case 'take_screenshot':
      return take_screenshot();
    case 'analyze_screen':
      // Анализ экрана выполняется в main.ts (нужен desktopCapturer + VLM)
      // Здесь возвращаем заглушку — реальный код в main.ts обходит dispatchTool
      return {
        success: false,
        error: 'analyze_screen обрабатывается в main.ts через desktopCapturer + VLM. Если вы видите эту ошибку — вызовите через IPC.',
      };
    case 'memory_save':
      // Сохранение факта в main.ts (нужен store)
      return {
        success: false,
        error: 'memory_save обрабатывается в main.ts через saveFact(). Если вы видите эту ошибку — вызовите через IPC.',
      };
    case 'memory_recall':
      // Поиск фактов в main.ts (нужен store)
      return {
        success: false,
        error: 'memory_recall обрабатывается в main.ts через recallFacts(). Если вы видите эту ошибку — вызовите через IPC.',
      };
    case 'request_confirmation':
      return request_confirmation(args as { action: string; risk: 'caution' | 'dangerous'; details: string }, ctx);
    case 'ask_clarification':
      return ask_clarification(args as { question: string; options?: string[] });
    case 'web_search':
      return web_search(args as { query: string; num?: number; recency_days?: number });
    case 'web_fetch':
      return web_fetch(args as { url: string; max_bytes?: number; timeout_ms?: number; extract_text?: boolean });
    case 'web_download':
      return web_download(args as { url: string; dest_dir?: string; filename?: string; timeout_ms?: number });
    case 'edit_file':
      return edit_file(args as {
        path: string;
        operation: 'replace' | 'insert_at_line' | 'append' | 'delete_lines';
        find?: string;
        replace?: string;
        line?: number;
        content?: string;
        start_line?: number;
        end_line?: number;
        create_backup?: boolean;
      });
    case 'grep':
      return grep(args as {
        pattern: string;
        path?: string;
        include?: string;
        max_results?: number;
        case_insensitive?: boolean;
        use_regex?: boolean;
      });
    case 'apply_patch':
      return apply_patch(args as { path: string; patch: string; create_backup?: boolean });
    case 'run_code':
      return run_code(args as { code: string; language?: 'javascript' | 'typescript'; timeout_ms?: number; setup_code?: string });
    case 'open_app':
      return open_app(args as { app_name: string; args?: string[] });
    case 'type_text':
      return type_text(args as { text: string; delay_ms?: number });
    case 'click':
      return click(args as { x: number; y: number; button?: 'left' | 'right' | 'middle'; double?: boolean });
    case 'key_press':
      return key_press(args as { key: string; modifiers?: string[] });
    case 'list_windows':
      return list_windows();
    default:
      return { success: false, error: `Неизвестный инструмент: ${name}` };
  }
}

/**
 * ask_clarification — возвращает вопрос пользователю.
 * LLM вызывает когда не уверена в интерпретации запроса.
 */
function ask_clarification(args: { question: string; options?: string[] }): ToolResult {
  if (!args.question) {
    return { success: false, error: 'Требуется параметр question' };
  }
  return {
    success: true,
    data: {
      type: 'clarification',
      question: args.question,
      options: args.options || [],
      needs_user_input: true,
    },
  };
}

/**
 * Определения инструментов для function calling LLM.
 */
export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'Показать содержимое директории. По умолчанию — домашняя папка.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к папке.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Прочитать текстовый файл. Не работает с бинарными и защищёнными файлами.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к файлу.' },
          max_bytes: { type: 'number', description: 'Максимум байт (по умолчанию 32768).' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Создать или перезаписать файл. Требует подтверждения вне домашней папки.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь.' },
          content: { type: 'string', description: 'Содержимое файла.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_files',
      description: 'Найти файлы по шаблону (поддерживает * и ?).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Шаблон имени (например *.txt).' },
          path: { type: 'string', description: 'Папка поиска.' },
          max_results: { type: 'number', description: 'Максимум результатов (по умолчанию 50).' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'execute_command',
      description: 'Выполнить shell-команду. Опасные команды требуют подтверждения.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Команда для выполнения.' },
          cwd: { type: 'string', description: 'Рабочая директория.' },
          timeout_ms: { type: 'number', description: 'Таймаут в мс (по умолчанию 30000).' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'take_screenshot',
      description: 'Сделать снимок экрана и вернуть base64.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_screen',
      description: 'Сделать снимок экрана и проанализировать через VLM.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Вопрос про экран.' },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'system_info',
      description: 'Информация о системе: ОС, CPU, память, диск, uptime.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'memory_save',
      description: 'Сохранить важный факт о пользователе или задаче в долговременную память.',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'Факт для запоминания.' },
          category: { type: 'string', enum: ['user', 'project', 'preference', 'task'], description: 'Категория.' },
        },
        required: ['fact', 'category'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'memory_recall',
      description: 'Вспомнить факты из долговременной памяти по теме.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Тема для вспоминания.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'request_confirmation',
      description: 'Запросить подтверждение опасной операции.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Описание действия.' },
          risk: { type: 'string', enum: ['caution', 'dangerous'], description: 'Уровень риска.' },
          details: { type: 'string', description: 'Подробности.' },
        },
        required: ['action', 'risk', 'details'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'ask_clarification',
      description: 'Уточнить у пользователя, если запрос неоднозначен или может привести к разным результатам. ВЫЗЫВАЙ когда не уверена в интерпретации. Лучше спросить, чем сделать неправильно.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Вопрос пользователю.' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Варианты ответа (если есть). Пустой массив = открытый вопрос.',
          },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Поиск в интернете через встроенный search engine. Возвращает заголовок, URL, snippet для каждого результата. Используй когда нужно найти актуальную информацию, проверить факты, или найти документацию.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Поисковый запрос.' },
          num: { type: 'number', description: 'Количество результатов (по умолчанию 5, максимум 20).' },
          recency_days: { type: 'number', description: 'Фильтр по давности: только результаты за последние N дней.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_fetch',
      description: 'Загрузить содержимое веб-страницы по URL. Возвращает текст (HTML или извлечённый plain text). Максимум 512 КБ. Используй для чтения документации, статей, и т.д.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Полный URL (http:// или https://).' },
          max_bytes: { type: 'number', description: 'Максимум байт (по умолчанию 524288, максимум 524288).' },
          timeout_ms: { type: 'number', description: 'Таймаут в мс (по умолчанию 30000, максимум 60000).' },
          extract_text: { type: 'boolean', description: 'Извлечь plain text из HTML (по умолчанию true).' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_download',
      description: 'Скачать файл по URL в указанную папку (по умолчанию ~/Downloads). Поддерживает любые типы файлов. Максимум 100 МБ. Возвращает путь к скачанному файлу.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Полный URL файла.' },
          dest_dir: { type: 'string', description: 'Папка назначения (должна быть внутри домашней папки). По умолчанию ~/Downloads.' },
          filename: { type: 'string', description: 'Имя файла (если не указано — берётся из URL).' },
          timeout_ms: { type: 'number', description: 'Таймаут в мс (по умолчанию 60000, максимум 300000).' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Точечное редактирование файла: найти-заменить, вставить строку, добавить в конец, удалить диапазон строк. Автоматически создаёт бэкап в ~/.una/backups/. Работает только внутри домашней папки. Не работает с защищёнными файлами (.env, *.key, id_rsa).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к файлу.' },
          operation: {
            type: 'string',
            enum: ['replace', 'insert_at_line', 'append', 'delete_lines'],
            description: 'replace — найти и заменить (требует find, replace); insert_at_line — вставить на строку (требует line, content); append — добавить в конец (требует content); delete_lines — удалить диапазон (требует start_line, end_line).',
          },
          find: { type: 'string', description: 'Для operation=replace: текст для поиска (точное совпадение).' },
          replace: { type: 'string', description: 'Для operation=replace: текст замены.' },
          line: { type: 'number', description: 'Для operation=insert_at_line: номер строки (1-indexed).' },
          content: { type: 'string', description: 'Для operation=insert_at_line или append: текст для вставки.' },
          start_line: { type: 'number', description: 'Для operation=delete_lines: начальная строка (1-indexed, inclusive).' },
          end_line: { type: 'number', description: 'Для operation=delete_lines: конечная строка (1-indexed, inclusive).' },
          create_backup: { type: 'boolean', description: 'Создать бэкап перед изменением (по умолчанию true).' },
        },
        required: ['path', 'operation'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep',
      description: 'Поиск по файлам через ripgrep (с JS fallback). Возвращает file, line_number, line_content для каждого совпадения. Исключает node_modules, .git, dist. Максимум 100 результатов.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Шаблон поиска (regex по умолчанию, если use_regex=false — точная строка).' },
          path: { type: 'string', description: 'Папка поиска (по умолчанию — текущая). Должна быть внутри домашней папки.' },
          include: { type: 'string', description: 'Glob-фильтр файлов (например *.ts, *.js).' },
          max_results: { type: 'number', description: 'Максимум результатов (по умолчанию 30, максимум 100).' },
          case_insensitive: { type: 'boolean', description: 'Игнорировать регистр (по умолчанию false).' },
          use_regex: { type: 'boolean', description: 'Использовать regex (по умолчанию true).' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'apply_patch',
      description: 'Применить unified diff патч к файлу. Формат: строки начинаются с пробела (context), + (add), - (remove), заголовки hunk: @@ -start,count +start,count @@. Автоматически создаёт бэкап. Проверяет context перед изменением.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к файлу.' },
          patch: { type: 'string', description: 'Unified diff патч. Формат: @@ -1,3 +1,4 @@\\n unchanged\\n-removed\\n+added\\n unchanged' },
          create_backup: { type: 'boolean', description: 'Создать бэкап (по умолчанию true).' },
        },
        required: ['path', 'patch'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_code',
      description: 'Выполнить JavaScript или TypeScript код в изолированном sandbox. Timeout 30 сек, memory limit 256 МБ. Перехватывает console.log/error/warn. Запрещён доступ к fs, child_process, net, http, process.env. Используй для вычислений, проверки гипотез, обработки данных.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Код для выполнения (JavaScript или TypeScript).' },
          language: { type: 'string', enum: ['javascript', 'typescript'], description: 'Язык кода (по умолчанию javascript).' },
          timeout_ms: { type: 'number', description: 'Таймаут в мс (по умолчанию 10000, максимум 30000).' },
          setup_code: { type: 'string', description: 'Код для выполнения перед основным (например, установка переменных).' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_app',
      description: 'Открыть приложение. Работает на Windows, macOS, Linux. Требует nut.js или robotjs для некоторых операций.',
      parameters: {
        type: 'object',
        properties: {
          app_name: { type: 'string', description: 'Имя приложения (например: notepad, code, chrome).' },
          args: { type: 'array', items: { type: 'string' }, description: 'Аргументы запуска.' },
        },
        required: ['app_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'type_text',
      description: 'Напечатать текст в активном окне. Требует nut.js или robotjs.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Текст для ввода.' },
          delay_ms: { type: 'number', description: 'Задержка между клавишами (мс).' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'click',
      description: 'Клик мышью по координатам. Требует nut.js или robotjs.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X координата.' },
          y: { type: 'number', description: 'Y координата.' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Кнопка мыши (по умолчанию left).' },
          double: { type: 'boolean', description: 'Двойной клик.' },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'key_press',
      description: 'Нажать клавишу или комбинацию. Требует nut.js или robotjs.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Клавиша (enter, escape, tab, space, и т.д.).' },
          modifiers: { type: 'array', items: { type: 'string' }, description: 'Модификаторы (ctrl, shift, alt, cmd).' },
        },
        required: ['key'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_windows',
      description: 'Список открытых окон. Не требует nut.js, работает через OS API.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];
