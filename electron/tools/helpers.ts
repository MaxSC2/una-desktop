import * as os from 'os';

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
