import * as crypto from 'crypto';
import * as os from 'os';

/**
 * Детерминированный токен подтверждения опасного действия.
 *
 * Токен выводится из СОДЕРЖИМОГО действия (tool + параметры), а не из времени:
 * - повтор того же действия → тот же токен → ранее выданное подтверждение срабатывает;
 * - изменение параметров → новый токен → новый запрос подтверждения.
 * (Прежние токены с Date.now()/random не могли совпасть дважды, из-за чего
 * подтверждение приходилось запрашивать бесконечно.)
 */
export function actionToken(prefix: string, actionKey: string): string {
  const digest = crypto.createHash('sha256').update(actionKey).digest('hex').slice(0, 24);
  return `${prefix}_${digest}`;
}

// ============================================================
// Pending-action record — подтверждение как запись с TTL (M6/Pass 1)
// ============================================================

/** Сколько живёт подтверждение действия (10 минут). */
export const CONFIRM_TTL_MS = 10 * 60_000;

/**
 * Запись о подтверждённом действии: не просто строка-токен, а аудит-запись.
 * - token: детерминированный digest действия (actionToken)
 * - action: человекочитаемое описание (для аудита/UI)
 * - origin: канал подтверждения (chat / telegram / autonomous)
 * - createdAt: момент подтверждения; по нему считается TTL
 */
export interface ConfirmedActionRecord {
  token: string;
  action: string;
  origin: string;
  createdAt: string;
}

/**
 * Убирает протухшие подтверждения. Чистая функция — тестируется без electron-store.
 * Записи с некорректной/отсутствующей датой считаются протухшими (fail-closed).
 */
export function purgeExpiredActions(
  records: ConfirmedActionRecord[],
  now: number = Date.now(),
  ttl: number = CONFIRM_TTL_MS
): ConfirmedActionRecord[] {
  return records.filter((r) => {
    const t = Date.parse(r.createdAt);
    return Number.isFinite(t) && now - t >= 0 && now - t < ttl;
  });
}

export interface ToolContext {
  /** Подтверждённые пользователем токены (для опасных операций) */
  confirmedTokens: Set<string>;
  /**
   * Одноразовое подтверждение: инструмент вызывает после ИСПОЛНЕНИЯ действия,
   * чтобы погасить токен (повтор действия = новый запрос подтверждения).
   * Опционален — тестовые/mock-контексты могут его не передавать.
   */
  consumeToken?: (token: string) => void;
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

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export function home(): string {
  return os.homedir();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... [обрезано, всего ${s.length} символов]`;
}

/**
 * Builds a safe environment for child processes using a whitelist.
 * Only allows essential system variables — no secrets, tokens, or API keys.
 */
export function safeEnv(): NodeJS.ProcessEnv {
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
