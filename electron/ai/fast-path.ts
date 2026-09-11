/**
 * Fast-path (Level 0) — детерминированные команды без LLM.
 *
 * «Открой Discord» не должно будить модель:
 *   текст → matchFastCommand → tool → готовый ответ (десятки мс вместо секунд).
 *
 * Если команда не распознана — возвращаем null, и запрос уходит в обычный
 * tool-loop (LLM). Это первый уровень маршрутизации, а не замена роутера.
 */

import { dispatchTool, ToolContext, ToolResult } from '../tools';

/** Синонимы: как пользователь называет приложение → что передать в open_app. */
const APP_ALIASES: Record<string, string> = {
  // Мессенджеры
  'discord': 'Discord',
  'дискорд': 'Discord',
  'telegram': 'Telegram',
  'телеграм': 'Telegram',
  'телегу': 'Telegram',
  // Браузеры
  'chrome': 'Chrome',
  'хром': 'Chrome',
  'google chrome': 'Chrome',
  'браузер': 'Chrome',
  'edge': 'msedge',
  'firefox': 'Firefox',
  // Разработка
  'code': 'Code',
  'vscode': 'Code',
  'vs code': 'Code',
  'visual studio code': 'Code',
  'код': 'Code',
  // Система
  'terminal': 'wt',
  'терминал': 'wt',
  'консоль': 'cmd',
  'cmd': 'cmd',
  'powershell': 'powershell',
  'explorer': 'explorer',
  'проводник': 'explorer',
  'notepad': 'Notepad',
  'блокнот': 'Notepad',
  'calc': 'calc',
  'калькулятор': 'calc',
  'диспетчер задач': 'taskmgr',
  'taskmgr': 'taskmgr',
};

/** «открой / запусти / включи / open / launch / start <цель>» */
const OPEN_APP_RE =
  /^\s*(?:пожалуйста\s+)?(?:откр(?:ой|ою|ывай|ыть|ываю)|запусти|запускай|включи|open|launch|start)\s+(.+?)\s*[.!?]?\s*$/i;

export interface FastCommandMatch {
  tool: 'open_app';
  args: Record<string, unknown>;
  /** Каноническое имя приложения (для ответа пользователю). */
  app: string;
}

/**
 * Чистое распознавание без побочных эффектов (удобно тестировать).
 * Возвращает null, если это не fast-path — тогда работает обычный LLM-путь.
 */
export function matchFastCommand(text: string): FastCommandMatch | null {
  const m = text.match(OPEN_APP_RE);
  if (!m) return null;

  const raw = m[1]
    .replace(/^(?:приложение|программу|прогу|app)\s+/i, '')
    .replace(/\s+пожалуйста$/i, '')
    .trim()
    .toLowerCase();

  const app = APP_ALIASES[raw];
  if (!app) return null;

  return { tool: 'open_app', args: { app_name: app }, app };
}

/**
 * Выполняет быструю команду, если распознана.
 * Возвращает готовый текст ответа (LLM не вызывался) или null.
 */
export async function tryFastCommand(text: string, ctx: ToolContext): Promise<string | null> {
  const match = matchFastCommand(text);
  if (!match) return null;

  let result: ToolResult;
  try {
    result = await dispatchTool(match.tool, match.args, ctx);
  } catch (e) {
    result = { success: false, error: (e as Error).message };
  }

  if (result.success) {
    return `Открываю ${match.app}.`;
  }
  return `Не удалось открыть ${match.app}: ${result.error ?? 'неизвестная ошибка'}`;
}
