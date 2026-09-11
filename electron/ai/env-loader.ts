/**
 * Minimal .env loader — без внешних зависимостей.
 *
 * Ищет .env в нескольких местах (проект, папка приложения, userData)
 * и выставляет переменные в process.env, НЕ перезаписывая уже заданные
 * (реальное окружение имеет приоритет).
 *
 * Используется для ключей AI API (OPENAI_API_KEY / GEMINI_API_KEY /
 * GROQ_API_KEY / OPENROUTER_API_KEY), OLLAMA_KEEP_ALIVE и т.д.
 */

import * as fs from 'fs';
import * as path from 'path';

let loaded = false;

function candidatePaths(): string[] {
  const out: string[] = [];
  try {
    out.push(path.join(process.cwd(), '.env'));
  } catch {
    /* нет cwd — пропускаем */
  }
  try {
    // В упакованном Electron-приложении .env может лежать рядом с ним
    // или в userData (если задан вручную).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron');
    const appPath = electron?.app?.getAppPath?.();
    if (appPath) out.push(path.join(appPath, '.env'));
    const userData = electron?.app?.getPath?.('userData');
    if (userData) out.push(path.join(userData, '.env'));
  } catch {
    /* не в Electron-контексте (тесты) — ок */
  }
  return out;
}

/**
 * Парсит содержимое .env: KEY=VALUE, комментарии (#), кавычки, пустые строки.
 */
export function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

/**
 * Загружает .env (однократно). Возвращает число применённых переменных.
 */
export function loadEnvFile(): number {
  if (loaded) return 0;
  loaded = true;

  const merged: Record<string, string> = {};
  for (const p of candidatePaths()) {
    try {
      if (fs.existsSync(p)) {
        Object.assign(merged, parseEnv(fs.readFileSync(p, 'utf-8')));
      }
    } catch {
      /* нечитаемый файл — пропускаем */
    }
  }

  let applied = 0;
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied++;
    }
  }
  if (applied > 0) {
    console.log(`[Env] loaded ${applied} variable(s) from .env`);
  }
  return applied;
}