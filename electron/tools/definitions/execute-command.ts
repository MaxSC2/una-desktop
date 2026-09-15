import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { classifyCommand } from '../../safety/classifier';
import { actionToken, home, safeEnv, truncate, ToolContext, ToolDefinition, ToolResult } from '../helpers';

const execFileAsync = promisify(execFile);

export const definition: ToolDefinition = {
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
};

/**
 * Выполнение shell-команды с проверкой безопасности.
 */
export async function handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const typedArgs = args as { command: string; cwd?: string; timeout_ms?: number };
  const cmd = typedArgs.command;
  const cwd = typedArgs.cwd ? path.resolve(typedArgs.cwd.replace(/^~/, home())) : home();
  const timeout = Math.min(typedArgs.timeout_ms ?? 30000, 120000);

  const safety = classifyCommand(cmd);

  if (safety.level === 'forbidden') {
    return {
      success: false,
      error: `Команда заблокирована: ${safety.reason}. ${safety.suggestion ?? ''}`,
    };
  }

  // Токен привязан к команде + рабочей директории: повтор идентичного вызова
  // находит ранее выданное подтверждение, любая модификация — новый запрос.
  // Вычисляется до гейта, чтобы после исполнения можно было погасить (consume).
  const confirmToken = safety.level === 'dangerous' ? actionToken('exec', `${cwd}|${cmd}`) : null;
  if (confirmToken && !ctx.confirmedTokens.has(confirmToken)) {
    return {
      success: false,
      needs_confirmation: {
        token: confirmToken,
        action: `Выполнить команду: ${cmd}`,
        risk: 'dangerous',
        details: `${safety.reason}. Рабочая директория: ${cwd}`,
      },
    };
  }

  try {
    // execFile вместо exec — cmd передаётся как аргумент shell, а не конкатенируется в команду
    // Это предотвращает shell argument injection (OWASP top 10)
    const shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/sh';
    const shellArgs = os.platform() === 'win32' ? ['/d', '/c', cmd] : ['-c', cmd];
    const { stdout, stderr } = await execFileAsync(shell, shellArgs, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024,
      env: safeEnv(),
    });
    // Одноразовое подтверждение: действие исполнено — токен погашается
    if (confirmToken) ctx.consumeToken?.(confirmToken);
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
